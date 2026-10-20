#!/usr/bin/env python3
"""Non-interactive transcode CLI for Cloud Run Job execution.

Reads one uploaded video from the source bucket, produces the renditions
a learner is actually served, and writes them to the processed bucket.

Environment variables only, with no arguments and no prompts, because a
Cloud Run Job has no terminal - the same shape as ``admin_cli.py``.

Environment Variables:
    TRANSCODE_ORG_ID:     Required.  Organisation that owns the upload.
    TRANSCODE_MODULE_ID:  Required.  Module the media belongs to.
    TRANSCODE_ASSET_ID:   Required.  Generated id of the uploaded asset.
    TEACHING_VIDEOS_SOURCE_BUCKET:  Required.  Where the raw upload is.
    TEACHING_VIDEOS_BUCKET:         Required.  Where renditions go.
    TEACHING_VIDEOS_SOURCE_MOUNT:   Optional.  Where the source bucket
                                    is mounted as a folder. The upload
                                    is read from there, and downloaded
                                    only where it is not.
    TRANSCODE_CALLBACK_URL:      Optional.  Where to report completion.
    TRANSCODE_CALLBACK_AUDIENCE: Optional.  The audience of the identity
                                 token that report carries: the
                                 backend's own address.

Both callback variables are optional together: unset means development,
where there is no backend to tell. Set in teaching, where the report is
what makes a module servable - the backend fires this job and does not
wait, so nothing else records that the renditions exist. The job holds
no secret for the report: the metadata server signs a token for its
service account, and the backend checks who that is.

Usage (Cloud Run Job):
    gcloud run jobs execute quill-transcode-teaching \\
      --region europe-west2 \\
      --update-env-vars \\
        TRANSCODE_ORG_ID=1,\\
        TRANSCODE_MODULE_ID=colonoscopy-basics,\\
        TRANSCODE_ASSET_ID=a1b2c3d4 \\
      --wait

The object-key contract, which this script must not break: the load
balancer does not strip the URL path prefix, so a request for
``/videos/{org}/{module}/x.mp4`` asks the bucket for the object key
``{org}/{module}/x.mp4``. Output therefore lives under the same
``{org_id}/{module_id}/`` prefix the signed cookie's ``URLPrefix``
covers. A mismatch presents as a 404 on a file plainly in the bucket.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path
from typing import Any, NoReturn

proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)

#: Cloud CDN caches what it is told to cache. An object written without
#: this is revalidated on every request and the CDN buys us nothing -
#: which is the whole reason the bytes go through a backend bucket.
CACHE_CONTROL = "public, max-age=86400"

#: The renditions, and the FFmpeg arguments that produce each. 720p is
#: the default the player asks for without the learner touching
#: anything, because hospital wifi is the common case; 1080p is offered
#: only when it exists.
#:
#: ``-movflags +faststart`` puts the MP4 index at the front of the file.
#: Without it playback stalls until the whole file has downloaded, which
#: looks exactly like a broken range-request implementation.
RENDITIONS: tuple[tuple[str, int, str], ...] = (
    ("720p", 720, "2500k"),
    ("1080p", 1080, "5000k"),
)

#: The second the poster frame is taken from when no admin has chosen
#: one. See :func:`build_poster`.
DEFAULT_POSTER_AT = 5


def _require_env(*names: str) -> dict[str, str]:
    """Read required environment variables, exiting on any missing."""
    values: dict[str, str] = {}
    missing: list[str] = []

    for name in names:
        val = os.environ.get(name, "").strip()
        if not val:
            missing.append(name)
        else:
            values[name] = val
    if missing:
        print(
            f"ERROR: Missing required environment variable(s): "
            f"{', '.join(missing)}",
            file=sys.stderr,
        )
        sys.exit(1)

    return values


def _poster_at() -> int | None:
    """The chosen poster second from ``TRANSCODE_POSTER_AT``.

    Unset means the default. Anything that is not a whole number of
    seconds, zero or more, is None too, and the caller refuses it: the
    backend only ever sends one it has already checked, so anything
    else is a job invoked by hand with a typo, and taking the default
    instead would hide it.
    """
    raw = os.environ.get("TRANSCODE_POSTER_AT", "").strip()

    if not raw:
        return DEFAULT_POSTER_AT

    if not raw.isdigit():
        return None

    return int(raw)


def _report_complete(
    org_id: int,
    module_id: str,
    asset_id: str,
    written: list[str],
    *,
    poster_only: bool = False,
) -> None:
    """Tell the backend the renditions are up, so the module can serve.

    Until this call lands, ``transcoded_at`` stays null and the
    availability gate keeps the module hidden - the renditions exist and
    no learner can reach them. This is the only thing that closes that
    gap: the backend fires the job and does not wait, so nothing else
    knows the job finished.

    **Never fails the job.** The encode succeeded, the outputs verified
    and the source is about to be deleted; a callback that cannot be
    delivered must not undo any of that or trigger a re-encode. It is
    logged loudly instead, and the module stays hidden until someone
    re-runs the job or the state is corrected by hand - the safe
    direction, and visible in the admin card as "awaiting transcode".

    Unconfigured is not an error either: in development there is no
    backend to call and no token to call it with, which is the same
    shape as the rest of this script's optional wiring.
    """
    url = os.environ.get("TRANSCODE_CALLBACK_URL", "").strip()
    audience = os.environ.get("TRANSCODE_CALLBACK_AUDIENCE", "").strip()

    # A retaken poster has a report of its own. The transcode report
    # rewrites every rendition flag from the names it is given, so one
    # naming only the poster would clear `has_1080p` and `has_captions`.
    # It sits beside the transcode callback, so it is worked out from
    # that address rather than configured as a second one.
    if poster_only and url:
        url = f"{url.rsplit('/', 1)[0]}/poster-complete"

    if not url or not audience:
        print(
            "Callback not configured; skipping completion report. "
            "The module stays hidden until it is recorded.",
            file=sys.stderr,
        )
        return

    from app.features.teaching.job_identity import mint_identity_token

    token = mint_identity_token(audience)

    if token is None:
        print(
            "ERROR: no identity token, so the completion report was not "
            "sent; module stays hidden",
            file=sys.stderr,
        )
        return

    # Names only. The backend rebuilds the prefix from the ids it is
    # given, so a compromised job cannot name a path outside its own
    # module by reporting one.
    names = [dest.rsplit("/", 1)[-1] for dest in written]

    try:
        payload = json.dumps(
            {
                "org_id": org_id,
                "module_id": module_id,
                "asset_id": asset_id,
                "outputs": names,
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        # The callback address is the job's own configuration, never a
        # user's.
        with urllib.request.urlopen(  # nosec B310
            request, timeout=30
        ) as response:
            if response.status >= 400:
                print(
                    f"ERROR: completion callback refused "
                    f"({response.status}); module stays hidden",
                    file=sys.stderr,
                )
                return
    except Exception as exc:  # noqa: BLE001
        print(
            f"ERROR: completion callback failed ({exc}); "
            f"module stays hidden",
            file=sys.stderr,
        )
        return

    print(f"✓ Reported completion for {asset_id}")


def _run_ffmpeg(args: list[str]) -> None:
    """Run FFmpeg, raising with its own diagnostics on failure.

    FFmpeg writes its reasoning to stderr and says nothing useful on
    stdout, so a failure that reports only an exit code sends whoever
    reads the job log back to reproduce it by hand.
    """
    # A fixed argument list and no shell.
    result = subprocess.run(  # noqa: S603  # nosec B607 B603
        ["ffmpeg", "-y", "-loglevel", "error", *args],  # noqa: S607
        capture_output=True,
        text=True,
        check=False,
    )

    if result.returncode != 0:
        msg = f"ffmpeg failed ({result.returncode}): {result.stderr.strip()}"
        raise RuntimeError(msg)


#: The containers an upload may arrive in, as FFprobe names them. The
#: first is every MP4 and QuickTime file; the second is WebM. These are
#: the three types `ALLOWED_MEDIA_TYPES` admits, seen from inside.
ALLOWED_CONTAINERS: frozenset[str] = frozenset(
    {"mov,mp4,m4a,3gp,3g2,mj2", "matroska,webm"}
)


def probe_container(path: Path) -> tuple[str, bool] | None:
    """What container a file is, and whether it has a video stream.

    Asked before the encode, because the encode cannot answer it: given
    a file that only claimed to be a video, FFmpeg fails part-way with
    its own message, which reads as a broken job rather than a wrong
    file. The backend never sees these bytes in production, since the
    browser uploads straight to the source bucket, so this job is the
    first place the file can be looked at.

    Returns None where FFprobe itself cannot answer, and the caller lets
    the encode try. Its own error is then the one in the log, which is
    more use than a guess.
    """
    # A fixed argument list and no shell.
    try:
        result = subprocess.run(  # noqa: S603  # nosec B607 B603
            [  # noqa: S607
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=format_name:stream=codec_type",
                "-of",
                "json",
                str(path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
    except OSError:
        return None

    if result.returncode != 0:
        return None

    try:
        report = json.loads(result.stdout)
    except ValueError:
        return None

    container = str(report.get("format", {}).get("format_name", ""))
    has_video = any(
        stream.get("codec_type") == "video"
        for stream in report.get("streams", [])
    )

    return container, has_video


def build_renditions(
    source: Path, renditions: list[tuple[Path, int, str]]
) -> None:
    """Encode every H.264 rendition in one FFmpeg run.

    One run rather than one per rendition, so the source is decoded once.
    On a 4K lecture decoding is a large share of the work, and doing it
    twice is what put a 27-minute lecture past the job's ceiling.

    ``renditions`` is each output with its height and video bitrate. The
    scale filter takes width from the height and rounds it to an even
    number: H.264 chroma subsampling requires even dimensions, and an
    odd width from an unusual aspect ratio fails the encode outright.

    The first audio stream goes to every output, if there is one. Other
    streams, such as a camera's timecode track, are left out, as they
    were when FFmpeg chose the streams itself.
    """
    if not renditions:
        raise ValueError("no renditions to encode")

    labels = [f"v{index}" for index in range(len(renditions))]
    scales = ";".join(
        f"[{label}]scale=-2:{height}[o{index}]"
        for index, (label, (_dest, height, _bitrate)) in enumerate(
            zip(labels, renditions, strict=True)
        )
    )
    split = f"[0:v]split={len(renditions)}" + "".join(
        f"[{label}]" for label in labels
    )
    args = ["-i", str(source), "-filter_complex", f"{split};{scales}"]

    for index, (dest, _height, bitrate) in enumerate(renditions):
        args += [
            "-map",
            f"[o{index}]",
            "-map",
            "0:a:0?",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-b:v",
            bitrate,
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            str(dest),
        ]

    _run_ffmpeg(args)


def build_poster(
    source: Path, dest: Path, at_seconds: int = DEFAULT_POSTER_AT
) -> None:
    """Grab a single frame for the player's poster image.

    ``at_seconds`` is the second an admin chose after watching the video,
    or the default. The default is five seconds in rather than zero: the
    first frame of a lecture is very often a black or blank title card,
    which makes a poster that tells the learner nothing about the video
    behind it.

    Raises:
        RuntimeError: FFmpeg failed, or wrote no frame. A second past the
            end of the video is the usual cause of the second, and FFmpeg
            reports it only as a warning and a zero exit.
    """
    _run_ffmpeg(
        [
            "-ss",
            str(at_seconds),
            "-i",
            str(source),
            "-vframes",
            "1",
            str(dest),
        ]
    )

    if not dest.is_file() or dest.stat().st_size == 0:
        raise RuntimeError(
            f"no frame at {at_seconds} seconds; is the video that long?"
        )


def _mounted_source(source_path: str) -> Path | None:
    """The upload's path in the mounted source bucket, if it is there.

    None where no mount is configured, or the object cannot be seen
    through it, and the caller downloads instead. The object path has
    already been checked by ``media_object_path``, so it cannot climb
    out of the mount.
    """
    mount = os.environ.get("TEACHING_VIDEOS_SOURCE_MOUNT", "").strip()

    if not mount:
        return None

    candidate = Path(mount) / source_path

    if not candidate.is_file():
        return None

    return candidate


def transcode() -> int:
    """Download one source object, transcode it, upload the renditions."""
    env = _require_env(
        "TRANSCODE_ORG_ID",
        "TRANSCODE_MODULE_ID",
        "TRANSCODE_ASSET_ID",
        "TEACHING_VIDEOS_SOURCE_BUCKET",
        "TEACHING_VIDEOS_BUCKET",
    )

    from google.cloud import storage  # type: ignore[attr-defined]

    # `object_paths`, not `storage`: the latter imports `settings` at
    # module scope, which requires JWT_SECRET and CORE_DB_PASSWORD - and
    # a video encoder should hold neither. Importing it here crashed
    # this job on startup before it read a byte.
    from app.features.teaching.object_paths import media_object_path

    try:
        org_id = int(env["TRANSCODE_ORG_ID"])
    except ValueError:
        print(
            f"ERROR: TRANSCODE_ORG_ID must be an integer, got "
            f"{env['TRANSCODE_ORG_ID']!r}",
            file=sys.stderr,
        )
        return 1

    module_id = env["TRANSCODE_MODULE_ID"]
    asset_id = env["TRANSCODE_ASSET_ID"]
    poster_at = _poster_at()

    if poster_at is None:
        print(
            "ERROR: TRANSCODE_POSTER_AT must be a whole number of " "seconds",
            file=sys.stderr,
        )
        return 1

    # Validated by the same helper that guards the upload and delete
    # paths, so a traversal cannot reach another organisation's prefix
    # from here either. It raises on anything outside the safe pattern.
    try:
        source_path = media_object_path(org_id, module_id, asset_id)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    client = storage.Client()
    source_bucket = client.bucket(env["TEACHING_VIDEOS_SOURCE_BUCKET"])
    processed_bucket = client.bucket(env["TEACHING_VIDEOS_BUCKET"])

    if os.environ.get("TRANSCODE_MODE", "").strip() == "poster":
        return _retake_poster(
            processed_bucket, org_id, module_id, asset_id, poster_at
        )

    source_blob = source_bucket.blob(source_path)

    if not source_blob.exists():
        print(
            f"ERROR: No source object at {source_path}",
            file=sys.stderr,
        )
        return 1

    # The renditions are written to the job's filesystem, which on Cloud
    # Run is memory. The temporary directory is cleaned up whether the
    # encode succeeds or fails.
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        local_source = _mounted_source(source_path)

        # A lecture is up to 3 GB, and copying it into a filesystem that
        # is memory is what ran the job out of memory. Read in place
        # from the mounted bucket where there is one; download only
        # where there is not, as in local development.
        if local_source is None:
            local_source = tmpdir / "source"
            print(f"Downloading {source_path}...")
            source_blob.download_to_filename(str(local_source))
        else:
            print(f"Reading {source_path} from the mounted bucket...")

        # Refused deliberately, naming the cause, rather than left to
        # fail inside the 720p encode. The source is kept: nothing has
        # been verified, and the lifecycle rule sweeps it.
        probed = probe_container(local_source)

        if probed is not None:
            container, has_video = probed

            if container not in ALLOWED_CONTAINERS or not has_video:
                print(
                    f"ERROR: Not a supported video (format: "
                    f"{container or 'unknown'}, video stream: "
                    f"{'yes' if has_video else 'no'})",
                    file=sys.stderr,
                )
                return 1

        outputs: list[tuple[Path, str, str]] = []
        renditions: list[tuple[Path, int, str]] = []

        for label, height, bitrate in RENDITIONS:
            local = tmpdir / f"{asset_id}-{label}.mp4"
            renditions.append((local, height, bitrate))
            outputs.append((local, f"{asset_id}-{label}.mp4", "video/mp4"))

        print(f"Encoding {', '.join(label for label, _, _ in RENDITIONS)}...")
        try:
            build_renditions(local_source, renditions)
        except RuntimeError as exc:
            print(f"✗ {exc}", file=sys.stderr)
            return 1

        poster = tmpdir / f"{asset_id}-poster.jpg"
        print("Extracting poster frame...")
        try:
            build_poster(local_source, poster, poster_at)
        except RuntimeError as exc:
            print(f"✗ {exc}", file=sys.stderr)
            return 1
        outputs.append((poster, f"{asset_id}-poster.jpg", "image/jpeg"))

        # Same prefix as the source, because that is what the signed
        # cookie covers and what `base_url` addresses.
        prefix = f"{org_id}/{module_id}"
        written: list[str] = []
        for local, name, content_type in outputs:
            dest = f"{prefix}/{name}"
            print(f"Uploading {dest}...")
            blob = processed_bucket.blob(dest)
            blob.cache_control = CACHE_CONTROL
            blob.upload_from_filename(str(local), content_type=content_type)
            written.append(dest)

    # Verify before deleting anything. An upload that reported success
    # but left nothing readable would otherwise cost us the master too,
    # and the renditions are what the learner is served - there is no
    # second copy of either once the source is gone.
    #
    # This also closes the only drift window the system creates itself:
    # the database records what the job produced, so recording an output
    # that is not there would have the player ask for a missing file.
    for dest in written:
        if not processed_bucket.blob(dest).exists():
            print(
                f"ERROR: {dest} is not readable after upload; "
                f"keeping the source object",
                file=sys.stderr,
            )
            return 1

    # The routine cleanup path. The 7-day lifecycle rule on the source
    # bucket is only a backstop for uploads whose job never ran: once
    # renditions exist the master's sole remaining use is re-encoding,
    # which is wanted within days of a video going up, not months.
    #
    # A source already gone is not an error - a re-run over an asset
    # cleaned up by a previous attempt should still succeed.
    print(f"Deleting source {source_path}...")
    try:
        source_blob.delete()
    except Exception as exc:  # noqa: BLE001
        # Never fails the job: the renditions are uploaded and verified
        # by this point, so the transcode genuinely succeeded. A master
        # left behind is swept by the lifecycle rule within a week.
        print(
            f"WARNING: could not delete source {source_path}: {exc}",
            file=sys.stderr,
        )

    _report_complete(org_id, module_id, asset_id, written)

    print(f"✓ Transcoded {asset_id} to {len(outputs)} outputs")

    return 0


def _retake_poster(
    processed_bucket: Any,
    org_id: int,
    module_id: str,
    asset_id: str,
    at_seconds: int,
) -> int:
    """Take the poster again, from a rendition, at a chosen second.

    From a rendition because the source is gone: the transcode deletes
    it once the renditions verify. The 1080p file where there is one,
    so the poster is as sharp as the best the learner can play; the
    720p always exists once a transcode has finished.

    Nothing else is touched. The old poster stays until the new one has
    been written over it, so a second past the end of the video leaves
    the learner with the poster they had rather than with none.
    """
    prefix = f"{org_id}/{module_id}"
    candidates = [
        f"{prefix}/{asset_id}-1080p.mp4",
        f"{prefix}/{asset_id}-720p.mp4",
    ]
    rendition = None

    for path in candidates:
        blob = processed_bucket.blob(path)
        if blob.exists():
            rendition = blob
            break

    if rendition is None:
        print(
            f"ERROR: No rendition of {asset_id} to take a poster from",
            file=sys.stderr,
        )
        return 1

    dest = f"{prefix}/{asset_id}-poster.jpg"

    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        local_source = tmpdir / "rendition.mp4"
        poster = tmpdir / f"{asset_id}-poster.jpg"

        print(f"Downloading {rendition.name}...")
        rendition.download_to_filename(str(local_source))

        print(f"Extracting poster frame at {at_seconds} seconds...")
        try:
            build_poster(local_source, poster, at_seconds)
        except RuntimeError as exc:
            print(f"✗ {exc}", file=sys.stderr)
            return 1

        print(f"Uploading {dest}...")
        blob = processed_bucket.blob(dest)
        blob.cache_control = CACHE_CONTROL
        blob.upload_from_filename(str(poster), content_type="image/jpeg")

    if not processed_bucket.blob(dest).exists():
        print(f"ERROR: {dest} is not readable after upload", file=sys.stderr)
        return 1

    _report_complete(org_id, module_id, asset_id, [dest], poster_only=True)

    print(f"✓ Retook the poster for {asset_id} at {at_seconds} seconds")

    return 0


def main() -> NoReturn:
    """Run the transcode and exit with its status."""
    sys.exit(transcode())


if __name__ == "__main__":
    main()
