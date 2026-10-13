"""Closing somebody's account, and opening it again.

An account is deactivated, never deleted: its owner can no longer sign
in, and everything they did stays for the record. Reactivating it is the
same switch thrown back.

The switch is nearly the whole of it. What they hold, where they belong
and where they practise all stay as they were, so reactivating puts
them back exactly where they left off.

One thing moves: their answer about news and updates. Closing an account
is not the person saying "stop emailing me", so their name, address and
answer go onto the newsletter list, which is kept apart from accounts.
Opening the account again brings them back off it.
"""

from sqlalchemy.orm import Session

from app.marketing.subscribers import fold_into_account, move_to_list
from app.models import User
from app.users.errors import (
    AccountEmptied,
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
    db.flush()

    # Closing an account is not the person saying "stop emailing me": it
    # is usually an admin who does it, and somebody who has left may
    # still want to hear what would bring them back. Their answer goes
    # onto the newsletter list as it stands, a yes as a yes and a no as
    # a no. Every newsletter carries the link that stops it.
    move_to_list(db, user)

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
        AccountEmptied: If it has been emptied.
    """
    user = account_the_caller_may_act_on(db, actor, user_id)

    if user.is_active:
        raise AlreadyActive()

    # An emptied account is a blank row kept so that other people's
    # records have something to point at. There is nobody to open it
    # for: no name, no address and no way to sign in.
    if user.emptied_at is not None:
        raise AccountEmptied()

    user.is_active = True
    db.flush()

    # Nobody is on the list and an open account both: the list entry is
    # folded back in, and a "no" given while the account was closed
    # comes with it.
    fold_into_account(db, user)

    return user
