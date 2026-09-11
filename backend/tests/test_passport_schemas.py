"""Tests for app/features/passport/schemas.py.

Testing where the rule lives: every invariant asserted here is enforced
by a validator in the model, so a caller cannot construct a record that
breaks it and no route needs to remember to check.

The three that matter most, and why each is a refusal rather than a
default:

- **Only a correction corrects.** Letting a progression set ``corrects``
  would imply an earlier assessor had got something wrong when they had
  not — a statement about a named person, made by a field default.
- **A signed record says who signed it.** A ``signed_off`` status with
  nobody attached is the one state that must not be representable, since
  the whole value of the record is a second named person.
- **A verified registration says who checked and when.** A bare flag
  asserts somebody looked at a register while recording nothing about it.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

import pytest
from pydantic import ValidationError

from app.features.passport import schemas


def _assessor() -> schemas.Assessor:
    return schemas.Assessor(
        user_id="u-1",
        name="Dr Amara Okonkwo",
        role="Consultant",
        registrations=[schemas.Registration(body="GMC", number="1234567")],
    )


def _signed_off(**overrides: object) -> schemas.SignOff:
    fields: dict[str, object] = {
        "id": "20260314T143207.881Z-" + "a" * 32,
        "competency": schemas.CompetencyRef(
            id="perform_bronchoscopy", name="Perform bronchoscopy"
        ),
        "kind": "initial",
        "status": "signed_off",
        "observed_on": date(2026, 3, 12),
        "signed_at": datetime(2026, 3, 14, 14, 32, tzinfo=UTC),
        "signed_off_by": _assessor(),
        "meaning": "directly observed",
    }
    fields.update(overrides)
    return schemas.SignOff(**fields)  # type: ignore[arg-type]


class TestUnknownFields:
    def test_an_unrecognised_field_is_refused(self) -> None:
        """Silently dropping it would lose data on the next write."""
        with pytest.raises(ValidationError):
            schemas.CompetencyRef(
                id="perform_cannulation",
                name="Insert cannula",
                risk_level="high",  # type: ignore[call-arg]
            )


class TestAttachment:
    def test_a_well_formed_attachment_validates(self) -> None:
        attachment = schemas.Attachment(
            hash="sha256:" + "ab12cd34" * 8,
            filename="certificate.pdf",
            size_bytes=104857,
            media_type="application/pdf",
        )

        assert attachment.hash.startswith("sha256:")

    @pytest.mark.parametrize(
        "bad_hash",
        [
            "ab12cd34" * 8,  # no algorithm prefix
            "md5:" + "ab" * 16,
            "sha256:" + "AB12CD34" * 8,  # upper case
            "sha256:abc",
        ],
    )
    def test_refuses_a_hash_the_store_could_not_resolve(
        self, bad_hash: str
    ) -> None:
        with pytest.raises(ValidationError):
            schemas.Attachment(
                hash=bad_hash,
                filename="x.pdf",
                size_bytes=1,
                media_type="application/pdf",
            )

    def test_refuses_an_empty_filename(self) -> None:
        with pytest.raises(ValidationError):
            schemas.Attachment(
                hash="sha256:" + "a" * 64,
                filename="",
                size_bytes=1,
                media_type="application/pdf",
            )

    def test_refuses_a_negative_size(self) -> None:
        with pytest.raises(ValidationError):
            schemas.Attachment(
                hash="sha256:" + "a" * 64,
                filename="x.pdf",
                size_bytes=-1,
                media_type="application/pdf",
            )


class TestRegistration:
    def test_declared_is_the_default(self) -> None:
        """Quill checks no register, and the record must say so."""
        registration = schemas.Registration(body="GMC", number="1234567")

        assert registration.verified is False
        assert registration.verified_by is None

    def test_a_verified_registration_names_who_and_when(self) -> None:
        registration = schemas.Registration(
            body="GMC",
            number="1234567",
            verified=True,
            verified_by="dr.patel@example.nhs.uk",
            verified_on=date(2026, 4, 2),
        )

        assert registration.verified is True

    def test_refuses_verified_without_a_checker(self) -> None:
        with pytest.raises(ValidationError, match="verified_by"):
            schemas.Registration(body="GMC", number="1234567", verified=True)

    def test_refuses_verified_without_a_date(self) -> None:
        with pytest.raises(ValidationError, match="verified_on"):
            schemas.Registration(
                body="GMC",
                number="1234567",
                verified=True,
                verified_by="someone@example.nhs.uk",
            )

    def test_refuses_a_checker_without_the_flag(self) -> None:
        """A check that confirmed nothing must not look like one that did."""
        with pytest.raises(ValidationError, match="only meaningful"):
            schemas.Registration(
                body="GMC",
                number="1234567",
                verified_by="someone@example.nhs.uk",
                verified_on=date(2026, 4, 2),
            )


class TestCompetencyRef:
    def test_carries_both_id_and_label(self) -> None:
        ref = schemas.CompetencyRef(
            id="prescribe_sact", name="Review and prescribe SACT"
        )

        assert ref.id == "prescribe_sact"
        assert ref.name

    @pytest.mark.parametrize(
        "bad_id",
        ["Prescribe_SACT", "prescribing/chemotherapy", "has spaces", ""],
    )
    def test_refuses_an_id_that_is_not_a_flat_slug(self, bad_id: str) -> None:
        with pytest.raises(ValidationError):
            schemas.CompetencyRef(id=bad_id, name="Something")

    def test_refuses_an_empty_label(self) -> None:
        """A record whose label is blank is unreadable years later."""
        with pytest.raises(ValidationError):
            schemas.CompetencyRef(id="perform_cannulation", name="")


class TestSignOffCorrections:
    def test_a_correction_names_what_it_corrects(self) -> None:
        record = _signed_off(kind="correction", corrects="earlier-folder-name")

        assert record.corrects == "earlier-folder-name"

    def test_a_correction_without_a_target_is_refused(self) -> None:
        with pytest.raises(ValidationError, match="must name the sign-off"):
            _signed_off(kind="correction")

    @pytest.mark.parametrize(
        "kind", ["initial", "progression", "reassessment"]
    )
    def test_nothing_else_may_correct(self, kind: str) -> None:
        """Progression and reassessment supersede nothing."""
        with pytest.raises(ValidationError, match="must not set corrects"):
            _signed_off(kind=kind, corrects="earlier-folder-name")


class TestSignedOffRecords:
    def test_a_complete_signed_record_validates(self) -> None:
        record = _signed_off()

        assert record.status == "signed_off"
        assert record.signed_off_by is not None

    @pytest.mark.parametrize(
        "missing", ["signed_off_by", "signed_at", "meaning"]
    )
    def test_a_signed_record_must_say_by_whom_when_and_how(
        self, missing: str
    ) -> None:
        with pytest.raises(ValidationError, match=missing):
            _signed_off(**{missing: None})

    def test_a_requested_record_needs_none_of_them(self) -> None:
        """The record is written when the holder asks, not when signed."""
        record = schemas.SignOff(
            id="20260314T143207.881Z-" + "a" * 32,
            competency=schemas.CompetencyRef(
                id="perform_bronchoscopy", name="Perform bronchoscopy"
            ),
            kind="initial",
            status="requested",
            observed_on=date(2026, 3, 12),
        )

        assert record.signed_off_by is None

    def test_refuses_a_naive_signed_at(self) -> None:
        with pytest.raises(ValidationError, match="timezone-aware"):
            _signed_off(
                signed_at=datetime(2026, 3, 14, 14, 32)  # noqa: DTZ001
            )

    def test_the_three_clocks_are_separate_fields(self) -> None:
        """observed_on is a date, signed_at an instant; the commit time is
        the store's business and appears nowhere in the record."""
        record = _signed_off()

        assert isinstance(record.observed_on, date)
        assert isinstance(record.signed_at, datetime)
        assert not hasattr(record, "committed_at")


class TestEvidenceSnapshot:
    def test_records_what_was_in_view(self) -> None:
        """Not a threshold that was met — what the assessor could see."""
        snapshot = schemas.EvidenceSnapshot(
            logbook_entries=38,
            logbook_digest="sha256:" + "a" * 64,
            certificates=["2025-11-04-bronchoscopy-course"],
        )

        assert snapshot.logbook_entries == 38

    def test_carries_no_target(self) -> None:
        """How many is enough is the assessor's judgement, not ours."""
        assert "target" not in schemas.EvidenceSnapshot.model_fields
        assert "required" not in schemas.EvidenceSnapshot.model_fields
        assert "sufficient" not in schemas.EvidenceSnapshot.model_fields


class TestIndexEntry:
    def test_counts_without_comparing(self) -> None:
        entry = schemas.IndexEntry(
            id="perform_bronchoscopy",
            name="Perform bronchoscopy",
            status="signed_off",
            logbook_entries=38,
        )

        assert entry.logbook_entries == 38

    def test_has_no_progress_field(self) -> None:
        for forbidden in ("progress", "percentage", "ready", "target"):
            assert forbidden not in schemas.IndexEntry.model_fields


class TestSelfDeclaredRecords:
    def test_a_logbook_entry_has_a_date_without_a_time(self) -> None:
        """Nobody recalls whether it was 09:30 or 11:00 on a Friday."""
        entry = schemas.LogbookEntry(performed_on=date(2026, 3, 12))

        assert isinstance(entry.performed_on, date)
        assert not isinstance(entry.performed_on, datetime)

    def test_a_logbook_entry_may_count_towards_several(self) -> None:
        entry = schemas.LogbookEntry(
            performed_on=date(2026, 3, 12),
            also_counts_towards=["perform_thoracic_ultrasound"],
        )

        assert entry.also_counts_towards == ["perform_thoracic_ultrasound"]

    def test_a_certificate_may_span_several_competencies(self) -> None:
        certificate = schemas.Certificate(
            id="20251104T090000.000Z-" + "a" * 32,
            title="Bronchoscopy course",
            issuer="Royal College of Physicians",
            awarded_on=date(2025, 11, 4),
            competencies=[
                schemas.CompetencyRef(
                    id="perform_bronchoscopy", name="Perform bronchoscopy"
                ),
                schemas.CompetencyRef(
                    id="take_informed_consent", name="Take informed consent"
                ),
            ],
        )

        assert len(certificate.competencies) == 2

    def test_a_cpd_entry_records_hours_when_claimed(self) -> None:
        entry = schemas.CpdEntry(
            activity_on=date(2026, 2, 11),
            title="Regional oncology day",
            activity_type="conference",
            hours=6.5,
        )

        assert entry.hours == 6.5

    def test_cpd_hours_cannot_be_negative(self) -> None:
        with pytest.raises(ValidationError):
            schemas.CpdEntry(
                activity_on=date(2026, 2, 11),
                title="A thing",
                activity_type="course",
                hours=-1,
            )

    def test_a_reflection_carries_its_structure_in_frontmatter(self) -> None:
        """The prose is the file body, which is why it is not a field."""
        reflection = schemas.Reflection(
            title="A difficult airway",
            written_on=date(2026, 3, 14),
        )

        assert "body" not in schemas.Reflection.model_fields
        assert reflection.title


class TestIndex:
    def test_refuses_a_naive_generated_at(self) -> None:
        with pytest.raises(ValidationError, match="timezone-aware"):
            schemas.Index(
                schema_version=1,
                generated_at=datetime(2026, 3, 14, 14, 32),  # noqa: DTZ001
            )

    def test_an_empty_index_is_valid(self) -> None:
        """A passport created a moment ago has no evidence yet."""
        index = schemas.Index(
            schema_version=1,
            generated_at=datetime(2026, 3, 14, 14, 32, tzinfo=UTC),
        )

        assert index.competencies == []


class TestManifestAndProfile:
    def test_a_manifest_carries_the_passport_id(self) -> None:
        """Without it the id exists only in the directory path, so a
        copied folder would lose it."""
        manifest = schemas.Manifest(
            passport_id="3f2a8c1e4b7d49f0a6c2e8b1d5a7f309",
            schema_version=schemas.SCHEMA_VERSION,
            created_by="Quill Medical",
            created_at=date(2026, 9, 10),
        )

        assert manifest.passport_id

    def test_refuses_a_malformed_passport_id(self) -> None:
        with pytest.raises(ValidationError):
            schemas.Manifest(
                passport_id="not-a-uuid",
                schema_version=1,
                created_by="Quill Medical",
                created_at=date(2026, 9, 10),
            )

    def test_the_manifest_has_no_jurisdiction(self) -> None:
        """A person may practise in more than one country, so pinning the
        record to one would split a career that is not split."""
        assert "jurisdiction" not in schemas.Manifest.model_fields
        assert "country" not in schemas.Manifest.model_fields

    def test_a_profile_is_the_only_place_the_holder_is_named(self) -> None:
        profile = schemas.Profile(user_id="u-2", name="Dr Sam Reeve")

        assert profile.name
        # No record model repeats the holder: copying the name into every
        # record would leave stale ones behind the first time somebody
        # marries.
        assert "holder" not in schemas.SignOff.model_fields
        assert "holder_name" not in schemas.SignOff.model_fields
