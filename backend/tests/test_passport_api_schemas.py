"""Tests for app/schemas/passport.py.

Schemas are usually not worth testing on their own — Pydantic is not
ours to verify. These earn their place because three properties here are
decisions rather than mechanics, and each would fail silently:

**Request bodies forbid unknown fields.** A client sending
``competancy_id`` must be told, not have the field dropped and the
request half-applied. Every ``*In`` model is checked, because the rule
holds only where ``extra="forbid"`` was actually set.

**The wire vocabularies match the record ones.** The enums are imported
from the record model rather than restated. A second copy would drift —
a CPD type added on disk and forgotten here would be storable but not
submittable — so each field's annotation is asserted to accept exactly
the record model's values.

**Nothing on the wire judges sufficiency.** No response field carries a
target, a percentage or a ready-or-not verdict. A logbook reports its
count and stops. This is pinned structurally, so adding such a field
fails a test rather than shipping.
"""  # cspell:ignore competancy

from __future__ import annotations

from typing import get_args

import pydantic
import pytest

from app.features.passport import schemas as record_schemas
from app.schemas import passport as api_schemas
from app.schemas.passport import (
    CertificateIn,
    CommonCompetenciesIn,
    CompetencyStateOut,
    CpdEntryIn,
    LogbookEntryIn,
    LogbookOut,
    ReflectionIn,
    SignOffDeclineIn,
    SignOffIn,
    SignOffRequestIn,
)

#: Every request model. Listed explicitly rather than discovered, so a
#: new one is a deliberate addition to this list and gets the same
#: guarantees rather than quietly missing them.
REQUEST_MODELS = [
    SignOffRequestIn,
    SignOffIn,
    SignOffDeclineIn,
    CertificateIn,
    LogbookEntryIn,
    ReflectionIn,
    CpdEntryIn,
    CommonCompetenciesIn,
]

#: Words that would mean the API had formed a view on whether somebody
#: has done enough. The passport counts and never compares.
JUDGEMENT_WORDS = (
    "target",
    "required",
    "progress",
    "percent",
    "percentage",
    "complete",
    "completion",
    "ready",
    "sufficient",
    "remaining",
    "outstanding",
)


class TestRequestsForbidUnknownFields:
    @pytest.mark.parametrize("model", REQUEST_MODELS)
    def test_unknown_field_is_refused(
        self, model: type[pydantic.BaseModel]
    ) -> None:
        """A typo in a field name must be an error, not a silent drop."""
        assert model.model_config.get("extra") == "forbid"

    def test_a_misspelled_field_raises(self) -> None:
        # cspell:ignore noets
        with pytest.raises(pydantic.ValidationError):
            LogbookEntryIn(
                performed_on="2026-03-14",  # type: ignore[arg-type]
                noets="a typo for notes",  # type: ignore[call-arg]
            )


class TestVocabulariesAreShared:
    """The enums are the record model's, not a second copy.

    Asserted through the annotations the API models actually carry,
    rather than through names re-exported from the API module. mypy's
    strict mode forbids implicit re-export, so reaching them via
    ``api_schemas.`` would not type-check — and the annotation is the
    better thing to test anyway: it is what the field really accepts.
    """

    def test_sign_off_meaning_accepts_exactly_the_record_values(
        self,
    ) -> None:
        annotation = SignOffIn.model_fields["meaning"].annotation

        assert get_args(annotation) == get_args(
            record_schemas.SignOffMeaning
        ), "A separate copy would drift from what the store accepts."

    def test_sign_off_status_accepts_exactly_the_record_values(
        self,
    ) -> None:
        annotation = CompetencyStateOut.model_fields["status"].annotation

        assert get_args(annotation) == get_args(record_schemas.SignOffStatus)

    def test_sign_off_kind_accepts_exactly_the_record_values(self) -> None:
        annotation = api_schemas.SignOffOut.model_fields["kind"].annotation

        assert get_args(annotation) == get_args(record_schemas.SignOffKind)

    def test_supervision_accepts_exactly_the_record_values(self) -> None:
        """Optional on the wire, so the literal sits inside a union."""
        annotation = LogbookEntryIn.model_fields["supervision"].annotation
        literal = next(arg for arg in get_args(annotation) if get_args(arg))

        assert get_args(literal) == get_args(record_schemas.Supervision)

    def test_cpd_activity_type_accepts_exactly_the_record_values(
        self,
    ) -> None:
        annotation = CpdEntryIn.model_fields["activity_type"].annotation

        assert get_args(annotation) == get_args(record_schemas.CpdActivityType)

    def test_an_unknown_meaning_is_refused(self) -> None:
        """Only the three clinically distinct acts are accepted."""
        with pytest.raises(pydantic.ValidationError):
            SignOffIn(
                meaning="glanced at it",  # type: ignore[arg-type]
                declaration_confirmed=True,
            )


class TestDeclarationsAreRequired:
    """Two confirmations the API refuses to default."""

    def test_signing_requires_the_declaration_field(self) -> None:
        """Omitting it is an error rather than a false.

        Defaulting would make signing a click. The declaration is what
        makes it a deliberate act, so its absence must be refused.
        """
        with pytest.raises(pydantic.ValidationError):
            SignOffIn(meaning="directly observed")  # type: ignore[call-arg]

    def test_a_reflection_requires_the_anonymisation_confirmation(
        self,
    ) -> None:
        """Reflections are one of two places patient data could enter."""
        with pytest.raises(pydantic.ValidationError):
            ReflectionIn(  # type: ignore[call-arg]
                title="A difficult airway",
                written_on="2026-03-14",  # type: ignore[arg-type]
                body="What I learned.",
            )

    def test_a_confirmed_reflection_validates(self) -> None:
        reflection = ReflectionIn(
            title="A difficult airway",
            written_on="2026-03-14",  # type: ignore[arg-type]
            body="What I learned.",
            anonymised_confirmed=True,
        )

        assert reflection.anonymised_confirmed


class TestNothingJudgesSufficiency:
    """The passport counts evidence; it never says whether it is enough."""

    def test_the_logbook_response_has_a_count_and_no_target(self) -> None:
        fields = set(LogbookOut.model_fields)

        assert "count" in fields
        assert not [
            name
            for name in fields
            if any(word in name.lower() for word in JUDGEMENT_WORDS)
        ]

    def test_competency_state_carries_no_verdict(self) -> None:
        """Status, level and dates — never a judgement about progress."""
        offending = [
            name
            for name in CompetencyStateOut.model_fields
            if any(word in name.lower() for word in JUDGEMENT_WORDS)
        ]

        assert not offending, (
            f"{offending} would have the API judge sufficiency, which is "
            "the assessor's call and not the software's."
        )

    def test_a_shortlist_cannot_be_marked_required(self) -> None:
        """A curated shortlist suggests; it never restricts.

        The field is named ``commonly_used_here`` rather than
        ``required`` deliberately: the wording matters as much as the
        behaviour, since a list presented as the set that matters
        quietly becomes a syllabus.
        """
        fields = set(api_schemas.CompetencyOptionOut.model_fields)

        assert "commonly_used_here" in fields
        assert not [
            name
            for name in fields
            if any(word in name.lower() for word in JUDGEMENT_WORDS)
        ]


class TestIdentifiersTravelWithLabels:
    """A response must be readable without holding the catalogue."""

    def test_a_competency_reference_carries_both(self) -> None:
        fields = set(api_schemas.CompetencyRefOut.model_fields)

        assert {"id", "name"} <= fields

    def test_a_level_reference_carries_both(self) -> None:
        fields = set(api_schemas.LevelRefOut.model_fields)

        assert {"id", "name"} <= fields


class TestRegistrationsAreHonest:
    """Declared until somebody checks a register, and the wire says so."""

    def test_verified_defaults_to_false(self) -> None:
        registration = api_schemas.RegistrationOut(
            body="GMC", number="1234567"
        )

        assert registration.verified is False

    def test_an_assessor_reports_whether_anyone_checked(self) -> None:
        fields = set(api_schemas.AssessorOut.model_fields)

        assert "registration_verified" in fields


class TestVerificationStatesItsLimits:
    def test_the_response_carries_what_it_does_not_prove(self) -> None:
        """A hash match proves less than a reader might assume.

        Not a professional registration, and nothing at all to somebody
        who distrusts Quill — the same system computed and stored it. The
        response says so rather than leaving it to be inferred.
        """
        fields = set(api_schemas.VerificationOut.model_fields)

        assert {"unchanged", "proves", "does_not_prove"} <= fields
