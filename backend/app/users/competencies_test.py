"""What somebody holds once their page is saved."""

from datetime import UTC, datetime

import pytest
from sqlalchemy.orm import Session

from app.models import User
from app.security import hash_password
from app.users.competencies import settle_competencies
from app.users.errors import (
    CompetenciesOutOfScope,
    SuperadminRoleNotAllowed,
    UserAdminError,
)

#: What ``superadmin_profession`` grants, in
#: ``shared/base-professions.yaml``.
OPERATOR_COMPETENCIES = {
    "manage_users",
    "manage_staff_membership",
    "manage_practising_competencies",
}


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


def _held(user: User) -> set[str]:
    return set(user.get_final_competencies())


@pytest.fixture
def user_manager(db_session: Session) -> User:
    """Holds ``manage_users`` and is not an operator."""
    return _person(db_session, "manager", "system_administrator")


@pytest.fixture
def operator(db_session: Session) -> User:
    return _person(
        db_session,
        "operator",
        "superadmin_profession",
        platform_role="superadmin",
    )


@pytest.fixture
def teaching_admin(db_session: Session) -> User:
    """Holds ``manage_teaching``: grants teaching competencies only."""
    return _person(db_session, "coordinator", "teaching_admin")


@pytest.fixture
def receptionist(db_session: Session) -> User:
    """Their profession grants ``access_clinic_admin`` and nothing else."""
    return _person(db_session, "receptionist", "receptionist")


# --- nothing sent -----------------------------------------------------------


def test_a_save_that_sends_nothing_changes_nothing(
    user_manager: User, receptionist: User
) -> None:
    settle_competencies(
        receptionist, user_manager, held_before=_held(receptionist)
    )

    assert _held(receptionist) == {"access_clinic_admin"}
    assert receptionist.base_profession == "receptionist"
    assert receptionist.platform_role == "standard"


# --- the two lists ----------------------------------------------------------


def test_an_additional_competency_is_held_beside_the_profession(
    user_manager: User, receptionist: User
) -> None:
    settle_competencies(
        receptionist,
        user_manager,
        held_before=_held(receptionist),
        additional_competencies=["take_teaching_modules"],
    )

    assert _held(receptionist) == {
        "access_clinic_admin",
        "take_teaching_modules",
    }


def test_the_additional_list_replaces_what_was_held_beyond_the_profession(
    user_manager: User, receptionist: User
) -> None:
    settle_competencies(
        receptionist,
        user_manager,
        held_before=_held(receptionist),
        additional_competencies=["take_teaching_modules"],
    )

    settle_competencies(
        receptionist,
        user_manager,
        held_before=_held(receptionist),
        additional_competencies=["view_teaching_results"],
    )

    assert _held(receptionist) == {
        "access_clinic_admin",
        "view_teaching_results",
    }


def test_a_removed_competency_is_no_longer_held(
    user_manager: User, receptionist: User
) -> None:
    settle_competencies(
        receptionist,
        user_manager,
        held_before=_held(receptionist),
        removed_competencies=["access_clinic_admin"],
    )

    assert _held(receptionist) == set()


def test_a_list_left_out_keeps_what_the_rows_already_say(
    user_manager: User, receptionist: User
) -> None:
    """Sending one list does not reset the other."""
    settle_competencies(
        receptionist,
        user_manager,
        held_before=_held(receptionist),
        additional_competencies=["take_teaching_modules"],
    )

    settle_competencies(
        receptionist,
        user_manager,
        held_before=_held(receptionist),
        removed_competencies=["access_clinic_admin"],
    )

    assert _held(receptionist) == {"take_teaching_modules"}


def test_a_new_row_records_who_granted_it(
    user_manager: User, receptionist: User
) -> None:
    settle_competencies(
        receptionist,
        user_manager,
        held_before=_held(receptionist),
        additional_competencies=["take_teaching_modules"],
    )

    now = datetime.now(UTC)
    row = next(
        grant
        for grant in receptionist.competency_grants
        if grant.competency_id == "take_teaching_modules"
        and grant.is_current(now)
    )

    assert row.source == "admin"
    assert row.granted_by == user_manager.id


# --- a change of profession -------------------------------------------------


def test_a_new_profession_adds_to_what_the_old_one_gave(
    user_manager: User, receptionist: User
) -> None:
    settle_competencies(
        receptionist,
        user_manager,
        held_before=_held(receptionist),
        base_profession="teaching_delegate",
    )

    assert receptionist.base_profession == "teaching_delegate"
    assert _held(receptionist) == {
        "access_clinic_admin",
        "take_teaching_modules",
        "view_teaching_results",
    }


def test_a_list_sent_with_a_new_profession_does_not_drop_the_old_one(
    user_manager: User, receptionist: User
) -> None:
    """The carry-over is worked out on top of the list that was sent."""
    settle_competencies(
        receptionist,
        user_manager,
        held_before=_held(receptionist),
        base_profession="teaching_delegate",
        additional_competencies=["view_teaching_analytics"],
    )

    assert _held(receptionist) == {
        "access_clinic_admin",
        "take_teaching_modules",
        "view_teaching_analytics",
        "view_teaching_results",
    }


def test_a_removal_sent_with_a_new_profession_is_taken_out_last(
    user_manager: User, receptionist: User
) -> None:
    """Otherwise the carry-over would hand the competency back."""
    settle_competencies(
        receptionist,
        user_manager,
        held_before=_held(receptionist),
        base_profession="teaching_delegate",
        removed_competencies=["access_clinic_admin"],
    )

    assert _held(receptionist) == {
        "take_teaching_modules",
        "view_teaching_results",
    }


# --- the platform role ------------------------------------------------------


def test_anybody_may_set_the_standard_role(
    user_manager: User, receptionist: User
) -> None:
    settle_competencies(
        receptionist,
        user_manager,
        held_before=_held(receptionist),
        platform_role="standard",
    )

    assert receptionist.platform_role == "standard"
    assert _held(receptionist) == {"access_clinic_admin"}


def test_only_an_operator_may_make_another(
    user_manager: User, receptionist: User
) -> None:
    with pytest.raises(SuperadminRoleNotAllowed) as refusal:
        settle_competencies(
            receptionist,
            user_manager,
            held_before=_held(receptionist),
            platform_role="superadmin",
        )

    assert isinstance(refusal.value, UserAdminError)
    assert refusal.value.status_code == 403
    assert refusal.value.message == (
        "Cannot grant the superadmin platform role"
    )
    assert receptionist.platform_role == "standard"
    assert _held(receptionist) == {"access_clinic_admin"}


def test_the_promotion_is_refused_before_the_lists_are_looked_at(
    teaching_admin: User, receptionist: User
) -> None:
    """Two things wrong: the platform role is the one reported."""
    with pytest.raises(SuperadminRoleNotAllowed):
        settle_competencies(
            receptionist,
            teaching_admin,
            held_before=_held(receptionist),
            additional_competencies=["prescribe_non_controlled"],
            platform_role="superadmin",
        )


def test_a_new_operator_gains_the_operator_competencies(
    operator: User, receptionist: User
) -> None:
    """Without them every competency gate would refuse the new operator."""
    settle_competencies(
        receptionist,
        operator,
        held_before=_held(receptionist),
        platform_role="superadmin",
    )

    assert receptionist.platform_role == "superadmin"
    assert receptionist.base_profession == "receptionist"
    assert _held(receptionist) == {
        "access_clinic_admin",
        *OPERATOR_COMPETENCIES,
    }


def test_a_promotion_keeps_what_the_same_save_added(
    operator: User, receptionist: User
) -> None:
    settle_competencies(
        receptionist,
        operator,
        held_before=_held(receptionist),
        additional_competencies=["take_teaching_modules"],
        platform_role="superadmin",
    )

    assert _held(receptionist) == {
        "access_clinic_admin",
        "take_teaching_modules",
        *OPERATOR_COMPETENCIES,
    }


def test_an_operator_may_set_another_back_to_standard(
    operator: User, db_session: Session
) -> None:
    """The role goes; what they hold is left for the lists to say."""
    other = _person(
        db_session,
        "second_operator",
        "superadmin_profession",
        platform_role="superadmin",
    )

    settle_competencies(
        other,
        operator,
        held_before=_held(other),
        platform_role="standard",
    )

    assert other.platform_role == "standard"
    assert _held(other) == OPERATOR_COMPETENCIES


# --- the caller's scope -----------------------------------------------------


def test_a_teaching_admin_may_grant_a_teaching_competency(
    teaching_admin: User, receptionist: User
) -> None:
    settle_competencies(
        receptionist,
        teaching_admin,
        held_before=_held(receptionist),
        additional_competencies=["take_teaching_modules"],
    )

    assert _held(receptionist) == {
        "access_clinic_admin",
        "take_teaching_modules",
    }


def test_a_competency_outside_the_callers_scope_is_refused_and_not_written(
    teaching_admin: User, receptionist: User
) -> None:
    with pytest.raises(CompetenciesOutOfScope) as refusal:
        settle_competencies(
            receptionist,
            teaching_admin,
            held_before=_held(receptionist),
            additional_competencies=["prescribe_non_controlled"],
        )

    assert refusal.value.message == (
        "You may not grant or remove: prescribe_non_controlled."
    )
    assert _held(receptionist) == {"access_clinic_admin"}


def test_what_a_new_profession_carries_over_is_not_a_change(
    teaching_admin: User, receptionist: User
) -> None:
    """They keep ``access_clinic_admin``, which is outside this scope."""
    settle_competencies(
        receptionist,
        teaching_admin,
        held_before=_held(receptionist),
        base_profession="teaching_delegate",
    )

    assert _held(receptionist) == {
        "access_clinic_admin",
        "take_teaching_modules",
        "view_teaching_results",
    }


def test_the_change_is_measured_from_what_was_held_before(
    teaching_admin: User, receptionist: User
) -> None:
    """An emptier starting point makes keeping a competency a grant."""
    with pytest.raises(CompetenciesOutOfScope) as refusal:
        settle_competencies(receptionist, teaching_admin, held_before=set())

    assert refusal.value.message == (
        "You may not grant or remove: access_clinic_admin."
    )
