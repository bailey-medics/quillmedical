"""Changing who an account says somebody is: name, email and password.

The part of saving a person's page that any holder of the account could
also do for themselves. What somebody may do, and where, is in the
modules beside this one.

A change to the username, email or password ends every session the
account holds, and every reset or setup link already sent, by moving
``token_version`` on: those are checked against it and nothing else. An
administrator setting a new password is usually answering a compromise,
and a session the attacker already holds would otherwise outlive it. A
name change is not a change to how somebody signs in, so it leaves them
signed in.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User, normalise_email
from app.security import hash_password
from app.users.errors import (
    EmailRequired,
    EmailTaken,
    PasswordTooShort,
    UsernameTaken,
)

#: The fewest characters a password may have, whoever sets it.
MIN_PASSWORD_LENGTH = 8


def change_identity(
    db: Session,
    user: User,
    *,
    username: str | None = None,
    name: str | None = None,
    email: str | None = None,
    password: str | None = None,
) -> None:
    """Set the parts of somebody's identity that were given.

    A field left as ``None`` is not touched. The user form sends every
    field on every save, so a value that matches what is already held is
    not an error: somebody's own username is not "taken" by them.

    A change to the username, email or password ends the account's
    sessions: see the module docstring. Nothing is flushed. The caller's
    transaction decides whether the change is kept.

    Args:
        db: The database session.
        user: The account to change.
        username: The new username. Trimmed.
        name: The new full name. Trimmed, and an empty one clears it.
        email: The new address. Held trimmed and in lower case.
        password: The new password. An empty string is not a change.

    Raises:
        UsernameTaken: If another account has the username.
        EmailRequired: If the address is changed to nothing.
        EmailTaken: If another account has the address.
        PasswordTooShort: If the password is under eight characters.
    """
    signs_in_differently = False

    if username is not None:
        signs_in_differently |= _change_username(db, user, username.strip())

    if name is not None:
        user.full_name = name.strip() or None

    if email is not None:
        signs_in_differently |= _change_email(db, user, normalise_email(email))

    if password:
        check_password_long_enough(password)
        user.password_hash = hash_password(password)
        signs_in_differently = True

    if signs_in_differently:
        end_sessions(user)


def end_sessions(user: User) -> None:
    """End every session *user* holds, and every link already sent them.

    Access and refresh tokens, and reset and setup links, carry the
    ``token_version`` they were made under and are refused once it
    differs. Nothing is flushed.
    """
    user.token_version += 1


def check_password_long_enough(password: str) -> None:
    """Refuse a password that is too short, whoever is setting it.

    Raises:
        PasswordTooShort: If it is under eight characters.
    """
    if len(password) < MIN_PASSWORD_LENGTH:
        raise PasswordTooShort()


def check_username_free(db: Session, username: str) -> None:
    """Refuse a username an account already has.

    Asked as the username will be held: the caller trims it first if it
    is to be trimmed.

    Raises:
        UsernameTaken: If any account has it.
    """
    if db.scalar(select(User).where(User.username == username)):
        raise UsernameTaken()


def check_email_free(db: Session, email: str) -> None:
    """Refuse an address an account already has.

    Asked as the address will be held, so the caller passes it through
    ``normalise_email`` first.

    Raises:
        EmailTaken: If any account has it.
    """
    if db.scalar(select(User).where(User.email == email)):
        raise EmailTaken()


def _change_username(db: Session, user: User, username: str) -> bool:
    """Give *user* the username, unless it is theirs already or taken.

    Returns:
        Whether it changed.
    """
    if username == user.username:
        return False

    check_username_free(db, username)
    user.username = username

    return True


def _change_email(db: Session, user: User, email: str) -> bool:
    """Give *user* the address, unless it is theirs already or taken.

    Returns:
        Whether it changed.
    """
    if email == user.email:
        return False

    if not email:
        raise EmailRequired()

    check_email_free(db, email)
    user.email = email

    return True
