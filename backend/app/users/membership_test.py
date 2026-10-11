"""Where somebody belongs once their page is saved."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.passport import cover as passport_cover
from app.models import (
    OrgUnit,
    OrgUnitFeature,
    User,
    UserCompetency,
    org_unit_member,
)
from app.organisations import add_org_unit_member
from app.security import hash_password
from app.users.errors import PlaceNotFound, UserAdminError
from app.users.membership import (
    capacity_at,
    org_units_the_caller_administers,
    org_units_the_caller_places_people_in,
    settle_membership,
)
from tests.places import administers

#: An id no org unit has.
NOWHERE = 999_999


def _person(
    db: Session,
    username: str,
    profession: str,
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
    db.commit()
    db.refresh(user)

    return user


def _org_unit(
    db: Session, name: str, type_: str, parent: OrgUnit | None = None
) -> OrgUnit:
    unit = OrgUnit(
        name=name,
        type=type_,
        parent_id=parent.id if parent is not None else None,
    )
    db.add(unit)
    db.commit()
    db.refresh(unit)

    return unit


def _memberships(db: Session, user: User) -> dict[int, str]:
    return {
        int(unit_id): str(capacity)
        for unit_id, capacity in db.execute(
            select(
                org_unit_member.c.org_unit_id, org_unit_member.c.capacity
            ).where(org_unit_member.c.user_id == user.id)
        ).all()
    }


def _cover_rows(db: Session, user: User) -> list[UserCompetency]:
    return list(
        db.scalars(
            select(UserCompetency).where(
                UserCompetency.user_id == user.id,
                UserCompetency.competency_id == "passport_write",
                UserCompetency.source == "organisation",
            )
        ).all()
    )


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    return _org_unit(db_session, "Severn Trust", "organisation")


@pytest.fixture
def ward(db_session: Session, trust: OrgUnit) -> OrgUnit:
    """A site beneath the trust."""
    return _org_unit(db_session, "Ward 4", "site", trust)


@pytest.fixture
def second_ward(db_session: Session, trust: OrgUnit) -> OrgUnit:
    return _org_unit(db_session, "Ward 5", "site", trust)


@pytest.fixture
def other_trust(db_session: Session) -> OrgUnit:
    """Somebody else's tree."""
    return _org_unit(db_session, "Wye Trust", "organisation")


@pytest.fixture
def manager(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_users`` and administers the trust."""
    user = _person(db_session, "manager", "system_administrator")
    administers(db_session, user.id, trust.id)

    return user


@pytest.fixture
def operator(db_session: Session) -> User:
    return _person(
        db_session,
        "operator",
        "superadmin_profession",
        platform_role="superadmin",
    )


@pytest.fixture
def teaching_admin(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_teaching`` and belongs to the trust."""
    user = _person(db_session, "coordinator", "teaching_admin")
    add_org_unit_member(db_session, trust.id, user.id, "staff")
    db_session.commit()

    return user


@pytest.fixture
def receptionist(db_session: Session) -> User:
    """The person whose memberships are settled."""
    return _person(db_session, "receptionist", "receptionist")


# --- the capacity somebody is given -----------------------------------------


def test_somebody_added_to_an_organisation_is_staff(trust: OrgUnit) -> None:
    assert capacity_at(trust) == "staff"


def test_somebody_added_inside_an_organisation_is_a_trainee(
    ward: OrgUnit,
) -> None:
    assert capacity_at(ward) == "trainee"


# --- where the caller may place people --------------------------------------


def test_an_operator_may_place_people_anywhere(
    db_session: Session, operator: User
) -> None:
    assert org_units_the_caller_places_people_in(db_session, operator) is None


def test_administering_a_trust_reaches_it_and_what_is_beneath_it(
    db_session: Session,
    manager: User,
    trust: OrgUnit,
    ward: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    assert org_units_the_caller_places_people_in(db_session, manager) == {
        trust.id,
        ward.id,
    }


def test_belonging_somewhere_is_not_administering_it(
    db_session: Session, trust: OrgUnit
) -> None:
    """Holding ``manage_users`` with no row at a place reaches nowhere."""
    member = _person(db_session, "member", "system_administrator")
    add_org_unit_member(db_session, trust.id, member.id, "staff")
    db_session.commit()

    assert org_units_the_caller_places_people_in(db_session, member) == set()


def test_a_scoped_manager_reaches_where_they_belong_and_beneath_it(
    db_session: Session,
    teaching_admin: User,
    trust: OrgUnit,
    ward: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    assert org_units_the_caller_places_people_in(
        db_session, teaching_admin
    ) == {trust.id, ward.id}


# --- loading the org units a request names ----------------------------------


def test_the_org_units_named_come_back_in_the_order_given(
    db_session: Session, manager: User, trust: OrgUnit, ward: OrgUnit
) -> None:
    places = org_units_the_caller_administers(
        db_session, manager, [ward.id, trust.id]
    )

    assert [place.id for place in places] == [ward.id, trust.id]


def test_naming_nothing_loads_nothing(
    db_session: Session, manager: User
) -> None:
    assert org_units_the_caller_administers(db_session, manager, []) == []


def test_an_id_no_org_unit_has_is_refused(
    db_session: Session, manager: User
) -> None:
    with pytest.raises(PlaceNotFound) as refusal:
        org_units_the_caller_administers(db_session, manager, [NOWHERE])

    assert isinstance(refusal.value, UserAdminError)
    assert refusal.value.status_code == 404
    assert refusal.value.message == f"Place {NOWHERE} not found"


def test_an_org_unit_outside_the_callers_reach_is_refused_the_same_way(
    db_session: Session, manager: User, other_trust: OrgUnit
) -> None:
    """The same words, so the answer does not confirm it exists."""
    with pytest.raises(PlaceNotFound) as refusal:
        org_units_the_caller_administers(db_session, manager, [other_trust.id])

    assert refusal.value.status_code == 404
    assert refusal.value.message == f"Place {other_trust.id} not found"


def test_the_first_id_refused_is_the_one_named(
    db_session: Session, manager: User, trust: OrgUnit, other_trust: OrgUnit
) -> None:
    with pytest.raises(PlaceNotFound) as refusal:
        org_units_the_caller_administers(
            db_session, manager, [trust.id, other_trust.id, NOWHERE]
        )

    assert refusal.value.message == f"Place {other_trust.id} not found"


def test_an_operator_may_name_any_org_unit(
    db_session: Session, operator: User, other_trust: OrgUnit
) -> None:
    places = org_units_the_caller_administers(
        db_session, operator, [other_trust.id]
    )

    assert [place.id for place in places] == [other_trust.id]


def test_an_operator_is_still_refused_an_id_no_org_unit_has(
    db_session: Session, operator: User
) -> None:
    with pytest.raises(PlaceNotFound):
        org_units_the_caller_administers(db_session, operator, [NOWHERE])


# --- settling somebody's memberships ----------------------------------------


def test_the_list_given_is_what_they_belong_to(
    db_session: Session,
    manager: User,
    receptionist: User,
    trust: OrgUnit,
    ward: OrgUnit,
    second_ward: OrgUnit,
) -> None:
    add_org_unit_member(db_session, second_ward.id, receptionist.id, "trainee")
    db_session.commit()

    settle_membership(db_session, manager, receptionist, [trust.id, ward.id])

    assert _memberships(db_session, receptionist) == {
        trust.id: "staff",
        ward.id: "trainee",
    }


def test_an_empty_list_takes_them_off_everywhere_the_caller_reaches(
    db_session: Session,
    manager: User,
    receptionist: User,
    trust: OrgUnit,
    ward: OrgUnit,
) -> None:
    add_org_unit_member(db_session, trust.id, receptionist.id, "staff")
    add_org_unit_member(db_session, ward.id, receptionist.id, "trainee")
    db_session.commit()

    settle_membership(db_session, manager, receptionist, [])

    assert _memberships(db_session, receptionist) == {}


def test_a_membership_outside_the_callers_reach_is_left_alone(
    db_session: Session,
    manager: User,
    receptionist: User,
    trust: OrgUnit,
    ward: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    """Somebody else's tree is not theirs to empty."""
    add_org_unit_member(db_session, trust.id, receptionist.id, "staff")
    add_org_unit_member(db_session, other_trust.id, receptionist.id, "staff")
    db_session.commit()

    settle_membership(db_session, manager, receptionist, [ward.id])

    assert _memberships(db_session, receptionist) == {
        ward.id: "trainee",
        other_trust.id: "staff",
    }


def test_an_operator_settles_membership_everywhere(
    db_session: Session,
    operator: User,
    receptionist: User,
    trust: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    """No limit on their reach, so nothing is left outside the list."""
    add_org_unit_member(db_session, trust.id, receptionist.id, "staff")
    db_session.commit()

    settle_membership(db_session, operator, receptionist, [other_trust.id])

    assert _memberships(db_session, receptionist) == {other_trust.id: "staff"}


def test_a_membership_they_already_had_keeps_its_capacity(
    db_session: Session,
    manager: User,
    receptionist: User,
    trust: OrgUnit,
    ward: OrgUnit,
) -> None:
    """A member of staff at a site is not turned into a trainee."""
    add_org_unit_member(db_session, ward.id, receptionist.id, "staff")
    add_org_unit_member(db_session, trust.id, receptionist.id, "external")
    db_session.commit()

    settle_membership(db_session, manager, receptionist, [trust.id, ward.id])

    assert _memberships(db_session, receptionist) == {
        trust.id: "external",
        ward.id: "staff",
    }


def test_an_id_refused_leaves_their_memberships_as_they_were(
    db_session: Session,
    manager: User,
    receptionist: User,
    trust: OrgUnit,
    ward: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    add_org_unit_member(db_session, trust.id, receptionist.id, "staff")
    db_session.commit()

    with pytest.raises(PlaceNotFound) as refusal:
        settle_membership(
            db_session, manager, receptionist, [ward.id, other_trust.id]
        )

    assert refusal.value.message == f"Place {other_trust.id} not found"
    assert _memberships(db_session, receptionist) == {trust.id: "staff"}


# --- keeping passport cover in step -----------------------------------------


@pytest.fixture
def covered_ward(db_session: Session, ward: OrgUnit) -> OrgUnit:
    """The ward, with its passport cover switched on."""
    db_session.add(
        OrgUnitFeature(org_unit=ward, feature_key=passport_cover.COVER_FEATURE)
    )
    db_session.commit()

    return ward


def test_joining_a_covered_org_unit_grants_passport_writing(
    db_session: Session,
    manager: User,
    receptionist: User,
    covered_ward: OrgUnit,
) -> None:
    settle_membership(db_session, manager, receptionist, [covered_ward.id])
    db_session.flush()

    rows = _cover_rows(db_session, receptionist)

    assert len(rows) == 1
    assert rows[0].ends_on is None


def test_a_trainee_taken_off_a_covered_org_unit_loses_the_grant(
    db_session: Session,
    manager: User,
    receptionist: User,
    covered_ward: OrgUnit,
) -> None:
    settle_membership(db_session, manager, receptionist, [covered_ward.id])
    db_session.flush()

    settle_membership(db_session, manager, receptionist, [])
    db_session.flush()
    db_session.expire_all()

    assert "passport_write" not in receptionist.get_final_competencies()


def test_saving_the_same_membership_again_changes_no_cover(
    db_session: Session,
    manager: User,
    receptionist: User,
    covered_ward: OrgUnit,
) -> None:
    """Clearing and writing back the same membership is no change."""
    settle_membership(db_session, manager, receptionist, [covered_ward.id])
    db_session.flush()

    settle_membership(db_session, manager, receptionist, [covered_ward.id])
    db_session.flush()

    rows = _cover_rows(db_session, receptionist)

    assert len(rows) == 1
    assert rows[0].ends_on is None
