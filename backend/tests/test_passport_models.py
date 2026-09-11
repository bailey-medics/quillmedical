"""Tests for app/features/passport/models.py and locking.py.

What the database holds, and what it deliberately does not.

The most useful test here is the one asserting absence: there is no
sign-off table, no per-competency status table and no cached progress,
because a row holding any of that would be a second version of the truth
waiting to disagree with the repository. That is easy to add by accident
later, so it is pinned.

The advisory lock is Postgres-only and the unit suite runs on SQLite, so
the key derivation is tested here and the lock itself is exercised where
a real database is available.
"""

from __future__ import annotations

import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.features.passport import locking
from app.features.passport.models import (
    REQUEST_STATUSES,
    Passport,
    PassportSignOffRequest,
    SiteCommonCompetency,
)
from app.models import Base, Organisation, User

PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
OTHER_ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90"


def _user(db_session: Session, email: str) -> User:
    user = User(
        username=email,
        email=email,
        password_hash="x",
        full_name="A Clinician",
    )
    db_session.add(user)
    db_session.flush()
    return user


class TestWhatTheDatabaseDoesNotHold:
    """The division of labour is the whole storage design."""

    def test_there_is_no_sign_off_table(self) -> None:
        """A sign-off lives in a file the holder can carry. A row would be
        a second version of the truth waiting to disagree with it."""
        tables = set(Base.metadata.tables)

        assert "passport_sign_off" not in tables
        assert "passport_signoff" not in tables
        assert "sign_off" not in tables

    def test_there_is_no_cached_status_or_progress_table(self) -> None:
        tables = set(Base.metadata.tables)

        for forbidden in (
            "passport_competency_status",
            "passport_progress",
            "passport_logbook",
            "passport_certificate",
        ):
            assert forbidden not in tables

    def test_the_passport_row_holds_no_record_content(self) -> None:
        """Only where the repository is, and where it was."""
        columns = {column.name for column in inspect(Passport).columns}

        assert columns == {
            "id",
            "user_id",
            "created_at",
            "head_commit",
            "storage_generation",
        }


class TestPassport:
    def test_one_passport_per_person(self, db_session: Session) -> None:
        """A second row would mean two records of the same career, each
        incomplete."""
        user = _user(db_session, "holder@example.nhs.uk")
        db_session.add(Passport(id=PASSPORT_ID, user_id=user.id))
        db_session.flush()

        db_session.add(Passport(id=OTHER_ID, user_id=user.id))

        with pytest.raises(IntegrityError):
            db_session.flush()

    def test_the_head_commit_is_nullable(self, db_session: Session) -> None:
        """It is a cache of something the repository already knows."""
        user = _user(db_session, "holder2@example.nhs.uk")

        passport = Passport(id=PASSPORT_ID, user_id=user.id)
        db_session.add(passport)
        db_session.flush()

        assert passport.head_commit is None
        assert passport.storage_generation is None


class TestSignOffRequest:
    def test_it_is_workflow_not_a_copy_of_the_record(self) -> None:
        """It names the folder that holds the record, and nothing of its
        contents: no level, no dates, no assessor snapshot."""
        columns = {
            column.name for column in inspect(PassportSignOffRequest).columns
        }

        assert "signoff_id" in columns
        for content in ("level", "observed_on", "signed_at", "content_hash"):
            assert content not in columns

    def test_one_request_per_sign_off_folder(
        self, db_session: Session
    ) -> None:
        """A second row would put two entries in an inbox for one act."""
        holder = _user(db_session, "holder3@example.nhs.uk")
        assessor = _user(db_session, "assessor@example.nhs.uk")
        db_session.add(Passport(id=PASSPORT_ID, user_id=holder.id))
        db_session.flush()

        for _ in range(2):
            db_session.add(
                PassportSignOffRequest(
                    passport_id=PASSPORT_ID,
                    signoff_id="2026-03-14-a-thing",
                    competency_id="perform_cannulation",
                    assessor_user_id=assessor.id,
                )
            )

        with pytest.raises(IntegrityError):
            db_session.flush()

    def test_the_competency_has_no_foreign_key(self) -> None:
        """The catalogue is YAML, and a retired competency must stay
        readable on records that reference it."""
        column = inspect(PassportSignOffRequest).columns["competency_id"]

        assert not column.foreign_keys

    def test_open_is_the_default(self, db_session: Session) -> None:
        holder = _user(db_session, "holder4@example.nhs.uk")
        assessor = _user(db_session, "assessor2@example.nhs.uk")
        db_session.add(Passport(id=PASSPORT_ID, user_id=holder.id))
        db_session.flush()

        request = PassportSignOffRequest(
            passport_id=PASSPORT_ID,
            signoff_id="2026-03-14-a-thing",
            competency_id="perform_cannulation",
            assessor_user_id=assessor.id,
        )
        db_session.add(request)
        db_session.flush()
        db_session.refresh(request)

        assert request.status == "open"
        assert request.status in REQUEST_STATUSES
        assert request.resolved_at is None


class TestSiteCommonCompetency:
    def test_exactly_one_place(self, db_session: Session) -> None:
        """A shortlist belongs to a site or an organisation, not both and
        not neither."""
        organisation = Organisation(name="A trust")
        db_session.add(organisation)
        db_session.flush()

        db_session.add(
            SiteCommonCompetency(
                organisation_id=organisation.id,
                competency_id="prescribe_sact",
            )
        )
        db_session.flush()

        db_session.add(
            SiteCommonCompetency(competency_id="perform_cannulation")
        )

        with pytest.raises(IntegrityError):
            db_session.flush()

    def test_a_competency_appears_once_per_place(
        self, db_session: Session
    ) -> None:
        organisation = Organisation(name="Another trust")
        db_session.add(organisation)
        db_session.flush()

        for _ in range(2):
            db_session.add(
                SiteCommonCompetency(
                    organisation_id=organisation.id,
                    competency_id="prescribe_sact",
                )
            )

        with pytest.raises(IntegrityError):
            db_session.flush()

    def test_it_gates_nothing(self) -> None:
        """Interface furniture. Nothing reads it when deciding what a
        person may do or be signed off for, so it carries no flag that
        could be mistaken for permission.
        """
        columns = {
            column.name for column in inspect(SiteCommonCompetency).columns
        }

        for permissive in ("required", "mandatory", "enabled", "allowed"):
            assert permissive not in columns


class TestLockKey:
    def test_the_key_fits_a_signed_32_bit_integer(self) -> None:
        """Postgres advisory lock keys are signed 32-bit integers."""
        for passport_id in (PASSPORT_ID, OTHER_ID, "0" * 32, "f" * 32):
            key = locking.lock_key(passport_id)

            assert -(2**31) <= key <= 2**31 - 1

    def test_the_same_passport_gives_the_same_key(self) -> None:
        assert locking.lock_key(PASSPORT_ID) == locking.lock_key(PASSPORT_ID)

    def test_different_passports_give_different_keys(self) -> None:
        """Two holders writing at once must not block each other."""
        assert locking.lock_key(PASSPORT_ID) != locking.lock_key(OTHER_ID)

    def test_the_namespace_is_fixed(self) -> None:
        """Advisory locks are global to the database, so a namespace stops
        a passport lock colliding with one taken elsewhere."""
        assert locking.LOCK_NAMESPACE == 0x5041_5353
