"""Sending a newsletter to everybody who said yes.

Quill sends its own newsletters. Amazon SES, which carries the mail, has
no screen to compose one and press send, and Quill's database is the
only list of who wants one: there is no copy at the mail provider to
drift from it.

A newsletter is a **campaign**: a template under
``app/email/templates/campaigns/<brand>/`` that extends
``newsletter.html.j2``, named by its file name less the ending. The
folder is the brand it goes out as, ``quill`` or ``ldd``: the theme it
is drawn in and the name it is sent under. It is written, reviewed and
merged like any other change, so the pull request is where its words are
read before anybody receives them.

It goes to two kinds of people: account holders who said yes, and
subscribers, who are on the mailing list and have no account. Where an
address is both, the account's answer is the one that counts.

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
from pathlib import Path
from typing import get_args

from sqlalchemy import select
from sqlalchemy.exc import InvalidRequestError
from sqlalchemy.orm import Session

from app.config import settings
from app.email.brand import EmailThemeName, email_theme
from app.email.render import RenderedEmail, render_email, send_args
from app.email_send import (
    EmailNotAllowedError,
    EmailRateLimitError,
    EmailSendError,
    mask_email,
    send_email,
)
from app.models import NewsletterSend, NewsletterSubscriber, User
from app.security import (
    create_marketing_unsubscribe_token,
    create_subscriber_unsubscribe_token,
)

logger = logging.getLogger(__name__)

#: What a campaign may be called: what is safe as a file name and in a
#: command line.
CAMPAIGN_NAME = re.compile(r"[a-z0-9][a-z0-9-]{0,99}")

#: Where campaigns are kept, beside the other email templates.
CAMPAIGNS_DIR = (
    Path(__file__).resolve().parent.parent
    / "email"
    / "templates"
    / "campaigns"
)

#: The brands a newsletter can go out as. A campaign's brand is the
#: folder its template is in, under ``campaigns/``.
BRANDS: tuple[EmailThemeName, ...] = get_args(EmailThemeName)

#: A pause between sends, to stay well inside the mail provider's limit
#: of fourteen a second however long the list grows.
PAUSE_SECONDS = 0.2


#: Somebody a newsletter can go to: an account holder, or somebody on
#: the mailing list who has no account.
Person = User | NewsletterSubscriber


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
        waiting: People due it whom this run leaves for a later one,
            because a limit was set.
        withdrew: People who said no between the start and their turn.
        refused: Addresses this environment may not write to, or that
            have had their hourly allowance. Development only.
        failed: Sends the mail provider refused or could not be reached
            for.
    """

    recipients: list[str] = field(default_factory=list)
    sent: int = 0
    already: int = 0
    waiting: int = 0
    withdrew: int = 0
    refused: int = 0
    failed: int = 0


def _wants_news(person: Person) -> bool:
    """Whether somebody may be sent a newsletter, as of now.

    An account holder must be verified, because an unverified address
    may be somebody else's; active, because a closed account is somebody
    who has left; and have said yes, since ``marketing_emails`` is off
    until a person turns it on. A subscriber must be subscribed.
    """
    if isinstance(person, NewsletterSubscriber):
        return bool(person.subscribed)
    return bool(
        person.email_verified and person.is_active and person.marketing_emails
    )


def recipients(db: Session) -> list[User]:
    """Every account holder who may be sent a newsletter, oldest first.

    Somebody whose address is on the mailing list as unsubscribed is
    left out even if their account says yes. ``fold_into_account``
    carries that refusal onto the account when the address is verified,
    and this is the guard for any account it has not reached: a "no"
    from the mailing list always survives.

    Args:
        db: Database session.

    Returns:
        The users.
    """
    refused_on_the_list = select(NewsletterSubscriber.email).where(
        NewsletterSubscriber.subscribed.is_(False)
    )
    return list(
        db.execute(
            select(User)
            .where(
                User.email_verified.is_(True),
                User.is_active.is_(True),
                User.marketing_emails.is_(True),
                User.email.not_in(refused_on_the_list),
            )
            .order_by(User.id)
        )
        .unique()
        .scalars()
        .all()
    )


def subscribers(db: Session) -> list[NewsletterSubscriber]:
    """Every mailing-list subscriber who may be sent a newsletter.

    Somebody whose address is also a verified account's is left out,
    whatever the mailing list says: the account's answer is the one that
    counts. So a person who registered and said no is not emailed
    because an old list still has them on it, and a person who said yes
    gets one newsletter and not two.

    Args:
        db: Database session.

    Returns:
        The subscribers, oldest first.
    """
    with_an_account = select(User.email).where(User.email_verified.is_(True))
    return list(
        db.execute(
            select(NewsletterSubscriber)
            .where(
                NewsletterSubscriber.subscribed.is_(True),
                NewsletterSubscriber.email.not_in(with_an_account),
            )
            .order_by(NewsletterSubscriber.id)
        )
        .scalars()
        .all()
    )


def everybody(db: Session) -> list[Person]:
    """Everybody who may be sent a newsletter: accounts, then subscribers."""
    return [*recipients(db), *subscribers(db)]


def _key(person: Person) -> tuple[str, int]:
    """What tells one person from another across the two tables."""
    kind = "subscriber" if isinstance(person, NewsletterSubscriber) else "user"
    return kind, person.id


def _already_sent(db: Session, campaign: str) -> set[tuple[str, int]]:
    """Whose copy of a campaign has already left."""
    rows = db.execute(
        select(NewsletterSend.user_id, NewsletterSend.subscriber_id).where(
            NewsletterSend.campaign == campaign
        )
    ).all()
    return {
        ("user", user_id) if user_id is not None else ("subscriber", sub_id)
        for user_id, sub_id in rows
        if user_id is not None or sub_id is not None
    }


def unsubscribe_links(person: Person) -> tuple[str, str]:
    """Where one person's unsubscribe link leads, for a person and a mailbox.

    Args:
        person: The account holder or subscriber.

    Returns:
        The page in the app, for the link in the footer, and the API
        route, for the ``List-Unsubscribe`` header a mailbox presses.
    """
    if isinstance(person, NewsletterSubscriber):
        token = create_subscriber_unsubscribe_token(person.id)
    else:
        token = create_marketing_unsubscribe_token(person.id)
    base = settings.FRONTEND_URL.rstrip("/")
    return (
        f"{base}/unsubscribe?token={token}",
        f"{base}/api/marketing/unsubscribe?token={token}",
    )


def campaign_brand(campaign: str) -> EmailThemeName:
    """Which brand a campaign goes out as: the folder its template is in.

    Args:
        campaign: The campaign's name.

    Returns:
        ``"quill"`` or ``"ldd"``.

    Raises:
        NewsletterError: If the name is not one, no brand has a campaign
            of that name, or more than one has.
    """
    if not CAMPAIGN_NAME.fullmatch(campaign):
        raise NewsletterError(f"Not a campaign name: {campaign!r}")
    found = [
        brand
        for brand in BRANDS
        if (CAMPAIGNS_DIR / brand / f"{campaign}.html.j2").is_file()
    ]
    if not found:
        raise NewsletterError(f"There is no campaign called {campaign!r}")
    if len(found) > 1:
        raise NewsletterError(
            f"More than one brand has a campaign called {campaign!r}"
        )
    return found[0]


def sender(brand: EmailThemeName) -> tuple[str, str | None]:
    """Who a newsletter in a brand comes from.

    A person, not the brand alone: it is signed off by Mark. The address
    is the brand's own where it has one set, and otherwise the app's,
    which is all that can be sent from until the brand's domain has been
    verified with the mail provider.

    Args:
        brand: The campaign's brand.

    Returns:
        The display name, and the address or None for the app's own.
    """
    name = f"Mark at {email_theme(brand).sender_name}"
    address = settings.EMAIL_FROM_LDD.strip() if brand == "ldd" else ""
    return name, address or None


def _render(campaign: str, brand: EmailThemeName, page: str) -> RenderedEmail:
    """Render a campaign for one person's unsubscribe link."""
    name, _ = sender(brand)
    return render_email(
        f"campaigns/{brand}/{campaign}.html.j2",
        brand,
        {"unsubscribe_url": page},
        from_name=name,
    )


def _send_one(campaign: str, brand: EmailThemeName, person: Person) -> None:
    """Render a campaign for one person and send it.

    One recipient to a message, each with their own link: a link shared
    by a whole mailing would let any reader unsubscribe everybody.
    """
    page, one_click = unsubscribe_links(person)
    _, address = sender(brand)
    send_email(
        to=person.email,
        **send_args(_render(campaign, brand, page)),
        from_address=address,
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
    limit: int | None = None,
) -> Sent:
    """Send a campaign, or with no ``confirm`` report who would get it.

    Each person is committed on their own, so a run that stops half way
    keeps what it did and the next reaches only the rest.

    Args:
        db: Database session.
        campaign: The campaign's name.
        confirm: :func:`confirmation` for this campaign and the number
            of people this run would now reach. None for a dry run.
        only_to: One address, for a trial send before the real one. They
            must be somebody who may be sent newsletters. A trial is not
            recorded, so the real send still reaches them.
        limit: The most people to reach in this run, for sending a
            newsletter in batches. The rest wait for a later run, which
            finds them because each send is recorded. None for no limit.

    Returns:
        What was found and done.

    Raises:
        NewsletterError: If the campaign does not exist or is misnamed,
            ``only_to`` is nobody who may be sent it, ``limit`` is not
            positive, or ``confirm`` is not what a dry run would now
            print.
    """
    brand = campaign_brand(campaign)
    if limit is not None and limit <= 0:
        raise NewsletterError("The limit must be at least one")

    people = everybody(db)
    already: set[tuple[str, int]] = set()
    if only_to is not None:
        wanted = only_to.strip().lower()
        to_send = [p for p in people if p.email.lower() == wanted]
        if not to_send:
            raise NewsletterError(
                f"{mask_email(only_to)} is nobody who may be sent a "
                "newsletter: not subscribed, or an account that is not "
                "verified, not active, or has not said yes"
            )
    else:
        already = _already_sent(db, campaign)
        to_send = [p for p in people if _key(p) not in already]

    result = Sent(already=len(already))
    if limit is not None and len(to_send) > limit:
        result.waiting = len(to_send) - limit
        to_send = to_send[:limit]
    result.recipients = [mask_email(p.email) for p in to_send]

    # Render it once before anything is sent, so a campaign that will
    # not render fails here and not after the first person has had theirs.
    if to_send:
        page, _ = unsubscribe_links(to_send[0])
        _render(campaign, brand, page)

    if confirm is None:
        return result
    expected = confirmation(campaign, len(to_send))
    if confirm != expected:
        raise NewsletterError(
            "CONFIRM does not match. A dry run now would print "
            f"{expected!r}: the list may have changed since yours."
        )

    for person in to_send:
        kind, person_id = _key(person)
        # Read again, just before their turn: somebody who unsubscribed
        # while this ran must not be emailed.
        try:
            db.refresh(person)
        except InvalidRequestError:
            # They were deleted while this ran.
            result.withdrew += 1
            continue
        if not _wants_news(person):
            result.withdrew += 1
            continue
        try:
            _send_one(campaign, brand, person)
        except (EmailNotAllowedError, EmailRateLimitError):
            result.refused += 1
            continue
        except EmailSendError as exc:
            logger.warning(
                "Newsletter %s could not be sent to %s %s: %s",
                campaign,
                kind,
                person_id,
                exc,
            )
            result.failed += 1
            continue
        finally:
            time.sleep(PAUSE_SECONDS)
        if only_to is None:
            db.add(
                NewsletterSend(
                    campaign=campaign,
                    user_id=person_id if kind == "user" else None,
                    subscriber_id=person_id if kind == "subscriber" else None,
                )
            )
            db.commit()
        result.sent += 1
    return result


def main() -> int:
    """Run a send from the environment and print what happened.

    Reads ``NEWSLETTER_CAMPAIGN``, and optionally ``CONFIRM``,
    ``NEWSLETTER_ONLY_TO`` and ``NEWSLETTER_LIMIT``.

    Returns:
        The exit status: 0 when everybody due was sent it, or for a dry
        run; 1 when the send could not start or anybody could not be
        reached.
    """
    from app.db.core_db import CoreSessionLocal

    campaign = os.environ.get("NEWSLETTER_CAMPAIGN", "").strip()
    confirm = os.environ.get("CONFIRM", "").strip() or None
    only_to = os.environ.get("NEWSLETTER_ONLY_TO", "").strip() or None
    raw_limit = os.environ.get("NEWSLETTER_LIMIT", "").strip()
    if not campaign:
        print("✗ NEWSLETTER_CAMPAIGN is required", file=sys.stderr)
        return 1
    if raw_limit and not raw_limit.isdecimal():
        print("✗ NEWSLETTER_LIMIT must be a whole number", file=sys.stderr)
        return 1
    limit = int(raw_limit) if raw_limit else None

    db = CoreSessionLocal()
    try:
        result = send_campaign(
            db, campaign, confirm=confirm, only_to=only_to, limit=limit
        )
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
            f"{result.already} already sent, "
            f"{result.waiting} left for a later run."
        )
        print(
            "Nothing was sent. To send, run again with "
            f"CONFIRM={confirmation(campaign, len(result.recipients))}"
        )
        return 0

    print(
        f"Campaign {campaign!r}: {result.sent} sent, "
        f"{result.already} already sent, {result.withdrew} withdrew, "
        f"{result.refused} refused, {result.failed} failed, "
        f"{result.waiting} left for a later run."
    )
    return 1 if result.failed or result.refused else 0


if __name__ == "__main__":
    sys.exit(main())
