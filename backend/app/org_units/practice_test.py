"""Who may say where somebody practises."""

import pytest
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.org_units.errors import (
    CompetenciesOutOfScope,
    CompetencyNotHeld,
    MemberNotFound,
    NobodyPractisesHere,
    OrgUnitError,
    OrgUnitNotFound,
    UserNotFound,
)
from app.org_units.practice import practice_refusal
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.places import administers

#: An id no org unit and no user has.
NOWHERE = 999_999
NOBODY = 999_999
#: Held by a consultant, from their profession.
HELD = "perform_venepuncture"
#: Not held by a consultant.
NOT_HELD = "manage_users"
#: One a teaching admin may grant, and holds.
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


def _refusal(
    db: Session,
    caller: User,
    unit_id: int,
    user_id: int,
    competency: str,
    *,
    authorising: bool,
) -> OrgUnitError | None:
    return practice_refusal(
        db,
        caller,
        unit_id=unit_id,
        user_id=user_id,
        competency=competency,
        authorising=authorising,
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
    """Inside the trust, and of a type nobody practises anything at."""
    return _org_unit(db_session, "Room 4", "room", trust)


@pytest.fixture
def manager(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_practising_competencies`` and administers the trust."""
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
def tutor(db_session: Session, trust: OrgUnit) -> User:
    """A second teaching admin at the trust, who holds ``TEACHING``."""
    user = _person(db_session, "tutor", "teaching_admin")
    add_org_unit_member(db_session, trust.id, user.id, "staff")
    db_session.commit()

    return user


# --- a caller who holds manage_practising_competencies ----------------------


def test_a_competency_they_hold_may_be_authorised_where_the_caller_administers(
    db_session: Session, manager: User, trust: OrgUnit, surgeon: User
) -> None:
    refusal = _refusal(
        db_session, manager, trust.id, surgeon.id, HELD, authorising=True
    )

    assert refusal is None


def test_it_may_be_withdrawn_there_too(
    db_session: Session, manager: User, trust: OrgUnit, surgeon: User
) -> None:
    refusal = _refusal(
        db_session, manager, trust.id, surgeon.id, HELD, authorising=False
    )

    assert refusal is None


@pytest.mark.parametrize("authorising", [True, False])
def test_an_id_no_org_unit_has_is_not_found(
    db_session: Session, manager: User, surgeon: User, authorising: bool
) -> None:
    refusal = _refusal(
        db_session, manager, NOWHERE, surgeon.id, HELD, authorising=authorising
    )

    assert isinstance(refusal, OrgUnitNotFound)
    assert refusal.status_code == 404
    assert refusal.message == "Place not found"


@pytest.mark.parametrize("authorising", [True, False])
def test_an_org_unit_the_caller_does_not_administer_reads_the_same(
    db_session: Session,
    manager: User,
    other_trust: OrgUnit,
    surgeon: User,
    authorising: bool,
) -> None:
    refusal = _refusal(
        db_session,
        manager,
        other_trust.id,
        surgeon.id,
        HELD,
        authorising=authorising,
    )

    assert isinstance(refusal, OrgUnitNotFound)
    assert refusal.message == "Place not found"


def test_nothing_is_authorised_at_a_type_that_holds_no_competencies(
    db_session: Session, manager: User, room: OrgUnit, surgeon: User
) -> None:
    refusal = _refusal(
        db_session, manager, room.id, surgeon.id, HELD, authorising=True
    )

    assert isinstance(refusal, NobodyPractisesHere)
    assert refusal.status_code == 422
    assert refusal.message == "Nobody practises anything at a room."


def test_a_row_at_such_a_type_can_still_be_withdrawn(
    db_session: Session, manager: User, room: OrgUnit, surgeon: User
) -> None:
    """A row can always be taken away, whatever the place has become."""
    refusal = _refusal(
        db_session, manager, room.id, surgeon.id, HELD, authorising=False
    )

    assert refusal is None


def test_the_type_is_refused_before_the_person_is_looked_for(
    db_session: Session, manager: User, room: OrgUnit
) -> None:
    refusal = _refusal(
        db_session, manager, room.id, NOBODY, HELD, authorising=True
    )

    assert isinstance(refusal, NobodyPractisesHere)


def test_nothing_is_authorised_for_an_id_nobody_has(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    refusal = _refusal(
        db_session, manager, trust.id, NOBODY, HELD, authorising=True
    )

    assert isinstance(refusal, UserNotFound)
    assert refusal.status_code == 404
    assert refusal.message == "User not found"


def test_a_row_for_an_id_nobody_has_can_still_be_withdrawn(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    refusal = _refusal(
        db_session, manager, trust.id, NOBODY, HELD, authorising=False
    )

    assert refusal is None


def test_a_competency_they_do_not_hold_is_not_authorised(
    db_session: Session, manager: User, trust: OrgUnit, surgeon: User
) -> None:
    refusal = _refusal(
        db_session, manager, trust.id, surgeon.id, NOT_HELD, authorising=True
    )

    assert isinstance(refusal, CompetencyNotHeld)
    assert refusal.status_code == 422
    assert refusal.message == (
        "They do not hold manage_users, so it cannot be authorised here. "
        "Grant it to them first."
    )


def test_a_row_for_a_competency_they_do_not_hold_can_still_be_withdrawn(
    db_session: Session, manager: User, trust: OrgUnit, surgeon: User
) -> None:
    refusal = _refusal(
        db_session, manager, trust.id, surgeon.id, NOT_HELD, authorising=False
    )

    assert refusal is None


def test_a_holder_of_the_competency_is_not_held_to_a_whitelist(
    db_session: Session, manager: User, trust: OrgUnit, surgeon: User
) -> None:
    """Nor to members: the surgeon belongs nowhere and is authorised."""
    refusal = _refusal(
        db_session, manager, trust.id, surgeon.id, HELD, authorising=True
    )

    assert refusal is None


# --- a caller who reaches the rule through a scoped manager -----------------


def test_a_scoped_manager_authorises_a_member_for_what_it_may_grant(
    db_session: Session, teaching_admin: User, trust: OrgUnit, tutor: User
) -> None:
    refusal = _refusal(
        db_session,
        teaching_admin,
        trust.id,
        tutor.id,
        TEACHING,
        authorising=True,
    )

    assert refusal is None


def test_a_scoped_manager_does_not_reach_another_tree(
    db_session: Session,
    teaching_admin: User,
    other_trust: OrgUnit,
    tutor: User,
) -> None:
    refusal = _refusal(
        db_session,
        teaching_admin,
        other_trust.id,
        tutor.id,
        TEACHING,
        authorising=True,
    )

    assert isinstance(refusal, OrgUnitNotFound)


def test_a_scoped_manager_authorises_only_a_member_of_the_org_unit(
    db_session: Session, teaching_admin: User, trust: OrgUnit
) -> None:
    outsider = _person(db_session, "outsider", "teaching_admin")

    refusal = _refusal(
        db_session,
        teaching_admin,
        trust.id,
        outsider.id,
        TEACHING,
        authorising=True,
    )

    assert isinstance(refusal, MemberNotFound)
    assert refusal.status_code == 404
    assert refusal.message == "Member not found"


def test_a_scoped_manager_withdraws_from_somebody_who_has_since_left(
    db_session: Session, teaching_admin: User, trust: OrgUnit
) -> None:
    outsider = _person(db_session, "outsider", "teaching_admin")

    refusal = _refusal(
        db_session,
        teaching_admin,
        trust.id,
        outsider.id,
        TEACHING,
        authorising=False,
    )

    assert refusal is None


@pytest.mark.parametrize("authorising", [True, False])
def test_a_scoped_manager_is_held_to_its_whitelist(
    db_session: Session,
    teaching_admin: User,
    trust: OrgUnit,
    authorising: bool,
) -> None:
    surgeon = _person(db_session, "surgeon", "consultant")
    add_org_unit_member(db_session, trust.id, surgeon.id, "staff")
    db_session.commit()

    refusal = _refusal(
        db_session,
        teaching_admin,
        trust.id,
        surgeon.id,
        HELD,
        authorising=authorising,
    )

    assert isinstance(refusal, CompetenciesOutOfScope)
    assert refusal.status_code == 403
    assert refusal.message == (
        "You may not grant or remove: perform_venepuncture."
    )


def test_not_being_a_member_is_said_before_the_whitelist(
    db_session: Session, teaching_admin: User, trust: OrgUnit, surgeon: User
) -> None:
    """The surgeon belongs nowhere, and the competency is off the list."""
    refusal = _refusal(
        db_session,
        teaching_admin,
        trust.id,
        surgeon.id,
        HELD,
        authorising=True,
    )

    assert isinstance(refusal, MemberNotFound)


def test_a_scoped_manager_cannot_authorise_what_a_member_does_not_hold(
    db_session: Session, teaching_admin: User, trust: OrgUnit
) -> None:
    """On the whitelist, and still theirs to hold first."""
    receptionist = _person(db_session, "receptionist", "receptionist")
    add_org_unit_member(db_session, trust.id, receptionist.id, "staff")
    db_session.commit()

    refusal = _refusal(
        db_session,
        teaching_admin,
        trust.id,
        receptionist.id,
        TEACHING,
        authorising=True,
    )

    assert isinstance(refusal, CompetencyNotHeld)
    assert refusal.message == (
        "They do not hold view_teaching_analytics, so it cannot be "
        "authorised here. Grant it to them first."
    )
