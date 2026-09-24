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

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.features.passport import locking
from app.features.passport.models import (
    REQUEST_STATUSES,
    Passport,
    PassportAssessorInvite,
    PassportSignOffRequest,
    SiteCommonCompetency,
)
from app.models import Base, OrgUnit, User

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
                    assessor_email=assessor.email,
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
            assessor_email=assessor.email,
        )
        db_session.add(request)
        db_session.flush()
        db_session.refresh(request)

        assert request.status == "open"
        assert request.status in REQUEST_STATUSES
        assert request.resolved_at is None


class TestSiteCommonCompetency:
    def test_a_shortlist_belongs_to_a_place(self, db_session: Session) -> None:
        """One column, so "exactly one place" needs no constraint.

        This carried ``site_id`` and ``organisation_id`` with a check
        constraint policing the pair. A trust is a place, so a
        trust-wide list is the organisation's own row in the tree and a
        ward's is the ward's — the same column either way.
        """
        organisation = OrgUnit(name="A trust", type="hospital_team")
        db_session.add(organisation)
        db_session.flush()

        db_session.add(
            SiteCommonCompetency(
                org_unit_id=organisation.id,
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
        organisation = OrgUnit(name="Another trust", type="hospital_team")
        db_session.add(organisation)
        db_session.flush()

        for _ in range(2):
            db_session.add(
                SiteCommonCompetency(
                    org_unit_id=organisation.id,
                    competency_id="prescribe_sact",
                )
            )

        with pytest.raises(IntegrityError):
            db_session.flush()

    def test_a_ward_and_its_trust_keep_separate_lists(
        self, db_session: Session
    ) -> None:
        """The property the old pair existed for, in one column.

        A ward's shortlist and the trust's are two rows naming two
        places, rather than two columns on rows of one table.
        """
        organisation = OrgUnit(name="A third trust", type="hospital_team")
        db_session.add(organisation)
        db_session.flush()
        ward = OrgUnit(name="Ward 9", type="ward", parent_id=organisation.id)
        db_session.add(ward)
        db_session.flush()

        db_session.add(
            SiteCommonCompetency(
                org_unit_id=organisation.id,
                competency_id="prescribe_sact",
            )
        )
        db_session.add(
            SiteCommonCompetency(
                org_unit_id=ward.id,
                competency_id="prescribe_sact",
            )
        )

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


class TestAssessorInvite:
    """Bringing somebody outside in, and spending the invitation once."""

    def _invite(
        self,
        db_session: Session,
        *,
        invite_id: str,
        token_hash: str,
        email: str = "amara@example.nhs.uk",
    ) -> PassportAssessorInvite:
        """One invitation against a fresh holder and inviter."""
        holder = _user(db_session, f"holder-{invite_id}@example.nhs.uk")
        db_session.add(Passport(id=PASSPORT_ID, user_id=holder.id))
        db_session.flush()

        return PassportAssessorInvite(
            id=invite_id,
            passport_id=PASSPORT_ID,
            invited_by_user_id=holder.id,
            email=email,
            token_hash=token_hash,
            expires_at=datetime.now(UTC) + timedelta(days=14),
        )

    def test_it_carries_no_part_of_the_record(self) -> None:
        """It is how an assessor was reached, never what they decided.

        The sign-off is a file; a level, a date, a signature or a hash
        here would be a second version of it, waiting to disagree.

        ``competency_id`` is deliberately not in this list. It says what
        the assessor was *asked* about, which the accept page needs so
        somebody deciding whether to register at all can see what they
        are being asked to judge. It is not what they decided, and
        nothing reads it to determine what they may sign: that is still
        resolved from the request rows naming them.
        """
        columns = {
            column.name for column in inspect(PassportAssessorInvite).columns
        }

        for content in (
            "level",
            "observed_on",
            "signed_at",
            "content_hash",
        ):
            assert content not in columns

    def test_the_raw_token_is_never_stored(self) -> None:
        """What is emailed is a credential. A readable copy would let
        anyone with a row redeem the invitation."""
        columns = {
            column.name for column in inspect(PassportAssessorInvite).columns
        }

        assert "token_hash" in columns
        assert "token" not in columns

    def test_a_fresh_invite_is_outstanding(self, db_session: Session) -> None:
        """Null ``accepted_at`` is what "not yet spent" looks like."""
        invite = self._invite(
            db_session, invite_id="inv-1", token_hash="hash-1"
        )
        db_session.add(invite)
        db_session.flush()
        db_session.refresh(invite)

        assert invite.accepted_at is None
        assert invite.accepted_user_id is None
        assert invite.created_at is not None

    def test_one_invite_per_token(self, db_session: Session) -> None:
        """Two rows sharing a hash would make one emailed link ambiguous,
        and single use undecidable."""
        first = self._invite(
            db_session, invite_id="inv-2", token_hash="shared-hash"
        )
        db_session.add(first)
        db_session.flush()

        db_session.add(
            PassportAssessorInvite(
                id="inv-3",
                passport_id=PASSPORT_ID,
                invited_by_user_id=first.invited_by_user_id,
                email="other@example.nhs.uk",
                token_hash="shared-hash",
                expires_at=datetime.now(UTC) + timedelta(days=14),
            )
        )

        with pytest.raises(IntegrityError):
            db_session.flush()

    def test_accepting_records_who_and_when(self, db_session: Session) -> None:
        """Consuming the invite is what the accept endpoint checks, so
        both halves have to be writable."""
        invite = self._invite(
            db_session, invite_id="inv-4", token_hash="hash-4"
        )
        db_session.add(invite)
        db_session.flush()

        assessor = _user(db_session, "assessor-accepts@example.nhs.uk")
        accepted = datetime.now(UTC)
        invite.accepted_at = accepted
        invite.accepted_user_id = assessor.id
        db_session.flush()
        db_session.refresh(invite)

        assert invite.accepted_at is not None
        assert invite.accepted_user_id == assessor.id

    def test_it_records_no_assessor_details(self) -> None:
        """The holder gives an address and nothing else.

        ``name``, ``registration_authority`` and ``registration_number``
        were here until 22 September and were written as empty strings
        on every invitation, because the invite form never asked for
        them. The assessor states their own name and registration when
        they accept, which is the more trustworthy source and is what
        the sign-off records.

        ``registration_verified`` has never been here, and must not be:
        an invitation is how somebody was reached, and a column
        claiming their registration had been checked would say Quill
        had done something it had not.
        """
        columns = {
            column.name for column in inspect(PassportAssessorInvite).columns
        }

        for absent in (
            "name",
            "registration_authority",
            "registration_number",
            "registration_verified",
        ):
            assert absent not in columns

    def test_expiry_is_stored_as_well_as_signed(
        self, db_session: Session
    ) -> None:
        """So a list can show it without decoding a token, and so expiry
        survives a key rotation that makes outstanding tokens
        undecodable."""
        invite = self._invite(
            db_session, invite_id="inv-6", token_hash="hash-6"
        )
        db_session.add(invite)
        db_session.flush()
        db_session.refresh(invite)

        assert invite.expires_at is not None


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
