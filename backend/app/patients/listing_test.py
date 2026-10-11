"""Which patients a caller is shown, and what is said about each.

Two trusts, each with one patient on its list, and a third patient on
nobody's. Every identifier here is made up.

The rows come back in the order the records were handed in.
"""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models import (
    ExternalPatientAccess,
    OrgUnit,
    PatientMetadata,
    User,
    org_unit_patient_member,
)
from app.organisations import add_org_unit_member
from app.patients.listing import (
    activation_by_patient,
    patient_rows,
    patients_shown,
    patients_within_reach,
    sees_deactivated,
)
from app.schemas.patients import PatientListItem
from app.security import hash_password

NORTH_PATIENT = "made-up-north"
SOUTH_PATIENT = "made-up-south"
UNLISTED_PATIENT = "made-up-nowhere"


def _record(patient_id: str) -> dict[str, object]:
    """A minimal patient resource, as FHIR would give it."""
    return {"resourceType": "Patient", "id": patient_id}


EVERY_RECORD = [
    _record(NORTH_PATIENT),
    _record(SOUTH_PATIENT),
    _record(UNLISTED_PATIENT),
]


def _person(
    db: Session,
    username: str,
    profession: str,
    *places: OrgUnit,
    platform_role: str = "standard",
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        platform_role=platform_role,
    )
    db.add(user)
    db.flush()

    for place in places:
        add_org_unit_member(db, place.id, user.id, "staff")

    db.commit()
    db.refresh(user)

    return user


def _place(
    db: Session, name: str, kind: str, parent: OrgUnit | None = None
) -> OrgUnit:
    place = OrgUnit(
        name=name,
        type=kind,
        parent_id=parent.id if parent is not None else None,
    )
    db.add(place)
    db.commit()
    db.refresh(place)

    return place


def _on_the_list_of(db: Session, place: OrgUnit, patient_id: str) -> None:
    db.execute(
        org_unit_patient_member.insert().values(
            org_unit_id=place.id, patient_id=patient_id
        )
    )
    db.commit()


def _given_access(
    db: Session,
    user: User,
    patient_id: str,
    granted_by: User,
    *,
    revoked_at: datetime | None = None,
) -> None:
    db.add(
        ExternalPatientAccess(
            user_id=user.id,
            patient_id=patient_id,
            granted_by_user_id=granted_by.id,
            revoked_at=revoked_at,
        )
    )
    db.commit()


def _recorded(db: Session, patient_id: str, *, is_active: bool) -> None:
    db.add(PatientMetadata(patient_id=patient_id, is_active=is_active))
    db.commit()


def _ids(rows: list[PatientListItem]) -> list[str | None]:
    return [row.id for row in rows]


@pytest.fixture
def north(db_session: Session) -> OrgUnit:
    trust = _place(db_session, "North Trust", "organisation")
    _on_the_list_of(db_session, trust, NORTH_PATIENT)

    return trust


@pytest.fixture
def south(db_session: Session) -> OrgUnit:
    trust = _place(db_session, "South Trust", "organisation")
    _on_the_list_of(db_session, trust, SOUTH_PATIENT)

    return trust


@pytest.fixture
def doctor(db_session: Session, north: OrgUnit) -> User:
    return _person(db_session, "doctor", "consultant", north)


@pytest.fixture
def patient_manager(db_session: Session, north: OrgUnit) -> User:
    """Holds ``manage_patient_membership`` and belongs to the north."""
    return _person(db_session, "caseload", "patient_manager", north)


@pytest.fixture
def admin(db_session: Session, north: OrgUnit) -> User:
    """Holds ``manage_users``, which is not the patient competency."""
    return _person(db_session, "admin", "system_administrator", north)


@pytest.fixture
def operator(db_session: Session) -> User:
    """Operates Quill, and belongs nowhere."""
    return _person(
        db_session,
        "operator",
        "superadmin_profession",
        platform_role="superadmin",
    )


@pytest.fixture
def loner(db_session: Session) -> User:
    """Belongs nowhere."""
    return _person(db_session, "loner", "consultant")


# --- which patients are within reach -----------------------------------------


def test_a_member_of_a_trust_reaches_the_patients_on_its_list(
    db_session: Session, doctor: User, south: OrgUnit
) -> None:
    reach = patients_within_reach(db_session, doctor, scope=None)

    assert reach == {NORTH_PATIENT}


def test_a_member_of_two_trusts_reaches_the_patients_of_both(
    db_session: Session, north: OrgUnit, south: OrgUnit
) -> None:
    locum = _person(db_session, "locum", "consultant", north, south)

    reach = patients_within_reach(db_session, locum, scope=None)

    assert reach == {NORTH_PATIENT, SOUTH_PATIENT}


def test_somebody_who_belongs_nowhere_reaches_no_patient(
    db_session: Session, loner: User, north: OrgUnit
) -> None:
    assert patients_within_reach(db_session, loner, scope=None) == set()


def test_a_member_of_a_ward_alone_does_not_reach_the_trusts_patients(
    db_session: Session, north: OrgUnit
) -> None:
    ward = _place(db_session, "Ward 9", "ward", north)
    nurse = _person(db_session, "nurse", "registered_nurse", ward)

    assert patients_within_reach(db_session, nurse, scope=None) == set()


def test_somebody_given_access_from_outside_reaches_that_patient(
    db_session: Session, loner: User, doctor: User
) -> None:
    _given_access(db_session, loner, NORTH_PATIENT, doctor)

    reach = patients_within_reach(db_session, loner, scope=None)

    assert reach == {NORTH_PATIENT}


def test_access_that_was_revoked_reaches_nobody(
    db_session: Session, loner: User, doctor: User
) -> None:
    _given_access(
        db_session,
        loner,
        NORTH_PATIENT,
        doctor,
        revoked_at=datetime.now(UTC),
    )

    assert patients_within_reach(db_session, loner, scope=None) == set()


def test_their_trusts_patients_and_those_given_come_together(
    db_session: Session, doctor: User, south: OrgUnit, loner: User
) -> None:
    _given_access(db_session, doctor, SOUTH_PATIENT, loner)

    reach = patients_within_reach(db_session, doctor, scope=None)

    assert reach == {NORTH_PATIENT, SOUTH_PATIENT}


def test_an_operator_asking_for_the_admin_scope_reaches_every_patient(
    db_session: Session, operator: User
) -> None:
    assert patients_within_reach(db_session, operator, scope="admin") is None


def test_an_operator_who_does_not_ask_is_confined_as_anybody_is(
    db_session: Session, operator: User, north: OrgUnit
) -> None:
    assert patients_within_reach(db_session, operator, scope=None) == set()


def test_an_admin_asking_for_the_admin_scope_is_confined_to_their_trust(
    db_session: Session, admin: User, south: OrgUnit
) -> None:
    """Not refused: answered as though nothing had been asked."""
    reach = patients_within_reach(db_session, admin, scope="admin")

    assert reach == {NORTH_PATIENT}


def test_a_patient_manager_asking_for_the_admin_scope_is_confined_too(
    db_session: Session, patient_manager: User, south: OrgUnit
) -> None:
    reach = patients_within_reach(db_session, patient_manager, scope="admin")

    assert reach == {NORTH_PATIENT}


def test_a_scope_that_is_not_admin_means_nothing_even_from_an_operator(
    db_session: Session, operator: User
) -> None:
    assert patients_within_reach(db_session, operator, scope="all") == set()
    assert patients_within_reach(db_session, operator, scope="") == set()
    assert patients_within_reach(db_session, operator, scope="Admin") == set()


# --- who is shown the deactivated patients -----------------------------------


def test_a_patient_manager_who_asks_is_shown_the_deactivated(
    patient_manager: User,
) -> None:
    assert sees_deactivated(patient_manager, include_inactive=True) is True


def test_a_patient_manager_who_does_not_ask_is_not_shown_them(
    patient_manager: User,
) -> None:
    assert sees_deactivated(patient_manager, include_inactive=False) is False


def test_somebody_without_the_patient_competency_who_asks_is_not_shown_them(
    doctor: User, admin: User
) -> None:
    assert sees_deactivated(doctor, include_inactive=True) is False
    assert sees_deactivated(admin, include_inactive=True) is False


def test_being_an_operator_is_not_the_patient_competency(
    db_session: Session,
) -> None:
    """It asks what the caller holds, and a platform role is not that."""
    bare_operator = _person(
        db_session, "bare_operator", "patient", platform_role="superadmin"
    )

    assert sees_deactivated(bare_operator, include_inactive=True) is False


# --- which patients have been deactivated ------------------------------------


def test_each_patient_with_a_record_is_given_as_active_or_not(
    db_session: Session,
) -> None:
    _recorded(db_session, NORTH_PATIENT, is_active=True)
    _recorded(db_session, SOUTH_PATIENT, is_active=False)

    assert activation_by_patient(db_session) == {
        NORTH_PATIENT: True,
        SOUTH_PATIENT: False,
    }


def test_no_records_gives_nothing(db_session: Session) -> None:
    assert activation_by_patient(db_session) == {}


# --- the rows ----------------------------------------------------------------


def test_with_no_limit_every_record_is_a_row() -> None:
    rows = patient_rows(EVERY_RECORD, None, {}, deactivated_too=False)

    assert _ids(rows) == [NORTH_PATIENT, SOUTH_PATIENT, UNLISTED_PATIENT]


def test_a_record_outside_the_callers_reach_is_left_out() -> None:
    rows = patient_rows(
        EVERY_RECORD, {SOUTH_PATIENT}, {}, deactivated_too=False
    )

    assert _ids(rows) == [SOUTH_PATIENT]


def test_an_empty_reach_gives_no_rows() -> None:
    assert patient_rows(EVERY_RECORD, set(), {}, deactivated_too=True) == []


def test_a_patient_with_no_record_of_their_own_is_active() -> None:
    [row] = patient_rows(
        [_record(NORTH_PATIENT)], None, {}, deactivated_too=False
    )

    assert row.is_active is True


def test_a_deactivated_patient_is_left_out() -> None:
    rows = patient_rows(
        EVERY_RECORD,
        None,
        {NORTH_PATIENT: False, SOUTH_PATIENT: True},
        deactivated_too=False,
    )

    assert _ids(rows) == [SOUTH_PATIENT, UNLISTED_PATIENT]


def test_a_deactivated_patient_is_a_row_marked_so_when_those_are_shown() -> (
    None
):
    rows = patient_rows(
        EVERY_RECORD,
        None,
        {NORTH_PATIENT: False},
        deactivated_too=True,
    )

    assert [(row.id, row.is_active) for row in rows] == [
        (NORTH_PATIENT, False),
        (SOUTH_PATIENT, True),
        (UNLISTED_PATIENT, True),
    ]


def test_showing_the_deactivated_does_not_widen_the_callers_reach() -> None:
    rows = patient_rows(
        EVERY_RECORD,
        {SOUTH_PATIENT},
        {NORTH_PATIENT: False},
        deactivated_too=True,
    )

    assert _ids(rows) == [SOUTH_PATIENT]


def test_a_record_with_no_id_is_left_out() -> None:
    rows = patient_rows(
        [{"resourceType": "Patient"}, _record(NORTH_PATIENT)],
        None,
        {},
        deactivated_too=True,
    )

    assert _ids(rows) == [NORTH_PATIENT]


def test_a_row_carries_everything_fhir_said_of_the_patient() -> None:
    record = {
        "resourceType": "Patient",
        "id": NORTH_PATIENT,
        "gender": "unknown",
        "somethingElse": "kept",
    }

    [row] = patient_rows([record], None, {}, deactivated_too=False)

    assert row.model_dump(exclude_none=True) == {
        **record,
        "is_active": True,
    }


def test_the_activation_fhir_gave_is_replaced_by_the_core_databases() -> None:
    record = {**_record(NORTH_PATIENT), "is_active": False}

    [row] = patient_rows([record], None, {}, deactivated_too=False)

    assert row.is_active is True


def test_a_record_that_is_not_a_patient_resource_is_not_made_a_row() -> None:
    with pytest.raises(ValidationError):
        patient_rows(
            [{"id": NORTH_PATIENT, "resourceType": 7}],
            None,
            {},
            deactivated_too=False,
        )


def test_no_records_give_no_rows() -> None:
    assert patient_rows([], None, {}, deactivated_too=True) == []


# --- the list one caller is shown --------------------------------------------


def test_a_doctor_is_shown_their_trusts_patients_alone(
    db_session: Session, doctor: User, south: OrgUnit
) -> None:
    rows = patients_shown(
        db_session,
        doctor,
        EVERY_RECORD,
        scope=None,
        include_inactive=False,
    )

    assert _ids(rows) == [NORTH_PATIENT]


def test_an_operator_in_the_admin_scope_is_shown_every_patient(
    db_session: Session, operator: User, north: OrgUnit, south: OrgUnit
) -> None:
    rows = patients_shown(
        db_session,
        operator,
        EVERY_RECORD,
        scope="admin",
        include_inactive=False,
    )

    assert _ids(rows) == [NORTH_PATIENT, SOUTH_PATIENT, UNLISTED_PATIENT]


def test_an_operator_without_the_patient_competency_is_not_shown_deactivated(
    db_session: Session, north: OrgUnit, south: OrgUnit
) -> None:
    """Every patient is one question and the deactivated another."""
    bare_operator = _person(
        db_session, "bare_operator", "patient", platform_role="superadmin"
    )
    _recorded(db_session, NORTH_PATIENT, is_active=False)

    rows = patients_shown(
        db_session,
        bare_operator,
        EVERY_RECORD,
        scope="admin",
        include_inactive=True,
    )

    assert _ids(rows) == [SOUTH_PATIENT, UNLISTED_PATIENT]


def test_a_patient_manager_who_asks_is_shown_their_deactivated_patient(
    db_session: Session, patient_manager: User, south: OrgUnit
) -> None:
    _recorded(db_session, NORTH_PATIENT, is_active=False)
    _recorded(db_session, SOUTH_PATIENT, is_active=False)

    rows = patients_shown(
        db_session,
        patient_manager,
        EVERY_RECORD,
        scope=None,
        include_inactive=True,
    )

    assert [(row.id, row.is_active) for row in rows] == [
        (NORTH_PATIENT, False)
    ]


def test_a_doctor_who_asks_is_not_shown_their_deactivated_patient(
    db_session: Session, doctor: User
) -> None:
    _recorded(db_session, NORTH_PATIENT, is_active=False)

    rows = patients_shown(
        db_session,
        doctor,
        EVERY_RECORD,
        scope=None,
        include_inactive=True,
    )

    assert rows == []


def test_somebody_who_belongs_nowhere_is_shown_nobody(
    db_session: Session, loner: User, north: OrgUnit
) -> None:
    rows = patients_shown(
        db_session,
        loner,
        EVERY_RECORD,
        scope="admin",
        include_inactive=True,
    )

    assert rows == []
