"""Tests for app/features/passport/hashing.py.

The fingerprint's value is entirely in its selectivity, so these tests
come in pairs: for each field, either changing it must move the hash or
it must not. A hash that moved for everything would be the file's own
checksum, and one that moved for nothing would be decoration.

The pairing is deliberate rather than tidy. A test that only asserted
"the level changes the hash" would still pass if the implementation
hashed the whole record, and the whole point is the fields it leaves
out.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta, timezone

import pytest

from app.features.passport import hashing, schemas
from app.features.passport.hashing import HashMismatchError


def _registration(**overrides: object) -> schemas.Registration:
    fields: dict[str, object] = {"body": "GMC", "number": "1234567"}
    fields.update(overrides)
    return schemas.Registration(**fields)  # type: ignore[arg-type]


def _assessor(**overrides: object) -> schemas.Assessor:
    fields: dict[str, object] = {
        "user_id": "u-1",
        "name": "Dr Amara Okonkwo",
        "role": "Consultant",
        "registrations": [_registration()],
        "care_location": "Bristol Royal Infirmary",
    }
    fields.update(overrides)
    return schemas.Assessor(**fields)  # type: ignore[arg-type]


def _sign_off(**overrides: object) -> schemas.SignOff:
    fields: dict[str, object] = {
        "id": "20260314T143207.881Z-" + "a" * 32,
        "competency": schemas.CompetencyRef(
            id="perform_bronchoscopy", name="Perform bronchoscopy"
        ),
        "kind": "initial",
        "status": "signed_off",
        "level": schemas.LevelRef(
            id="unsupervised", name="Entrusted to act unsupervised"
        ),
        "observed_on": date(2026, 3, 12),
        "signed_at": datetime(2026, 3, 14, 14, 32, tzinfo=UTC),
        "expires_on": date(2027, 3, 12),
        "meaning": "directly observed",
        "signed_off_by": _assessor(),
    }
    fields.update(overrides)
    return schemas.SignOff(**fields)  # type: ignore[arg-type]


class TestStability:
    """The same record must fingerprint the same way, every time."""

    def test_the_same_record_hashes_the_same(self) -> None:
        assert hashing.content_hash(_sign_off()) == hashing.content_hash(
            _sign_off()
        )

    def test_re_serialising_an_unchanged_record_reproduces_the_hash(
        self,
    ) -> None:
        """Round-tripping through YAML or JSON must not move it."""
        original = _sign_off()

        restored = schemas.SignOff.model_validate(
            json.loads(original.model_dump_json())
        )

        assert hashing.content_hash(restored) == hashing.content_hash(original)

    def test_the_hash_looks_like_every_other_hash_in_a_passport(
        self,
    ) -> None:
        value = hashing.content_hash(_sign_off())

        assert value.startswith("sha256:")
        assert len(value) == len("sha256:") + 64

    def test_the_same_instant_in_another_zone_hashes_the_same(self) -> None:
        """One instant is one instant, however it was written down."""
        eastern = timezone(timedelta(hours=-5))

        in_utc = _sign_off(signed_at=datetime(2026, 3, 14, 14, 32, tzinfo=UTC))
        in_eastern = _sign_off(
            signed_at=datetime(2026, 3, 14, 9, 32, tzinfo=eastern)
        )

        assert hashing.content_hash(in_utc) == hashing.content_hash(in_eastern)

    def test_attachment_order_does_not_matter(self) -> None:
        """The order two files were uploaded in says nothing."""
        first = schemas.Attachment(
            hash="sha256:" + "ab" * 32,
            filename="a.pdf",
            size_bytes=1,
            media_type="application/pdf",
        )
        second = schemas.Attachment(
            hash="sha256:" + "cd" * 32,
            filename="b.pdf",
            size_bytes=2,
            media_type="application/pdf",
        )

        assert hashing.content_hash(
            _sign_off(attachments=[first, second])
        ) == hashing.content_hash(_sign_off(attachments=[second, first]))

    def test_registration_order_does_not_matter(self) -> None:
        gmc = _registration(body="GMC", number="1234567")
        nmc = _registration(body="NMC", number="98765")

        assert hashing.content_hash(
            _sign_off(signed_off_by=_assessor(registrations=[gmc, nmc]))
        ) == hashing.content_hash(
            _sign_off(signed_off_by=_assessor(registrations=[nmc, gmc]))
        )


class TestWhatMustMoveTheHash:
    """Change any of these and the record asserts something different."""

    def test_the_level(self) -> None:
        changed = _sign_off(
            level=schemas.LevelRef(
                id="indirect_supervision",
                name="Entrusted to act with indirect supervision",
            )
        )

        assert hashing.content_hash(changed) != hashing.content_hash(
            _sign_off()
        )

    def test_the_observed_date(self) -> None:
        assert hashing.content_hash(
            _sign_off(observed_on=date(2026, 3, 13))
        ) != hashing.content_hash(_sign_off())

    def test_the_signing_instant(self) -> None:
        assert hashing.content_hash(
            _sign_off(signed_at=datetime(2026, 3, 14, 15, 0, tzinfo=UTC))
        ) != hashing.content_hash(_sign_off())

    def test_the_expiry(self) -> None:
        assert hashing.content_hash(
            _sign_off(expires_on=date(2028, 3, 12))
        ) != hashing.content_hash(_sign_off())

    def test_the_competency(self) -> None:
        assert hashing.content_hash(
            _sign_off(
                competency=schemas.CompetencyRef(
                    id="perform_cannulation", name="Insert cannula"
                )
            )
        ) != hashing.content_hash(_sign_off())

    def test_the_assessor(self) -> None:
        assert hashing.content_hash(
            _sign_off(signed_off_by=_assessor(user_id="someone-else"))
        ) != hashing.content_hash(_sign_off())

    def test_an_assessors_registration(self) -> None:
        """Professional standing cannot be quietly rewritten afterwards."""
        assert hashing.content_hash(
            _sign_off(
                signed_off_by=_assessor(
                    registrations=[_registration(number="7654321")]
                )
            )
        ) != hashing.content_hash(_sign_off())

    def test_the_care_location(self) -> None:
        assert hashing.content_hash(
            _sign_off(signed_off_by=_assessor(care_location="Somewhere else"))
        ) != hashing.content_hash(_sign_off())

    def test_the_meaning(self) -> None:
        """Directly observed and reviewed evidence are different acts."""
        assert hashing.content_hash(
            _sign_off(meaning="reviewed evidence")
        ) != hashing.content_hash(_sign_off())

    def test_the_status(self) -> None:
        assert hashing.content_hash(
            _sign_off(
                status="declined",
                signed_off_by=None,
                signed_at=None,
                meaning=None,
            )
        ) != hashing.content_hash(_sign_off())

    def test_the_kind(self) -> None:
        assert hashing.content_hash(
            _sign_off(kind="reassessment")
        ) != hashing.content_hash(_sign_off())

    def test_an_attachment(self) -> None:
        attachment = schemas.Attachment(
            hash="sha256:" + "ab" * 32,
            filename="evidence.pdf",
            size_bytes=1,
            media_type="application/pdf",
        )

        assert hashing.content_hash(
            _sign_off(attachments=[attachment])
        ) != hashing.content_hash(_sign_off())

    def test_the_record_id(self) -> None:
        assert hashing.content_hash(
            _sign_off(id="20260314T143207.881Z-" + "b" * 32)
        ) != hashing.content_hash(_sign_off())


class TestWhatMustNotMoveTheHash:
    """Cosmetic edits must not look like tampering."""

    def test_a_comment(self) -> None:
        assert hashing.content_hash(
            _sign_off(comments="Straightforward. Biopsies taken.")
        ) == hashing.content_hash(_sign_off())

    def test_fixing_a_typo_in_a_comment(self) -> None:
        before = _sign_off(comments="Uneventful. Biopsy taken")
        after = _sign_off(comments="Uneventful. Biopsy taken.")

        assert hashing.content_hash(before) == hashing.content_hash(after)

    def test_a_competency_display_name(self) -> None:
        """A convenience copy of the id, which does contribute."""
        assert hashing.content_hash(
            _sign_off(
                competency=schemas.CompetencyRef(
                    id="perform_bronchoscopy",
                    name="Perform flexible bronchoscopy",
                )
            )
        ) == hashing.content_hash(_sign_off())

    def test_a_level_display_name(self) -> None:
        assert hashing.content_hash(
            _sign_off(
                level=schemas.LevelRef(
                    id="unsupervised", name="Works unsupervised"
                )
            )
        ) == hashing.content_hash(_sign_off())

    def test_the_assessors_name(self) -> None:
        """People are renamed; none of that changes what was decided."""
        assert hashing.content_hash(
            _sign_off(signed_off_by=_assessor(name="Dr Amara Okonkwo-Smith"))
        ) == hashing.content_hash(_sign_off())

    def test_the_assessors_role_label(self) -> None:
        assert hashing.content_hash(
            _sign_off(
                signed_off_by=_assessor(
                    role="Consultant Respiratory Physician"
                )
            )
        ) == hashing.content_hash(_sign_off())

    def test_verifying_a_registration_afterwards(self) -> None:
        """Verification must not invalidate the record it confirms."""
        verified = _registration(
            verified=True,
            verified_by="admin@example.nhs.uk",
            verified_on=date(2026, 4, 2),
        )

        assert hashing.content_hash(
            _sign_off(signed_off_by=_assessor(registrations=[verified]))
        ) == hashing.content_hash(_sign_off())

    def test_the_registration_verified_flag_on_the_assessor(self) -> None:
        assert hashing.content_hash(
            _sign_off(signed_off_by=_assessor(registration_verified=True))
        ) == hashing.content_hash(_sign_off())

    def test_an_attachments_filename(self) -> None:
        """Renaming a file must not invalidate the record referencing it."""
        digest = "sha256:" + "ab" * 32
        one = schemas.Attachment(
            hash=digest,
            filename="scan.pdf",
            size_bytes=1,
            media_type="application/pdf",
        )
        other = schemas.Attachment(
            hash=digest,
            filename="bronchoscopy-dops.pdf",
            size_bytes=1,
            media_type="application/pdf",
        )

        assert hashing.content_hash(
            _sign_off(attachments=[one])
        ) == hashing.content_hash(_sign_off(attachments=[other]))

    def test_the_evidence_snapshot(self) -> None:
        """What was in view, not part of the decision."""
        assert hashing.content_hash(
            _sign_off(
                evidence=schemas.EvidenceSnapshot(
                    logbook_entries=38,
                    certificates=["2025-11-04-a-course"],
                )
            )
        ) == hashing.content_hash(_sign_off())

    def test_the_content_hash_itself(self) -> None:
        """A file cannot contain its own fingerprint."""
        computed = hashing.content_hash(_sign_off())

        assert (
            hashing.content_hash(_sign_off(content_hash=computed)) == computed
        )


class TestCanonicalForm:
    def test_keys_are_sorted(self) -> None:
        """Two implementations must serialise identically."""
        rendered = hashing.canonical_bytes(_sign_off()).decode()
        keys = list(json.loads(rendered).keys())

        assert keys == sorted(keys)

    def test_there_is_no_insignificant_whitespace(self) -> None:
        rendered = hashing.canonical_bytes(_sign_off()).decode()

        assert ", " not in rendered
        assert not rendered.endswith("\n")

    def test_dates_are_iso_strings(self) -> None:
        payload = hashing.canonical_payload(_sign_off())

        assert payload["observed_on"] == "2026-03-12"
        assert payload["signed_at"].startswith("2026-03-14T14:32")

    def test_non_ascii_survives_rather_than_escaping(self) -> None:
        """The same name must hash the same in every locale."""
        rendered = hashing.canonical_bytes(
            _sign_off(
                signed_off_by=_assessor(care_location="Ward 5 \u2014 annexe")
            )
        ).decode()

        assert "\u2014" in rendered

    def test_the_payload_covers_every_contributing_field(self) -> None:
        payload = hashing.canonical_payload(_sign_off())

        assert set(payload) == set(hashing.CONTRIBUTING)

    def test_no_contributing_field_is_also_listed_as_excluded(self) -> None:
        """The two lists are read side by side, so they must not disagree."""
        assert not set(hashing.CONTRIBUTING) & set(hashing.NON_CONTRIBUTING)


class TestVerify:
    def test_a_matching_record_verifies(self) -> None:
        record = _sign_off()
        signed = _sign_off(content_hash=hashing.content_hash(record))

        assert hashing.matches(signed) is True
        hashing.verify(signed)

    def test_an_altered_record_does_not(self) -> None:
        record = _sign_off()
        tampered = _sign_off(
            level=schemas.LevelRef(id="supervised", name="With supervision"),
            content_hash=hashing.content_hash(record),
        )

        assert hashing.matches(tampered) is False

        with pytest.raises(HashMismatchError, match="does not match"):
            hashing.verify(tampered)

    def test_the_mismatch_names_both_hashes(self) -> None:
        """The only useful next step is comparing them."""
        record = _sign_off()
        stored = hashing.content_hash(record)
        tampered = _sign_off(observed_on=date(2026, 1, 1), content_hash=stored)

        with pytest.raises(HashMismatchError, match=stored[:20]):
            hashing.verify(tampered)

    def test_a_record_with_no_hash_does_not_verify(self) -> None:
        """Answering "verified" would assert more than is known."""
        assert hashing.matches(_sign_off()) is False

        with pytest.raises(HashMismatchError, match="no content_hash"):
            hashing.verify(_sign_off())

    def test_the_mismatch_does_not_accuse_anyone(self) -> None:
        """A bug in a writer looks identical to an edit."""
        record = _sign_off()
        tampered = _sign_off(
            kind="reassessment", content_hash=hashing.content_hash(record)
        )

        with pytest.raises(HashMismatchError) as caught:
            hashing.verify(tampered)

        assert "or by a bug" in str(caught.value)


class TestVerifyTemplate:
    def test_says_what_the_check_does_not_prove(self) -> None:
        """A reader must not infer more from a match than it supports."""
        assert "does **not** prove" in hashing.VERIFY_TEMPLATE
        assert "registration" in hashing.VERIFY_TEMPLATE

    def test_uses_tools_already_on_the_machine(self) -> None:
        assert "sha256sum" in hashing.VERIFY_TEMPLATE
        assert "git log" in hashing.VERIFY_TEMPLATE

    def test_promises_no_keys(self) -> None:
        assert "no keys" in hashing.VERIFY_TEMPLATE
