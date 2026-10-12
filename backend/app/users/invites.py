"""Accepting an invite to a patient's record.

Somebody who may invite people to a patient's record is handed a signed
token naming the patient, the address invited and what the person is: a
clinician from elsewhere or a patient's advocate. Whoever sends that
token back is given access to that patient's record. Nobody is signed
in: the token is the whole of the authority.

Two things can happen, and the address in the token decides which. If
an account has the address, that account is given the access and
nothing else about it is touched. If none has, an account is made with
the username and password sent, and given the access.

Nothing records that a token was used. It works until it runs out, and
a second use finds the account the first one made.

The invite a passport assessor is sent is a different token with its own
rules, in :mod:`app.features.passport`.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ExternalPatientAccess, User, normalise_email
from app.security import (
    TokenNotAcceptable,
    decode_invite_token,
    hash_password,
)
from app.users.errors import (
    InviteNeedsUsernameAndPassword,
    InviteTokenInvalid,
    InviteUsernameTaken,
)


@dataclass(frozen=True)
class InviteAccepted:
    """What came of accepting an invite.

    Attributes:
        user: The account that now has access to the patient's record.
        registered: Whether the account was made by this invite. False
            where an account already had the address.
    """

    user: User
    registered: bool


def accept_external_invite(
    db: Session,
    token: str,
    *,
    username: str | None = None,
    password: str | None = None,
) -> InviteAccepted:
    """Give whoever an invite names access to the patient's record.

    The checks run in a fixed order, so when two things are wrong the
    same one is always reported: the token, then, only where no account
    has the address, that a username and a password were sent, then
    that the username is free.

    Where an account has the address, the username and the password
    sent are not looked at, and the account is not asked to be active.

    No length is asked of the password, unlike everywhere else one is
    set.

    A new account is flushed, so it has its id. Nothing is committed.

    Args:
        db: Core database session.
        token: The invite token, as it came from the link.
        username: What a new account will sign in with. Held as sent.
        password: A new account's password, as typed.

    Returns:
        The account given access, and whether this invite made it.

    Raises:
        InviteTokenInvalid: If the token has run out, was altered, or
            is not an invite to a patient's record.
        InviteNeedsUsernameAndPassword: If no account has the address
            and the username or the password is missing or empty.
        InviteUsernameTaken: If no account has the address and another
            has the username.
    """
    try:
        payload = decode_invite_token(token)
    except TokenNotAcceptable as err:
        raise InviteTokenInvalid() from err

    patient_id: str = payload["patient_id"]
    email: str = normalise_email(payload["email"])
    user_type: str = payload["user_type"]

    # Check if user already exists
    existing = db.scalar(select(User).where(User.email == email))

    if existing is not None:
        _give_access_to_existing(db, existing, patient_id)

        return InviteAccepted(user=existing, registered=False)

    # New user registration
    if not username or not password:
        raise InviteNeedsUsernameAndPassword()

    # Validate uniqueness
    if db.scalar(select(User).where(User.username == username)):
        raise InviteUsernameTaken()

    new_user = User(
        username=username,
        email=email,
        password_hash=hash_password(password),
        base_profession=user_type,
    )
    db.add(new_user)
    db.flush()

    db.add(
        ExternalPatientAccess(
            user_id=new_user.id,
            patient_id=patient_id,
            granted_by_user_id=new_user.id,
        )
    )

    return InviteAccepted(user=new_user, registered=True)


def _give_access_to_existing(db: Session, user: User, patient_id: str) -> None:
    """Give an account that already exists access to the patient's record.

    Doing it twice changes nothing. Access that was taken away is given
    back: the row is kept and its ending is cleared.
    """
    # Grant access to existing user (idempotent)
    grant = db.scalar(
        select(ExternalPatientAccess).where(
            ExternalPatientAccess.user_id == user.id,
            ExternalPatientAccess.patient_id == patient_id,
        )
    )

    if grant is None:
        db.add(
            ExternalPatientAccess(
                user_id=user.id,
                patient_id=patient_id,
                granted_by_user_id=user.id,
            )
        )
    elif grant.revoked_at is not None:
        grant.revoked_at = None
