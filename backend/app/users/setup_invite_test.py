"""The invite an administrator sends so somebody can set their password."""

import pytest
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.organisations import add_org_unit_member
from app.security import hash_password, verify_password_reset_token
from app.users.errors import (
    AccountOutOfScope,
    OperatorAccountNotAllowed,
    UserNotFound,
)
from app.users.setup_invite import setup_invite_for

#: An id no account has.
NOBODY = 999_999


def _person(
    db: Session,
    username: str,
    profession: str,
    platform_role: str = "standard",
    *,
    at: OrgUnit | None = None,
    is_active: bool = True,
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=is_active,
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


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    org = OrgUnit(name="Severn Trust", type="organisation")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    return org


@pytest.fixture
def manager(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_users`` and belongs to the trust."""
    return _person(db_session, "manager", "system_administrator", at=trust)


@pytest.fixture
def teaching_admin(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_teaching`` and belongs to the trust."""
    return _person(db_session, "coordinator", "teaching_admin", at=trust)


@pytest.fixture
def colleague(db_session: Session, trust: OrgUnit) -> User:
    return _person(db_session, "colleague", "consultant", at=trust)


def test_the_invite_is_for_the_account_named(
    db_session: Session, manager: User, colleague: User
) -> None:
    invite = setup_invite_for(db_session, manager, colleague.id)

    assert invite.user is colleague


def test_the_token_resets_the_password_of_that_accounts_address(
    db_session: Session, manager: User, colleague: User
) -> None:
    invite = setup_invite_for(db_session, manager, colleague.id)

    assert verify_password_reset_token(invite.token) == colleague.email


def test_somebody_whose_account_is_closed_may_still_be_sent_one(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    leaver = _person(
        db_session, "leaver", "consultant", at=trust, is_active=False
    )

    invite = setup_invite_for(db_session, manager, leaver.id)

    assert verify_password_reset_token(invite.token) == leaver.email


def test_a_caller_may_send_themselves_one(
    db_session: Session, manager: User
) -> None:
    invite = setup_invite_for(db_session, manager, manager.id)

    assert invite.user is manager


def test_an_id_no_account_has_is_not_found(
    db_session: Session, manager: User
) -> None:
    with pytest.raises(UserNotFound):
        setup_invite_for(db_session, manager, NOBODY)


def test_somebody_at_another_trust_is_not_found(
    db_session: Session, manager: User
) -> None:
    other = OrgUnit(name="Wye Trust", type="organisation")
    db_session.add(other)
    db_session.commit()
    outsider = _person(db_session, "outsider", "consultant", at=other)

    with pytest.raises(UserNotFound):
        setup_invite_for(db_session, manager, outsider.id)


def test_an_operator_is_not_invited_by_somebody_who_is_not_one(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    operator = _person(
        db_session,
        "operator",
        "superadmin_profession",
        "superadmin",
        at=trust,
    )

    with pytest.raises(OperatorAccountNotAllowed):
        setup_invite_for(db_session, manager, operator.id)


def test_an_account_out_of_scope_is_not_invited(
    db_session: Session, teaching_admin: User, colleague: User
) -> None:
    with pytest.raises(AccountOutOfScope):
        setup_invite_for(db_session, teaching_admin, colleague.id)
