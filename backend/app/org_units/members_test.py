"""Who is at an org unit, and who leads it."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.positions import clinical_leads_of
from app.features.passport.cover import COVER_FEATURE
from app.models import (
    OrgUnit,
    OrgUnitFeature,
    Position,
    User,
    org_unit_member,
)
from app.org_units.errors import (
    CannotBeClinicalLead,
    CompetenciesOutOfScope,
    NobodyBelongsHere,
    NobodyLeadsHere,
    NotAtThisPlace,
    OrgUnitNotFound,
    UnknownCapacity,
    UserNotFound,
)
from app.org_units.members import (
    add_member,
    known_capacity,
    name_clinical_lead,
)
from app.organisations import add_org_unit_member
from app.security import hash_password
from app.users.errors import AccountOutOfScope, ProfessionOutOfScope
from tests.places import administers

#: An id no org unit and no user has.
NOWHERE = 999_999
NOBODY = 999_999
#: Held by a consultant, from their profession, and by no delegate.
CLINICAL = "perform_venepuncture"
#: One a teaching admin may grant, which a delegate does not hold.
TEACHING = "view_teaching_analytics"


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


def _capacity(db: Session, unit: OrgUnit, user: User) -> str | None:
    return db.scalar(
        select(org_unit_member.c.capacity).where(
            org_unit_member.c.org_unit_id == unit.id,
            org_unit_member.c.user_id == user.id,
        )
    )


def _add(
    db: Session,
    caller: User,
    unit_id: int,
    user_id: int,
    *,
    capacity: str = "trainee",
    base_profession: str | None = None,
    additional_competencies: list[str] | None = None,
) -> str:
    return add_member(
        db,
        caller,
        unit_id,
        user_id=user_id,
        capacity=capacity,
        base_profession=base_profession,
        additional_competencies=additional_competencies,
    )


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    return _org_unit(db_session, "Severn Trust", "organisation")


@pytest.fixture
def other_trust(db_session: Session) -> OrgUnit:
    """Somebody else's tree."""
    return _org_unit(db_session, "Wye Trust", "organisation")


@pytest.fixture
def room(db_session: Session, trust: OrgUnit) -> OrgUnit:
    """Inside the trust, and of a type with no members and no posts."""
    return _org_unit(db_session, "Room 4", "room", trust)


@pytest.fixture
def manager(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_staff_membership`` and administers the trust."""
    user = _person(db_session, "manager", "system_administrator")
    administers(db_session, user.id, trust.id)

    return user


@pytest.fixture
def teaching_admin(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_teaching`` and belongs to the trust."""
    user = _person(db_session, "coordinator", "teaching_admin")
    add_org_unit_member(db_session, trust.id, user.id, "staff")
    db_session.commit()

    return user


@pytest.fixture
def surgeon(db_session: Session) -> User:
    """A consultant, who belongs nowhere."""
    return _person(db_session, "surgeon", "consultant")


@pytest.fixture
def delegate(db_session: Session) -> User:
    """Holds only what a teaching admin may grant, and belongs nowhere."""
    return _person(db_session, "delegate", "teaching_delegate")


# --- the capacity -----------------------------------------------------------


def test_a_capacity_in_the_vocabulary_is_handed_back() -> None:
    assert known_capacity("staff") == "staff"


def test_a_capacity_outside_the_vocabulary_is_refused() -> None:
    with pytest.raises(UnknownCapacity):
        known_capacity("visitor")


# --- adding a member --------------------------------------------------------


def test_adding_at_an_org_unit_outside_their_reach_is_not_found(
    db_session: Session, manager: User, other_trust: OrgUnit, surgeon: User
) -> None:
    with pytest.raises(OrgUnitNotFound):
        _add(db_session, manager, other_trust.id, surgeon.id)

    with pytest.raises(OrgUnitNotFound):
        _add(db_session, manager, NOWHERE, surgeon.id)

    assert _capacity(db_session, other_trust, surgeon) is None


def test_nobody_is_added_to_a_room(
    db_session: Session, manager: User, room: OrgUnit, surgeon: User
) -> None:
    with pytest.raises(NobodyBelongsHere) as refused:
        _add(db_session, manager, room.id, surgeon.id)

    assert refused.value.message == "Nobody belongs to a room."
    assert _capacity(db_session, room, surgeon) is None


def test_an_unknown_capacity_is_refused_before_anything_is_written(
    db_session: Session, manager: User, trust: OrgUnit, surgeon: User
) -> None:
    with pytest.raises(UnknownCapacity):
        _add(db_session, manager, trust.id, surgeon.id, capacity="visitor")

    assert _capacity(db_session, trust, surgeon) is None


def test_adding_an_id_nobody_has_is_refused(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    with pytest.raises(UserNotFound):
        _add(db_session, manager, trust.id, NOBODY)


def test_somebody_new_is_added_in_the_capacity_given(
    db_session: Session, manager: User, trust: OrgUnit, surgeon: User
) -> None:
    held = set(surgeon.get_final_competencies())

    assert (
        _add(db_session, manager, trust.id, surgeon.id, capacity="staff")
        == "added"
    )

    assert _capacity(db_session, trust, surgeon) == "staff"
    assert surgeon.base_profession == "consultant"
    assert set(surgeon.get_final_competencies()) == held


def test_adding_somebody_already_here_changes_their_capacity(
    db_session: Session, manager: User, trust: OrgUnit, surgeon: User
) -> None:
    _add(db_session, manager, trust.id, surgeon.id, capacity="trainee")

    assert (
        _add(db_session, manager, trust.id, surgeon.id, capacity="external")
        == "updated"
    )

    assert _capacity(db_session, trust, surgeon) == "external"


def test_competencies_are_granted_on_top_of_what_they_hold(
    db_session: Session, manager: User, trust: OrgUnit, surgeon: User
) -> None:
    held = set(surgeon.get_final_competencies())

    _add(
        db_session,
        manager,
        trust.id,
        surgeon.id,
        additional_competencies=[TEACHING],
    )

    assert set(surgeon.get_final_competencies()) == held | {TEACHING}


def test_a_new_profession_is_given_and_what_was_added_before_is_kept(
    db_session: Session, manager: User, trust: OrgUnit, delegate: User
) -> None:
    _add(
        db_session,
        manager,
        trust.id,
        delegate.id,
        additional_competencies=[CLINICAL],
    )

    _add(
        db_session,
        manager,
        trust.id,
        delegate.id,
        base_profession="teaching_admin",
    )

    assert delegate.base_profession == "teaching_admin"
    assert {CLINICAL, "manage_teaching"} <= set(
        delegate.get_final_competencies()
    )


def test_a_trainee_joining_a_covered_org_unit_is_given_writing(
    db_session: Session, manager: User, trust: OrgUnit, surgeon: User
) -> None:
    """Passport cover is kept in step with the membership written."""
    db_session.add(
        OrgUnitFeature(org_unit_id=trust.id, feature_key="passport")
    )
    db_session.add(
        OrgUnitFeature(org_unit_id=trust.id, feature_key=COVER_FEATURE)
    )
    db_session.commit()

    _add(db_session, manager, trust.id, surgeon.id, capacity="trainee")

    # The grant is its own row, so their loaded rows are read again.
    db_session.refresh(surgeon)
    assert "passport_write" in surgeon.get_final_competencies()


# --- adding a member, through a scoped manager -------------------------------


def test_a_scoped_manager_may_add_anybody(
    db_session: Session, teaching_admin: User, trust: OrgUnit, surgeon: User
) -> None:
    """Being at an org unit is not a change to their account."""
    held = set(surgeon.get_final_competencies())

    assert _add(db_session, teaching_admin, trust.id, surgeon.id) == "added"

    assert _capacity(db_session, trust, surgeon) == "trainee"
    assert set(surgeon.get_final_competencies()) == held


def test_a_scoped_manager_may_not_change_the_capacity_of_a_wider_account(
    db_session: Session, teaching_admin: User, trust: OrgUnit, surgeon: User
) -> None:
    add_org_unit_member(db_session, trust.id, surgeon.id, "staff")
    db_session.commit()

    with pytest.raises(AccountOutOfScope):
        _add(
            db_session,
            teaching_admin,
            trust.id,
            surgeon.id,
            capacity="trainee",
        )


def test_a_scoped_manager_may_not_give_a_wider_account_a_profession(
    db_session: Session, teaching_admin: User, trust: OrgUnit, surgeon: User
) -> None:
    with pytest.raises(AccountOutOfScope):
        _add(
            db_session,
            teaching_admin,
            trust.id,
            surgeon.id,
            base_profession="teaching_delegate",
        )


def test_a_scoped_manager_may_not_give_a_profession_off_its_list(
    db_session: Session, teaching_admin: User, trust: OrgUnit, delegate: User
) -> None:
    with pytest.raises(ProfessionOutOfScope) as refused:
        _add(
            db_session,
            teaching_admin,
            trust.id,
            delegate.id,
            base_profession="consultant",
        )

    assert refused.value.message == (
        "You may not give the profession consultant."
    )


def test_a_scoped_manager_may_not_grant_off_its_whitelist(
    db_session: Session, teaching_admin: User, trust: OrgUnit, delegate: User
) -> None:
    with pytest.raises(CompetenciesOutOfScope) as refused:
        _add(
            db_session,
            teaching_admin,
            trust.id,
            delegate.id,
            additional_competencies=[CLINICAL],
        )

    assert refused.value.message == (
        "You may not grant or remove: perform_venepuncture."
    )


def test_a_scoped_manager_grants_within_its_whitelist(
    db_session: Session, teaching_admin: User, trust: OrgUnit, delegate: User
) -> None:
    assert (
        _add(
            db_session,
            teaching_admin,
            trust.id,
            delegate.id,
            additional_competencies=[TEACHING],
        )
        == "added"
    )

    assert TEACHING in delegate.get_final_competencies()


def test_a_scoped_manager_gives_a_profession_on_its_list(
    db_session: Session, teaching_admin: User, trust: OrgUnit, delegate: User
) -> None:
    _add(
        db_session,
        teaching_admin,
        trust.id,
        delegate.id,
        base_profession="teaching_admin",
    )

    assert delegate.base_profession == "teaching_admin"
    assert "manage_teaching" in delegate.get_final_competencies()


def test_a_scoped_manager_changes_the_capacity_of_an_account_in_scope(
    db_session: Session, teaching_admin: User, trust: OrgUnit, delegate: User
) -> None:
    add_org_unit_member(db_session, trust.id, delegate.id, "trainee")
    db_session.commit()

    assert (
        _add(
            db_session, teaching_admin, trust.id, delegate.id, capacity="staff"
        )
        == "updated"
    )

    assert _capacity(db_session, trust, delegate) == "staff"


# --- naming the clinical lead -----------------------------------------------


def test_naming_a_lead_outside_their_reach_is_not_found(
    db_session: Session, manager: User, other_trust: OrgUnit, surgeon: User
) -> None:
    with pytest.raises(OrgUnitNotFound):
        name_clinical_lead(db_session, manager, other_trust.id, surgeon.id)


def test_nobody_leads_a_room(
    db_session: Session, manager: User, room: OrgUnit
) -> None:
    with pytest.raises(NobodyLeadsHere) as refused:
        name_clinical_lead(db_session, manager, room.id, None)

    assert refused.value.message == "Nobody is clinical lead of a room."


def test_naming_an_id_nobody_has_is_refused(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    with pytest.raises(UserNotFound):
        name_clinical_lead(db_session, manager, trust.id, NOBODY)


def test_somebody_who_is_not_a_member_may_not_lead(
    db_session: Session, manager: User, trust: OrgUnit, surgeon: User
) -> None:
    with pytest.raises(NotAtThisPlace):
        name_clinical_lead(db_session, manager, trust.id, surgeon.id)

    assert clinical_leads_of(db_session, [trust.id]) == {}


def test_a_member_is_named_lead(
    db_session: Session, manager: User, trust: OrgUnit, surgeon: User
) -> None:
    add_org_unit_member(db_session, trust.id, surgeon.id, "staff")
    db_session.commit()

    assert (
        name_clinical_lead(db_session, manager, trust.id, surgeon.id) == "set"
    )

    assert clinical_leads_of(db_session, [trust.id]) == {trust.id: surgeon.id}


def test_naming_nobody_leaves_the_post_vacant(
    db_session: Session, manager: User, trust: OrgUnit, surgeon: User
) -> None:
    add_org_unit_member(db_session, trust.id, surgeon.id, "staff")
    db_session.commit()
    name_clinical_lead(db_session, manager, trust.id, surgeon.id)

    assert name_clinical_lead(db_session, manager, trust.id, None) == "vacant"

    assert clinical_leads_of(db_session, [trust.id]) == {}


def test_a_post_that_refuses_them_is_said_in_fixed_words(
    db_session: Session, manager: User, trust: OrgUnit, delegate: User
) -> None:
    """The post asks for a competency they may not practise here."""
    add_org_unit_member(db_session, trust.id, delegate.id, "staff")
    db_session.add(
        Position(
            org_unit_id=trust.id,
            kind="clinical_lead",
            title="Clinical lead",
            max_holders=1,
            requires_competency="certify_death",
        )
    )
    db_session.commit()

    with pytest.raises(CannotBeClinicalLead) as refused:
        name_clinical_lead(db_session, manager, trust.id, delegate.id)

    assert refused.value.message == (
        "That person cannot be made clinical lead here."
    )
