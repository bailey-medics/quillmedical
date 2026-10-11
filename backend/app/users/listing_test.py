"""Which people a caller is shown, and what is said about each.

One trust with a ward beneath it, a second trust beside it, and
somebody who belongs nowhere. Each test asks what one caller is shown.

Neither list is put in an order, so the people are compared as sets.
The rows are the exception: they come back in the order the people were
handed in.
"""

from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from app.models import (
    ExternalPatientAccess,
    OrgUnit,
    User,
    org_unit_patient_member,
)
from app.organisations import add_org_unit_member
from app.security import hash_password
from app.users.errors import PatientPickerNotAllowed, UserAdminError
from app.users.listing import (
    admin_rows,
    people_around_a_patient,
    people_to_list,
    people_within_reach,
    picker_rows,
)

PATIENT = "patient-one"
ANOTHER_PATIENT = "patient-two"


def _person(
    db: Session,
    username: str,
    profession: str,
    *places: OrgUnit,
    platform_role: str = "standard",
    capacity: str = "staff",
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
        add_org_unit_member(db, place.id, user.id, capacity)

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


def _listed(
    db: Session, actor: User, exclude_org_unit: int | None = None
) -> set[str]:
    """The usernames the admin list gives *actor*, as the route asks."""
    people = people_to_list(
        db,
        people_within_reach(db, actor),
        exclude_org_unit=exclude_org_unit,
    )

    return {person.username for person in people}


def _usernames(db: Session, ids: set[int] | None) -> set[str]:
    assert ids is not None

    return {
        person.username
        for person in db.query(User).filter(User.id.in_(ids)).all()
    }


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    return _place(db_session, "North Trust", "organisation")


@pytest.fixture
def ward(db_session: Session, trust: OrgUnit) -> OrgUnit:
    return _place(db_session, "Ward 9", "ward", trust)


@pytest.fixture
def other_trust(db_session: Session) -> OrgUnit:
    return _place(db_session, "South Trust", "organisation")


@pytest.fixture
def trust_admin(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_users`` and belongs to the trust."""
    return _person(db_session, "trust_admin", "system_administrator", trust)


@pytest.fixture
def ward_admin(db_session: Session, ward: OrgUnit) -> User:
    """Holds ``manage_users`` and belongs to the ward alone."""
    return _person(db_session, "ward_admin", "system_administrator", ward)


@pytest.fixture
def teaching_admin(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_teaching`` and belongs to the trust."""
    return _person(db_session, "coordinator", "teaching_admin", trust)


@pytest.fixture
def passport_admin(db_session: Session, ward: OrgUnit) -> User:
    """Holds ``manage_passport`` and belongs to the ward alone."""
    return _person(db_session, "passport_lead", "passport_admin", ward)


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
def doctor(db_session: Session, trust: OrgUnit) -> User:
    return _person(db_session, "doctor", "consultant", trust)


@pytest.fixture
def nurse(db_session: Session, ward: OrgUnit) -> User:
    return _person(db_session, "nurse", "registered_nurse", ward)


@pytest.fixture
def stranger(db_session: Session, other_trust: OrgUnit) -> User:
    return _person(db_session, "stranger", "consultant", other_trust)


@pytest.fixture
def loner(db_session: Session) -> User:
    """Belongs nowhere."""
    return _person(db_session, "loner", "consultant")


@pytest.fixture
def everybody(
    trust_admin: User,
    ward_admin: User,
    teaching_admin: User,
    passport_admin: User,
    operator: User,
    doctor: User,
    nurse: User,
    stranger: User,
    loner: User,
) -> set[str]:
    """Every account there is, by username."""
    return {
        "trust_admin",
        "ward_admin",
        "coordinator",
        "passport_lead",
        "operator",
        "doctor",
        "nurse",
        "stranger",
        "loner",
    }


AT_THE_TRUST = {"trust_admin", "coordinator", "doctor"}
AT_THE_WARD = {"ward_admin", "passport_lead", "nurse"}


# --- whose accounts the caller reaches ---------------------------------------


def test_an_operator_reaches_everybody(
    db_session: Session, operator: User, everybody: set[str]
) -> None:
    assert people_within_reach(db_session, operator) is None


def test_an_admin_at_a_trust_reaches_its_people_and_its_wards_people(
    db_session: Session, trust_admin: User, everybody: set[str]
) -> None:
    reach = people_within_reach(db_session, trust_admin)

    assert _usernames(db_session, reach) == AT_THE_TRUST | AT_THE_WARD


def test_an_admin_is_within_their_own_reach(
    db_session: Session, trust_admin: User
) -> None:
    assert people_within_reach(db_session, trust_admin) == {trust_admin.id}


def test_an_admin_at_a_ward_reaches_the_ward_and_not_the_trust_above(
    db_session: Session, ward_admin: User, everybody: set[str]
) -> None:
    reach = people_within_reach(db_session, ward_admin)

    assert _usernames(db_session, reach) == AT_THE_WARD


def test_a_teaching_admin_reaches_where_they_belong_and_beneath(
    db_session: Session, teaching_admin: User, everybody: set[str]
) -> None:
    reach = people_within_reach(db_session, teaching_admin)

    assert _usernames(db_session, reach) == AT_THE_TRUST | AT_THE_WARD


def test_a_passport_admin_at_a_ward_reaches_the_ward_alone(
    db_session: Session, passport_admin: User, everybody: set[str]
) -> None:
    reach = people_within_reach(db_session, passport_admin)

    assert _usernames(db_session, reach) == AT_THE_WARD


def test_somebody_who_belongs_nowhere_reaches_nobody(
    db_session: Session, loner: User, everybody: set[str]
) -> None:
    assert people_within_reach(db_session, loner) == set()


def test_a_trainee_is_reached_as_a_member_of_staff_is(
    db_session: Session, trust_admin: User, ward: OrgUnit
) -> None:
    trainee = _person(
        db_session, "trainee", "teaching_delegate", ward, capacity="trainee"
    )

    reach = people_within_reach(db_session, trust_admin)

    assert reach is not None
    assert trainee.id in reach


def test_an_operator_who_belongs_to_the_trust_is_within_its_admins_reach(
    db_session: Session, trust_admin: User, trust: OrgUnit
) -> None:
    colleague = _person(
        db_session,
        "operating_colleague",
        "superadmin_profession",
        trust,
        platform_role="superadmin",
    )

    reach = people_within_reach(db_session, trust_admin)

    assert reach is not None
    assert colleague.id in reach


def test_somebody_at_two_trusts_is_reached_from_either(
    db_session: Session,
    trust_admin: User,
    trust: OrgUnit,
    other_trust: OrgUnit,
    stranger: User,
) -> None:
    locum = _person(db_session, "locum", "consultant", trust, other_trust)

    reach = people_within_reach(db_session, trust_admin)

    assert reach is not None
    assert locum.id in reach
    assert stranger.id not in reach


# --- the admin list ----------------------------------------------------------


def test_an_operator_is_listed_everybody_even_those_who_belong_nowhere(
    db_session: Session, operator: User, everybody: set[str]
) -> None:
    assert _listed(db_session, operator) == everybody


def test_an_admin_is_listed_the_people_within_their_reach(
    db_session: Session, trust_admin: User, everybody: set[str]
) -> None:
    assert _listed(db_session, trust_admin) == AT_THE_TRUST | AT_THE_WARD


def test_a_ward_admin_is_not_listed_the_trusts_people(
    db_session: Session, ward_admin: User, everybody: set[str]
) -> None:
    assert _listed(db_session, ward_admin) == AT_THE_WARD


def test_a_scoped_manager_is_listed_as_an_admin_in_their_place_would_be(
    db_session: Session,
    teaching_admin: User,
    passport_admin: User,
    everybody: set[str],
) -> None:
    assert _listed(db_session, teaching_admin) == AT_THE_TRUST | AT_THE_WARD
    assert _listed(db_session, passport_admin) == AT_THE_WARD


def test_somebody_who_belongs_nowhere_is_listed_nobody(
    db_session: Session, loner: User, everybody: set[str]
) -> None:
    assert _listed(db_session, loner) == set()


def test_an_empty_reach_lists_nobody_whatever_is_excluded(
    db_session: Session, everybody: set[str], ward: OrgUnit
) -> None:
    assert people_to_list(db_session, set(), exclude_org_unit=None) == []
    assert people_to_list(db_session, set(), exclude_org_unit=ward.id) == []


def test_ids_are_listed_as_given_with_nobody_added(
    db_session: Session, doctor: User, stranger: User, everybody: set[str]
) -> None:
    people = people_to_list(
        db_session, {doctor.id, stranger.id}, exclude_org_unit=None
    )

    assert {person.username for person in people} == {"doctor", "stranger"}


def test_an_id_no_account_has_lists_nobody(
    db_session: Session, everybody: set[str]
) -> None:
    assert people_to_list(db_session, {999_999}, exclude_org_unit=None) == []


def test_nobody_is_listed_where_there_are_no_accounts(
    db_session: Session,
) -> None:
    assert people_to_list(db_session, None, exclude_org_unit=None) == []


# --- leaving out the members of one org unit ---------------------------------


def test_an_operator_excluding_a_ward_is_listed_everybody_else(
    db_session: Session, operator: User, everybody: set[str], ward: OrgUnit
) -> None:
    listed = _listed(db_session, operator, exclude_org_unit=ward.id)

    assert listed == everybody - AT_THE_WARD


def test_excluding_a_trust_keeps_the_people_of_the_ward_beneath_it(
    db_session: Session, operator: User, everybody: set[str], trust: OrgUnit
) -> None:
    """Membership of the org unit named, and of nothing beneath it."""
    listed = _listed(db_session, operator, exclude_org_unit=trust.id)

    assert listed == everybody - AT_THE_TRUST


def test_an_admin_excluding_a_ward_is_listed_the_rest_of_their_reach(
    db_session: Session, trust_admin: User, everybody: set[str], ward: OrgUnit
) -> None:
    listed = _listed(db_session, trust_admin, exclude_org_unit=ward.id)

    assert listed == AT_THE_TRUST


def test_excluding_the_only_org_unit_within_reach_lists_nobody(
    db_session: Session, ward_admin: User, everybody: set[str], ward: OrgUnit
) -> None:
    assert _listed(db_session, ward_admin, exclude_org_unit=ward.id) == set()


def test_excluding_an_org_unit_outside_their_reach_changes_nothing(
    db_session: Session,
    trust_admin: User,
    everybody: set[str],
    other_trust: OrgUnit,
) -> None:
    listed = _listed(db_session, trust_admin, exclude_org_unit=other_trust.id)

    assert listed == AT_THE_TRUST | AT_THE_WARD


def test_excluding_an_org_unit_that_does_not_exist_excludes_nobody(
    db_session: Session, operator: User, everybody: set[str]
) -> None:
    assert _listed(db_session, operator, exclude_org_unit=999_999) == everybody


def test_a_member_in_any_capacity_is_excluded(
    db_session: Session, operator: User, ward: OrgUnit
) -> None:
    _person(
        db_session, "trainee", "teaching_delegate", ward, capacity="trainee"
    )

    assert _listed(db_session, operator, exclude_org_unit=ward.id) == {
        "operator"
    }


def test_somebody_at_the_org_unit_excluded_and_at_another_is_left_out(
    db_session: Session,
    operator: User,
    trust: OrgUnit,
    ward: OrgUnit,
) -> None:
    _person(db_session, "both", "consultant", trust, ward)

    assert _listed(db_session, operator, exclude_org_unit=ward.id) == {
        "operator"
    }


# --- what the admin list says about each person ------------------------------


def test_a_row_names_the_organisations_and_every_org_unit_they_belong_to(
    db_session: Session, trust: OrgUnit, ward: OrgUnit
) -> None:
    both = _person(db_session, "both", "consultant", trust, ward)

    [row] = admin_rows(db_session, [both])

    assert row.organisations == ["North Trust"]
    assert row.sites is not None
    assert sorted(row.sites) == ["North Trust", "Ward 9"]


def test_a_ward_is_not_named_among_the_organisations(
    db_session: Session, nurse: User
) -> None:
    [row] = admin_rows(db_session, [nurse])

    assert row.organisations == []
    assert row.sites == ["Ward 9"]


def test_somebody_who_belongs_nowhere_has_two_empty_lists(
    db_session: Session, loner: User
) -> None:
    [row] = admin_rows(db_session, [loner])

    assert row.organisations == []
    assert row.sites == []


def test_each_person_is_given_their_own_org_units_and_no_other_persons(
    db_session: Session, doctor: User, stranger: User
) -> None:
    rows = admin_rows(db_session, [doctor, stranger])

    assert [row.organisations for row in rows] == [
        ["North Trust"],
        ["South Trust"],
    ]


def test_a_row_carries_the_account_as_it_stands(
    db_session: Session, doctor: User
) -> None:
    doctor.full_name = "Dr Ada Example"
    doctor.is_active = False
    db_session.commit()

    [row] = admin_rows(db_session, [doctor])

    assert row.id == doctor.id
    assert row.username == "doctor"
    assert row.email == "doctor@example.test"
    assert row.full_name == "Dr Ada Example"
    assert row.platform_role == "standard"
    assert row.is_active is False
    assert row.competencies == doctor.get_final_competencies()
    assert row.competencies != []


def test_a_row_names_an_operator_as_one(
    db_session: Session, operator: User
) -> None:
    [row] = admin_rows(db_session, [operator])

    assert row.platform_role == "superadmin"


def test_no_name_on_the_account_is_an_empty_name_in_the_row(
    db_session: Session, doctor: User
) -> None:
    assert doctor.full_name is None

    [row] = admin_rows(db_session, [doctor])

    assert row.full_name == ""


def test_the_rows_are_in_the_order_the_people_were_given(
    db_session: Session, doctor: User, nurse: User, loner: User
) -> None:
    rows = admin_rows(db_session, [loner, doctor, nurse])

    assert [row.username for row in rows] == ["loner", "doctor", "nurse"]


def test_nobody_gives_no_rows(db_session: Session) -> None:
    assert admin_rows(db_session, []) == []


# --- the people around a patient ---------------------------------------------


def test_everybody_at_the_patients_organisation_may_be_added(
    db_session: Session,
    trust_admin: User,
    everybody: set[str],
    trust: OrgUnit,
) -> None:
    _on_the_list_of(db_session, trust, PATIENT)

    people = people_around_a_patient(db_session, trust_admin, PATIENT)

    assert {person.username for person in people} == AT_THE_TRUST


def test_a_member_in_any_capacity_may_be_added(
    db_session: Session, trust_admin: User, trust: OrgUnit
) -> None:
    _person(
        db_session, "trainee", "teaching_delegate", trust, capacity="trainee"
    )
    _on_the_list_of(db_session, trust, PATIENT)

    people = people_around_a_patient(db_session, trust_admin, PATIENT)

    assert {person.username for person in people} == {
        "trust_admin",
        "trainee",
    }


def test_the_callers_own_org_units_are_not_asked_about(
    db_session: Session,
    trust_admin: User,
    stranger: User,
    other_trust: OrgUnit,
) -> None:
    """A patient at another trust still brings that trust's people."""
    _on_the_list_of(db_session, other_trust, PATIENT)

    people = people_around_a_patient(db_session, trust_admin, PATIENT)

    assert {person.username for person in people} == {"stranger"}


def test_a_patient_at_two_organisations_brings_the_people_of_both(
    db_session: Session,
    trust_admin: User,
    stranger: User,
    trust: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    _on_the_list_of(db_session, trust, PATIENT)
    _on_the_list_of(db_session, other_trust, PATIENT)

    people = people_around_a_patient(db_session, trust_admin, PATIENT)

    assert {person.username for person in people} == {
        "trust_admin",
        "stranger",
    }


def test_a_patient_on_a_wards_list_alone_brings_nobody(
    db_session: Session, trust_admin: User, nurse: User, ward: OrgUnit
) -> None:
    """Only an organisation's own list is read."""
    _on_the_list_of(db_session, ward, PATIENT)

    assert people_around_a_patient(db_session, trust_admin, PATIENT) == []


def test_somebody_outside_given_access_to_the_patient_may_be_added(
    db_session: Session, trust_admin: User, stranger: User
) -> None:
    _given_access(db_session, stranger, PATIENT, trust_admin)

    people = people_around_a_patient(db_session, trust_admin, PATIENT)

    assert {person.username for person in people} == {"stranger"}


def test_access_that_was_revoked_adds_nobody(
    db_session: Session, trust_admin: User, stranger: User
) -> None:
    _given_access(
        db_session,
        stranger,
        PATIENT,
        trust_admin,
        revoked_at=datetime.now(UTC),
    )

    assert people_around_a_patient(db_session, trust_admin, PATIENT) == []


def test_access_to_another_patient_adds_nobody(
    db_session: Session, trust_admin: User, stranger: User
) -> None:
    _given_access(db_session, stranger, ANOTHER_PATIENT, trust_admin)

    assert people_around_a_patient(db_session, trust_admin, PATIENT) == []


def test_the_organisations_people_and_those_given_access_come_together(
    db_session: Session,
    trust_admin: User,
    doctor: User,
    stranger: User,
    loner: User,
    trust: OrgUnit,
) -> None:
    _on_the_list_of(db_session, trust, PATIENT)
    _given_access(db_session, stranger, PATIENT, trust_admin)

    people = people_around_a_patient(db_session, trust_admin, PATIENT)

    assert {person.username for person in people} == {
        "trust_admin",
        "doctor",
        "stranger",
    }


def test_somebody_at_the_organisation_and_given_access_is_there_once(
    db_session: Session, trust_admin: User, doctor: User, trust: OrgUnit
) -> None:
    _on_the_list_of(db_session, trust, PATIENT)
    _given_access(db_session, doctor, PATIENT, trust_admin)

    people = people_around_a_patient(db_session, trust_admin, PATIENT)

    assert sorted(person.username for person in people) == [
        "doctor",
        "trust_admin",
    ]


def test_a_patient_nobody_knows_brings_nobody(
    db_session: Session, trust_admin: User, everybody: set[str]
) -> None:
    assert people_around_a_patient(db_session, trust_admin, PATIENT) == []


def test_an_operator_who_holds_manage_users_may_ask(
    db_session: Session, operator: User, doctor: User, trust: OrgUnit
) -> None:
    _on_the_list_of(db_session, trust, PATIENT)

    people = people_around_a_patient(db_session, operator, PATIENT)

    assert {person.username for person in people} == {"doctor"}


def test_a_teaching_admin_is_refused_the_people_around_a_patient(
    db_session: Session, teaching_admin: User, trust: OrgUnit
) -> None:
    _on_the_list_of(db_session, trust, PATIENT)

    with pytest.raises(PatientPickerNotAllowed) as refusal:
        people_around_a_patient(db_session, teaching_admin, PATIENT)

    assert isinstance(refusal.value, UserAdminError)
    assert refusal.value.status_code == 403
    assert refusal.value.message == (
        "Forbidden: User lacks required competency 'manage_users'"
    )


def test_a_passport_admin_is_refused_the_people_around_a_patient(
    db_session: Session, passport_admin: User
) -> None:
    with pytest.raises(PatientPickerNotAllowed):
        people_around_a_patient(db_session, passport_admin, PATIENT)


def test_being_an_operator_is_not_enough_without_manage_users(
    db_session: Session,
) -> None:
    """It asks what the caller holds, and a platform role is not that."""
    bare_operator = _person(
        db_session, "bare_operator", "patient", platform_role="superadmin"
    )

    with pytest.raises(PatientPickerNotAllowed):
        people_around_a_patient(db_session, bare_operator, PATIENT)


def test_the_refusal_comes_before_anything_is_read(
    db_session: Session, teaching_admin: User
) -> None:
    """A patient nobody knows is refused the same, not answered empty."""
    with pytest.raises(PatientPickerNotAllowed):
        people_around_a_patient(db_session, teaching_admin, "no-such-patient")


# --- what the picker is told about each person -------------------------------


def test_a_picker_row_says_who_they_are_and_what_they_hold(
    db_session: Session, doctor: User
) -> None:
    [row] = picker_rows([doctor])

    assert row.id == doctor.id
    assert row.username == "doctor"
    assert row.email == "doctor@example.test"
    assert row.platform_role == "standard"
    assert row.is_active is True
    assert row.competencies == doctor.get_final_competencies()


def test_a_picker_row_gives_no_name_and_nowhere_they_belong(
    db_session: Session, doctor: User
) -> None:
    doctor.full_name = "Dr Ada Example"
    db_session.commit()

    [row] = picker_rows([doctor])

    assert row.full_name is None
    assert row.organisations is None
    assert row.sites is None


def test_picker_rows_are_in_the_order_the_people_were_given(
    db_session: Session, doctor: User, nurse: User
) -> None:
    rows = picker_rows([nurse, doctor])

    assert [row.username for row in rows] == ["nurse", "doctor"]


def test_nobody_gives_no_picker_rows() -> None:
    assert picker_rows([]) == []
