#!/usr/bin/env python3
"""Non-interactive transcode CLI for Cloud Run Job execution.

Reads one uploaded video from the source bucket, produces the renditions
a learner is actually served, and writes them to the processed bucket.

Environment variables only, with no arguments and no prompts, because a
Cloud Run Job has no terminal — the same shape as ``admin_cli.py``.

Environment Variables:
    TRANSCODE_ORG_ID:     Required.  Organisation that owns the upload.
    TRANSCODE_MODULE_ID:  Required.  Module the media belongs to.
    TRANSCODE_ASSET_ID:   Required.  Generated id of the uploaded asset.
    TEACHING_VIDEOS_SOURCE_BUCKET:  Required.  Where the raw upload is.
    TEACHING_VIDEOS_BUCKET:         Required.  Where renditions go.
    TRANSCODE_CALLBACK_URL:   Optional.  Where to report completion.
    TRANSCODE_CALLBACK_TOKEN: Optional.  Bearer token for that report.

Both callback variables are optional together: unset means development,
where there is no backend to tell. Set in teaching, where the report is
what makes a module servable — the backend fires this job and does not
wait, so nothing else records that the renditions exist.

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
from typing import NoReturn

proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)

#: Cloud CDN caches what it is told to cache. An object written without
#: this is revalidated on every request and the CDN buys us nothing —
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


def _report_complete(
    org_id: int,
    module_id: str,
    asset_id: str,
    written: list[str],
) -> None:
    """Tell the backend the renditions are up, so the module can serve.

    Until this call lands, ``transcoded_at`` stays null and the
    availability gate keeps the module hidden — the renditions exist and
    no learner can reach them. This is the only thing that closes that
    gap: the backend fires the job and does not wait, so nothing else
    knows the job finished.

    **Never fails the job.** The encode succeeded, the outputs verified
    and the source is about to be deleted; a callback that cannot be
    delivered must not undo any of that or trigger a re-encode. It is
    logged loudly instead, and the module stays hidden until someone
    re-runs the job or the state is corrected by hand — the safe
    direction, and visible in the admin card as "awaiting transcode".

    Unconfigured is not an error either: in development there is no
    backend to call and no token to call it with, which is the same
    shape as the rest of this script's optional wiring.
    """
    url = os.environ.get("TRANSCODE_CALLBACK_URL", "").strip()
    token = os.environ.get("TRANSCODE_CALLBACK_TOKEN", "").strip()
    if not url or not token:
        print(
            "Callback not configured; skipping completion report. "
            "The module stays hidden until it is recorded.",
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
        with urllib.request.urlopen(request, timeout=30) as response:
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
    result = subprocess.run(  # noqa: S603
        ["ffmpeg", "-y", "-loglevel", "error", *args],  # noqa: S607
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        msg = f"ffmpeg failed ({result.returncode}): {result.stderr.strip()}"
        raise RuntimeError(msg)


def build_rendition(
    source: Path, dest: Path, height: int, bitrate: str
) -> None:
    """Encode one H.264 rendition at the given height.

    The scale filter takes width from the height and rounds it to an
    even number: H.264 chroma subsampling requires even dimensions, and
    an odd width from an unusual aspect ratio fails the encode outright.
    """
    _run_ffmpeg(
        [
            "-i",
            str(source),
            "-vf",
            f"scale=-2:{height}",
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
    )


def build_poster(source: Path, dest: Path) -> None:
    """Grab a single frame for the player's poster image.

    Five seconds in rather than at zero: the first frame of a lecture is
    very often a black or blank title card, which makes a poster that
    tells the learner nothing about the video behind it.
    """
    _run_ffmpeg(["-ss", "5", "-i", str(source), "-vframes", "1", str(dest)])


def transcode() -> int:
    """Download one source object, transcode it, upload the renditions."""
    env = _require_env(
        "TRANSCODE_ORG_ID",
        "TRANSCODE_MODULE_ID",
        "TRANSCODE_ASSET_ID",
        "TEACHING_VIDEOS_SOURCE_BUCKET",
        "TEACHING_VIDEOS_BUCKET",
    )

    from google.cloud import storage  # type: ignore[import-untyped]

    # `object_paths`, not `storage`: the latter imports `settings` at
    # module scope, which requires JWT_SECRET and CORE_DB_PASSWORD — and
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

    source_blob = source_bucket.blob(source_path)
    if not source_blob.exists():
        print(
            f"ERROR: No source object at {source_path}",
            file=sys.stderr,
        )
        return 1

    # A lecture is large, and the job's filesystem is the only place it
    # can be worked on. The temporary directory is cleaned up whether
    # the encode succeeds or fails.
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        local_source = tmpdir / "source"
        print(f"Downloading {source_path}...")
        source_blob.download_to_filename(str(local_source))

        outputs: list[tuple[Path, str, str]] = []

        for label, height, bitrate in RENDITIONS:
            local = tmpdir / f"{asset_id}-{label}.mp4"
            print(f"Encoding {label}...")
            try:
                build_rendition(local_source, local, height, bitrate)
            except RuntimeError as exc:
                print(f"✗ {exc}", file=sys.stderr)
                return 1
            outputs.append((local, f"{asset_id}-{label}.mp4", "video/mp4"))

        poster = tmpdir / f"{asset_id}-poster.jpg"
        print("Extracting poster frame...")
        try:
            build_poster(local_source, poster)
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
    # and the renditions are what the learner is served — there is no
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
    # A source already gone is not an error — a re-run over an asset
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


def main() -> NoReturn:
    """Run the transcode and exit with its status."""
    sys.exit(transcode())


if __name__ == "__main__":
    main()
