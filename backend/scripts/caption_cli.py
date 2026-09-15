#!/usr/bin/env python3
"""Non-interactive caption CLI for Cloud Run Job execution.

Transcribes one transcoded lecture and writes WebVTT beside its
renditions, so the player can offer captions — a WCAG 2.1 AA requirement
for the learning centre.

Environment variables only, with no arguments and no prompts, because a
Cloud Run Job has no terminal — the same shape as ``transcode_cli.py``.

Environment Variables:
    CAPTION_ORG_ID:     Required.  Organisation that owns the upload.
    CAPTION_MODULE_ID:  Required.  Module the media belongs to.
    CAPTION_ASSET_ID:   Required.  Generated id of the uploaded asset.
    TEACHING_VIDEOS_BUCKET:  Required.  Where renditions live, and where
                             the WebVTT is written.
    WHISPER_MODEL:      Optional.  Defaults to ``small``.
    CAPTION_CALLBACK_URL:   Optional.  Where to report the track exists.
    CAPTION_CALLBACK_TOKEN: Optional.  Bearer token for that report.

Both callback variables are optional together: unset means development,
where there is no backend to tell. Set in teaching, where the report is
what turns ``has_captions`` true — the player composes the track's URL
from that column, so a WebVTT nobody recorded is never offered.

Usage (Cloud Run Job):
    gcloud run jobs execute quill-caption-teaching \\
      --region europe-west2 \\
      --update-env-vars \\
        CAPTION_ORG_ID=1,\\
        CAPTION_MODULE_ID=colonoscopy-basics,\\
        CAPTION_ASSET_ID=a1b2c3d4 \\
      --wait

**Reads the processed bucket, not the source.** The transcode job deletes
its master once the renditions verify, so by the time captions are wanted
the original is usually gone. The 720p rendition is the input instead:
it is always present when this job is reachable, and it is a smaller
download for audio nothing renders.

The object-key contract applies here as it does to the transcode job: the
load balancer does not strip the URL path prefix, so output lives under
the same ``{org_id}/{module_id}/`` prefix the signed cookie covers. The
player asks for ``{asset_id}.vtt``, which is what ``_resolve_video_filename``
returns when the link records ``has_captions``.
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path
from typing import Any, NoReturn

proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)

#: Cloud CDN caches what it is told to cache. An object written without
#: this is revalidated on every request and the CDN buys us nothing —
#: the same constant the transcode job writes, for the same reason.
CACHE_CONTROL = "public, max-age=86400"

#: Which rendition to transcribe. The 720p one always exists where the
#: transcode job succeeded, and carries the same audio as the 1080p.
SOURCE_SUFFIX = "-720p.mp4"


def _report_captions(org_id: int, module_id: str, asset_id: str) -> None:
    """Tell the backend a caption track now exists.

    The player composes the track's URL from ``has_captions``, not by
    listing the bucket, so a WebVTT nobody recorded is never offered to
    a learner. This call is what sets that column.

    Its own endpoint rather than the transcode one: that callback
    rewrites every rendition flag from the list it is given, so a report
    naming only a ``.vtt`` would clear ``has_1080p`` and ``has_poster``
    and claim a transcode that never ran.

    **Never fails the job.** The track is written and verified by the
    time this runs. A failure here means captions exist and are not
    offered, which is worse than nothing but far better than a job that
    reports failure and gets re-run over an hour of Whisper.
    """
    url = os.environ.get("CAPTION_CALLBACK_URL", "").strip()
    token = os.environ.get("CAPTION_CALLBACK_TOKEN", "").strip()
    if not url or not token:
        print(
            "Callback not configured; skipping caption report. The "
            "track exists but will not be offered.",
            file=sys.stderr,
        )
        return

    try:
        import httpx

        response = httpx.post(
            url,
            json={
                "org_id": org_id,
                "module_id": module_id,
                "asset_id": asset_id,
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=30.0,
        )
        if response.status_code >= 400:
            print(
                f"ERROR: caption callback refused "
                f"({response.status_code}); track not offered",
                file=sys.stderr,
            )
            return
    except Exception as exc:  # noqa: BLE001
        print(
            f"ERROR: caption callback failed ({exc}); track not offered",
            file=sys.stderr,
        )
        return

    print(f"✓ Reported captions for {asset_id}")


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


def _format_timestamp(seconds: float) -> str:
    """WebVTT timestamp: ``HH:MM:SS.mmm``.

    Whisper reports float seconds; WebVTT wants zero-padded fields with
    a full stop before the milliseconds, not the comma SubRip uses. A
    player given the wrong separator shows no captions at all and says
    nothing about why.
    """
    if seconds < 0:
        seconds = 0.0
    whole = int(seconds)
    milliseconds = int(round((seconds - whole) * 1000))
    # Rounding can carry into the next second; fold it rather than
    # emitting ".1000".
    if milliseconds == 1000:
        whole += 1
        milliseconds = 0
    hours, remainder = divmod(whole, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{milliseconds:03d}"


def to_webvtt(segments: list[dict[str, Any]]) -> str:
    """Render Whisper's segments as a WebVTT document.

    Written by hand rather than through Whisper's own writer, which
    expects to put a file on disk and takes its formatting options from
    a CLI namespace. The format is small enough that owning it is
    cheaper than adapting to that.

    Segments with no text are dropped: Whisper emits them for silence,
    and a cue with an empty body is a flicker on screen.
    """
    lines = ["WEBVTT", ""]
    for segment in segments:
        text = str(segment.get("text", "")).strip()
        if not text:
            continue
        start = _format_timestamp(float(segment.get("start", 0.0)))
        end = _format_timestamp(float(segment.get("end", 0.0)))
        lines.append(f"{start} --> {end}")
        lines.append(text)
        lines.append("")
    return "\n".join(lines)


def transcribe(path: Path, model_name: str) -> list[dict[str, Any]]:
    """Run Whisper over one audio or video file.

    Imported inside the function so the module can be imported — and its
    formatting tested — on a machine with no torch installed, which is
    every machine but this job's own image.
    """
    # Not installed outside the caption image, by design — see
    # Dockerfile.caption. The ignore is what lets this module be imported
    # and its formatting tested anywhere else.
    import whisper  # type: ignore[import-not-found]

    model = whisper.load_model(model_name)
    # fp16 is a GPU feature and a Cloud Run Job has none; leaving it on
    # produces a warning on every run and falls back to fp32 anyway.
    result = model.transcribe(str(path), fp16=False)
    segments: list[dict[str, Any]] = result.get("segments", [])
    return segments


def caption() -> int:
    """Download one rendition, transcribe it, upload the WebVTT."""
    env = _require_env(
        "CAPTION_ORG_ID",
        "CAPTION_MODULE_ID",
        "CAPTION_ASSET_ID",
        "TEACHING_VIDEOS_BUCKET",
    )
    model_name = os.environ.get("WHISPER_MODEL", "small").strip() or "small"

    from google.cloud import storage  # type: ignore[import-untyped]

    from app.features.teaching.storage import media_object_path

    try:
        org_id = int(env["CAPTION_ORG_ID"])
    except ValueError:
        print(
            f"ERROR: CAPTION_ORG_ID must be an integer, got "
            f"{env['CAPTION_ORG_ID']!r}",
            file=sys.stderr,
        )
        return 1

    module_id = env["CAPTION_MODULE_ID"]
    asset_id = env["CAPTION_ASSET_ID"]

    # Validated by the same helper that guards every other path that
    # builds an object key, so a traversal cannot reach another
    # organisation's prefix from here either.
    try:
        media_object_path(org_id, module_id, asset_id)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    prefix = f"{org_id}/{module_id}"
    source_key = f"{prefix}/{asset_id}{SOURCE_SUFFIX}"
    dest_key = f"{prefix}/{asset_id}.vtt"

    client = storage.Client()
    bucket = client.bucket(env["TEACHING_VIDEOS_BUCKET"])

    source_blob = bucket.blob(source_key)
    if not source_blob.exists():
        print(
            f"ERROR: No rendition at {source_key}; run the transcode job "
            f"first",
            file=sys.stderr,
        )
        return 1

    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        local_source = tmpdir / f"{asset_id}{SOURCE_SUFFIX}"
        print(f"Downloading {source_key}...")
        source_blob.download_to_filename(str(local_source))

        print(f"Transcribing with Whisper ({model_name})...")
        try:
            segments = transcribe(local_source, model_name)
        except Exception as exc:  # noqa: BLE001
            print(f"✗ Transcription failed: {exc}", file=sys.stderr)
            return 1

        if not segments:
            # Not an error: a lecture with no speech has no captions,
            # and writing an empty track would claim otherwise.
            print(
                "WARNING: no speech detected; writing no captions",
                file=sys.stderr,
            )
            return 0

        local_vtt = tmpdir / f"{asset_id}.vtt"
        local_vtt.write_text(to_webvtt(segments), encoding="utf-8")

        print(f"Uploading {dest_key}...")
        blob = bucket.blob(dest_key)
        blob.cache_control = CACHE_CONTROL
        blob.upload_from_filename(str(local_vtt), content_type="text/vtt")

    # Verify before reporting success, the same closing check the
    # transcode job makes: the database records what the job produced,
    # so recording captions that are not there would have the player ask
    # for a missing file and show nothing.
    if not bucket.blob(dest_key).exists():
        print(
            f"ERROR: {dest_key} is not readable after upload",
            file=sys.stderr,
        )
        return 1

    _report_captions(org_id, module_id, asset_id)

    print(f"✓ Captioned {asset_id} in {len(segments)} segments")
    return 0


def main() -> NoReturn:
    """Run the captioning and exit with its status."""
    sys.exit(caption())


if __name__ == "__main__":
    main()
