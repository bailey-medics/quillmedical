"""The invite an administrator sends so somebody can set their password.

An account made by an administrator has a password its owner was never
told. The invite is how they get in: an email carrying a link to the
page that sets a password, signed for their address and good for a
limited time. The token is the one a forgotten password is sent, so the
same page serves both.

This module decides who may be sent one and makes the token. Writing the
email and sending it belong to the route, which knows the address of the
site and holds the sender.

The invite to a patient's record is a different thing with its own
token, in :mod:`app.users.invites`.
"""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models import User
from app.security import create_password_reset_token
from app.users.reach import account_the_caller_may_act_on


@dataclass(frozen=True)
class SetupInvite:
    """What the route needs to write and send an invite.

    Attributes:
        user: The account the invite is for.
        token: A password reset token signed for that account's address.
    """

    user: User
    token: str


def setup_invite_for(db: Session, actor: User, user_id: int) -> SetupInvite:
    """Make the token that lets an account's owner set their password.

    Anybody the caller may act on may be sent one, however often and
    whether or not their account is active or has been signed in to.
    Nothing is written: the token is signed, not stored.

    Args:
        db: Core database session.
        actor: The caller.
        user_id: The id of the account, as the request gave it.

    Returns:
        The account and its token.

    Raises:
        UserAdminError: Whatever ``account_the_caller_may_act_on``
            refuses.
    """
    user = account_the_caller_may_act_on(db, actor, user_id)

    return SetupInvite(
        user=user,
        token=create_password_reset_token(user.email, user.token_version),
    )
