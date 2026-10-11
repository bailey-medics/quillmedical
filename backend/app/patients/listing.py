"""Which patients a caller is shown, and what is said about each.

FHIR hands over every patient it holds. These functions decide which of
them one caller is shown.

Two questions are asked of every record. Is the patient within the
caller's reach: cared for at an org unit the caller belongs to, or one
the caller has been given access to from outside. And is the record
deactivated, which hides it from everybody but somebody who manages
patients and asked to see those too.

Who may list patients at all is the route's question. These functions
refuse nobody.

The list is not put in an order: the records come back as FHIR gave
them.
"""

from collections.abc import Mapping, Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PatientMetadata, User
from app.organisations import get_accessible_patient_ids
from app.schemas.patients import PatientListItem


def activation_by_patient(db: Session) -> dict[str, bool]:
    """Whether each patient the core database has a record of is active.

    A patient with no record is not in the answer, and is treated as
    active by :func:`patient_rows`.
    """
    # Fetch all patient metadata from database
    stmt = select(PatientMetadata)
    metadata_records = db.execute(stmt).scalars().all()

    return {m.patient_id: m.is_active for m in metadata_records}


def sees_deactivated(actor: User, *, include_inactive: bool) -> bool:
    """Whether the caller is shown the deactivated patients as well.

    Seeing *deactivated* patients is a narrower question than seeing
    every patient: it applies within the list the caller can already
    reach, so it asks the patient competency rather than the platform
    role. Someone administering their own organisation's caseload has
    reason to see its deactivated patients; that is not a claim to
    reach every trust.

    Args:
        actor: The caller.
        include_inactive: Whether the caller asked for them.

    Returns:
        True only for somebody who asked and holds
        ``manage_patient_membership``. Asking without it is not
        refused: the deactivated patients are left out.
    """
    manages_patients = (
        "manage_patient_membership" in actor.get_final_competencies()
    )

    return include_inactive and manages_patients


def patients_within_reach(
    db: Session, actor: User, *, scope: str | None
) -> set[str] | None:
    """The patients the caller may be shown, or None for all of them.

    Seeing every patient in the deployment is not an administrative
    act at an org_unit - it is reach unbounded by any org_unit, which is
    what the platform role records. An admin at one trust is confined
    to the patients they share an organisation with, the same as anyone
    else.

    Args:
        db: Core database session.
        actor: The caller.
        scope: What the caller asked for. Only ``"admin"`` means
            anything, and only from an operator. Anything else, and
            ``"admin"`` from anybody else, is not refused: it is
            answered as though nothing had been asked.

    Returns:
        The FHIR ids of the patients, which is empty for somebody who
        belongs nowhere and has been given access to nobody, or None
        for an operator who asked for everybody.
    """
    is_operator = actor.platform_role == "superadmin"
    admin_scope = scope == "admin" and is_operator

    if admin_scope:
        return None  # no filtering

    return get_accessible_patient_ids(db, actor)


def patient_rows(
    records: Sequence[Mapping[str, Any]],
    within: set[str] | None,
    active: Mapping[str, bool],
    *,
    deactivated_too: bool,
) -> list[PatientListItem]:
    """The records the caller is shown, each with whether it is active.

    Args:
        records: Patient resources as FHIR gave them.
        within: The ids :func:`patients_within_reach` gave, or None for
            everybody.
        active: What :func:`activation_by_patient` gave.
        deactivated_too: What :func:`sees_deactivated` gave.

    Returns:
        One row for each record shown, in the order given. A record
        with no id is left out, as is one outside *within* and, unless
        *deactivated_too*, one that is deactivated.
    """
    # Enrich patients with activation status and filter
    enriched_patients: list[PatientListItem] = []

    for patient in records:
        patient_id = patient.get("id")
        if patient_id is None:
            continue

        # Org-based filtering (skip for admin scope)
        if within is not None and patient_id not in within:
            continue

        is_active = active.get(patient_id, True)

        # Filter based on activation status
        if is_active or deactivated_too:
            enriched_patients.append(
                PatientListItem.model_validate(
                    {**patient, "is_active": is_active}
                )
            )

    return enriched_patients


def patients_shown(
    db: Session,
    actor: User,
    records: Sequence[Mapping[str, Any]],
    *,
    scope: str | None,
    include_inactive: bool,
) -> list[PatientListItem]:
    """The patient list for one caller, from everything FHIR holds.

    Args:
        db: Core database session.
        actor: The caller.
        records: Every patient resource, as FHIR gave them.
        scope: The ``scope`` the caller sent, or None.
        include_inactive: Whether the caller asked for deactivated
            patients as well.

    Returns:
        The rows the caller is shown, in the order FHIR gave them.
    """
    active = activation_by_patient(db)
    deactivated_too = sees_deactivated(
        actor, include_inactive=include_inactive
    )
    within = patients_within_reach(db, actor, scope=scope)

    return patient_rows(
        records, within, active, deactivated_too=deactivated_too
    )
