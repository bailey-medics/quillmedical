"""Telling somebody their account has been closed.

One email, once, when an account is closed. It is usually an
administrator who closes it, so otherwise the first its owner would know
is a login that no longer works. It says the account is closed, what
happens to their data next, and who to speak to about a mistake.

**Their newsletter is part of the same email.** Closing an account moves
its owner's stored answer about news and updates to the newsletter list
(``app.marketing.subscribers.move_to_list``). Where that leaves them
subscribed, the email says the newsletter carries on and gives the link
that stops it. Nobody is sent two emails.

**Who is sent it.** Mark's decisions of 14 October:

- **Not an address nobody verified.** It may be somebody else's, who
  would be told a stranger's account was closed.
- **An account an administrator made whose owner never set a
  password** is sent it. Its address counts as verified, because the
  administrator vouched for it, and the email explains why their
  invitation no longer works.
- **Nothing on deletion.** Emptying an account years later sends
  nothing: the address is wiped by then, and they were told here.

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

#: The published privacy policy. On the public site and the same in every
#: environment, as ``PRIVACY_POLICY_URL`` in
#: ``frontend/src/lib/legal/links.ts`` is: the policy somebody reads should
#: be the published one.
PRIVACY_POLICY_URL = "https://quill-medical.com/privacy-policy"


@dataclass(frozen=True)
class ClosureNotice:
    """What the email needs, read while the request is still open.

    Attributes:
        user_id: Whose account, for the log and nothing else.
        to: The address to write to.
        name: Who to greet.
        username: The account's username.
        unsubscribe_url: The page that stops their newsletter, or None
            for somebody who is not sent one. The email's paragraph about
            news and updates is shown only with it.
    """

    user_id: int
    to: str
    name: str
    username: str
    unsubscribe_url: str | None


def closure_notice_for(db: Session, user: User) -> ClosureNotice | None:
    """The notice to send for an account just closed, if any is due.

    Args:
        db: Database session.
        user: The account, already closed and already moved to the list.

    Returns:
        The notice, or None for an open account or an address nobody
        verified.
    """
    if user.is_active or not user.email_verified:
        return None

    entry = db.scalar(
        select(NewsletterSubscriber).where(
            NewsletterSubscriber.email == user.email
        )
    )
    page: str | None = None

    if entry is not None and entry.subscribed:
        page, _api = unsubscribe_links(entry)

    values = account_email_values(user)

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
    link that stops it.
    """
    try:
        rendered = render_email(
            "account_closed.html.j2",
            "quill",
            {
                "name": notice.name,
                "username": notice.username,
                "email": notice.to,
                "privacy_policy_url": PRIVACY_POLICY_URL,
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
