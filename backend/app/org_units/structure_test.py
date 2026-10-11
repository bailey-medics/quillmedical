"""Making an org unit, and changing what it is and where it sits."""

import pytest
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.org_units.errors import (
    InsideItself,
    NeedsAParent,
    OperatorOnly,
    OrganisationNeedsManageUsers,
    OrgUnitNotFound,
    SiteInsideASite,
    TopOfATree,
    TypeWouldMoveIt,
    UnknownOrgUnitType,
)
from app.org_units.structure import (
    add_org_unit,
    change_org_unit,
    known_type,
    require_parent_is_an_organisation,
)
from app.organisations import add_org_unit_member
from app.security import hash_password
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


def _add(
    db: Session,
    caller: User,
    *,
    name: str = "Ward 9",
    unit_type: str = "site",
    parent_id: int | None = None,
    location: str | None = None,
) -> OrgUnit:
    return add_org_unit(
        db,
        caller,
        name=name,
        unit_type=unit_type,
        parent_id=parent_id,
        location=location,
    )


def _change(
    db: Session,
    caller: User,
    unit_id: int,
    *,
    name: str | None = None,
    unit_type: str | None = None,
    parent_id: int | None = None,
    location: str | None = None,
) -> OrgUnit:
    return change_org_unit(
        db,
        caller,
        unit_id,
        name=name,
        unit_type=unit_type,
        parent_id=parent_id,
        location=location,
    )


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    return _org_unit(db_session, "Severn Trust", "organisation")


@pytest.fixture
def site(db_session: Session, trust: OrgUnit) -> OrgUnit:
    return _org_unit(db_session, "Ward 4", "site", trust)


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


# --- the two small checks ---------------------------------------------------


def test_a_type_in_the_vocabulary_is_handed_back() -> None:
    assert known_type("site") == "site"


def test_a_type_outside_the_vocabulary_is_refused() -> None:
    with pytest.raises(UnknownOrgUnitType):
        known_type("palace")


def test_an_organisation_may_be_a_parent(trust: OrgUnit) -> None:
    require_parent_is_an_organisation(trust)


def test_a_site_may_not_be_a_parent(site: OrgUnit) -> None:
    with pytest.raises(SiteInsideASite):
        require_parent_is_an_organisation(site)


# --- making one -------------------------------------------------------------


def test_making_one_of_an_unknown_type_is_refused(
    db_session: Session, operator: User
) -> None:
    with pytest.raises(UnknownOrgUnitType):
        _add(db_session, operator, unit_type="palace")


def test_a_site_with_no_parent_is_refused_naming_its_type(
    db_session: Session, operator: User
) -> None:
    with pytest.raises(NeedsAParent) as refused:
        _add(db_session, operator, unit_type="site")

    assert refused.value.message == (
        "A site sits inside something. Name the place it belongs to."
    )


def test_only_an_operator_starts_a_tree(
    db_session: Session, manager: User
) -> None:
    with pytest.raises(OperatorOnly):
        _add(db_session, manager, unit_type="organisation")


def test_an_operator_starts_a_tree(
    db_session: Session, operator: User
) -> None:
    unit = _add(
        db_session,
        operator,
        name="  Avon Trust ",
        unit_type="organisation",
        location=" Bristol ",
    )

    assert unit.id is not None
    assert unit.name == "Avon Trust"
    assert unit.type == "organisation"
    assert unit.parent_id is None
    assert unit.location == "Bristol"


def test_no_location_is_stored_as_none(
    db_session: Session, operator: User
) -> None:
    empty = _add(db_session, operator, unit_type="organisation", location="")
    absent = _add(
        db_session, operator, unit_type="organisation", location=None
    )

    assert empty.location is None
    assert absent.location is None


def test_an_organisation_given_a_parent_is_refused_naming_its_type(
    db_session: Session, operator: User, trust: OrgUnit
) -> None:
    with pytest.raises(TopOfATree) as refused:
        _add(
            db_session, operator, unit_type="organisation", parent_id=trust.id
        )

    assert refused.value.message == (
        "A organisation is the top of a tree and does not sit inside "
        "anything."
    )


def test_a_parent_outside_their_reach_is_not_found(
    db_session: Session, manager: User, other_trust: OrgUnit
) -> None:
    with pytest.raises(OrgUnitNotFound):
        _add(db_session, manager, parent_id=other_trust.id)

    with pytest.raises(OrgUnitNotFound):
        _add(db_session, manager, parent_id=NOWHERE)


def test_a_site_may_not_be_made_inside_a_site(
    db_session: Session, manager: User, site: OrgUnit
) -> None:
    with pytest.raises(SiteInsideASite):
        _add(db_session, manager, parent_id=site.id)


def test_an_administrator_makes_a_site_inside_their_organisation(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    unit = _add(db_session, manager, parent_id=trust.id)

    assert unit.parent_id == trust.id
    assert unit.type == "site"
    assert db_session.get(OrgUnit, unit.id) is unit


def test_a_scoped_manager_makes_a_site_where_they_belong(
    db_session: Session, teaching_admin: User, trust: OrgUnit
) -> None:
    unit = _add(db_session, teaching_admin, parent_id=trust.id)

    assert unit.parent_id == trust.id


# --- changing one -----------------------------------------------------------


def test_changing_one_outside_their_reach_is_not_found(
    db_session: Session, manager: User, other_trust: OrgUnit
) -> None:
    with pytest.raises(OrgUnitNotFound):
        _change(db_session, manager, other_trust.id, name="Theirs")


def test_a_scoped_manager_may_not_change_an_organisation(
    db_session: Session, teaching_admin: User, trust: OrgUnit
) -> None:
    with pytest.raises(OrganisationNeedsManageUsers):
        _change(db_session, teaching_admin, trust.id, name="Mine now")

    db_session.refresh(trust)
    assert trust.name == "Severn Trust"


def test_a_scoped_manager_changes_a_site_they_act_at(
    db_session: Session, teaching_admin: User, site: OrgUnit
) -> None:
    assert (
        _change(db_session, teaching_admin, site.id, name="Ward 5").name
        == "Ward 5"
    )


def test_changing_to_an_unknown_type_is_refused(
    db_session: Session, manager: User, site: OrgUnit
) -> None:
    with pytest.raises(UnknownOrgUnitType):
        _change(db_session, manager, site.id, unit_type="palace")


def test_a_type_that_would_change_whether_it_has_a_parent_is_refused(
    db_session: Session, manager: User, site: OrgUnit, trust: OrgUnit
) -> None:
    with pytest.raises(TypeWouldMoveIt):
        _change(db_session, manager, site.id, unit_type="organisation")

    with pytest.raises(TypeWouldMoveIt):
        _change(db_session, manager, trust.id, unit_type="site")


def test_a_type_of_the_same_sort_is_taken(
    db_session: Session, manager: User, site: OrgUnit
) -> None:
    assert _change(db_session, manager, site.id, unit_type="ward").type == (
        "ward"
    )


def test_only_what_is_given_is_changed(
    db_session: Session, manager: User, site: OrgUnit, trust: OrgUnit
) -> None:
    site.location = "Level 2"
    db_session.commit()

    unit = _change(db_session, manager, site.id)

    assert unit.name == "Ward 4"
    assert unit.type == "site"
    assert unit.location == "Level 2"
    assert unit.parent_id == trust.id


def test_a_name_loses_the_space_around_it_and_an_empty_location_clears(
    db_session: Session, manager: User, site: OrgUnit
) -> None:
    site.location = "Level 2"
    db_session.commit()

    unit = _change(
        db_session, manager, site.id, name="  Ward 5 ", location="  "
    )

    assert unit.name == "Ward 5"
    assert unit.location is None


def test_a_location_loses_the_space_around_it(
    db_session: Session, manager: User, site: OrgUnit
) -> None:
    assert (
        _change(db_session, manager, site.id, location=" Level 3 ").location
        == "Level 3"
    )


def test_an_organisation_may_not_be_moved_inside_anything(
    db_session: Session, operator: User, trust: OrgUnit, other_trust: OrgUnit
) -> None:
    with pytest.raises(TopOfATree) as refused:
        _change(db_session, operator, trust.id, parent_id=other_trust.id)

    assert refused.value.message == (
        "A organisation is the top of a tree and does not sit inside "
        "anything."
    )


def test_an_org_unit_may_not_be_moved_inside_itself(
    db_session: Session, manager: User, site: OrgUnit
) -> None:
    with pytest.raises(InsideItself):
        _change(db_session, manager, site.id, parent_id=site.id)


def test_moving_to_a_parent_outside_their_reach_is_not_found(
    db_session: Session, manager: User, site: OrgUnit, other_trust: OrgUnit
) -> None:
    with pytest.raises(OrgUnitNotFound):
        _change(db_session, manager, site.id, parent_id=other_trust.id)


def test_a_site_may_not_be_moved_inside_a_site(
    db_session: Session, manager: User, site: OrgUnit, trust: OrgUnit
) -> None:
    second = _org_unit(db_session, "Ward 6", "site", trust)

    with pytest.raises(SiteInsideASite):
        _change(db_session, manager, second.id, parent_id=site.id)


def test_one_already_inside_a_site_may_name_the_parent_it_has(
    db_session: Session, manager: User, site: OrgUnit
) -> None:
    """Rows already deeper are left alone: only a move is checked."""
    bay = _org_unit(db_session, "Bay 1", "ward", site)

    unit = _change(
        db_session, manager, bay.id, name="Bay 2", parent_id=site.id
    )

    assert unit.parent_id == site.id
    assert unit.name == "Bay 2"


def test_a_site_is_moved_to_another_organisation_they_administer(
    db_session: Session,
    manager: User,
    site: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    administers(db_session, manager.id, other_trust.id)

    unit = _change(db_session, manager, site.id, parent_id=other_trust.id)

    assert unit.parent_id == other_trust.id
