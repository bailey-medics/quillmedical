"""Invoking the transcode job, and recording what it produced.

The backend is the trigger rather than Eventarc: ``link_module_media``
already knows the moment the bytes landed, already holds credentials,
and already has the three ids the job needs. Eventarc would survive an
upload whose link call never happens, but costs a new API, a service
agent and IAM that this repository does not otherwise use - see the
trigger decision in the video auth gate plan.

The consequence is that **the backend records completion**, not the job.
That is what keeps ``scripts/transcode_cli.py`` talking only to GCS,
with no database connection of its own.

Kept separate from ``storage.py`` and ``media.py`` so the invocation
path can be tested without a bucket and without the media inventory.
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

#: Outputs the job writes, and the link column each one sets. The names
#: are deterministic - the player addresses them directly rather than
#: listing the bucket - so this is the one org_unit the mapping lives.
RENDITION_FLAGS: tuple[tuple[str, str], ...] = (
    ("has_1080p", "-1080p.mp4"),
    ("has_poster", "-poster.jpg"),
    ("has_captions", ".vtt"),
)


def caption_prompt(module_id: str) -> str | None:
    """The module's ``captionVocabulary``, as text to hand Whisper.

    Read from the module's ``module.yaml`` the way the module listing
    reads it: from the content bucket, or from disk in development.
    Written as "Glossary: colonoscopy, adenoma." because Whisper treats
    its prompt as text already heard, and spells what it has heard.

    **Never raises.** A missing file, an unreadable one, or a list of the
    wrong shape gives None, and captions start without a prompt, as they
    did before modules could list words. A list over the schema's limits
    is refused too: one that never went through ``validate-teaching``
    must not hand Whisper more than it reads.
    """
    from app.config import settings
    from app.features.teaching import mdx_parser, storage
    from app.features.teaching.tooling.module_schema import (
        caption_vocabulary_problem,
    )

    try:
        bucket = settings.TEACHING_GCS_BUCKET
        meta: dict[str, Any] = {}

        if bucket:
            meta = (
                storage.download_module_yaml_from_gcs(bucket, module_id) or {}
            )
        elif settings.TEACHING_QUESTION_BANK_PATH:
            module_dir = storage.resolve_module_dir(
                settings.TEACHING_QUESTION_BANK_PATH, module_id
            )
            if module_dir is not None:
                meta = mdx_parser.load_module_yaml(module_dir)
    except Exception:
        logger.exception("caption vocabulary unreadable module=%s", module_id)
        return None

    terms = meta.get("captionVocabulary")

    if terms is None:
        return None

    if not isinstance(terms, list) or not all(
        isinstance(term, str) for term in terms
    ):
        logger.warning(
            "caption vocabulary is not a list of words module=%s", module_id
        )
        return None

    cleaned = [term.strip() for term in terms]
    problem = caption_vocabulary_problem(cleaned)

    if problem is not None:
        logger.warning(
            "caption vocabulary refused module=%s: %s", module_id, problem
        )
        return None

    if not cleaned:
        return None

    return f"Glossary: {', '.join(cleaned)}."


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

    Returns the execution name, or None where no job is configured -
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

        env = [
            run_v2.EnvVar(name="CAPTION_ORG_ID", value=str(org_id)),
            run_v2.EnvVar(name="CAPTION_MODULE_ID", value=module_id),
            run_v2.EnvVar(name="CAPTION_ASSET_ID", value=asset_id),
        ]

        # The module's own words, so its captions spell them right.
        # Left out where it lists none, and the job captions without.
        prompt = caption_prompt(module_id)

        if prompt is not None:
            env.append(run_v2.EnvVar(name="CAPTION_PROMPT", value=prompt))

        client = run_v2.JobsClient()
        request = run_v2.RunJobRequest(
            name=job,
            overrides=run_v2.RunJobRequest.Overrides(
                container_overrides=[
                    run_v2.RunJobRequest.Overrides.ContainerOverride(env=env)
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
    *,
    poster_at_seconds: int | None = None,
    poster_only: bool = False,
) -> str | None:
    """Fire the transcode job for one uploaded asset.

    ``poster_at_seconds`` is the second the poster frame is taken from,
    where an admin has chosen one; the job takes its own default when it
    is None. ``poster_only`` runs the job's poster mode instead: the
    renditions already exist and the source is gone, so only the poster
    is taken again, from a rendition, and reported to a callback of its
    own.

    Returns the execution name, or None where no job is configured -
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
                            *_poster_env(poster_at_seconds, poster_only),
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
        "transcode started org=%s module=%s asset=%s poster_only=%s "
        "execution=%s",
        org_id,
        module_id,
        asset_id,
        poster_only,
        name,
    )

    return name


def _poster_env(poster_at_seconds: int | None, poster_only: bool) -> list[Any]:
    """The job's poster settings, as environment variables.

    Only what differs from the job's defaults is sent, so an ordinary
    transcode with no chosen second is invoked exactly as before.
    """
    from google.cloud import run_v2

    env: list[Any] = []

    if poster_at_seconds is not None:
        env.append(
            run_v2.EnvVar(
                name="TRANSCODE_POSTER_AT", value=str(poster_at_seconds)
            )
        )

    if poster_only:
        env.append(run_v2.EnvVar(name="TRANSCODE_MODE", value="poster"))

    return env
