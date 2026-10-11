"""Whose account a caller reaches, and which they may act on."""

import pytest
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from app.users.errors import (
    AccountOutOfScope,
    OperatorAccountNotAllowed,
    UserAdminError,
    UserNotFound,
)
from app.users.reach import (
    account_the_caller_may_act_on,
    check_account_within_reach,
)

#: An id no account has.
NOBODY = 999_999


def _person(
    db: Session,
    username: str,
    profession: str,
    platform_role: str = "standard",
    *,
    at: OrgUnit | None = None,
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

    if at is not None:
        add_org_unit_member(db, at.id, user.id, "staff")

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
    """Holds ``manage_users`` and belongs to the trust."""
    return _person(db_session, "manager", "system_administrator", at=trust)


@pytest.fixture
def teaching_admin(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_teaching`` and belongs to the trust."""
    return _person(db_session, "coordinator", "teaching_admin", at=trust)


@pytest.fixture
def operator(db_session: Session) -> User:
    """Operates the deployment, and belongs nowhere."""
    return _person(
        db_session, "operator", "superadmin_profession", "superadmin"
    )


@pytest.fixture
def colleague(db_session: Session, trust: OrgUnit) -> User:
    return _person(db_session, "colleague", "consultant", at=trust)


@pytest.fixture
def outsider(db_session: Session, other_trust: OrgUnit) -> User:
    return _person(db_session, "outsider", "consultant", at=other_trust)


# --- whose account a caller reaches -----------------------------------------


def test_somebody_at_the_callers_own_org_unit_is_within_reach(
    db_session: Session, manager: User, colleague: User
) -> None:
    check_account_within_reach(db_session, manager, colleague)


def test_somebody_beneath_the_callers_org_unit_is_within_reach(
    db_session: Session, manager: User, ward: OrgUnit
) -> None:
    nurse = _person(db_session, "nurse", "consultant", at=ward)

    check_account_within_reach(db_session, manager, nurse)


def test_somebody_at_another_trust_is_not_found(
    db_session: Session, manager: User, outsider: User
) -> None:
    with pytest.raises(UserNotFound):
        check_account_within_reach(db_session, manager, outsider)


def test_somebody_above_the_callers_org_unit_is_not_found(
    db_session: Session, ward: OrgUnit, colleague: User
) -> None:
    """Reach runs downward only: a ward does not reach its trust."""
    ward_manager = _person(
        db_session, "ward_manager", "system_administrator", at=ward
    )

    with pytest.raises(UserNotFound):
        check_account_within_reach(db_session, ward_manager, colleague)


def test_somebody_who_belongs_nowhere_is_not_found(
    db_session: Session, manager: User
) -> None:
    """Fails closed: belonging nowhere is not belonging everywhere."""
    adrift = _person(db_session, "adrift", "consultant")

    with pytest.raises(UserNotFound):
        check_account_within_reach(db_session, manager, adrift)


def test_a_caller_who_belongs_nowhere_reaches_nobody(
    db_session: Session, colleague: User
) -> None:
    adrift = _person(db_session, "adrift", "system_administrator")

    with pytest.raises(UserNotFound):
        check_account_within_reach(db_session, adrift, colleague)


def test_a_callers_own_account_is_within_reach_wherever_they_belong(
    db_session: Session,
) -> None:
    adrift = _person(db_session, "adrift", "system_administrator")

    check_account_within_reach(db_session, adrift, adrift)


def test_an_operator_reaches_everybody(
    db_session: Session, operator: User, outsider: User
) -> None:
    adrift = _person(db_session, "adrift", "consultant")

    check_account_within_reach(db_session, operator, outsider)
    check_account_within_reach(db_session, operator, adrift)


def test_out_of_reach_answers_as_an_id_nobody_has_would() -> None:
    """The 404 and the words a caller got before the rule moved here."""
    refusal = UserNotFound()

    assert isinstance(refusal, UserAdminError)
    assert refusal.status_code == 404
    assert refusal.message == "User not found"
    assert str(refusal) == "User not found"


# --- an account the caller may act on ---------------------------------------


def test_an_account_within_reach_and_scope_is_handed_back(
    db_session: Session, manager: User, colleague: User
) -> None:
    found = account_the_caller_may_act_on(db_session, manager, colleague.id)

    assert found is colleague


def test_an_id_no_account_has_is_not_found(
    db_session: Session, manager: User
) -> None:
    with pytest.raises(UserNotFound):
        account_the_caller_may_act_on(db_session, manager, NOBODY)


def test_an_operators_account_is_refused_to_somebody_who_is_not_one(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    beside_them = _person(
        db_session,
        "operator",
        "superadmin_profession",
        "superadmin",
        at=trust,
    )

    with pytest.raises(OperatorAccountNotAllowed):
        account_the_caller_may_act_on(db_session, manager, beside_them.id)


def test_an_operator_may_act_on_another_operators_account(
    db_session: Session, operator: User
) -> None:
    other = _person(
        db_session, "second_operator", "superadmin_profession", "superadmin"
    )

    assert (
        account_the_caller_may_act_on(db_session, operator, other.id) is other
    )


def test_an_account_out_of_reach_is_not_found(
    db_session: Session, manager: User, outsider: User
) -> None:
    with pytest.raises(UserNotFound):
        account_the_caller_may_act_on(db_session, manager, outsider.id)


def test_an_account_holding_more_than_the_caller_may_grant_is_refused(
    db_session: Session, teaching_admin: User, colleague: User
) -> None:
    with pytest.raises(AccountOutOfScope):
        account_the_caller_may_act_on(db_session, teaching_admin, colleague.id)


def test_a_scoped_manager_may_act_on_somebody_they_could_have_built(
    db_session: Session, teaching_admin: User, trust: OrgUnit
) -> None:
    delegate = _person(db_session, "delegate", "teaching_delegate", at=trust)

    found = account_the_caller_may_act_on(
        db_session, teaching_admin, delegate.id
    )

    assert found is delegate


# --- which is reported when two things are wrong ----------------------------


def test_an_operator_is_reported_before_being_out_of_reach(
    db_session: Session, manager: User, operator: User
) -> None:
    """As the routes always answered: the 403, not the 404."""
    with pytest.raises(OperatorAccountNotAllowed):
        account_the_caller_may_act_on(db_session, manager, operator.id)


def test_out_of_reach_is_reported_before_out_of_scope(
    db_session: Session, teaching_admin: User, outsider: User
) -> None:
    with pytest.raises(UserNotFound):
        account_the_caller_may_act_on(db_session, teaching_admin, outsider.id)
