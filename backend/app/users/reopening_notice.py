"""Telling somebody their account has been opened again.

The other half of ``app.users.closure_notice``. Somebody whose account
was closed was told so, and may never try to log in again unless they
are told it is open. It is also a check: a reopening the owner did not
expect reaches them at once.

One email, once, when the account is reopened. It says they can log in,
that what is still kept is as they left it, and where their newsletter
stands: a "no" given while the account was closed comes back with them.

**Who is sent it.** Everybody whose address was verified, as for the
closure. An address nobody verified may be somebody else's.

**An account an administrator made and nobody used** is sent the same
email. It has a password its owner was never told, so the email's link
to set a new password is their way in. Nothing in the account says
whether its owner ever set one, so no second email is chosen for them.

Working out the notice and sending it are apart, as for the closure: the
first reads the database inside the request, the second runs once the
request has answered.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.config import settings
from app.email.account import account_email_values
from app.email.render import render_email, send_args
from app.email_send import send_email
from app.models import User

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ReopeningNotice:
    """What the email needs, read while the request is still open.

    Attributes:
        user_id: Whose account, for the log and nothing else.
        to: The address to write to.
        name: Who to greet.
        username: The account's username.
        wants_news: Whether they are set to receive news and updates.
    """

    user_id: int
    to: str
    name: str
    username: str
    wants_news: bool


def reopening_notice_for(user: User) -> ReopeningNotice | None:
    """The notice to send for an account just reopened, if any is due.

    Args:
        user: The account, already open again, and with its newsletter
            answer already folded back from the list.

    Returns:
        The notice, or None for a closed account or an address nobody
        verified.
    """
    if not user.is_active or not user.email_verified:
        return None

    values = account_email_values(user)

    return ReopeningNotice(
        user_id=user.id,
        to=values["email"],
        name=values["name"],
        username=values["username"],
        wants_news=bool(user.marketing_emails),
    )


def send_reopening_notice(notice: ReopeningNotice) -> None:
    """Send the notice. Run after the request has answered.

    A failure is logged and swallowed: the account is open whether or
    not the email leaves.
    """
    base = settings.FRONTEND_URL.rstrip("/")

    try:
        rendered = render_email(
            "account_reopened.html.j2",
            "quill",
            {
                "name": notice.name,
                "username": notice.username,
                "email": notice.to,
                "login_url": f"{base}/login",
                "forgot_password_url": f"{base}/forgot-password",
                "wants_news": notice.wants_news,
            },
        )
        send_email(to=notice.to, **send_args(rendered))
    except Exception:
        # Broad on purpose: whatever went wrong, there is nobody left to
        # tell but the log. The id only, never the name or the address.
        logger.exception(
            "account reopening notice not sent",
            extra={"user_id": notice.user_id},
        )
