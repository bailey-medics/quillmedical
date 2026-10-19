"""Whose account a caller may reach, and which they may act on.

A competency says what somebody may do, never where. A route that acts
on one account by its id has to ask where as well, or an administrator
at one trust can act on somebody at another by naming their number. This
module asks it.

It also holds the one sequence that three routes share before they act
on a whole account: deactivating it, reactivating it, and sending its
owner an invite. Each finds the account, then asks whether it is an
operator's, whether the caller reaches it, and whether it is within what
the caller may manage, in that order.

Where a caller may *place* people is a different question, answered in
:mod:`app.users.membership`: that follows ``manage_users`` practising
rows, and this follows membership.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import User
from app.organisations import (
    is_member_within,
    org_units_whose_people_reached_by,
)
from app.users.errors import UserNotFound
from app.users.scope import (
    check_account_in_deactivation_scope,
    check_account_in_scope,
    check_may_act_on_operator,
)


def check_account_within_reach(db: Session, actor: User, target: User) -> None:
    """Refuse a user who is at no org_unit the admin reaches.

    The org_unit check for the admin routes that act on one user by id. Being
    an admin says what someone may do, never where: the column is global
    and the authority is not, so without this an admin at one trust can
    act on a user at another by naming their id.

    The admin reaches the org_units they belong to and everything
    beneath those, which is what the user list shows them. It
    asked for a shared *organisation* until somebody running one site
    could add a person there and then not open them.

    A user in no org_unit at all is refused rather than treated as
    everyone's, so a record that has slipped out of the membership tables
    fails closed.

    The refusal is the one given for an id no account has, so the answer
    does not confirm that a user exists to somebody who may not see them.

    Somebody's own account is always within their reach.

    Args:
        db: Core database session.
        actor: The admin making the request.
        target: The user being acted on.

    Raises:
        UserNotFound: If the target is at none of them.
    """
    if target.id == actor.id:
        return

    reached = org_units_whose_people_reached_by(db, actor)

    if reached is None:
        return
    if not is_member_within(db, target.id, reached):
        raise UserNotFound()


def account_the_caller_may_act_on(
    db: Session, actor: User, user_id: int, *, deactivating: bool = False
) -> User:
    """Find an account the caller may act on as a whole, or refuse.

    The checks run in a fixed order, so when two things are wrong the
    same one is always reported: the account exists, it is not an
    operator's unless the caller is one, the caller reaches an org unit
    its owner belongs to, and everything its owner holds is something
    the caller may grant.

    The caller has already been asked whether they manage people at all.

    Args:
        db: Core database session.
        actor: The caller.
        user_id: The id of the account, as the request gave it.
        deactivating: Whether the act is a deactivation or reactivation,
            whose scope leaves out what organisation cover gives (see
            ``may_deactivate_account``).

    Returns:
        The account.

    Raises:
        UserNotFound: If no account has that id, or its owner is at no
            org unit the caller reaches.
        OperatorAccountNotAllowed: If it is an operator's and the caller
            is not one.
        AccountOutOfScope: If it is outside what the caller may manage.
    """
    user = db.scalar(select(User).where(User.id == user_id))

    # An emptied account is a blank row kept for other people's records
    # to point at. To anybody administering accounts it is not there.
    if user is None or user.emptied_at is not None:
        raise UserNotFound()

    check_may_act_on_operator(actor, user)
    check_account_within_reach(db, actor, user)

    if deactivating:
        check_account_in_deactivation_scope(actor, user)
    else:
        check_account_in_scope(actor, user)

    return user
