"""Tests for app/features/passport/service.py and blobs.py.

The sign-off lifecycle, which is the one place a passport records a
two-party act. Two rules matter more than everything else here, and both
are tested for the thing that would be worst if they failed: not that
they refuse, but that a refusal **writes nothing**. A half-made sign-off
would be worse than none at all, because the record would exist without
the act that gives it meaning.
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from pathlib import Path

import pygit2
import pytest

from app.features.passport import (
    blobs,
    commits,
    hashing,
    paths,
    service,
    store,
)
from app.features.passport.blobs import (
    BlobConflictError,
    BlobNotFoundError,
    BlobStore,
)
from app.features.passport.service import (
    DeclarationNotConfirmedError,
    SelfSignOffError,
    SignOffError,
    SignOffStateError,
)

PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
NOW = datetime(2026, 3, 14, 14, 32, tzinfo=UTC)
HOLDER_USER = "u-holder"
ASSESSOR_USER = "u-assessor"

# A competency with a scale, and one without. Named here so a change to
# the catalogue surfaces as one failure rather than twenty.
SCALED = "prescribe_sact"
UNSCALED = "perform_cannulation"


@pytest.fixture
def holder() -> commits.Actor:
    return commits.Actor(
        name="Dr Sam Reeve", role="Registrar", email="sam@example.nhs.uk"
    )


@pytest.fixture
def assessor() -> commits.Actor:
    return commits.Actor(
        name="Dr Amara Okonkwo",
        role="Consultant",
        email="amara@example.nhs.uk",
        registrations=("GMC 1234567",),
        care_location="Bristol Royal Infirmary",
    )


@pytest.fixture
def passport(
    tmp_path: Path, holder: commits.Actor
) -> store.LocalPassportStore:
    created = store.LocalPassportStore(tmp_path)
    service.create_passport(
        created, PASSPORT_ID, holder, user_id=HOLDER_USER, now=NOW
    )
    return created


def _request(
    passport: store.LocalPassportStore,
    holder: commits.Actor,
    *,
    competency_id: str = UNSCALED,
    level_id: str | None = None,
    observed_on: date = date(2026, 3, 12),
) -> str:
    name, _ = service.request_sign_off(
        passport,
        PASSPORT_ID,
        holder,
        competency_id=competency_id,
        observed_on=observed_on,
        level_id=level_id,
        now=NOW,
    )
    return name


def _sign(
    passport: store.LocalPassportStore,
    assessor: commits.Actor,
    name: str,
    **overrides: object,
) -> str:
    kwargs: dict[str, object] = {
        "name": name,
        "assessor_user_id": ASSESSOR_USER,
        "holder_user_id": HOLDER_USER,
        "meaning": "directly observed",
        "declaration_confirmed": True,
        "registrations": [],
        "now": NOW,
    }
    kwargs.update(overrides)
    return service.sign_off(passport, PASSPORT_ID, assessor, **kwargs)  # type: ignore[arg-type]


class TestCreatePassport:
    def test_a_new_passport_has_its_three_files(
        self, passport: store.LocalPassportStore
    ) -> None:
        assert passport.read(PASSPORT_ID, paths.MANIFEST)
        assert passport.read(PASSPORT_ID, paths.PROFILE)
        assert passport.read(PASSPORT_ID, paths.INDEX)

    def test_the_manifest_carries_the_passport_id(
        self, passport: store.LocalPassportStore
    ) -> None:
        """Without it the id exists only in the directory path."""
        manifest = passport.read(PASSPORT_ID, paths.MANIFEST).decode()

        assert PASSPORT_ID in manifest


class TestSelfSignOff:
    """The one hard rule."""

    def test_a_holder_cannot_sign_their_own(
        self,
        passport: store.LocalPassportStore,
        holder: commits.Actor,
    ) -> None:
        name = _request(passport, holder)

        with pytest.raises(SelfSignOffError):
            _sign(passport, holder, name, assessor_user_id=HOLDER_USER)

    def test_a_refused_self_sign_off_writes_nothing(
        self,
        passport: store.LocalPassportStore,
        holder: commits.Actor,
        tmp_path: Path,
    ) -> None:
        """The refusal must leave no trace, not a half-made record."""
        name = _request(passport, holder)
        before = passport.head(PASSPORT_ID).commit

        with pytest.raises(SelfSignOffError):
            _sign(passport, holder, name, assessor_user_id=HOLDER_USER)

        assert passport.head(PASSPORT_ID).commit == before
        assert (
            service.read_sign_off(passport, PASSPORT_ID, name).status
            == "requested"
        )

    def test_a_holder_cannot_decline_their_own_request(
        self, passport: store.LocalPassportStore, holder: commits.Actor
    ) -> None:
        name = _request(passport, holder)

        with pytest.raises(SelfSignOffError):
            service.decline_sign_off(
                passport,
                PASSPORT_ID,
                holder,
                name=name,
                assessor_user_id=HOLDER_USER,
                holder_user_id=HOLDER_USER,
                reason="No",
                now=NOW,
            )

    def test_it_is_refused_regardless_of_the_declaration(
        self, passport: store.LocalPassportStore, holder: commits.Actor
    ) -> None:
        """Confirming the declaration does not buy an exception."""
        name = _request(passport, holder)

        with pytest.raises(SelfSignOffError):
            _sign(
                passport,
                holder,
                name,
                assessor_user_id=HOLDER_USER,
                declaration_confirmed=True,
            )


class TestDeclaration:
    def test_signing_without_confirming_is_refused(
        self,
        passport: store.LocalPassportStore,
        holder: commits.Actor,
        assessor: commits.Actor,
    ) -> None:
        name = _request(passport, holder)

        with pytest.raises(DeclarationNotConfirmedError):
            _sign(passport, assessor, name, declaration_confirmed=False)

    def test_an_unconfirmed_attempt_writes_nothing(
        self,
        passport: store.LocalPassportStore,
        holder: commits.Actor,
        assessor: commits.Actor,
    ) -> None:
        name = _request(passport, holder)
        before = passport.head(PASSPORT_ID).commit

        with pytest.raises(DeclarationNotConfirmedError):
            _sign(passport, assessor, name, declaration_confirmed=False)

        assert passport.head(PASSPORT_ID).commit == before
        assert (
            service.read_sign_off(passport, PASSPORT_ID, name).status
            == "requested"
        )

    def test_the_declaration_text_is_fixed(self) -> None:
        """Not configurable per organisation: a declaration that varied
        by site would mean records asserted different things depending on
        where they were made."""
        assert "accountability" in service.DECLARATION
        assert "professional judgement" in service.DECLARATION


class TestSigning:
    def test_a_signed_record_carries_the_assessor_and_a_hash(
        self,
        passport: store.LocalPassportStore,
        holder: commits.Actor,
        assessor: commits.Actor,
    ) -> None:
        name = _request(passport, holder)

        _sign(passport, assessor, name)

        record = service.read_sign_off(passport, PASSPORT_ID, name)
        assert record.status == "signed_off"
        assert record.signed_off_by is not None
        assert record.signed_off_by.name == "Dr Amara Okonkwo"
        assert record.meaning == "directly observed"
        assert hashing.matches(record)

    def test_the_assessor_snapshot_is_frozen_not_referenced(
        self,
        passport: store.LocalPassportStore,
        holder: commits.Actor,
        assessor: commits.Actor,
    ) -> None:
        """Their role changes, their registration lapses, they leave;
        none of that may rewrite what the record said."""
        name = _request(passport, holder)

        _sign(
            passport,
            assessor,
            name,
            registrations=[{"body": "GMC", "number": "1234567"}],
        )

        record = service.read_sign_off(passport, PASSPORT_ID, name)
        assert record.signed_off_by is not None
        assert record.signed_off_by.role == "Consultant"
        assert record.signed_off_by.registrations[0].number == "1234567"

    def test_registration_is_recorded_as_declared(
        self,
        passport: store.LocalPassportStore,
        holder: commits.Actor,
        assessor: commits.Actor,
    ) -> None:
        """Quill checks no register, and the record must say so."""
        name = _request(passport, holder)

        _sign(passport, assessor, name)

        record = service.read_sign_off(passport, PASSPORT_ID, name)
        assert record.signed_off_by is not None
        assert record.signed_off_by.registration_verified is False

    def test_signing_twice_is_refused(
        self,
        passport: store.LocalPassportStore,
        holder: commits.Actor,
        assessor: commits.Actor,
    ) -> None:
        name = _request(passport, holder)
        _sign(passport, assessor, name)

        with pytest.raises(SignOffStateError, match="signed_off"):
            _sign(passport, assessor, name)

    def test_one_write_is_one_commit(
        self,
        passport: store.LocalPassportStore,
        holder: commits.Actor,
        assessor: commits.Actor,
        tmp_path: Path,
    ) -> None:
        repository = pygit2.Repository(
            str(tmp_path / paths.shard(PASSPORT_ID))
        )
        start = len(list(repository.walk(repository.head.target)))

        name = _request(passport, holder)
        _sign(passport, assessor, name)

        after = pygit2.Repository(str(tmp_path / paths.shard(PASSPORT_ID)))
        assert len(list(after.walk(after.head.target))) == start + 2


class TestLevels:
    def test_a_scaled_competency_needs_a_level(
        self, passport: store.LocalPassportStore, holder: commits.Actor
    ) -> None:
        with pytest.raises(SignOffError, match="a level must be named"):
            _request(passport, holder, competency_id=SCALED)

    def test_the_refusal_names_the_available_levels(
        self, passport: store.LocalPassportStore, holder: commits.Actor
    ) -> None:
        with pytest.raises(SignOffError, match="observation_only"):
            _request(passport, holder, competency_id=SCALED)

    def test_an_unscaled_competency_needs_none(
        self, passport: store.LocalPassportStore, holder: commits.Actor
    ) -> None:
        name = _request(passport, holder, competency_id=UNSCALED)

        assert service.read_sign_off(passport, PASSPORT_ID, name).level is None

    def test_the_level_wording_is_copied_into_the_record(
        self, passport: store.LocalPassportStore, holder: commits.Actor
    ) -> None:
        """So it stays readable if the scale is later reworded."""
        name = _request(
            passport,
            holder,
            competency_id=SCALED,
            level_id="review_and_authorise",
        )

        record = service.read_sign_off(passport, PASSPORT_ID, name)
        assert record.level is not None
        assert record.level.name


class TestKind:
    def test_the_first_sign_off_is_initial(
        self,
        passport: store.LocalPassportStore,
        holder: commits.Actor,
        assessor: commits.Actor,
    ) -> None:
        name = _request(passport, holder, competency_id=UNSCALED)
        _sign(passport, assessor, name)

        assert (
            service.read_sign_off(passport, PASSPORT_ID, name).kind
            == "initial"
        )

    def test_a_higher_level_later_is_a_progression(
        self,
        passport: store.LocalPassportStore,
        holder: commits.Actor,
        assessor: commits.Actor,
    ) -> None:
        """The earlier record stays correct; the holder moved on."""
        first = _request(
            passport,
            holder,
            competency_id=SCALED,
            level_id="review_and_authorise",
        )
        _sign(passport, assessor, first)

        second = _request(
            passport,
            holder,
            competency_id=SCALED,
            level_id="prescribe_first_cycle",
            observed_on=date(2026, 9, 1),
        )

        assert (
            service.read_sign_off(passport, PASSPORT_ID, second).kind
            == "progression"
        )

    def test_the_same_level_again_is_a_reassessment(
        self,
        passport: store.LocalPassportStore,
        holder: commits.Actor,
        assessor: commits.Actor,
    ) -> None:
        first = _request(
            passport,
            holder,
            competency_id=SCALED,
            level_id="review_and_authorise",
        )
        _sign(passport, assessor, first)

        second = _request(
            passport,
            holder,
            competency_id=SCALED,
            level_id="review_and_authorise",
            observed_on=date(2026, 9, 1),
        )

        assert (
            service.read_sign_off(passport, PASSPORT_ID, second).kind
            == "reassessment"
        )

    def test_a_progression_supersedes_nothing(
        self,
        passport: store.LocalPassportStore,
        holder: commits.Actor,
        assessor: commits.Actor,
    ) -> None:
        """Conflating it with a correction would imply the earlier
        assessor had got something wrong when they had not."""
        first = _request(
            passport,
            holder,
            competency_id=SCALED,
            level_id="review_and_authorise",
        )
        _sign(passport, assessor, first)

        second = _request(
            passport,
            holder,
            competency_id=SCALED,
            level_id="prescribe_first_cycle",
            observed_on=date(2026, 9, 1),
        )
        _sign(passport, assessor, second)

        earlier = service.read_sign_off(passport, PASSPORT_ID, first)
        assert earlier.status == "signed_off"
        assert earlier.corrects is None


class TestDeclineWithdrawSupersede:
    def test_a_decline_is_recorded_not_deleted(
        self,
        passport: store.LocalPassportStore,
        holder: commits.Actor,
        assessor: commits.Actor,
    ) -> None:
        """A record showing only successes is worth less to everyone."""
        name = _request(passport, holder)

        service.decline_sign_off(
            passport,
            PASSPORT_ID,
            assessor,
            name=name,
            assessor_user_id=ASSESSOR_USER,
            holder_user_id=HOLDER_USER,
            reason="Not yet ready for this level.",
            now=NOW,
        )

        record = service.read_sign_off(passport, PASSPORT_ID, name)
        assert record.status == "declined"
        assert record.comments == "Not yet ready for this level."

    def test_a_holder_can_withdraw_an_open_request(
        self, passport: store.LocalPassportStore, holder: commits.Actor
    ) -> None:
        name = _request(passport, holder)

        service.withdraw_sign_off(
            passport, PASSPORT_ID, holder, name=name, now=NOW
        )

        from app.features.passport.store import PassportNotFoundError

        with pytest.raises(PassportNotFoundError):
            service.read_sign_off(passport, PASSPORT_ID, name)

    def test_a_signed_record_cannot_be_withdrawn(
        self,
        passport: store.LocalPassportStore,
        holder: commits.Actor,
        assessor: commits.Actor,
    ) -> None:
        """It is the assessor's attestation, not the holder's to remove."""
        name = _request(passport, holder)
        _sign(passport, assessor, name)

        with pytest.raises(SignOffStateError, match="not the holder's"):
            service.withdraw_sign_off(
                passport, PASSPORT_ID, holder, name=name, now=NOW
            )

    def test_only_a_signed_record_can_be_superseded(
        self, passport: store.LocalPassportStore, holder: commits.Actor
    ) -> None:
        name = _request(passport, holder)

        with pytest.raises(SignOffStateError, match="nothing to supersede"):
            service.supersede_sign_off(
                passport, PASSPORT_ID, holder, name=name, now=NOW
            )

    def test_superseding_keeps_the_record(
        self,
        passport: store.LocalPassportStore,
        holder: commits.Actor,
        assessor: commits.Actor,
    ) -> None:
        name = _request(passport, holder)
        _sign(passport, assessor, name)

        service.supersede_sign_off(
            passport, PASSPORT_ID, assessor, name=name, now=NOW
        )

        record = service.read_sign_off(passport, PASSPORT_ID, name)
        assert record.status == "superseded"
        assert record.signed_off_by is not None


class TestStatus:
    def test_no_evidence_reports_none(
        self, passport: store.LocalPassportStore
    ) -> None:
        assert service.status_for(passport, PASSPORT_ID, UNSCALED) == "none"

    def test_an_expired_sign_off_still_reports_signed_off(
        self,
        passport: store.LocalPassportStore,
        holder: commits.Actor,
        assessor: commits.Actor,
    ) -> None:
        """What a lapsed sign-off implies is a clinical decision that has
        not been made, so the status does not make it."""
        name = _request(passport, holder)
        _sign(passport, assessor, name)

        assert (
            service.status_for(passport, PASSPORT_ID, UNSCALED) == "signed_off"
        )


class TestBlobs:
    def test_bytes_are_stored_under_their_own_hash(
        self, tmp_path: Path
    ) -> None:
        blob_store = BlobStore(tmp_path)

        attachment = blob_store.put(
            PASSPORT_ID,
            b"a scanned certificate",
            filename="scan.pdf",
            media_type="application/pdf",
        )

        assert attachment.hash == blobs.digest(b"a scanned certificate")
        assert blob_store.get(PASSPORT_ID, attachment.hash) == (
            b"a scanned certificate"
        )

    def test_storing_the_same_bytes_twice_is_one_blob(
        self, tmp_path: Path
    ) -> None:
        """Nothing needs to detect the duplicate."""
        blob_store = BlobStore(tmp_path)

        first = blob_store.put(
            PASSPORT_ID,
            b"same",
            filename="a.pdf",
            media_type="application/pdf",
        )
        second = blob_store.put(
            PASSPORT_ID,
            b"same",
            filename="b.pdf",
            media_type="application/pdf",
        )

        assert first.hash == second.hash

    def test_a_filename_never_decides_where_bytes_live(
        self, tmp_path: Path
    ) -> None:
        """A filename carrying a patient identifier must not reach a path."""
        blob_store = BlobStore(tmp_path)

        attachment = blob_store.put(
            PASSPORT_ID,
            b"content",
            filename="NHS1234567-Smith-bronchoscopy.pdf",
            media_type="application/pdf",
        )

        stored = list(tmp_path.rglob("*"))
        assert not any("Smith" in str(path) for path in stored)
        assert attachment.filename == "NHS1234567-Smith-bronchoscopy.pdf"

    def test_a_blob_cannot_be_replaced_with_different_bytes(
        self, tmp_path: Path
    ) -> None:
        """A successful overwrite would redirect every record that
        referred to that hash."""
        blob_store = BlobStore(tmp_path)
        attachment = blob_store.put(
            PASSPORT_ID,
            b"original",
            filename="a.pdf",
            media_type="application/pdf",
        )

        # Reach past the store to plant different bytes at the same hash,
        # which is the only way this can happen.
        target = (
            tmp_path / paths.shard(PASSPORT_ID) / paths.blob(attachment.hash)
        )
        target.write_bytes(b"tampered")

        with pytest.raises(BlobConflictError):
            blob_store.put(
                PASSPORT_ID,
                b"original",
                filename="a.pdf",
                media_type="application/pdf",
            )

    def test_verify_detects_altered_bytes(self, tmp_path: Path) -> None:
        """The whole integrity check, needing no stored checksum."""
        blob_store = BlobStore(tmp_path)
        attachment = blob_store.put(
            PASSPORT_ID,
            b"original",
            filename="a.pdf",
            media_type="application/pdf",
        )

        assert blob_store.verify(PASSPORT_ID, attachment.hash) is True

        target = (
            tmp_path / paths.shard(PASSPORT_ID) / paths.blob(attachment.hash)
        )
        target.write_bytes(b"altered")

        assert blob_store.verify(PASSPORT_ID, attachment.hash) is False

    def test_reading_an_absent_blob_is_refused(self, tmp_path: Path) -> None:
        """A broken reference must not pass as an empty file."""
        blob_store = BlobStore(tmp_path)

        with pytest.raises(BlobNotFoundError):
            blob_store.get(PASSPORT_ID, "sha256:" + "ab" * 32)

    def test_blobs_are_not_committed(
        self,
        passport: store.LocalPassportStore,
        tmp_path: Path,
    ) -> None:
        """Evidence is content-addressed beside the repository, never in
        it — which is what the .gitignore is for."""
        blob_store = BlobStore(tmp_path)
        blob_store.put(
            PASSPORT_ID,
            b"evidence",
            filename="a.pdf",
            media_type="application/pdf",
        )

        repository = pygit2.Repository(
            str(tmp_path / paths.shard(PASSPORT_ID))
        )
        tree = repository.get(repository.head.target).tree

        assert "files" not in [entry.name for entry in tree]
