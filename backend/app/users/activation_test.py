"""Closing somebody's account, and opening it again."""

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.marketing.preferences import set_marketing_preference
from app.models import NewsletterSubscriber, OrgUnit, User
from app.organisations import add_org_unit_member, get_member_org_unit_ids
from app.security import hash_password
from app.users.activation import deactivate_account, reactivate_account
from app.users.errors import (
    AccountOutOfScope,
    AlreadyActive,
    AlreadyDeactivated,
    DeactivatingYourself,
    OperatorAccountNotAllowed,
    UserAdminError,
    UserNotFound,
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


def _is_active(db: Session, user: User) -> bool:
    """What the database holds, not what the session remembers."""
    db.expire_all()
    saved = db.get(User, user.id)
    assert saved is not None

    return saved.is_active


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


@pytest.fixture
def leaver(db_session: Session, trust: OrgUnit) -> User:
    """Somebody whose account is already closed."""
    return _person(
        db_session, "leaver", "consultant", at=trust, is_active=False
    )


# --- closing an account -----------------------------------------------------


def test_deactivating_closes_the_account(
    db_session: Session, manager: User, colleague: User
) -> None:
    closed = deactivate_account(db_session, manager, colleague.id)

    assert closed is colleague
    assert _is_active(db_session, colleague) is False


def test_deactivating_leaves_everything_else_about_them_as_it_was(
    db_session: Session, manager: User, colleague: User, trust: OrgUnit
) -> None:
    held = set(colleague.get_final_competencies())

    deactivate_account(db_session, manager, colleague.id)
    db_session.expire_all()

    assert set(colleague.get_final_competencies()) == held
    assert colleague.base_profession == "consultant"
    assert get_member_org_unit_ids(db_session, colleague.id) == [trust.id]


def test_nobody_deactivates_their_own_account(
    db_session: Session, manager: User
) -> None:
    with pytest.raises(DeactivatingYourself):
        deactivate_account(db_session, manager, manager.id)

    assert _is_active(db_session, manager) is True


def test_an_account_already_closed_is_not_closed_again(
    db_session: Session, manager: User, leaver: User
) -> None:
    with pytest.raises(AlreadyDeactivated):
        deactivate_account(db_session, manager, leaver.id)


def test_an_account_the_caller_may_not_act_on_is_not_closed(
    db_session: Session, teaching_admin: User, colleague: User
) -> None:
    with pytest.raises(AccountOutOfScope):
        deactivate_account(db_session, teaching_admin, colleague.id)

    assert _is_active(db_session, colleague) is True


def test_deactivating_an_id_no_account_has_is_not_found(
    db_session: Session, manager: User
) -> None:
    with pytest.raises(UserNotFound):
        deactivate_account(db_session, manager, NOBODY)


def test_a_scoped_manager_does_not_deactivate_their_own_account_either(
    db_session: Session, teaching_admin: User
) -> None:
    with pytest.raises(DeactivatingYourself):
        deactivate_account(db_session, teaching_admin, teaching_admin.id)


def test_being_out_of_scope_is_reported_before_already_being_closed(
    db_session: Session, teaching_admin: User, leaver: User
) -> None:
    with pytest.raises(AccountOutOfScope):
        deactivate_account(db_session, teaching_admin, leaver.id)


def test_an_operator_who_is_not_the_caller_is_reported_before_all_else(
    db_session: Session, manager: User, trust: OrgUnit
) -> None:
    operator = _person(
        db_session,
        "operator",
        "superadmin_profession",
        "superadmin",
        at=trust,
        is_active=False,
    )

    with pytest.raises(OperatorAccountNotAllowed):
        deactivate_account(db_session, manager, operator.id)


# --- opening it again -------------------------------------------------------


def test_reactivating_opens_the_account_again(
    db_session: Session, manager: User, leaver: User
) -> None:
    opened = reactivate_account(db_session, manager, leaver.id)

    assert opened is leaver
    assert _is_active(db_session, leaver) is True


def test_an_account_already_open_is_not_opened_again(
    db_session: Session, manager: User, colleague: User
) -> None:
    with pytest.raises(AlreadyActive):
        reactivate_account(db_session, manager, colleague.id)


def test_an_account_the_caller_may_not_act_on_is_not_opened(
    db_session: Session, teaching_admin: User, leaver: User
) -> None:
    with pytest.raises(AccountOutOfScope):
        reactivate_account(db_session, teaching_admin, leaver.id)

    assert _is_active(db_session, leaver) is False


def test_reactivating_an_id_no_account_has_is_not_found(
    db_session: Session, manager: User
) -> None:
    with pytest.raises(UserNotFound):
        reactivate_account(db_session, manager, NOBODY)


# --- what a caller is told --------------------------------------------------


@pytest.mark.parametrize(
    ("raised", "message"),
    [
        (DeactivatingYourself(), "Cannot deactivate your own account"),
        (AlreadyDeactivated(), "User is already deactivated"),
        (AlreadyActive(), "User is already active"),
    ],
)
def test_each_refusal_says_what_the_route_always_said(
    raised: UserAdminError, message: str
) -> None:
    """The words and the 400 a caller got before the rule moved here."""
    assert raised.status_code == 400
    assert raised.message == message
    assert str(raised) == message


def test_an_emptied_account_cannot_be_opened_again(
    db_session: Session, manager: User, leaver: User
) -> None:
    """It is a blank row kept for other people's records to point at,
    and answers as an account that is not there."""
    leaver.emptied_at = leaver.deactivated_at
    db_session.commit()

    with pytest.raises(UserNotFound):
        reactivate_account(db_session, manager, leaver.id)

    assert _is_active(db_session, leaver) is False


# --- the newsletter list ----------------------------------------------------


def _on_the_list(db: Session, user: User) -> NewsletterSubscriber | None:
    db.expire_all()

    return db.scalar(
        select(NewsletterSubscriber).where(
            NewsletterSubscriber.email == user.email
        )
    )


def test_closing_an_account_moves_their_own_yes_to_the_newsletter_list(
    db_session: Session, manager: User, colleague: User
) -> None:
    set_marketing_preference(
        db_session, colleague, wants=True, source="settings"
    )
    db_session.commit()

    deactivate_account(db_session, manager, colleague.id)
    db_session.commit()

    entry = _on_the_list(db_session, colleague)
    assert entry is not None
    assert entry.subscribed is True


def test_closing_an_account_carries_a_refusal_as_a_refusal(
    db_session: Session, manager: User, colleague: User
) -> None:
    set_marketing_preference(
        db_session, colleague, wants=True, source="settings"
    )
    set_marketing_preference(
        db_session, colleague, wants=False, source="settings"
    )
    db_session.commit()

    deactivate_account(db_session, manager, colleague.id)
    db_session.commit()

    entry = _on_the_list(db_session, colleague)
    assert entry is not None
    assert entry.subscribed is False


def test_closing_an_account_carries_a_yes_left_by_an_unticked_box(
    db_session: Session, manager: User, colleague: User
) -> None:
    """The colleague belongs to the trust and said yes by leaving "I would
    rather not" unticked. Their stored answer is yes, so it stands."""
    set_marketing_preference(
        db_session,
        colleague,
        wants=True,
        source="invite",
        first_answer=True,
    )
    db_session.commit()

    deactivate_account(db_session, manager, colleague.id)
    db_session.commit()

    entry = _on_the_list(db_session, colleague)
    assert entry is not None
    assert entry.subscribed is True


def test_a_refused_closure_moves_nobody(
    db_session: Session, manager: User
) -> None:
    set_marketing_preference(
        db_session, manager, wants=True, source="settings"
    )
    db_session.commit()

    with pytest.raises(DeactivatingYourself):
        deactivate_account(db_session, manager, manager.id)

    assert _on_the_list(db_session, manager) is None


def test_reactivating_takes_them_back_off_the_list_with_their_answer(
    db_session: Session, manager: User, colleague: User
) -> None:
    set_marketing_preference(
        db_session, colleague, wants=True, source="settings"
    )
    deactivate_account(db_session, manager, colleague.id)
    db_session.commit()

    reactivate_account(db_session, manager, colleague.id)
    db_session.commit()

    assert _on_the_list(db_session, colleague) is None
    assert colleague.marketing_emails is True


def test_reactivating_brings_back_a_no_given_while_the_account_was_closed(
    db_session: Session, manager: User, colleague: User
) -> None:
    set_marketing_preference(
        db_session, colleague, wants=True, source="settings"
    )
    deactivate_account(db_session, manager, colleague.id)
    db_session.commit()
    entry = _on_the_list(db_session, colleague)
    assert entry is not None
    entry.subscribed = False
    db_session.commit()

    reactivate_account(db_session, manager, colleague.id)
    db_session.commit()

    assert _on_the_list(db_session, colleague) is None
    assert colleague.marketing_emails is False
