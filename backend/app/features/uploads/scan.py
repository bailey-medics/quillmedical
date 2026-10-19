"""Asking for an upload to be scanned, and recording what came back.

The backend fires the scan job and does not wait: a Cloud Run Job takes
seconds to start, and a request cannot be held open for it. The job
reports through ``/api/ci/uploads/scan-complete`` when it has a verdict,
and :func:`record_verdict` is what that report writes.

Everything here is flushed, not committed. The session the route was
handed commits when the route returns.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.uploads.models import UploadScan, validate_scan_verdict

logger = logging.getLogger(__name__)

#: How a feature sees an upload's scan: the three verdicts, or
#: ``pending`` for a scan requested and not yet answered.
ScanState = Literal["pending", "clean", "infected", "failed"]


class ScanNotRequested(LookupError):
    """A verdict arrived for an object nobody asked to scan."""


def scan_is_configured() -> bool:
    """Whether a scan job exists to look at uploads at all.

    False is the development case, not a fault: ``compose.dev.yml`` sets
    no job, so nothing is requested and nothing is gated. Read at call
    time rather than captured at import, because the tests set the job
    on a live ``settings`` object. The same shape as
    ``transcode_is_configured`` in the teaching feature.
    """
    from app.config import settings

    return bool(settings.UPLOAD_SCAN_JOB)


def request_scan(db: Session, bucket: str, object_key: str) -> UploadScan:
    """Record that a scan is wanted, and fire the job.

    Recorded before firing, as the transcode invocation is: a feature
    that asks "is this clean?" and finds no row would otherwise read a
    running scan as one never asked for. An existing row, from an
    earlier upload of the same bytes to the same key, is reset to
    pending: the object has been written again and must be looked at
    again.

    The row is flushed, not committed. The job is fired after the flush,
    and a job that cannot be reached is logged and leaves the row
    pending, which the feature shows as a scan still running; nothing
    is served on the strength of a request alone.
    """
    row = _row(db, bucket, object_key)

    if row is None:
        row = UploadScan(bucket=bucket, object_key=object_key)
        db.add(row)

    row.requested_at = datetime.now(UTC)
    row.scanned_at = None
    row.verdict = None
    row.signature = None
    row.definitions = None
    db.flush()

    _start_job(bucket, object_key)

    return row


def record_verdict(
    db: Session,
    bucket: str,
    object_key: str,
    verdict: str,
    signature: str | None,
    definitions: str | None,
) -> UploadScan:
    """Write what the job found.

    On ``infected`` the object is deleted from the bucket here, by the
    backend's own credentials: the job holds read access only, so a
    fault in the scanner cannot remove a file, and acting on the
    verdict in one place keeps the record and the bucket in step. The
    row stays, so the feature can say why the file went.

    The row is flushed, not committed.

    Raises:
        ScanNotRequested: no scan was asked for on that object.
        ValueError: the verdict is not one of ``SCAN_VERDICTS``.
    """
    validate_scan_verdict(verdict)

    row = _row(db, bucket, object_key)

    if row is None:
        raise ScanNotRequested

    row.scanned_at = datetime.now(UTC)
    row.verdict = verdict
    row.signature = signature
    row.definitions = definitions
    db.flush()

    if verdict == "infected":
        delete_object(bucket, object_key)

    # The key names an upload, never a person, and the signature is
    # ClamAV's name for what it found.
    logger.info(
        "upload scan recorded bucket=%s key=%s verdict=%s signature=%s",
        bucket,
        object_key,
        verdict,
        signature,
    )

    return row


def scan_state_for(
    db: Session, bucket: str, object_key: str
) -> ScanState | None:
    """What a feature should make of one object.

    ``None`` where no scan was ever requested, which is the case for
    every upload made before scanning existed and for every upload in
    development. The feature decides what that means; where no job is
    configured it means nothing is gated.
    """
    row = _row(db, bucket, object_key)

    return None if row is None else state_of(row)


def state_of(row: UploadScan) -> ScanState:
    """One row, read as the state a feature acts on."""
    if row.verdict is None:
        return "pending"

    if row.verdict == "clean":
        return "clean"

    if row.verdict == "infected":
        return "infected"

    return "failed"


def scan_row_for(
    db: Session, bucket: str, object_key: str
) -> UploadScan | None:
    """The whole row, for a card that shows when a scan was asked for."""
    return _row(db, bucket, object_key)


def scan_signature_for(
    db: Session, bucket: str, object_key: str
) -> str | None:
    """The signature or reason the job gave, for showing to the uploader."""
    row = _row(db, bucket, object_key)

    return None if row is None else row.signature


def delete_object(bucket_name: str, object_key: str) -> None:
    """Remove one object from a bucket. A missing object is not an error."""
    from google.api_core import exceptions as gcs_exceptions
    from google.cloud import storage  # type: ignore[attr-defined]

    client = storage.Client()

    try:
        client.bucket(bucket_name).blob(object_key).delete()
    except gcs_exceptions.NotFound:
        return


def _row(db: Session, bucket: str, object_key: str) -> UploadScan | None:
    return db.execute(
        select(UploadScan).where(
            UploadScan.bucket == bucket,
            UploadScan.object_key == object_key,
        )
    ).scalar_one_or_none()


def _start_job(bucket: str, object_key: str) -> str | None:
    """Fire the scan job for one object. Never raises into the caller.

    Returns the execution name, or None where no job is configured or
    the invocation failed. The caller has already recorded the request,
    so a failure here leaves the upload pending, where the feature
    shows it as still being checked and serves nothing.
    """
    from app.config import settings

    job = settings.UPLOAD_SCAN_JOB

    if not job:
        logger.info(
            "scan not configured, skipping bucket=%s key=%s",
            bucket,
            object_key,
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
                            run_v2.EnvVar(name="SCAN_BUCKET", value=bucket),
                            run_v2.EnvVar(
                                name="SCAN_OBJECT", value=object_key
                            ),
                        ]
                    )
                ]
            ),
        )
        operation = client.run_job(request=request)
        # Not awaited, like the transcode job: the job reports its own
        # completion.
        name: str = operation.operation.name
    except Exception:
        logger.exception(
            "scan invocation failed bucket=%s key=%s", bucket, object_key
        )
        return None

    logger.info(
        "scan started bucket=%s key=%s execution=%s",
        bucket,
        object_key,
        name,
    )

    return name
