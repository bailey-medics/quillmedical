"""Sending a newsletter to everybody who said yes.

Quill sends its own newsletters. Amazon SES, which carries the mail, has
no screen to compose one and press send, and Quill's database is the
only list of who wants one: there is no copy at the mail provider to
drift from it.

A newsletter is a **campaign**: a template under
``app/email/templates/campaigns/`` that extends ``newsletter.html.j2``,
named by its file name less the ending. It is written, reviewed and
merged like any other change, so the pull request is where its words are
read before anybody receives them.

**Nothing but this module stops an email to somebody who refused.** So
who it sends to is read when a send starts and read again for each
person just before theirs, and the tests pin both down.

Run with ``just newsletter-send``, or as the ``send-newsletter`` admin
action. Without ``CONFIRM`` it only reports. See Phase 4 of
``docs/docs/plans/2026-10-06-amazon-ses-email-plan.md``.
"""

from __future__ import annotations

import logging
import os
import re
import sys
import time
from dataclasses import dataclass, field

from jinja2 import TemplateNotFound
from sqlalchemy import select
from sqlalchemy.exc import InvalidRequestError
from sqlalchemy.orm import Session

from app.config import settings
from app.email.render import render_email, send_args
from app.email_send import (
    EmailNotAllowedError,
    EmailRateLimitError,
    EmailSendError,
    mask_email,
    send_email,
)
from app.models import NewsletterSend, User
from app.security import create_marketing_unsubscribe_token

logger = logging.getLogger(__name__)

#: What a campaign may be called: what is safe as a file name and in a
#: command line.
CAMPAIGN_NAME = re.compile(r"[a-z0-9][a-z0-9-]{0,99}")

#: Who a newsletter comes from. A person, not the brand: it is signed
#: off by Mark.
FROM_NAME = "Mark at Quill Medical"

#: A pause between sends, to stay well inside the mail provider's limit
#: of fourteen a second however long the list grows.
PAUSE_SECONDS = 0.2


class NewsletterError(Exception):
    """A send that cannot start, with the reason."""


@dataclass
class Sent:
    """What one run found and did.

    Attributes:
        recipients: Masked addresses, in the order they were reached. In
            a dry run, who would be sent it.
        sent: Emails the mail provider accepted.
        already: People this campaign had reached on an earlier run.
        withdrew: People who said no between the start and their turn.
        refused: Addresses this environment may not write to, or that
            have had their hourly allowance. Development only.
        failed: Sends the mail provider refused or could not be reached
            for.
    """

    recipients: list[str] = field(default_factory=list)
    sent: int = 0
    already: int = 0
    withdrew: int = 0
    refused: int = 0
    failed: int = 0


def _wants_news(user: User) -> bool:
    """Whether somebody may be sent a newsletter, as of now.

    Verified, because an unverified address may be somebody else's.
    Active, because a closed account is somebody who has left. And said
    yes: ``marketing_emails`` is off until a person turns it on.
    """
    return bool(
        user.email_verified and user.is_active and user.marketing_emails
    )


def recipients(db: Session) -> list[User]:
    """Everybody who may be sent a newsletter, oldest account first.

    Args:
        db: Database session.

    Returns:
        The users.
    """
    return list(
        db.execute(
            select(User)
            .where(
                User.email_verified.is_(True),
                User.is_active.is_(True),
                User.marketing_emails.is_(True),
            )
            .order_by(User.id)
        )
        .unique()
        .scalars()
        .all()
    )


def _already_sent(db: Session, campaign: str) -> set[int]:
    """Whose copy of a campaign has already left."""
    return set(
        db.execute(
            select(NewsletterSend.user_id).where(
                NewsletterSend.campaign == campaign
            )
        )
        .scalars()
        .all()
    )


def unsubscribe_links(user: User) -> tuple[str, str]:
    """Where one person's unsubscribe link leads, for a person and a mailbox.

    Args:
        user: The person.

    Returns:
        The page in the app, for the link in the footer, and the API
        route, for the ``List-Unsubscribe`` header a mailbox presses.
    """
    token = create_marketing_unsubscribe_token(user.id)
    base = settings.FRONTEND_URL.rstrip("/")
    return (
        f"{base}/unsubscribe?token={token}",
        f"{base}/api/marketing/unsubscribe?token={token}",
    )


def _send_one(campaign: str, user: User) -> None:
    """Render a campaign for one person and send it.

    One recipient to a message, each with their own link: a link shared
    by a whole mailing would let any reader unsubscribe everybody.
    """
    page, one_click = unsubscribe_links(user)
    rendered = render_email(
        f"campaigns/{campaign}.html.j2",
        "quill",
        {"unsubscribe_url": page},
        from_name=FROM_NAME,
    )
    send_email(
        to=user.email,
        **send_args(rendered),
        # Both headers, or a mailbox shows no unsubscribe button: the
        # second says the first may be pressed without a person looking
        # at a page (RFC 8058). Gmail and Yahoo require them of bulk mail.
        headers={
            "List-Unsubscribe": f"<{one_click}>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
    )


def confirmation(campaign: str, count: int) -> str:
    """What must be passed back to send for real.

    It names the count as well as the campaign, so it can only be known
    by reading a dry run, and stops being right if the list changes
    between the dry run and the send.
    """
    return f"{campaign}:{count}"


def send_campaign(
    db: Session,
    campaign: str,
    *,
    confirm: str | None = None,
    only_to: str | None = None,
) -> Sent:
    """Send a campaign, or with no ``confirm`` report who would get it.

    Each person is committed on their own, so a run that stops half way
    keeps what it did and the next reaches only the rest.

    Args:
        db: Database session.
        campaign: The campaign's name.
        confirm: :func:`confirmation` for this campaign and the number
            of people it would now reach. None for a dry run.
        only_to: One address, for a trial send before the real one. They
            must be somebody who may be sent newsletters. A trial is not
            recorded, so the real send still reaches them.

    Returns:
        What was found and done.

    Raises:
        NewsletterError: If the campaign does not exist or is misnamed,
            ``only_to`` is nobody who may be sent it, or ``confirm`` is
            not what a dry run would now print.
    """
    if not CAMPAIGN_NAME.fullmatch(campaign):
        raise NewsletterError(f"Not a campaign name: {campaign!r}")

    everybody = recipients(db)
    if only_to is not None:
        wanted = only_to.strip().lower()
        to_send = [u for u in everybody if u.email.lower() == wanted]
        if not to_send:
            raise NewsletterError(
                f"{mask_email(only_to)} is nobody who may be sent a "
                "newsletter: not verified, not active, or has not said yes"
            )
        already: set[int] = set()
    else:
        already = _already_sent(db, campaign)
        to_send = [u for u in everybody if u.id not in already]

    result = Sent(already=len(already))
    result.recipients = [mask_email(u.email) for u in to_send]

    # Render it once before anything is sent, so a campaign that does
    # not exist or will not render fails here and not after the first
    # person has had theirs.
    if to_send:
        try:
            page, _ = unsubscribe_links(to_send[0])
            render_email(
                f"campaigns/{campaign}.html.j2",
                "quill",
                {"unsubscribe_url": page},
                from_name=FROM_NAME,
            )
        except TemplateNotFound:
            raise NewsletterError(
                f"There is no campaign called {campaign!r}"
            ) from None

    if confirm is None:
        return result
    expected = confirmation(campaign, len(to_send))
    if confirm != expected:
        raise NewsletterError(
            "CONFIRM does not match. A dry run now would print "
            f"{expected!r}: the list may have changed since yours."
        )

    for user in to_send:
        # Read again, just before their turn: somebody who unsubscribed
        # while this ran must not be emailed.
        try:
            db.refresh(user)
        except InvalidRequestError:
            # The account was deleted while this ran.
            result.withdrew += 1
            continue
        if not _wants_news(user):
            result.withdrew += 1
            continue
        try:
            _send_one(campaign, user)
        except (EmailNotAllowedError, EmailRateLimitError):
            result.refused += 1
            continue
        except EmailSendError as exc:
            logger.warning(
                "Newsletter %s could not be sent to user %s: %s",
                campaign,
                user.id,
                exc,
            )
            result.failed += 1
            continue
        finally:
            time.sleep(PAUSE_SECONDS)
        if only_to is None:
            db.add(NewsletterSend(campaign=campaign, user_id=user.id))
            db.commit()
        result.sent += 1
    return result


def main() -> int:
    """Run a send from the environment and print what happened.

    Reads ``NEWSLETTER_CAMPAIGN``, and optionally ``CONFIRM`` and
    ``NEWSLETTER_ONLY_TO``.

    Returns:
        The exit status: 0 when everybody due was sent it, or for a dry
        run; 1 when the send could not start or anybody could not be
        reached.
    """
    from app.db.core_db import CoreSessionLocal

    campaign = os.environ.get("NEWSLETTER_CAMPAIGN", "").strip()
    confirm = os.environ.get("CONFIRM", "").strip() or None
    only_to = os.environ.get("NEWSLETTER_ONLY_TO", "").strip() or None
    if not campaign:
        print("✗ NEWSLETTER_CAMPAIGN is required", file=sys.stderr)
        return 1

    db = CoreSessionLocal()
    try:
        result = send_campaign(db, campaign, confirm=confirm, only_to=only_to)
    except NewsletterError as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()

    if confirm is None:
        print(f"Dry run. Campaign {campaign!r} would be sent to:")
        for address in result.recipients:
            print(f"  {address}")
        print(
            f"{len(result.recipients)} to send, "
            f"{result.already} already sent."
        )
        print(
            "Nothing was sent. To send, run again with "
            f"CONFIRM={confirmation(campaign, len(result.recipients))}"
        )
        return 0

    print(
        f"Campaign {campaign!r}: {result.sent} sent, "
        f"{result.already} already sent, {result.withdrew} withdrew, "
        f"{result.refused} refused, {result.failed} failed."
    )
    return 1 if result.failed or result.refused else 0


if __name__ == "__main__":
    sys.exit(main())
