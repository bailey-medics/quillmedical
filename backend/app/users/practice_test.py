"""Where somebody may practise, as the user form settles it."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.grants import sync_competency_rows
from app.models import OrgUnit, PractisingCompetency, User
from app.org_units.errors import (
    CompetenciesOutOfScope,
    CompetencyNotHeld,
    OrgUnitNotFound,
)
from app.organisations import add_org_unit_member
from app.security import hash_password
from app.users.errors import (
    PracticeNotAllowed,
    PracticeRefused,
    PractisingWhereNotAMember,
    UserAdminError,
)
from app.users.practice import settle_practice
from tests.places import administers

#: Two competencies a consultant holds from their profession.
HELD = "perform_venepuncture"
ALSO_HELD = "certify_death"
#: Two a consultant does not hold.
NOT_HELD = "manage_users"
ALSO_NOT_HELD = "manage_teaching"

NOT_HELD_WORDS = (
    "They do not hold manage_users, so it cannot be authorised here. "
    "Grant it to them first."
)
ALSO_NOT_HELD_WORDS = (
    "They do not hold manage_teaching, so it cannot be authorised here. "
    "Grant it to them first."
)


def _person(
    db: Session, username: str, profession: str, *places: OrgUnit
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    db.add(user)
    db.flush()

    for place in places:
        add_org_unit_member(db, place.id, user.id, "staff")

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


def _authorise(
    db: Session,
    user: User,
    unit: OrgUnit,
    competency: str,
    by: User | None = None,
) -> None:
    """Write a row straight to the table, held or not."""
    db.add(
        PractisingCompetency(
            user_id=user.id,
            org_unit_id=unit.id,
            competency=competency,
            authorised_by=by.id if by is not None else None,
        )
    )
    db.commit()


def _rows(db: Session, user: User, unit: OrgUnit) -> set[str]:
    return set(
        db.execute(
            select(PractisingCompetency.competency).where(
                PractisingCompetency.user_id == user.id,
                PractisingCompetency.org_unit_id == unit.id,
            )
        )
        .scalars()
        .all()
    )


def _row(
    db: Session, user: User, unit: OrgUnit, competency: str
) -> PractisingCompetency:
    row = db.scalar(
        select(PractisingCompetency).where(
            PractisingCompetency.user_id == user.id,
            PractisingCompetency.org_unit_id == unit.id,
            PractisingCompetency.competency == competency,
        )
    )
    assert row is not None

    return row


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    return _org_unit(db_session, "Severn Trust", "organisation")


@pytest.fixture
def ward(db_session: Session, trust: OrgUnit) -> OrgUnit:
    return _org_unit(db_session, "Ward 4", "site", trust)


@pytest.fixture
def other_trust(db_session: Session) -> OrgUnit:
    """A tree the manager does not administer."""
    return _org_unit(db_session, "Wye Trust", "organisation")


@pytest.fixture
def manager(db_session: Session, trust: OrgUnit, ward: OrgUnit) -> User:
    """Holds ``manage_practising_competencies``, at the trust and ward."""
    user = _person(db_session, "manager", "system_administrator")
    administers(db_session, user.id, trust.id)
    administers(db_session, user.id, ward.id)

    return user


@pytest.fixture
def without_practice(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_users`` and not ``manage_practising_competencies``."""
    user = _person(db_session, "accounts", "system_administrator")
    administers(db_session, user.id, trust.id)
    sync_competency_rows(
        user,
        additional=[],
        removed=["manage_practising_competencies"],
        source="admin",
    )
    db_session.commit()

    return user


@pytest.fixture
def coordinator(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_teaching``, a scoped manager, at the trust."""
    return _person(db_session, "coordinator", "teaching_admin", trust)


@pytest.fixture
def surgeon(db_session: Session, trust: OrgUnit, ward: OrgUnit) -> User:
    """A consultant who belongs to the trust and the ward."""
    return _person(db_session, "surgeon", "consultant", trust, ward)


# --- settling ---------------------------------------------------------------


def test_what_is_listed_is_authorised_in_the_callers_name(
    db_session: Session, manager: User, surgeon: User, trust: OrgUnit
) -> None:
    settle_practice(db_session, manager, surgeon, {trust.id: [HELD]})

    assert _rows(db_session, surgeon, trust) == {HELD}
    assert _row(db_session, surgeon, trust, HELD).authorised_by == manager.id


def test_what_they_hold_and_is_not_listed_is_withdrawn(
    db_session: Session, manager: User, surgeon: User, trust: OrgUnit
) -> None:
    _authorise(db_session, surgeon, trust, HELD)

    settle_practice(db_session, manager, surgeon, {trust.id: [ALSO_HELD]})

    assert _rows(db_session, surgeon, trust) == {ALSO_HELD}


def test_an_empty_list_withdraws_everything_they_hold_there(
    db_session: Session, manager: User, surgeon: User, trust: OrgUnit
) -> None:
    _authorise(db_session, surgeon, trust, HELD)

    settle_practice(db_session, manager, surgeon, {trust.id: []})

    assert _rows(db_session, surgeon, trust) == set()


def test_an_org_unit_left_out_is_not_touched(
    db_session: Session,
    manager: User,
    surgeon: User,
    trust: OrgUnit,
    ward: OrgUnit,
) -> None:
    _authorise(db_session, surgeon, ward, HELD)

    settle_practice(db_session, manager, surgeon, {trust.id: [ALSO_HELD]})

    assert _rows(db_session, surgeon, ward) == {HELD}


def test_a_row_for_something_they_do_not_hold_is_left_alone(
    db_session: Session, manager: User, surgeon: User, trust: OrgUnit
) -> None:
    """The form has no switch for it, so its silence withdraws nothing."""
    _authorise(db_session, surgeon, trust, NOT_HELD)

    settle_practice(db_session, manager, surgeon, {trust.id: [HELD]})

    assert _rows(db_session, surgeon, trust) == {HELD, NOT_HELD}


def test_a_row_that_does_not_change_keeps_who_authorised_it(
    db_session: Session,
    manager: User,
    surgeon: User,
    trust: OrgUnit,
    coordinator: User,
) -> None:
    _authorise(db_session, surgeon, trust, HELD, by=coordinator)

    settle_practice(
        db_session, manager, surgeon, {trust.id: [HELD, ALSO_HELD]}
    )

    assert (
        _row(db_session, surgeon, trust, HELD).authorised_by == coordinator.id
    )


def test_naming_no_org_unit_touches_nothing(
    db_session: Session, manager: User, surgeon: User, trust: OrgUnit
) -> None:
    _authorise(db_session, surgeon, trust, HELD)

    settle_practice(db_session, manager, surgeon, {})

    assert _rows(db_session, surgeon, trust) == {HELD}


# --- where they belong ------------------------------------------------------


def test_practice_where_they_do_not_belong_is_refused(
    db_session: Session, manager: User, trust: OrgUnit, ward: OrgUnit
) -> None:
    visitor = _person(db_session, "visitor", "consultant", trust)

    with pytest.raises(PractisingWhereNotAMember) as refusal:
        settle_practice(
            db_session, manager, visitor, {trust.id: [HELD], ward.id: [HELD]}
        )

    assert isinstance(refusal.value, UserAdminError)
    assert refusal.value.status_code == 422
    assert refusal.value.message == (
        "Practice can be set only where they belong. Not a member of "
        f"place {ward.id}."
    )
    assert _rows(db_session, visitor, trust) == set()


def test_every_org_unit_they_do_not_belong_to_is_named_lowest_first(
    db_session: Session, manager: User, trust: OrgUnit, ward: OrgUnit
) -> None:
    """The word stays "place" however many there are."""
    nobody_here = _person(db_session, "visitor", "consultant")

    with pytest.raises(PractisingWhereNotAMember) as refusal:
        settle_practice(
            db_session,
            manager,
            nobody_here,
            {ward.id: [HELD], trust.id: [HELD]},
        )

    assert trust.id < ward.id
    assert refusal.value.message == (
        "Practice can be set only where they belong. Not a member of "
        f"place {trust.id}, {ward.id}."
    )


def test_an_id_no_org_unit_has_is_somewhere_they_do_not_belong(
    db_session: Session, manager: User, surgeon: User
) -> None:
    """It is handed back as sent, and never looked up."""
    with pytest.raises(PractisingWhereNotAMember) as refusal:
        settle_practice(db_session, manager, surgeon, {999_999: []})

    assert refusal.value.message == (
        "Practice can be set only where they belong. Not a member of "
        "place 999999."
    )


def test_it_is_refused_even_when_the_list_would_change_nothing(
    db_session: Session, manager: User, trust: OrgUnit, ward: OrgUnit
) -> None:
    visitor = _person(db_session, "visitor", "consultant", trust)

    with pytest.raises(PractisingWhereNotAMember):
        settle_practice(db_session, manager, visitor, {ward.id: []})


# --- who may set practice at all --------------------------------------------


def test_manage_users_alone_is_not_enough(
    db_session: Session,
    without_practice: User,
    surgeon: User,
    trust: OrgUnit,
) -> None:
    with pytest.raises(PracticeNotAllowed) as refusal:
        settle_practice(
            db_session, without_practice, surgeon, {trust.id: [HELD]}
        )

    assert isinstance(refusal.value, UserAdminError)
    assert refusal.value.status_code == 403
    assert refusal.value.message == (
        "You may not set where somebody practises."
    )
    assert _rows(db_session, surgeon, trust) == set()


def test_withdrawing_is_refused_the_same_way(
    db_session: Session,
    without_practice: User,
    surgeon: User,
    trust: OrgUnit,
) -> None:
    _authorise(db_session, surgeon, trust, HELD)

    with pytest.raises(PracticeNotAllowed):
        settle_practice(db_session, without_practice, surgeon, {trust.id: []})

    assert _rows(db_session, surgeon, trust) == {HELD}


def test_a_list_that_changes_nothing_is_never_refused(
    db_session: Session,
    without_practice: User,
    surgeon: User,
    trust: OrgUnit,
) -> None:
    """The form sends every field on every save."""
    _authorise(db_session, surgeon, trust, HELD)

    settle_practice(db_session, without_practice, surgeon, {trust.id: [HELD]})

    assert _rows(db_session, surgeon, trust) == {HELD}


def test_a_scoped_manager_sets_what_is_on_its_whitelist(
    db_session: Session, coordinator: User, trust: OrgUnit
) -> None:
    tutor = _person(db_session, "tutor", "teaching_admin", trust)

    settle_practice(
        db_session, coordinator, tutor, {trust.id: ["view_teaching_analytics"]}
    )

    assert _rows(db_session, tutor, trust) == {"view_teaching_analytics"}


# --- changes the caller may not make ----------------------------------------


def test_a_change_the_caller_may_not_make_is_refused_in_its_own_words(
    db_session: Session, manager: User, surgeon: User, trust: OrgUnit
) -> None:
    with pytest.raises(PracticeRefused) as refusal:
        settle_practice(db_session, manager, surgeon, {trust.id: [NOT_HELD]})

    assert isinstance(refusal.value, UserAdminError)
    assert refusal.value.status_code == 422
    assert refusal.value.message == NOT_HELD_WORDS


def test_every_distinct_reason_is_joined_and_nothing_is_written(
    db_session: Session, manager: User, surgeon: User, trust: OrgUnit
) -> None:
    """At one org unit, changes are taken in the order of their ids."""
    with pytest.raises(PracticeRefused) as refusal:
        settle_practice(
            db_session,
            manager,
            surgeon,
            {trust.id: [NOT_HELD, HELD, ALSO_NOT_HELD]},
        )

    assert refusal.value.status_code == 422
    assert refusal.value.message == f"{ALSO_NOT_HELD_WORDS} {NOT_HELD_WORDS}"
    assert _rows(db_session, surgeon, trust) == set()


def test_a_scoped_manager_is_held_to_its_whitelist(
    db_session: Session,
    coordinator: User,
    surgeon: User,
    trust: OrgUnit,
    ward: OrgUnit,
) -> None:
    """Two org units refusing in the same words are one reason."""
    with pytest.raises(PracticeRefused) as refusal:
        settle_practice(
            db_session,
            coordinator,
            surgeon,
            {trust.id: [HELD], ward.id: [HELD]},
        )

    assert refusal.value.status_code == 403
    assert refusal.value.message == (
        "You may not grant or remove: perform_venepuncture."
    )


def test_the_status_is_the_first_refusals(
    db_session: Session,
    manager: User,
    other_trust: OrgUnit,
    trust: OrgUnit,
) -> None:
    """An org unit the caller does not administer, sent first."""
    visitor = _person(db_session, "visitor", "consultant", trust, other_trust)

    with pytest.raises(PracticeRefused) as refusal:
        settle_practice(
            db_session,
            manager,
            visitor,
            {other_trust.id: [HELD], trust.id: [NOT_HELD]},
        )

    assert refusal.value.status_code == 404
    assert refusal.value.message == f"Place not found {NOT_HELD_WORDS}"


# --- which is reported when two things are wrong ----------------------------


def test_where_they_belong_is_reported_before_who_may_set_practice(
    db_session: Session,
    without_practice: User,
    trust: OrgUnit,
    ward: OrgUnit,
) -> None:
    visitor = _person(db_session, "visitor", "consultant", trust)

    with pytest.raises(PractisingWhereNotAMember):
        settle_practice(
            db_session, without_practice, visitor, {ward.id: [HELD]}
        )


def test_who_may_set_practice_is_reported_before_any_one_change(
    db_session: Session,
    without_practice: User,
    surgeon: User,
    trust: OrgUnit,
) -> None:
    with pytest.raises(PracticeNotAllowed):
        settle_practice(
            db_session, without_practice, surgeon, {trust.id: [NOT_HELD]}
        )


# --- the refusal made of other refusals -------------------------------------


def test_the_gathered_refusal_says_each_reason_once() -> None:
    """Under the first one's status, in the order they were given."""
    refusal = PracticeRefused(
        [
            CompetenciesOutOfScope(["perform_venepuncture"]),
            CompetencyNotHeld("manage_users"),
            CompetenciesOutOfScope(["perform_venepuncture"]),
            OrgUnitNotFound(),
        ]
    )

    assert refusal.status_code == 403
    assert refusal.message == (
        "You may not grant or remove: perform_venepuncture. "
        f"{NOT_HELD_WORDS} Place not found"
    )
    assert str(refusal) == refusal.message


def test_one_gathered_refusal_does_not_set_the_status_of_the_next() -> None:
    PracticeRefused([OrgUnitNotFound()])

    assert PracticeRefused(
        [CompetencyNotHeld("manage_users")]
    ).status_code == (422)
    assert PracticeRefused.status_code == 400


def test_a_gathered_refusal_needs_a_reason() -> None:
    with pytest.raises(ValueError):
        PracticeRefused([])
