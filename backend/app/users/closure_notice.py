"""Telling somebody their account is closed and their newsletter is not.

Closing an account moves its owner's answer about news and updates to
the newsletter list (``app.marketing.subscribers.move_to_list``). Where
that leaves them still subscribed, they are told once, by email: that
the account is closed, that the newsletter carries on, and how to stop
it. It is usually an administrator who closes an account, so otherwise
the first they would know is a newsletter from somewhere they had left.

**Nobody else is sent it.** Somebody who said no, or who was never
asked, has no newsletter to be told about, and is sent nothing.

Working out the notice and sending it are apart, as in
``app.users.setup_invite``: the first reads the database inside the
request, the second runs once the request has answered, so a mail
provider that is slow or down does not hold up or undo the closure.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.email.account import account_email_values
from app.email.render import render_email, send_args
from app.email_send import send_email
from app.marketing.newsletter import unsubscribe_links
from app.models import NewsletterSubscriber, User

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ClosureNotice:
    """What the email needs, read while the request is still open.

    Attributes:
        user_id: Whose account, for the log and nothing else.
        to: The address to write to.
        name: Who to greet.
        username: The account's username.
        unsubscribe_url: The page that stops their newsletter.
    """

    user_id: int
    to: str
    name: str
    username: str
    unsubscribe_url: str


def closure_notice_for(db: Session, user: User) -> ClosureNotice | None:
    """The notice to send for an account just closed, if any is due.

    Args:
        db: Database session.
        user: The account, already closed and already moved to the list.

    Returns:
        The notice, or None when their newsletter does not carry on.
    """
    if user.is_active:
        return None

    entry = db.scalar(
        select(NewsletterSubscriber).where(
            NewsletterSubscriber.email == user.email
        )
    )

    if entry is None or not entry.subscribed:
        return None

    values = account_email_values(user)
    page, _api = unsubscribe_links(entry)

    return ClosureNotice(
        user_id=user.id,
        to=values["email"],
        name=values["name"],
        username=values["username"],
        unsubscribe_url=page,
    )


def send_closure_notice(notice: ClosureNotice) -> None:
    """Send the notice. Run after the request has answered.

    A failure is logged and swallowed: the account is closed whether or
    not the email leaves, and every newsletter they are sent carries the
    same link.
    """
    try:
        rendered = render_email(
            "account_closed.html.j2",
            "quill",
            {
                "name": notice.name,
                "username": notice.username,
                "email": notice.to,
                "unsubscribe_url": notice.unsubscribe_url,
            },
        )
        send_email(to=notice.to, **send_args(rendered))
    except Exception:
        # Broad on purpose: whatever went wrong, there is nobody left to
        # tell but the log. The id only, never the name or the address.
        logger.exception(
            "account closure notice not sent",
            extra={"user_id": notice.user_id},
        )
