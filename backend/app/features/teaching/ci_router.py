"""The job callbacks: content sync, and transcode and caption completion.

Called by jobs, not by people. Each proves itself with a service token
and carries no session, so none sits behind the teaching feature gate
or under the teaching router's prefix.

Moved out of ``main.py`` on 12 October 2026, as they were: the same
addresses, checks and response models. ``main.py`` includes this router
under the API prefix.
"""

import hmac
import logging

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Request,
    Response,
)
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_core_db
from app.features.teaching.ci_media import (
    record_captions,
    record_poster,
    record_transcode,
)
from app.features.teaching.ci_sync import sync_every_bank
from app.features.teaching.schemas import (
    CaptionCompleteIn,
    CaptionCompleteOut,
    CiTeachingSyncOut,
    PosterCompleteIn,
    PosterCompleteOut,
    TranscodeCompleteIn,
    TranscodeCompleteOut,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# --- CI/CD sync endpoint (service token auth) ---
@router.post(
    "/ci/teaching/sync",
    response_model=CiTeachingSyncOut,
    responses={
        422: {
            "model": CiTeachingSyncOut,
            "description": "At least one bank was rejected.",
        }
    },
)
def ci_teaching_sync(
    request: Request,
    response: Response,
    db: Session = Depends(get_core_db),
) -> CiTeachingSyncOut:
    """Trigger teaching content sync from CI/CD pipeline.

    Authenticates via Bearer token (TEACHING_SYNC_TOKEN).
    Syncs all banks found in GCS or local filesystem.

    Returns 422 when any bank was rejected, so the content deploy that
    calls this fails instead of reporting success. The body is the same
    either way, because a partial sync still needs to say which banks
    succeeded and which did not.
    """
    # Validate service token
    token = settings.TEACHING_SYNC_TOKEN

    if not token:
        raise HTTPException(503, "Sync token not configured")

    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Missing Bearer token")

    provided = auth_header.removeprefix("Bearer ").strip()

    if not hmac.compare_digest(provided, token.get_secret_value()):
        raise HTTPException(401, "Invalid token")

    outcome = sync_every_bank(db)

    if outcome.errors:
        # Non-2xx so the caller's curl fails. Without this a rejected bank
        # is indistinguishable from a clean sync, which is what let a
        # malformed certificate block reach GCS unnoticed.
        response.status_code = 422

    return outcome


# --- Transcode completion callback (service token auth) ---
#
# Beside the sync endpoint rather than on `teaching_router`, and for the
# same reason the passport's public router sits apart: that router carries
# `requires_feature("teaching")`, which resolves a feature flag through the
# caller's organisation membership. A Cloud Run Job has no user, no
# organisation and nothing for that gate to resolve through.
#
# This closes the one gap that kept the pipeline from working end to end.
# The backend fires the transcode job and deliberately does not wait -
# encoding takes minutes and an admin's request cannot hold open for it -
# so without this report nothing ever learns the job finished,
# `transcoded_at` stays null, and the availability gate hides a module
# whose renditions are sitting in the bucket.
@router.post(
    "/ci/teaching/transcode-complete",
    response_model=TranscodeCompleteOut,
)
def ci_transcode_complete(
    request: Request,
    body: TranscodeCompleteIn,
    db: Session = Depends(get_core_db),
) -> TranscodeCompleteOut:
    """Record that the transcode job produced and verified its outputs.

    Authenticates with a shared token (TEACHING_TRANSCODE_CALLBACK_TOKEN),
    the same shape as the CI sync endpoint above. Terraform generates the
    value and fills both ends, so the two cannot drift apart.

    Idempotent: re-running a job for the same asset reports the same
    outputs and rewrites the same columns, which is what makes a manual
    re-run a safe remedy.
    """
    token = settings.TEACHING_TRANSCODE_CALLBACK_TOKEN

    if not token:
        raise HTTPException(503, "Transcode callback token not configured")

    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Missing Bearer token")

    provided = auth_header.removeprefix("Bearer ").strip()

    if not hmac.compare_digest(provided, token.get_secret_value()):
        raise HTTPException(401, "Invalid token")

    set_flags = record_transcode(
        db, body.org_id, body.module_id, body.asset_id, body.outputs
    )

    return TranscodeCompleteOut(recorded=True, flags=set_flags)


# --- Caption completion callback (service token auth) ---
#
# Its own endpoint rather than a mode of the one above. The transcode
# callback rewrites every rendition flag from the list it is given, so a
# report naming only a `.vtt` would clear `has_1080p` and `has_poster`
# and stamp a `transcoded_at` for a transcode that never ran.
@router.post(
    "/ci/teaching/caption-complete",
    response_model=CaptionCompleteOut,
)
def ci_caption_complete(
    request: Request,
    body: CaptionCompleteIn,
    db: Session = Depends(get_core_db),
) -> CaptionCompleteOut:
    """Record that a caption track exists for one asset.

    Shares the transcode callback's token: both are the same trust
    boundary - a Cloud Run Job in this project reporting on work the
    backend asked it to do - and a second secret would be two things to
    rotate for one guarantee.
    """
    token = settings.TEACHING_TRANSCODE_CALLBACK_TOKEN

    if not token:
        raise HTTPException(503, "Transcode callback token not configured")

    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Missing Bearer token")

    provided = auth_header.removeprefix("Bearer ").strip()

    if not hmac.compare_digest(provided, token.get_secret_value()):
        raise HTTPException(401, "Invalid token")

    record_captions(db, body.org_id, body.module_id, body.asset_id)

    return CaptionCompleteOut(recorded=True)


# --- Poster completion callback (service token auth) ---
#
# Its own endpoint for the reason the caption one is: the transcode
# report rewrites every rendition flag from the names it is given. The
# job works this address out from the transcode one, by its last part.
@router.post(
    "/ci/teaching/poster-complete",
    response_model=PosterCompleteOut,
)
def ci_poster_complete(
    request: Request,
    body: PosterCompleteIn,
    db: Session = Depends(get_core_db),
) -> PosterCompleteOut:
    """Record that a retaken poster is in the bucket.

    Shares the transcode callback's token, as the caption callback does:
    the same job reporting on work the backend asked it to do.
    """
    token = settings.TEACHING_TRANSCODE_CALLBACK_TOKEN

    if not token:
        raise HTTPException(503, "Transcode callback token not configured")

    auth_header = request.headers.get("Authorization", "")

    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Missing Bearer token")

    provided = auth_header.removeprefix("Bearer ").strip()

    if not hmac.compare_digest(provided, token.get_secret_value()):
        raise HTTPException(401, "Invalid token")

    record_poster(db, body.org_id, body.module_id, body.asset_id, body.outputs)

    return PosterCompleteOut(recorded=True)
