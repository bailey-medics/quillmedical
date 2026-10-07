"""Hearing from Amazon which addresses bounced or complained.

Amazon SES keeps a suppression list for the account: every address that
hard-bounced, and every address whose owner reported an email as spam.
It refuses to send to them again, so nobody is emailed twice. But it
never tells Quill, so the mailing list would go on calling those people
subscribed, and a complaint, which is a refusal, would never be recorded.

So the newsletter command reads the list before each send and marks the
people on it. Reading is all it does at Amazon: the app's key is allowed
``ses:ListSuppressedDestinations`` and nothing else beyond sending.

Chosen over being told of each one as it happens, which would need a
public route and hand-written signature checking for something that can
wait until the next send. See Phase 6 of
``docs/docs/plans/2026-10-06-amazon-ses-email-plan.md``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal

import boto3
from botocore.config import Config
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.marketing.preferences import set_marketing_preference
from app.marketing.subscribers import set_subscribed
from app.models import NewsletterSubscriber, User

logger = logging.getLogger(__name__)

#: Why Amazon will not send to an address.
Reason = Literal["bounce", "complaint"]

#: Amazon's names for the two, and Quill's.
_REASONS: dict[str, Reason] = {"BOUNCE": "bounce", "COMPLAINT": "complaint"}

#: How long Amazon is given to answer one page of the list.
_CONFIG = Config(
    connect_timeout=3,
    read_timeout=20,
    retries={"max_attempts": 2, "mode": "standard"},
)

#: The most pages read in one go, at a thousand addresses a page: far
#: more than the list will hold, and a stop for a loop that never ends.
MAX_PAGES = 50


class SuppressionError(Exception):
    """Amazon's list could not be read, with the reason."""


@dataclass
class Marked:
    """What reading the list changed.

    Attributes:
        subscribers: Mailing-list subscribers marked unsubscribed.
        accounts: Account holders whose newsletters were switched off.
    """

    subscribers: int = 0
    accounts: int = 0


def is_configured() -> bool:
    """Whether there is an Amazon account to ask.

    Only when the SES key is set. A development stack without one, and
    the tests, have nobody to ask.
    """
    return bool(settings.SES_ACCESS_KEY_ID and settings.SES_SECRET_ACCESS_KEY)


def suppressed_addresses() -> dict[str, Reason]:
    """Every address Amazon will not send to, and why.

    Returns:
        Lower-case address to ``"bounce"`` or ``"complaint"``. Empty if
        there is no Amazon account to ask.

    Raises:
        SuppressionError: If the list could not be read. The message
            never holds a credential.
    """
    key_id = settings.SES_ACCESS_KEY_ID
    secret = settings.SES_SECRET_ACCESS_KEY
    if not is_configured() or key_id is None or secret is None:
        return {}
    key_id_value = key_id.get_secret_value().strip()
    secret_value = secret.get_secret_value().strip()

    found: dict[str, Reason] = {}
    try:
        client = boto3.client(
            "sesv2",
            region_name=settings.SES_REGION,
            aws_access_key_id=key_id_value,
            aws_secret_access_key=secret_value,
            config=_CONFIG,
        )
        token: str | None = None
        for _ in range(MAX_PAGES):
            page = (
                client.list_suppressed_destinations(
                    PageSize=1000, NextToken=token
                )
                if token
                else client.list_suppressed_destinations(PageSize=1000)
            )
            for entry in page.get("SuppressedDestinationSummaries", []):
                reason = _REASONS.get(str(entry.get("Reason", "")))
                address = str(entry.get("EmailAddress", "")).strip().lower()
                if reason is not None and address:
                    found[address] = reason
            token = page.get("NextToken")
            if not token:
                break
    except Exception as exc:
        message = str(exc).replace(secret_value, "[redacted]")
        message = message.replace(key_id_value, "[redacted]")
        raise SuppressionError(message) from None
    return found


def mark_suppressed(db: Session, addresses: dict[str, Reason]) -> Marked:
    """Record that the people at these addresses are not to be sent news.

    A subscriber is unsubscribed. An account holder's newsletters are
    switched off, with a history row saying whether it was a bounce or a
    complaint. Somebody already off is left as they are.

    Args:
        db: Database session. Changes are flushed, not committed.
        addresses: Lower-case address to reason, from
            :func:`suppressed_addresses`.

    Returns:
        How many of each were changed.
    """
    marked = Marked()
    if not addresses:
        return marked

    for subscriber in db.scalars(
        select(NewsletterSubscriber).where(
            NewsletterSubscriber.subscribed.is_(True),
            NewsletterSubscriber.email.in_(addresses),
        )
    ):
        if set_subscribed(subscriber, wants=False):
            marked.subscribers += 1

    users = (
        db.scalars(
            select(User).where(
                User.marketing_emails.is_(True),
                func.lower(User.email).in_(addresses),
            )
        )
        .unique()
        .all()
    )
    for user in users:
        reason = addresses.get(user.email.lower(), "bounce")
        if set_marketing_preference(db, user, wants=False, source=reason):
            marked.accounts += 1
    db.flush()
    return marked


def hear_from_amazon(db: Session) -> Marked | None:
    """Read Amazon's list and mark everybody on it, committing the change.

    Args:
        db: Database session.

    Returns:
        What changed, or None if the list could not be read. That is
        logged and not raised: Amazon refuses those addresses itself, so
        a send is still safe to make without it.
    """
    try:
        addresses = suppressed_addresses()
    except SuppressionError as exc:
        logger.warning("Amazon's suppression list could not be read: %s", exc)
        return None
    marked = mark_suppressed(db, addresses)
    db.commit()
    return marked
