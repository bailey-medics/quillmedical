"""Changing somebody's username, name, email and password."""

import pytest
from sqlalchemy.orm import Session

from app.models import User
from app.security import hash_password, verify_password
from app.users.errors import (
    EmailRequired,
    EmailTaken,
    PasswordTooShort,
    UserAdminError,
    UsernameTaken,
)
from app.users.identity import change_identity

OLD_PASSWORD = "OldPassword123!"


def _person(db: Session, username: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        full_name="Sam Patel",
        password_hash=hash_password(OLD_PASSWORD),
        is_active=True,
    )
    db.add(user)
    db.flush()

    return user


@pytest.fixture
def person(db_session: Session) -> User:
    return _person(db_session, "sam")


# --- nothing given ----------------------------------------------------------


def test_nothing_given_changes_nothing(
    db_session: Session, person: User
) -> None:
    before = (person.username, person.full_name, person.email)
    hash_before = person.password_hash

    change_identity(db_session, person)

    assert (person.username, person.full_name, person.email) == before
    assert person.password_hash == hash_before


# --- username ---------------------------------------------------------------


def test_a_new_username_is_trimmed_and_taken_up(
    db_session: Session, person: User
) -> None:
    change_identity(db_session, person, username="  samuel  ")

    assert person.username == "samuel"


def test_a_username_is_not_taken_by_the_person_who_has_it(
    db_session: Session, person: User
) -> None:
    """The user form sends every field on every save."""
    change_identity(db_session, person, username="sam")

    assert person.username == "sam"


def test_a_username_another_account_has_is_refused(
    db_session: Session, person: User
) -> None:
    _person(db_session, "alex")

    with pytest.raises(UsernameTaken):
        change_identity(db_session, person, username="alex")

    assert person.username == "sam"


# --- name -------------------------------------------------------------------


def test_a_name_is_trimmed(db_session: Session, person: User) -> None:
    change_identity(db_session, person, name="  Samantha Patel ")

    assert person.full_name == "Samantha Patel"


@pytest.mark.parametrize("blank", ["", "   "])
def test_a_blank_name_clears_it(
    db_session: Session, person: User, blank: str
) -> None:
    change_identity(db_session, person, name=blank)

    assert person.full_name is None


# --- email ------------------------------------------------------------------


def test_a_new_address_is_held_trimmed_and_in_lower_case(
    db_session: Session, person: User
) -> None:
    change_identity(db_session, person, email="  Sam.Patel@NHS.net ")

    assert person.email == "sam.patel@nhs.net"


def test_their_own_address_in_other_capitals_is_no_change(
    db_session: Session, person: User
) -> None:
    change_identity(db_session, person, email="SAM@example.test")

    assert person.email == "sam@example.test"


@pytest.mark.parametrize("blank", ["", "   "])
def test_an_address_cannot_be_changed_to_nothing(
    db_session: Session, person: User, blank: str
) -> None:
    with pytest.raises(EmailRequired):
        change_identity(db_session, person, email=blank)

    assert person.email == "sam@example.test"


def test_an_address_another_account_has_is_refused(
    db_session: Session, person: User
) -> None:
    """Whatever capitals it is typed in."""
    _person(db_session, "alex")

    with pytest.raises(EmailTaken):
        change_identity(db_session, person, email="Alex@Example.test")

    assert person.email == "sam@example.test"


# --- password ---------------------------------------------------------------


def test_a_new_password_is_stored_hashed(
    db_session: Session, person: User
) -> None:
    change_identity(db_session, person, password="NewPassword456!")

    assert person.password_hash != "NewPassword456!"
    assert verify_password("NewPassword456!", person.password_hash)


def test_an_empty_password_is_not_a_change(
    db_session: Session, person: User
) -> None:
    """The form sends an empty field when nothing was typed."""
    change_identity(db_session, person, password="")

    assert verify_password(OLD_PASSWORD, person.password_hash)


def test_a_password_of_seven_characters_is_refused(
    db_session: Session, person: User
) -> None:
    with pytest.raises(PasswordTooShort):
        change_identity(db_session, person, password="1234567")

    assert verify_password(OLD_PASSWORD, person.password_hash)


def test_a_password_of_eight_characters_is_taken(
    db_session: Session, person: User
) -> None:
    change_identity(db_session, person, password="12345678")

    assert verify_password("12345678", person.password_hash)


# --- the refusals -----------------------------------------------------------


@pytest.mark.parametrize(
    ("refusal", "message"),
    [
        (UsernameTaken, "Username already exists"),
        (EmailRequired, "Email is required"),
        (EmailTaken, "Email already exists"),
        (PasswordTooShort, "Password must be at least 8 characters"),
    ],
)
def test_each_refusal_says_what_the_route_always_said(
    refusal: type[UserAdminError], message: str
) -> None:
    """The words and the 400 a caller got before the rule moved here."""
    raised = refusal()

    assert raised.status_code == 400
    assert raised.message == message
    assert str(raised) == message


def test_the_first_thing_wrong_is_the_one_reported(
    db_session: Session, person: User
) -> None:
    """Username, then email, then password: the order the route had."""
    _person(db_session, "alex")

    with pytest.raises(UsernameTaken):
        change_identity(
            db_session,
            person,
            username="alex",
            email="alex@example.test",
            password="short",
        )
