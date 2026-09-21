"""Tests for app/cbac/base_professions.py.

Covers:
- The real shared/base-professions.yaml validates against
  BaseProfessionEntry with no errors
- get_profession_details / get_profession_base_competencies lookups
- resolve_user_competencies' union-then-remove formula
- BaseProfessionEntry rejects malformed data (extra fields)
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.cbac.base_professions import (
    BASE_PROFESSIONS,
    PROFESSION_IDS,
    BaseProfessionEntry,
    get_profession_base_competencies,
    get_profession_details,
    resolve_user_competencies,
)


def test_all_real_professions_loaded() -> None:
    assert len(BASE_PROFESSIONS) > 0
    assert len(BASE_PROFESSIONS) == len(PROFESSION_IDS)
    assert "patient" in PROFESSION_IDS
    assert "consultant" in PROFESSION_IDS


def test_get_profession_details_known_id() -> None:
    details = get_profession_details("patient")
    assert details is not None
    assert details.id == "patient"


def test_get_profession_details_unknown_id() -> None:
    assert get_profession_details("does-not-exist") is None


def test_get_profession_base_competencies_known_id() -> None:
    competencies = get_profession_base_competencies("patient")
    assert "access_own_patient_records" in competencies
    # Not the clinical one: a patient reaches their own record, never a
    # caseload. The two were one id until the split.
    assert "access_patient_records" not in competencies


def test_get_profession_base_competencies_unknown_id() -> None:
    assert get_profession_base_competencies("does-not-exist") == []


def test_resolve_user_competencies_combines_and_removes() -> None:
    result = resolve_user_competencies(
        base_profession="patient",
        additional_competencies=["extra_one"],
        removed_competencies=["access_own_patient_records"],
    )
    assert "extra_one" in result
    assert "access_own_patient_records" not in result


def test_resolve_user_competencies_unknown_profession_defaults_empty() -> None:
    result = resolve_user_competencies(base_profession="does-not-exist")
    assert result == []


def test_base_profession_entry_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        BaseProfessionEntry(
            id="x",
            display_name="X",
            description="desc",
            requires_clinical_services=True,
            base_competencies=[],
            unexpected_field="oops",  # type: ignore[call-arg]
        )


def test_clinicians_hold_the_passport_and_others_do_not() -> None:
    """Who gets the clinician passport by default, and who does not.

    Pinned because the split is a judgement rather than something the
    data states: ``requires_clinical_services`` is true for receptionists
    and patients too, so it cannot be the discriminator. The rule is
    whether the profession practises and accumulates assessed
    competencies.

    Every clinical one of these is an assessor, and this is the free
    half: assessing is a favour to somebody else's record, so it arrives
    with the profession and never lapses. Holding a passport is the sold
    half and is granted by entitlement, which is why ``passport_write``
    appears on no profession here.

    The split is not seniority. A consultant still gets signed off on
    new things, and a registrar signed off last year is often who signs
    off a junior this year; most clinicians at a paying organisation
    hold both competencies.

    ``external_assessor`` is the one exception, and belongs to the set
    for the opposite reason: it is the *only* thing that profession can
    do. A consultant invited from another trust gets it on a new account
    so they can reach the passport routes and nothing else — no patient
    records, no clinical actions. Somebody who already uses Quill keeps
    the clinical profession they have, since all fourteen above already
    carry the competency.
    """
    holders = {
        p.id
        for p in BASE_PROFESSIONS
        if "assess_clinician_passport" in p.base_competencies
    }

    assert holders == {
        "foundation_year_1",
        "foundation_year_2",
        "specialty_trainee_1_2",
        "specialty_trainee_3_plus",
        "consultant",
        "general_practitioner",
        "registered_nurse",
        "advanced_nurse_practitioner",
        "healthcare_assistant",
        "pharmacist",
        "pharmacy_technician",
        "physiotherapist",
        "occupational_therapist",
        "paramedic",
        "external_assessor",
    }


def test_the_external_assessor_can_reach_nothing_but_the_passport() -> None:
    """The profession is the whole grant, so its ceiling is the point.

    An invited consultant does not work here. Anything else on this list
    would be access to a trust's data granted by a trainee sending an
    email, which is why it is pinned rather than left to review.
    """
    assessor = next(p for p in BASE_PROFESSIONS if p.id == "external_assessor")

    assert assessor.base_competencies == ["assess_clinician_passport"]
    assert not assessor.requires_clinical_services


def test_no_profession_grants_the_right_to_write_a_passport() -> None:
    """The sold half must not arrive free with an account.

    ``passport_write`` is what a clinician or their organisation pays
    for. It comes from an organisation enabling it or from an individual
    subscription, and from nowhere else — so a base profession granting
    it would hand every clinician the paid feature at provisioning and
    make the split between assessing and holding cosmetic.

    Pinned rather than left to review because the failure is silent:
    everything works, nobody is refused, and the only symptom is that
    the product was given away.
    """
    grantors = {
        profession.id
        for profession in BASE_PROFESSIONS
        if "passport_write" in profession.base_competencies
    }

    assert grantors == set(), (
        "passport_write is sold, so no base profession may grant it: "
        f"{sorted(grantors)}"
    )


def test_the_passport_is_not_a_default_for_patients_or_back_office() -> None:
    """Stated separately because it is the half that protects people.

    A patient holding it would be offered a clinical training record,
    and an administrator holding it could sign off clinical competence.
    Neither is a permission escalation — signing is refused only for
    self-sign-off — but both would be wrong by default, and a default
    is what most people will ever have.
    """
    for profession_id in (
        "patient",
        "medical_secretary",
        "receptionist",
        "clinic_manager",
        "patient_manager",
        "system_administrator",
        "teaching_delegate",
        "teaching_admin",
    ):
        competencies = get_profession_base_competencies(profession_id)
        assert (
            "assess_clinician_passport" not in competencies
        ), f"{profession_id} should not hold the passport by default"
