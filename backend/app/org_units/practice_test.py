"""Who may say where somebody practises."""

import pytest
from sqlalchemy.orm import Session

from app.cbac.practising import competencies_at
from app.models import OrgUnit, User
from app.org_units.errors import (
    CompetenciesOutOfScope,
    CompetencyNotHeld,
    GrantingNotAllowed,
    GrantingToYourself,
    MemberNotFound,
    NobodyPractisesHere,
    OperatorAccountNotAllowed,
    OrgUnitError,
    OrgUnitNotFound,
    UserNotFound,
)
from app.org_units.practice import (
    grant_refusal,
    grant_then_authorise,
    practice_refusal,
)
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.competencies import hold, withhold
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


# --- who may add to somebody's competencies ---------------------------------


def _grant(
    db: Session, caller: User, unit_id: int, user_id: int, competency: str
) -> str:
    return grant_then_authorise(
        db, caller, unit_id=unit_id, user_id=user_id, competency=competency
    )


def _practises(db: Session, user: User, unit: OrgUnit) -> set[str]:
    return competencies_at(db, user, org_unit_id=unit.id)


@pytest.fixture
def colleague(db_session: Session, trust: OrgUnit) -> User:
    """A consultant who belongs to the trust."""
    user = _person(db_session, "colleague", "consultant")
    add_org_unit_member(db_session, trust.id, user.id, "staff")
    db_session.commit()

    return user


@pytest.fixture
def operator(db_session: Session, trust: OrgUnit) -> User:
    """An operator, who also belongs to the trust."""
    user = _person(
        db_session,
        "operator",
        "superadmin_profession",
        platform_role="superadmin",
    )
    add_org_unit_member(db_session, trust.id, user.id, "staff")
    db_session.commit()

    return user


@pytest.fixture
def admin(db_session: Session, manager: User, trust: OrgUnit) -> User:
    """The manager, who also belongs to the trust they administer.

    Reaching somebody's account goes by where the administrator belongs,
    not by where they administer.
    """
    add_org_unit_member(db_session, trust.id, manager.id, "staff")
    db_session.commit()

    return manager


def test_somebody_holding_nothing_that_grants_may_not_grant(
    db_session: Session, surgeon: User, colleague: User
) -> None:
    refusal = grant_refusal(db_session, surgeon, colleague)

    assert isinstance(refusal, GrantingNotAllowed)


def test_an_operator_may_grant_to_anybody_themselves_included(
    db_session: Session, operator: User, surgeon: User
) -> None:
    assert grant_refusal(db_session, operator, surgeon) is None
    assert grant_refusal(db_session, operator, operator) is None


def test_only_an_operator_grants_to_an_operator(
    db_session: Session, manager: User, operator: User
) -> None:
    refusal = grant_refusal(db_session, manager, operator)

    assert isinstance(refusal, OperatorAccountNotAllowed)


def test_nobody_grants_to_themselves(
    db_session: Session, manager: User
) -> None:
    refusal = grant_refusal(db_session, manager, manager)

    assert isinstance(refusal, GrantingToYourself)


def test_somebody_at_no_org_unit_the_caller_reaches_is_not_found(
    db_session: Session, manager: User, surgeon: User
) -> None:
    refusal = grant_refusal(db_session, manager, surgeon)

    assert isinstance(refusal, MemberNotFound)


def test_administering_where_they_do_not_belong_reaches_nobody(
    db_session: Session, manager: User, colleague: User
) -> None:
    """A row to administer the trust opens its pages, not its accounts."""
    refusal = grant_refusal(db_session, manager, colleague)

    assert isinstance(refusal, MemberNotFound)


def test_an_administrator_may_grant_to_somebody_they_reach(
    db_session: Session, admin: User, colleague: User
) -> None:
    assert grant_refusal(db_session, admin, colleague) is None


def test_a_scoped_manager_may_grant_to_somebody_they_reach(
    db_session: Session, teaching_admin: User, colleague: User
) -> None:
    """What it may grant them is asked separately, of its whitelist."""
    assert grant_refusal(db_session, teaching_admin, colleague) is None


# --- granting and authorising together --------------------------------------


def test_granting_needs_both_competencies_or_a_scoped_manager(
    db_session: Session, trust: OrgUnit, surgeon: User, colleague: User
) -> None:
    """``manage_users`` alone is not enough, even administering the trust."""
    hold(surgeon, "manage_users")
    db_session.commit()
    administers(db_session, surgeon.id, trust.id)

    with pytest.raises(GrantingNotAllowed):
        _grant(db_session, surgeon, trust.id, colleague.id, TEACHING)

    assert TEACHING not in colleague.get_final_competencies()


def test_granting_at_an_org_unit_outside_their_reach_is_not_found(
    db_session: Session, manager: User, other_trust: OrgUnit, colleague: User
) -> None:
    with pytest.raises(OrgUnitNotFound):
        _grant(db_session, manager, other_trust.id, colleague.id, TEACHING)


def test_nothing_is_granted_at_a_room(
    db_session: Session, manager: User, room: OrgUnit, colleague: User
) -> None:
    with pytest.raises(NobodyPractisesHere) as refused:
        _grant(db_session, manager, room.id, colleague.id, TEACHING)

    assert refused.value.message == "Nobody practises anything at a room."
    assert TEACHING not in colleague.get_final_competencies()


def test_granting_to_somebody_who_is_not_a_member_here_is_not_found(
    db_session: Session, manager: User, trust: OrgUnit, surgeon: User
) -> None:
    with pytest.raises(MemberNotFound):
        _grant(db_session, manager, trust.id, surgeon.id, TEACHING)

    with pytest.raises(MemberNotFound):
        _grant(db_session, manager, trust.id, NOBODY, TEACHING)


def test_granting_to_yourself_at_your_own_org_unit_is_refused(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    add_org_unit_member(db_session, trust.id, manager.id, "staff")
    db_session.commit()

    with pytest.raises(GrantingToYourself):
        _grant(db_session, manager, trust.id, manager.id, TEACHING)

    assert TEACHING not in manager.get_final_competencies()


def test_a_scoped_manager_may_not_grant_off_its_whitelist(
    db_session: Session, teaching_admin: User, trust: OrgUnit, tutor: User
) -> None:
    with pytest.raises(CompetenciesOutOfScope) as refused:
        _grant(db_session, teaching_admin, trust.id, tutor.id, HELD)

    assert refused.value.message == (
        "You may not grant or remove: perform_venepuncture."
    )
    assert HELD not in tutor.get_final_competencies()
    assert _practises(db_session, tutor, trust) == set()


def test_a_competency_new_to_them_is_granted_and_authorised(
    db_session: Session, admin: User, trust: OrgUnit, colleague: User
) -> None:
    assert (
        _grant(db_session, admin, trust.id, colleague.id, TEACHING)
        == "granted_and_authorised"
    )

    assert TEACHING in colleague.get_final_competencies()
    assert TEACHING in colleague.additional_competency_ids
    assert _practises(db_session, colleague, trust) == {TEACHING}


def test_a_competency_they_hold_is_only_authorised(
    db_session: Session, admin: User, trust: OrgUnit, colleague: User
) -> None:
    held = set(colleague.get_final_competencies())

    assert (
        _grant(db_session, admin, trust.id, colleague.id, HELD) == "authorised"
    )

    assert set(colleague.get_final_competencies()) == held
    assert _practises(db_session, colleague, trust) == {HELD}


def test_asking_again_once_both_are_in_place_changes_nothing(
    db_session: Session, admin: User, trust: OrgUnit, colleague: User
) -> None:
    _grant(db_session, admin, trust.id, colleague.id, TEACHING)

    assert (
        _grant(db_session, admin, trust.id, colleague.id, TEACHING)
        == "unchanged"
    )

    assert _practises(db_session, colleague, trust) == {TEACHING}


def test_one_their_profession_gives_is_restored_and_not_added_beyond_it(
    db_session: Session, admin: User, trust: OrgUnit, colleague: User
) -> None:
    """Taken off the removed list: it was never beyond their profession."""
    withhold(colleague, HELD)
    db_session.commit()
    assert HELD in colleague.removed_competency_ids

    assert (
        _grant(db_session, admin, trust.id, colleague.id, HELD)
        == "granted_and_authorised"
    )

    assert HELD in colleague.get_final_competencies()
    assert HELD not in colleague.removed_competency_ids
    assert HELD not in colleague.additional_competency_ids


def test_a_scoped_manager_grants_within_its_whitelist(
    db_session: Session, teaching_admin: User, trust: OrgUnit, colleague: User
) -> None:
    assert (
        _grant(db_session, teaching_admin, trust.id, colleague.id, TEACHING)
        == "granted_and_authorised"
    )

    assert TEACHING in colleague.get_final_competencies()
    assert _practises(db_session, colleague, trust) == {TEACHING}
