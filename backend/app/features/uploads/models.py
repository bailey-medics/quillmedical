"""The record of a malware scan, one row per uploaded object."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, validates

from app.models import Base

#: What a scan can conclude. ``clean`` and ``infected`` are ClamAV's two
#: answers; ``failed`` is the job saying it could not read the file, or
#: that the file was not there, so the upload shows as needing attention
#: rather than waiting for ever. Validated in code rather than as a
#: database enum, as ``MEMBER_CAPACITIES`` is, so a new word needs no
#: migration.
SCAN_VERDICTS: tuple[str, ...] = ("clean", "infected", "failed")


def validate_scan_verdict(value: str) -> str:
    """Return the verdict unchanged, or raise naming the known ones."""
    if value not in SCAN_VERDICTS:
        raise ValueError(
            f"Unknown scan verdict {value!r}; expected one of "
            f"{', '.join(SCAN_VERDICTS)}"
        )

    return value


class UploadScan(Base):
    """One uploaded object, and what the scan job said about it.

    Keyed by the object's bucket and key rather than by the feature's
    own record, so one table serves passport evidence and teaching
    videos alike: one callback, one recorder, and one question, "is
    this object clean?", asked the same way by both. The passport
    record in particular is hashed, so a field there would have moved
    every existing fingerprint.

    A row with ``scanned_at`` null is a scan requested and not yet
    answered; the object is not served until it is. There is no row at
    all where no scan job is configured, which is development, and the
    features then ask nothing of this table.
    """

    __tablename__ = "upload_scan"
    __table_args__ = (
        UniqueConstraint("bucket", "object_key", name="uq_upload_scan_object"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bucket: Mapped[str] = mapped_column(String(222), nullable=False)
    #: The object's key within the bucket, as the job was given it. Up
    #: to 1024 bytes in Cloud Storage; a passport blob's is about 100.
    object_key: Mapped[str] = mapped_column(String(1024), nullable=False)
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    scanned_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verdict: Mapped[str | None] = mapped_column(String(16), nullable=True)
    #: The signature ClamAV named, for ``infected``; the reason, for
    #: ``failed``. Shown to the person who uploaded the file, so they
    #: know what went.
    signature: Mapped[str | None] = mapped_column(String(255), nullable=True)
    #: What the file was scanned with: ClamAV's version line, carrying
    #: the engine, the database version and the database date.
    definitions: Mapped[str | None] = mapped_column(String(255), nullable=True)

    @validates("verdict")
    def _check_verdict(self, _key: str, value: str | None) -> str | None:
        if value is None:
            return None

        return validate_scan_verdict(value)
