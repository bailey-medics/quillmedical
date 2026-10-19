"""Tests for app/features/uploads/scan.py.

The job is never started here: `_start_job` reaches Cloud Run, and is
patched to record what it was asked. What is tested is the row: when it
is written, what resets it, and what each verdict does to it and to the
object.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from sqlalchemy.orm import Session

from app.config import settings
from app.features.uploads.models import UploadScan, validate_scan_verdict
from app.features.uploads.scan import (
    ScanNotRequested,
    record_verdict,
    request_scan,
    scan_is_configured,
    scan_signature_for,
    scan_state_for,
)

BUCKET = "passports-bucket"
KEY = "ab/cd/one/files/sha256/ab/cd/abcd1234"
DEFINITIONS = "ClamAV 1.0.7/27460/Tue Oct 14 08:00:00 2026"


@pytest.fixture()
def job_started():
    with patch("app.features.uploads.scan._start_job") as started:
        yield started


@pytest.fixture()
def deleted():
    with patch("app.features.uploads.scan.delete_object") as delete:
        yield delete


class TestConfigured:
    def test_unset_is_development(self, monkeypatch) -> None:
        monkeypatch.setattr(settings, "UPLOAD_SCAN_JOB", None)

        assert scan_is_configured() is False

    def test_set_means_every_upload_is_scanned(self, monkeypatch) -> None:
        monkeypatch.setattr(
            settings, "UPLOAD_SCAN_JOB", "projects/p/locations/l/jobs/scan"
        )

        assert scan_is_configured() is True


class TestRequest:
    def test_writes_a_pending_row_then_fires_the_job(
        self, db_session: Session, job_started
    ) -> None:
        row = request_scan(db_session, BUCKET, KEY)

        assert row.requested_at is not None
        assert row.scanned_at is None
        assert row.verdict is None
        assert scan_state_for(db_session, BUCKET, KEY) == "pending"
        job_started.assert_called_once_with(BUCKET, KEY)

    def test_asking_again_resets_an_answered_row(
        self, db_session: Session, job_started, deleted
    ) -> None:
        """The same bytes uploaded again to the same key have been
        written again, and must be looked at again."""
        request_scan(db_session, BUCKET, KEY)
        record_verdict(db_session, BUCKET, KEY, "clean", None, DEFINITIONS)
        assert scan_state_for(db_session, BUCKET, KEY) == "clean"

        request_scan(db_session, BUCKET, KEY)

        assert scan_state_for(db_session, BUCKET, KEY) == "pending"
        assert db_session.query(UploadScan).count() == 1

    def test_a_job_that_cannot_be_started_leaves_the_row_pending(
        self, db_session: Session
    ) -> None:
        """Nothing is served on the strength of a request alone."""
        with patch("app.features.uploads.scan._start_job", return_value=None):
            request_scan(db_session, BUCKET, KEY)

        assert scan_state_for(db_session, BUCKET, KEY) == "pending"


class TestVerdict:
    def test_clean_is_recorded_with_its_definitions(
        self, db_session: Session, job_started, deleted
    ) -> None:
        request_scan(db_session, BUCKET, KEY)

        row = record_verdict(
            db_session, BUCKET, KEY, "clean", None, DEFINITIONS
        )

        assert row.scanned_at is not None
        assert row.definitions == DEFINITIONS
        assert scan_state_for(db_session, BUCKET, KEY) == "clean"
        deleted.assert_not_called()

    def test_infected_deletes_the_object_and_keeps_the_row(
        self, db_session: Session, job_started, deleted
    ) -> None:
        """The row stays so the feature can say why the file went."""
        request_scan(db_session, BUCKET, KEY)

        record_verdict(
            db_session, BUCKET, KEY, "infected", "Eicar-Signature", DEFINITIONS
        )

        deleted.assert_called_once_with(BUCKET, KEY)
        assert scan_state_for(db_session, BUCKET, KEY) == "infected"
        assert scan_signature_for(db_session, BUCKET, KEY) == "Eicar-Signature"

    def test_failed_is_recorded_and_deletes_nothing(
        self, db_session: Session, job_started, deleted
    ) -> None:
        request_scan(db_session, BUCKET, KEY)

        record_verdict(
            db_session, BUCKET, KEY, "failed", "clamscan exited 2", ""
        )

        deleted.assert_not_called()
        assert scan_state_for(db_session, BUCKET, KEY) == "failed"
        assert scan_signature_for(db_session, BUCKET, KEY) == (
            "clamscan exited 2"
        )

    def test_a_verdict_nobody_asked_for_is_refused(
        self, db_session: Session, deleted
    ) -> None:
        """A report cannot write a row some later upload would inherit."""
        with pytest.raises(ScanNotRequested):
            record_verdict(db_session, BUCKET, KEY, "clean", None, DEFINITIONS)

        deleted.assert_not_called()

    def test_an_unknown_verdict_is_refused(
        self, db_session: Session, job_started
    ) -> None:
        request_scan(db_session, BUCKET, KEY)

        with pytest.raises(ValueError, match="Unknown scan verdict"):
            record_verdict(db_session, BUCKET, KEY, "maybe", None, None)


class TestState:
    def test_never_requested_is_none(self, db_session: Session) -> None:
        """Uploads from before scanning existed, and every upload in
        development: the feature decides what that means."""
        assert scan_state_for(db_session, BUCKET, KEY) is None
        assert scan_signature_for(db_session, BUCKET, KEY) is None

    def test_rows_are_per_object(
        self, db_session: Session, job_started
    ) -> None:
        request_scan(db_session, BUCKET, KEY)

        assert scan_state_for(db_session, BUCKET, "other/key") is None
        assert scan_state_for(db_session, "other-bucket", KEY) is None


def test_the_vocabulary_is_closed() -> None:
    assert validate_scan_verdict("clean") == "clean"

    with pytest.raises(ValueError):
        validate_scan_verdict("suspicious")
