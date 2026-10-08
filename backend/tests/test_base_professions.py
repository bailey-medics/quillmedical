"""Tests for app/cbac/base_professions.py.

Covers:
- The real shared/base-professions.yaml validates against
  BaseProfessionEntry with no errors
- get_profession_details / get_profession_base_competencies lookups
- resolve_user_competencies' union-then-remove formula
- competencies_kept_across_profession_change loses nothing and repeats
  nothing across a profession change, and changes nothing itself
- BaseProfessionEntry rejects malformed data (extra fields)
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.cbac.base_professions import (
    BASE_PROFESSIONS,
    PROFESSION_IDS,
    BaseProfessionEntry,
    competencies_kept_across_profession_change,
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
    appears on no profession here but the Passport admin.

    The split is not seniority. A consultant still gets signed off on
    new things, and a registrar signed off last year is often who signs
    off a junior this year; most clinicians at a paying organisation
    hold both competencies.

    The passport professions belong to the set for the opposite reason:
    the passport is the *only* thing they are for. A delegate or clinical
    lead holds a passport of their own and signs off other people's, at
    an organisation that uses the passport without the rest of Quill.
    A Passport admin holds it as a perk of running the scheme.
    ``passport_external_assessor`` is narrower still. A consultant invited from another trust gets it on a new account
    so they can reach the passport routes and nothing else - no patient
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
        "passport_delegate",
        "passport_clinical_lead",
        "passport_admin",
        "passport_external_assessor",
    }


def test_the_external_assessor_can_reach_nothing_but_the_passport() -> None:
    """The profession is the whole grant, so its ceiling is the point.

    An invited consultant does not work here. Anything else on this list
    would be access to a trust's data granted by a trainee sending an
    email, which is why it is pinned rather than left to review.
    """
    assessor = next(
        p for p in BASE_PROFESSIONS if p.id == "passport_external_assessor"
    )

    assert assessor.base_competencies == ["assess_clinician_passport"]
    assert not assessor.requires_clinical_services


@pytest.mark.parametrize(
    "profession_id", ["passport_delegate", "passport_clinical_lead"]
)
def test_passport_professions_need_nothing_clinical(
    profession_id: str,
) -> None:
    """A passport-only organisation runs with clinical services off.

    The passport holds no patient data, so neither profession may depend
    on FHIR or EHRbase, or the new user form would hide it exactly where
    it is needed.
    """
    profession = get_profession_details(profession_id)

    assert profession is not None
    assert not profession.requires_clinical_services


def test_a_passport_admin_runs_the_passport_and_holds_one() -> None:
    """Managing the passport comes with a passport of their own.

    ``assess_clinician_passport`` is the way in: without it every
    passport route refused them. ``passport_write`` lets them keep a
    passport. They may give writing to others through
    ``manage_passport`` but never to themselves, so without it an admin
    at a place with no cover switched on could not use what they run.
    Pinned whole, so nothing else arrives with the job unremarked.
    """
    admin = get_profession_details("passport_admin")

    assert admin is not None
    assert set(admin.base_competencies) == {
        "manage_passport",
        "assess_clinician_passport",
        "passport_write",
    }
    assert not admin.requires_clinical_services


def test_the_passport_clinical_lead_is_a_label() -> None:
    """The lead names a person; it grants nothing a delegate lacks.

    Anything more would be a clinical lead able to do what a delegate
    cannot, which the profession was agreed not to carry.
    """
    assert get_profession_base_competencies(
        "passport_clinical_lead"
    ) == get_profession_base_competencies("passport_delegate")


def test_only_the_passport_admin_profession_may_write_a_passport() -> None:
    """The sold half must not arrive free with a clinical account.

    ``passport_write`` is what a clinician or their organisation pays
    for. It comes from an organisation enabling it or from an individual
    subscription - so a clinical profession granting it would hand every
    clinician the paid feature at provisioning and make the split between
    assessing and holding cosmetic.

    The Passport admin is the one deliberate exception. Nobody may
    change their own competencies, so an admin could give writing to
    everybody but themselves; the profession carries it for them.

    Pinned rather than left to review because the failure is silent:
    everything works, nobody is refused, and the only symptom is that
    the product was given away.
    """
    grantors = {
        profession.id
        for profession in BASE_PROFESSIONS
        if "passport_write" in profession.base_competencies
    }

    assert grantors == {"passport_admin"}, (
        "passport_write is sold, so only passport_admin may grant it: "
        f"{sorted(grantors)}"
    )


def test_the_passport_is_not_a_default_for_patients_or_back_office() -> None:
    """Stated separately because it is the half that protects people.

    A patient holding it would be offered a clinical training record,
    and an administrator holding it could sign off clinical competence.
    Neither is a permission escalation - signing is refused only for
    self-sign-off - but both would be wrong by default, and a default
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


def test_teaching_admin_runs_teaching_without_the_root() -> None:
    """One teaching profession, carrying ``manage_teaching``.

    ``teaching_manager`` did the people half through ``manage_users``, the
    root competency, and was folded into ``teaching_admin``. See
    ``docs/docs/plans/2026-09-30-manage-teaching-competency-plan.md``.
    """
    assert get_profession_base_competencies("teaching_admin") == [
        "view_teaching_results",
        "take_teaching_modules",
        "manage_teaching",
        "view_teaching_analytics",
    ]
    assert get_profession_details("teaching_manager") is None


@pytest.mark.parametrize(
    "profession_id", ["safety_officer", "safety_clinical_lead", "safety_admin"]
)
def test_safety_professions_need_nothing_clinical(profession_id: str) -> None:
    """A safety-only organisation runs with clinical services off.

    A safety case holds no patient data, so no safety profession may
    depend on FHIR or EHRbase, or the new user form would hide it exactly
    where it is needed.
    """
    profession = get_profession_details(profession_id)

    assert profession is not None
    assert not profession.requires_clinical_services


def test_a_safety_admin_runs_safety_and_may_open_it() -> None:
    """Managing safety comes with the way into it, and nothing else.

    Pinned whole, as the passport admin is, so nothing arrives with the
    job unremarked.
    """
    admin = get_profession_details("safety_admin")

    assert admin is not None
    assert set(admin.base_competencies) == {
        "manage_safety",
        "view_safety_cases",
    }


def test_the_safety_clinical_lead_is_a_label() -> None:
    """The lead names a person; it grants nothing an officer lacks."""
    assert get_profession_base_competencies(
        "safety_clinical_lead"
    ) == get_profession_base_competencies("safety_officer")


def test_a_patient_made_a_healthcare_assistant_keeps_their_own_record() -> (
    None
):
    """The old profession's competency is carried, not replaced."""
    outside = competencies_kept_across_profession_change(
        [],
        old_profession="patient",
        new_profession="healthcare_assistant",
    )

    assert outside == ["access_own_patient_records"]


def test_what_the_new_profession_gives_is_not_listed_again() -> None:
    """Shared competencies come through the profession, not as extras."""
    shared = set(get_profession_base_competencies("healthcare_assistant"))
    shared &= set(get_profession_base_competencies("consultant"))
    assert shared, "the two professions no longer overlap; pick another pair"

    outside = competencies_kept_across_profession_change(
        [],
        old_profession="healthcare_assistant",
        new_profession="consultant",
    )

    assert not shared & set(outside)


def test_what_they_already_held_outside_survives_a_change() -> None:
    """An extra held before the change is still held after it."""
    outside = competencies_kept_across_profession_change(
        ["manage_users"],
        old_profession="patient",
        new_profession="healthcare_assistant",
    )

    assert outside == ["access_own_patient_records", "manage_users"]


def test_it_changes_nothing_it_is_given() -> None:
    """A calculation only: the caller's list is left as it was."""
    held = ["manage_users"]

    competencies_kept_across_profession_change(
        held,
        old_profession="patient",
        new_profession="healthcare_assistant",
    )

    assert held == ["manage_users"]
