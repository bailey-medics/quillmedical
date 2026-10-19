"""The scan job's callback.

Called by the job, not by a person, so it carries no session and sits
under no feature gate. It proves itself the way the video jobs' reports
do: a Google identity token for the backend's own address, from a
service account the backend was told to expect. ``main.py`` includes
this router under the API prefix.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_core_db
from app.deps import DEP_REQUIRE_JOB_IDENTITY
from app.features.teaching.ci_media import after_scan
from app.features.uploads.scan import ScanNotRequested, record_verdict
from app.features.uploads.schemas import ScanCompleteIn, ScanCompleteOut

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Scan completion callback (job identity) ---
@router.post(
    "/ci/uploads/scan-complete",
    response_model=ScanCompleteOut,
)
def ci_scan_complete(
    body: ScanCompleteIn,
    db: Session = Depends(get_core_db),
    _caller: str = DEP_REQUIRE_JOB_IDENTITY,
) -> ScanCompleteOut:
    """Record what the scan job found for one object.

    An ``infected`` verdict has the object deleted here, by the backend;
    the job itself holds read access only. A verdict for an object
    nobody asked to scan is refused, so a report cannot write a row that
    some later upload would then inherit.
    """
    try:
        record_verdict(
            db,
            body.bucket,
            body.object_key,
            body.verdict,
            body.signature,
            body.definitions,
        )
    except ScanNotRequested:
        raise HTTPException(
            404, "No scan was requested for that object"
        ) from None

    # A teaching upload waits on this verdict for its transcode. The
    # passport needs nothing fired: its routes read the verdict when a
    # file is asked for.
    after_scan(db, body.bucket, body.object_key, body.verdict)

    return ScanCompleteOut(recorded=True, verdict=body.verdict)
