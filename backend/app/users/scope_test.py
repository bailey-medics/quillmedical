"""Whose authority reaches what, on somebody else's account."""

import pytest
from sqlalchemy.orm import Session

from app.cbac.grants import sync_competency_rows
from app.models import User
from app.security import hash_password
from app.users.errors import (
    AccountOutOfScope,
    CompetenciesOutOfScope,
    OperatorAccountNotAllowed,
    PlatformRoleNotAllowed,
    ProfessionOutOfScope,
    SelfGranting,
    UserAdminError,
)
from app.users.scope import (
    check_account_in_scope,
    check_changes_in_scope,
    check_may_act_on_operator,
    check_may_set_platform_role,
    check_not_granting_to_self,
    check_profession_in_scope,
)


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


@pytest.fixture
def user_manager(db_session: Session) -> User:
    """Holds ``manage_users``: no limit on what they hand out."""
    return _person(db_session, "manager", "system_administrator")


@pytest.fixture
def teaching_admin(db_session: Session) -> User:
    """Holds ``manage_teaching``: teaching competencies and professions."""
    return _person(db_session, "coordinator", "teaching_admin")


@pytest.fixture
def delegate(db_session: Session) -> User:
    return _person(db_session, "delegate", "teaching_delegate")


@pytest.fixture
def consultant(db_session: Session) -> User:
    return _person(db_session, "consultant", "consultant")


# --- the competencies changed -----------------------------------------------


def test_a_user_manager_may_grant_and_remove_anything(
    user_manager: User,
) -> None:
    check_changes_in_scope(
        user_manager,
        {"prescribe_non_controlled"},
        {"manage_users", "take_teaching_modules"},
    )


def test_a_teaching_admin_may_grant_a_teaching_competency(
    teaching_admin: User,
) -> None:
    check_changes_in_scope(teaching_admin, set(), {"take_teaching_modules"})


def test_a_teaching_admin_may_remove_a_teaching_competency(
    teaching_admin: User,
) -> None:
    check_changes_in_scope(teaching_admin, {"take_teaching_modules"}, set())


def test_what_is_held_before_and_after_is_not_a_change(
    teaching_admin: User,
) -> None:
    """A clinician keeps their clinical competencies through the save."""
    check_changes_in_scope(
        teaching_admin,
        {"prescribe_non_controlled"},
        {"prescribe_non_controlled", "take_teaching_modules"},
    )


def test_a_teaching_admin_may_not_grant_a_clinical_competency(
    teaching_admin: User,
) -> None:
    with pytest.raises(CompetenciesOutOfScope) as refusal:
        check_changes_in_scope(
            teaching_admin, set(), {"prescribe_non_controlled"}
        )

    assert refusal.value.message == (
        "You may not grant or remove: prescribe_non_controlled."
    )


def test_removing_counts_as_much_as_granting(teaching_admin: User) -> None:
    with pytest.raises(CompetenciesOutOfScope):
        check_changes_in_scope(
            teaching_admin, {"prescribe_non_controlled"}, set()
        )


def test_every_competency_out_of_scope_is_named_in_order(
    teaching_admin: User,
) -> None:
    """Granted and removed alike, sorted, with those in scope left out."""
    with pytest.raises(CompetenciesOutOfScope) as refusal:
        check_changes_in_scope(
            teaching_admin,
            {"prescribe_non_controlled"},
            {"manage_users", "take_teaching_modules"},
        )

    assert refusal.value.message == (
        "You may not grant or remove: "
        "manage_users, prescribe_non_controlled."
    )


# --- the profession given ---------------------------------------------------


def test_a_user_manager_may_give_any_profession(user_manager: User) -> None:
    check_profession_in_scope(user_manager, "consultant")


def test_a_teaching_admin_may_give_a_teaching_profession(
    teaching_admin: User,
) -> None:
    check_profession_in_scope(teaching_admin, "teaching_delegate")


def test_a_teaching_admin_may_not_give_a_clinical_profession(
    teaching_admin: User,
) -> None:
    with pytest.raises(ProfessionOutOfScope) as refusal:
        check_profession_in_scope(teaching_admin, "consultant")

    assert refusal.value.message == (
        "You may not give the profession consultant."
    )


# --- the account as a whole -------------------------------------------------


def test_a_user_manager_reaches_a_clinicians_account(
    user_manager: User, consultant: User
) -> None:
    check_account_in_scope(user_manager, consultant)


def test_a_teaching_admin_reaches_a_delegates_account(
    teaching_admin: User, delegate: User
) -> None:
    check_account_in_scope(teaching_admin, delegate)


def test_a_teaching_admin_does_not_reach_a_clinicians_account(
    teaching_admin: User, consultant: User
) -> None:
    with pytest.raises(AccountOutOfScope):
        check_account_in_scope(teaching_admin, consultant)


def test_a_delegate_holding_more_is_out_of_a_teaching_admins_reach(
    db_session: Session, teaching_admin: User, delegate: User
) -> None:
    """The account is judged by what it holds, not by its profession."""
    sync_competency_rows(
        delegate, additional=["manage_users"], removed=[], source="admin"
    )
    db_session.commit()

    with pytest.raises(AccountOutOfScope):
        check_account_in_scope(teaching_admin, delegate)


# --- the platform role ------------------------------------------------------


@pytest.mark.parametrize("sets_platform_role", [True, False])
def test_a_user_manager_may_set_a_platform_role(
    user_manager: User, sets_platform_role: bool
) -> None:
    check_may_set_platform_role(
        user_manager, sets_platform_role=sets_platform_role
    )


def test_a_teaching_admin_who_sets_no_platform_role_is_not_refused(
    teaching_admin: User,
) -> None:
    check_may_set_platform_role(teaching_admin, sets_platform_role=False)


def test_a_teaching_admin_may_not_set_a_platform_role(
    teaching_admin: User,
) -> None:
    with pytest.raises(PlatformRoleNotAllowed):
        check_may_set_platform_role(teaching_admin, sets_platform_role=True)


# --- granting to yourself ---------------------------------------------------


def test_nobody_grants_to_themselves(user_manager: User) -> None:
    with pytest.raises(SelfGranting):
        check_not_granting_to_self(
            user_manager, user_manager, sends_granting_field=True
        )


def test_somebody_may_save_their_own_page_without_a_granting_field(
    user_manager: User,
) -> None:
    """Name, email and password are ordinary self-service."""
    check_not_granting_to_self(
        user_manager, user_manager, sends_granting_field=False
    )


def test_granting_to_somebody_else_is_not_refused(
    user_manager: User, consultant: User
) -> None:
    check_not_granting_to_self(
        user_manager, consultant, sends_granting_field=True
    )


def test_an_operator_may_grant_to_themselves(db_session: Session) -> None:
    """Somebody has to be able to bootstrap a deployment."""
    operator = _person(
        db_session, "operator", "superadmin_profession", "superadmin"
    )

    check_not_granting_to_self(operator, operator, sends_granting_field=True)


# --- the refusals -----------------------------------------------------------


@pytest.mark.parametrize(
    ("raised", "message"),
    [
        (
            AccountOutOfScope(),
            "This account is outside what you may manage.",
        ),
        (
            ProfessionOutOfScope("consultant"),
            "You may not give the profession consultant.",
        ),
        (
            CompetenciesOutOfScope(["manage_users", "sign_documents"]),
            "You may not grant or remove: manage_users, sign_documents.",
        ),
        (PlatformRoleNotAllowed(), "You may not set a platform role."),
        (
            SelfGranting(),
            "Competencies and platform role must be changed by another "
            "user who holds manage_users",
        ),
    ],
)
def test_each_refusal_says_what_the_route_always_said(
    raised: UserAdminError, message: str
) -> None:
    """The words and the 403 a caller got before the rule moved here."""
    assert raised.status_code == 403
    assert raised.message == message
    assert str(raised) == message


def test_a_refusal_naming_an_id_leaves_the_others_their_own_words() -> None:
    """The words built for one refusal are its own, not the class's."""
    ProfessionOutOfScope("consultant")

    assert ProfessionOutOfScope("patient").message == (
        "You may not give the profession patient."
    )
    assert UserAdminError().message == "The request could not be completed"


# --- an operator's account --------------------------------------------------


@pytest.fixture
def operator(db_session: Session) -> User:
    return _person(
        db_session, "operator", "superadmin_profession", "superadmin"
    )


def test_somebody_who_is_not_an_operator_may_not_act_on_one(
    user_manager: User, operator: User
) -> None:
    with pytest.raises(OperatorAccountNotAllowed) as refusal:
        check_may_act_on_operator(user_manager, operator)

    assert refusal.value.status_code == 403
    assert refusal.value.message == "Cannot modify superadmin users"


def test_an_operator_may_act_on_another_operator(
    db_session: Session, operator: User
) -> None:
    other = _person(
        db_session, "second_operator", "superadmin_profession", "superadmin"
    )

    check_may_act_on_operator(operator, other)


def test_anybody_may_act_on_an_account_that_is_not_an_operators(
    user_manager: User, operator: User, delegate: User
) -> None:
    check_may_act_on_operator(user_manager, delegate)
    check_may_act_on_operator(operator, delegate)
