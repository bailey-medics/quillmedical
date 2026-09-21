"""Invoking the transcode job, and recording what it produced.

The backend is the trigger rather than Eventarc: ``link_module_media``
already knows the moment the bytes landed, already holds credentials,
and already has the three ids the job needs. Eventarc would survive an
upload whose link call never happens, but costs a new API, a service
agent and IAM that this repository does not otherwise use — see the
trigger decision in the video auth gate plan.

The consequence is that **the backend records completion**, not the job.
That is what keeps ``scripts/transcode_cli.py`` talking only to GCS,
with no database connection of its own.

Kept separate from ``storage.py`` and ``media.py`` so the invocation
path can be tested without a bucket and without the media inventory.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

#: Outputs the job writes, and the link column each one sets. The names
#: are deterministic — the player addresses them directly rather than
#: listing the bucket — so this is the one org_unit the mapping lives.
RENDITION_FLAGS: tuple[tuple[str, str], ...] = (
    ("has_1080p", "-1080p.mp4"),
    ("has_poster", "-poster.jpg"),
    ("has_captions", ".vtt"),
)


def start_caption(
    org_id: int,
    module_id: str,
    asset_id: str,
) -> str | None:
    """Fire the caption job for one transcoded asset.

    Invoked from the transcode completion report rather than from the
    upload, because Whisper transcribes the 720p rendition and that does
    not exist until the transcode job has written it. Firing at upload
    would race a job that takes minutes, and lose.

    Returns the execution name, or None where no job is configured —
    the normal development case. A module then has no captions until
    someone writes them in the admin editor, which is a real workflow
    rather than a broken one.

    Never raises into the caller. The caller is the transcode completion
    endpoint, and the renditions it is recording are the thing that
    matters: a caption job that could not be reached must not cost the
    module its `transcoded_at`, or the video stays hidden over a missing
    subtitle track.
    """
    from app.config import settings

    job = settings.TEACHING_CAPTION_JOB
    if not job:
        logger.info(
            "caption not configured, skipping org=%s module=%s asset=%s",
            org_id,
            module_id,
            asset_id,
        )
        return None

    try:
        from google.cloud import run_v2

        client = run_v2.JobsClient()
        request = run_v2.RunJobRequest(
            name=job,
            overrides=run_v2.RunJobRequest.Overrides(
                container_overrides=[
                    run_v2.RunJobRequest.Overrides.ContainerOverride(
                        env=[
                            run_v2.EnvVar(
                                name="CAPTION_ORG_ID", value=str(org_id)
                            ),
                            run_v2.EnvVar(
                                name="CAPTION_MODULE_ID", value=module_id
                            ),
                            run_v2.EnvVar(
                                name="CAPTION_ASSET_ID", value=asset_id
                            ),
                        ]
                    )
                ]
            ),
        )
        operation = client.run_job(request=request)
        # Not awaited, like the transcode job: Whisper over a lecture is
        # slower still, and the job reports its own completion.
        name: str = operation.operation.name
    except Exception:
        logger.exception(
            "caption invocation failed org=%s module=%s asset=%s",
            org_id,
            module_id,
            asset_id,
        )
        return None

    logger.info(
        "caption started org=%s module=%s asset=%s execution=%s",
        org_id,
        module_id,
        asset_id,
        name,
    )
    return name


def start_transcode(
    org_id: int,
    module_id: str,
    asset_id: str,
) -> str | None:
    """Fire the transcode job for one uploaded asset.

    Returns the execution name, or None where no job is configured —
    which is the normal development case, not an error. A developer
    uploading through the admin card gets their file stored and no
    renditions, and the module stays incomplete, which is the same safe
    direction as a job that fails.

    Never raises into the caller. Linking an upload is the operation the
    admin asked for, and it has already succeeded by the time this runs;
    failing the request because the follow-on job could not be reached
    would leave the admin thinking the upload itself had failed, and the
    link row is what the retry path acts on.
    """
    from app.config import settings

    job = settings.TEACHING_TRANSCODE_JOB
    if not job:
        logger.info(
            "transcode not configured, skipping org=%s module=%s asset=%s",
            org_id,
            module_id,
            asset_id,
        )
        return None

    try:
        from google.cloud import run_v2

        client = run_v2.JobsClient()
        request = run_v2.RunJobRequest(
            name=job,
            overrides=run_v2.RunJobRequest.Overrides(
                container_overrides=[
                    run_v2.RunJobRequest.Overrides.ContainerOverride(
                        env=[
                            run_v2.EnvVar(
                                name="TRANSCODE_ORG_ID", value=str(org_id)
                            ),
                            run_v2.EnvVar(
                                name="TRANSCODE_MODULE_ID", value=module_id
                            ),
                            run_v2.EnvVar(
                                name="TRANSCODE_ASSET_ID", value=asset_id
                            ),
                        ]
                    )
                ]
            ),
        )
        operation = client.run_job(request=request)
        # Deliberately not awaited: encoding a lecture takes minutes and
        # the admin's request must not hold open for it. Completion is
        # recorded when the job is polled, not here.
        name: str = operation.operation.name
    except Exception:
        # Logged with context but never re-raised, per the docstring.
        logger.exception(
            "transcode invocation failed org=%s module=%s asset=%s",
            org_id,
            module_id,
            asset_id,
        )
        return None

    logger.info(
        "transcode started org=%s module=%s asset=%s execution=%s",
        org_id,
        module_id,
        asset_id,
        name,
    )
    return name
