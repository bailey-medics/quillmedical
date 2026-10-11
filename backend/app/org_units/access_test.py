"""Which org units a caller may act at, and on whom."""

import pytest
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.org_units.access import (
    require_editable,
    require_in_scope,
    require_member,
    require_visible,
    scoped_manager_ids,
    through_a_scope,
    visible_ids,
)
from app.org_units.errors import (
    CompetenciesOutOfScope,
    MemberNotFound,
    OrganisationNeedsManageUsers,
    OrgUnitError,
    OrgUnitNotFound,
)
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.places import administers

#: An id no org unit and no user has.
NOWHERE = 999_999
NOBODY = 999_999


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


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    return _org_unit(db_session, "Severn Trust", "organisation")


@pytest.fixture
def ward(db_session: Session, trust: OrgUnit) -> OrgUnit:
    """A site beneath the trust."""
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


@pytest.fixture
def receptionist(db_session: Session, ward: OrgUnit) -> User:
    """A member of the ward, who manages nothing."""
    user = _person(db_session, "receptionist", "receptionist")
    add_org_unit_member(db_session, ward.id, user.id, "staff")
    db_session.commit()

    return user


# --- the org units a caller administers -------------------------------------


def test_an_operator_administers_everywhere(
    db_session: Session, operator: User
) -> None:
    assert visible_ids(db_session, operator) is None


def test_a_row_at_a_trust_reaches_it_and_what_is_beneath_it(
    db_session: Session,
    manager: User,
    trust: OrgUnit,
    ward: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    assert visible_ids(db_session, manager) == {trust.id, ward.id}


def test_belonging_somewhere_is_not_administering_it(
    db_session: Session, teaching_admin: User
) -> None:
    assert visible_ids(db_session, teaching_admin) == set()


# --- reaching a route through a scoped manager ------------------------------


def test_holding_what_the_route_needs_is_not_through_a_scope(
    manager: User,
) -> None:
    assert through_a_scope(manager, "manage_users") is False


def test_a_scoped_manager_lacking_what_the_route_needs_is_through_a_scope(
    teaching_admin: User,
) -> None:
    assert through_a_scope(teaching_admin, "manage_users") is True


def test_lacking_one_of_several_needs_is_through_a_scope(
    teaching_admin: User,
) -> None:
    """Every competency named has to be held, not any one of them."""
    assert (
        through_a_scope(teaching_admin, "manage_teaching", "manage_users")
        is True
    )


def test_a_scoped_manager_holding_all_the_route_needs_is_not_through_a_scope(
    teaching_admin: User,
) -> None:
    assert through_a_scope(teaching_admin, "manage_teaching") is False


def test_a_route_that_needs_nothing_is_never_reached_through_a_scope(
    teaching_admin: User,
) -> None:
    assert through_a_scope(teaching_admin) is False


def test_somebody_holding_no_scoped_manager_is_not_through_a_scope(
    receptionist: User,
) -> None:
    assert through_a_scope(receptionist, "manage_users") is False


# --- where a scoped manager acts --------------------------------------------


def test_a_scoped_manager_acts_where_they_belong_and_beneath_it(
    db_session: Session,
    teaching_admin: User,
    trust: OrgUnit,
    ward: OrgUnit,
    other_trust: OrgUnit,
) -> None:
    assert scoped_manager_ids(db_session, teaching_admin) == {
        trust.id,
        ward.id,
    }


# --- the org unit a route names ---------------------------------------------


def test_an_org_unit_the_caller_administers_is_returned(
    db_session: Session, manager: User, ward: OrgUnit
) -> None:
    assert require_visible(db_session, manager, ward.id).id == ward.id


def test_an_id_no_org_unit_has_is_not_found(
    db_session: Session, manager: User
) -> None:
    with pytest.raises(OrgUnitNotFound) as refusal:
        require_visible(db_session, manager, NOWHERE)

    assert isinstance(refusal.value, OrgUnitError)
    assert refusal.value.status_code == 404
    assert refusal.value.message == "Place not found"


def test_an_org_unit_outside_what_the_caller_administers_reads_the_same(
    db_session: Session, manager: User, other_trust: OrgUnit
) -> None:
    """The same words, so the answer does not confirm it exists."""
    with pytest.raises(OrgUnitNotFound) as refusal:
        require_visible(db_session, manager, other_trust.id)

    assert refusal.value.status_code == 404
    assert refusal.value.message == "Place not found"


def test_an_operator_sees_any_org_unit(
    db_session: Session, operator: User, other_trust: OrgUnit
) -> None:
    unit = require_visible(db_session, operator, other_trust.id)

    assert unit.id == other_trust.id


def test_an_operator_is_still_refused_an_id_no_org_unit_has(
    db_session: Session, operator: User
) -> None:
    with pytest.raises(OrgUnitNotFound):
        require_visible(db_session, operator, NOWHERE)


def test_a_scoped_manager_sees_where_they_belong_on_a_route_that_admits_them(
    db_session: Session, teaching_admin: User, ward: OrgUnit
) -> None:
    unit = require_visible(db_session, teaching_admin, ward.id, "manage_users")

    assert unit.id == ward.id


def test_a_scoped_manager_does_not_see_another_tree(
    db_session: Session, teaching_admin: User, other_trust: OrgUnit
) -> None:
    with pytest.raises(OrgUnitNotFound):
        require_visible(
            db_session, teaching_admin, other_trust.id, "manage_users"
        )


def test_a_scoped_manager_sees_nothing_on_a_route_that_names_no_needs(
    db_session: Session, teaching_admin: User, trust: OrgUnit
) -> None:
    """With no needs named, only what they administer counts."""
    with pytest.raises(OrgUnitNotFound):
        require_visible(db_session, teaching_admin, trust.id)


# --- the competencies a caller may hand out ---------------------------------


def test_a_user_manager_may_change_any_competency(manager: User) -> None:
    require_in_scope(manager, {"prescribe_non_controlled", "manage_users"})


def test_a_scoped_manager_may_change_what_is_on_its_whitelist(
    teaching_admin: User,
) -> None:
    require_in_scope(teaching_admin, {"view_teaching_analytics"})


def test_changing_nothing_is_always_in_scope(teaching_admin: User) -> None:
    require_in_scope(teaching_admin, set())


def test_a_scoped_manager_is_refused_what_is_off_its_whitelist(
    teaching_admin: User,
) -> None:
    """Every competency refused is named, in order, and no other."""
    with pytest.raises(CompetenciesOutOfScope) as refusal:
        require_in_scope(
            teaching_admin,
            {
                "sign_documents",
                "view_teaching_analytics",
                "prescribe_non_controlled",
            },
        )

    assert refusal.value.status_code == 403
    assert refusal.value.message == (
        "You may not grant or remove: "
        "prescribe_non_controlled, sign_documents."
    )


# --- the member a route names -----------------------------------------------


def test_a_member_of_the_org_unit_is_returned(
    db_session: Session, receptionist: User, ward: OrgUnit
) -> None:
    person = require_member(db_session, ward.id, receptionist.id)

    assert person.id == receptionist.id


def test_somebody_who_belongs_elsewhere_is_not_found(
    db_session: Session, receptionist: User, trust: OrgUnit
) -> None:
    """Belonging to the ward is not belonging to the trust above it."""
    with pytest.raises(MemberNotFound) as refusal:
        require_member(db_session, trust.id, receptionist.id)

    assert isinstance(refusal.value, OrgUnitError)
    assert refusal.value.status_code == 404
    assert refusal.value.message == "Member not found"


def test_an_id_nobody_has_reads_the_same(
    db_session: Session, ward: OrgUnit
) -> None:
    with pytest.raises(MemberNotFound) as refusal:
        require_member(db_session, ward.id, NOBODY)

    assert refusal.value.status_code == 404
    assert refusal.value.message == "Member not found"


# --- require_editable -------------------------------------------------------


def test_an_administrator_may_edit_an_organisation_they_administer(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    assert require_editable(db_session, manager, trust.id) is trust


def test_an_org_unit_outside_their_reach_is_not_found_to_edit(
    db_session: Session, manager: User, other_trust: OrgUnit
) -> None:
    with pytest.raises(OrgUnitNotFound):
        require_editable(db_session, manager, other_trust.id)

    with pytest.raises(OrgUnitNotFound):
        require_editable(db_session, manager, NOWHERE)


def test_a_scoped_manager_may_edit_a_site_they_act_at(
    db_session: Session, teaching_admin: User, ward: OrgUnit
) -> None:
    assert require_editable(db_session, teaching_admin, ward.id) is ward


def test_a_scoped_manager_may_not_edit_an_organisation(
    db_session: Session, teaching_admin: User, trust: OrgUnit
) -> None:
    """They see it, and it stays with ``manage_users`` to edit."""
    with pytest.raises(OrganisationNeedsManageUsers) as refused:
        require_editable(db_session, teaching_admin, trust.id)

    assert refused.value.status_code == 403
    assert refused.value.message == (
        "Editing an organisation requires manage_users."
    )
