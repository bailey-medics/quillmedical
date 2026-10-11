"""Closing somebody's account, and opening it again.

An account is deactivated, never deleted: its owner can no longer sign
in, and everything they did stays for the record. Reactivating it is the
same switch thrown back.

The switch is the whole of it. Nothing else about the account is
written: what they hold, where they belong and where they practise all
stay as they were, so reactivating puts them back exactly where they
left off.
"""

from sqlalchemy.orm import Session

from app.models import User
from app.users.errors import (
    AlreadyActive,
    AlreadyDeactivated,
    DeactivatingYourself,
)
from app.users.reach import account_the_caller_may_act_on


def deactivate_account(db: Session, actor: User, user_id: int) -> User:
    """Mark an account as closed, so its owner can no longer sign in.

    Nobody closes their own account here, which would lock them out with
    no way back but another administrator.

    Flushed, never committed: the caller's transaction decides whether
    the change is kept.

    Args:
        db: Core database session.
        actor: The caller.
        user_id: The id of the account, as the request gave it.

    Returns:
        The account, now inactive.

    Raises:
        UserAdminError: Whatever ``account_the_caller_may_act_on``
            refuses, first.
        DeactivatingYourself: If the account is the caller's own.
        AlreadyDeactivated: If it is already inactive.
    """
    user = account_the_caller_may_act_on(db, actor, user_id)

    if user.id == actor.id:
        raise DeactivatingYourself()

    if not user.is_active:
        raise AlreadyDeactivated()

    user.is_active = False

    # The mailing list is deliberately left alone. Closing an account is
    # not the person saying "stop emailing me": it is usually an admin
    # who does it, and somebody who has left may still want to hear what
    # would bring them back. They keep the unsubscribe link in every
    # newsletter. Taking somebody off the list altogether is for a
    # request to erase their data, which is `remove_contact`'s job and
    # has no route yet.

    db.flush()

    return user


def reactivate_account(db: Session, actor: User, user_id: int) -> User:
    """Mark a closed account as open again.

    Flushed, never committed: the caller's transaction decides whether
    the change is kept.

    Args:
        db: Core database session.
        actor: The caller.
        user_id: The id of the account, as the request gave it.

    Returns:
        The account, now active.

    Raises:
        UserAdminError: Whatever ``account_the_caller_may_act_on``
            refuses, first.
        AlreadyActive: If it is already active.
    """
    user = account_the_caller_may_act_on(db, actor, user_id)

    if user.is_active:
        raise AlreadyActive()

    user.is_active = True
    db.flush()

    return user
