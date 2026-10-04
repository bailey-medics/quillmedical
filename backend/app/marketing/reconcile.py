"""The weekly check that Quill still matches Resend.

Resend sends the newsletter, so what it holds for a contact is what
happens to them. Quill is told of a change there by a webhook, within a
second. A webhook can be lost, or left unconfigured: on 4 October 2026
the first real unsubscribe from a newsletter never reached Quill, because
the webhook in Resend had been set to report contacts being created and
not updated. Resend stopped the emails and Quill went on showing the
person as subscribed, with nothing that would ever have gone back to
look.

This is what goes back to look. **Resend wins**: where the two disagree,
Quill is changed to match, and the change is recorded with ``resend`` as
its source, exactly as the webhook records it.

One thing comes first. A choice somebody made in Quill that Resend has
not yet been told about is Quill knowing something newer, not the two
disagreeing, so those are sent before anything is compared, and anybody
still unsent afterwards is left alone until next time.

Run with ``just marketing-reconcile`` against the dev stack, or as the
``marketing-reconcile`` admin action in production, which a scheduled
workflow runs once a week.
"""

from __future__ import annotations

import logging
import sys
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.marketing.preferences import set_marketing_preference
from app.marketing.resend_contacts import (
    ListedContact,
    MarketingSyncError,
    is_configured,
    list_contacts,
    topic_subscription,
)
from app.marketing.sync import sync_unsynced
from app.models import User

logger = logging.getLogger(__name__)

#: Somebody whose choice reached Resend this recently is left for next
#: time: Resend's reads lag its writes by a second or two, and a read
#: taken now could be the answer from before their change.
SETTLING = timedelta(minutes=5)

#: A pause between people, to stay well inside Resend's ten requests a
#: second however long the list grows.
PAUSE_SECONDS = 0.15


@dataclass
class Reconciled:
    """What one run found and did.

    Attributes:
        sent: Choices made in Quill that were sent to Resend first.
        unsent: Choices that still could not be sent, and were left.
        matched: People Quill and Resend agreed about.
        corrected: People Quill was changed to match Resend for.
        missing: People with an account and no contact in Resend, who are
            switched off and sent again, opted out, by the next run.
        skipped: People left for next time: changed too recently, or
            Resend held no answer for them.
        failed: People Resend could not be asked about.
    """

    sent: int = 0
    unsent: int = 0
    matched: int = 0
    corrected: int = 0
    missing: int = 0
    skipped: int = 0
    failed: int = 0


def _resend_wants(contact: ListedContact) -> bool | None:
    """Whether Resend will send this contact the newsletter.

    A contact unsubscribed from everything gets nothing, whatever its
    topic says. Otherwise the topic decides.

    Args:
        contact: The contact as listed.

    Returns:
        True or False, or None when Resend holds no answer for the topic.

    Raises:
        MarketingSyncError: If the topic could not be read.
    """
    if contact.unsubscribed:
        return False
    subscription = topic_subscription(contact.email)
    if subscription is None:
        return None
    return subscription == "opt_in"


def _synced_users(db: Session) -> list[User]:
    """Everybody whose current choice Resend has been told.

    Verified and active, as the sync requires, and with a sync mark:
    somebody without one has a choice Resend has not had yet.

    Args:
        db: Database session.

    Returns:
        The users, oldest account first.
    """
    return list(
        db.execute(
            select(User)
            .where(
                User.email_verified.is_(True),
                User.is_active.is_(True),
                User.marketing_synced_at.is_not(None),
            )
            .order_by(User.id)
        )
        .unique()
        .scalars()
        .all()
    )


def _recently_synced(user: User, now: datetime) -> bool:
    synced_at = user.marketing_synced_at
    if synced_at is None:
        return False
    if synced_at.tzinfo is None:
        synced_at = synced_at.replace(tzinfo=UTC)
    return now - synced_at < SETTLING


def reconcile(db: Session) -> Reconciled:
    """Make Quill match Resend, for everybody Resend has been told about.

    Each person is committed on their own, so a failure half way through
    keeps what was done before it.

    Args:
        db: Database session.

    Returns:
        What was found and done.

    Raises:
        MarketingSyncError: If the list of contacts could not be read. One
            person who cannot be read is counted and passed over; with no
            list there is nothing to compare anybody with.
    """
    result = Reconciled()

    # Quill's unsent choices first: newer than anything Resend holds.
    result.sent, result.unsent = sync_unsynced(db)

    listed = list_contacts()
    if listed is None:
        return result
    contacts = {contact.email.lower(): contact for contact in listed}

    now = datetime.now(UTC)
    for user in _synced_users(db):
        if _recently_synced(user, now):
            result.skipped += 1
            continue

        contact = contacts.get(user.email.lower())
        if contact is None:
            # Gone from Resend, so nothing is sent to them. Recorded as
            # the webhook records a deleted contact: off, and unsynced,
            # so the next run puts the contact back opted out and Resend
            # goes on holding the refusal.
            set_marketing_preference(db, user, wants=False, source="resend")
            user.marketing_synced_at = None
            db.commit()
            result.missing += 1
            continue

        try:
            wants = _resend_wants(contact)
        except MarketingSyncError as exc:
            logger.warning(
                "Marketing reconcile could not read user %s: %s",
                user.id,
                exc,
            )
            result.failed += 1
            continue
        finally:
            time.sleep(PAUSE_SECONDS)

        if wants is None:
            result.skipped += 1
            continue
        if wants == user.marketing_emails:
            result.matched += 1
            continue

        set_marketing_preference(db, user, wants=wants, source="resend")
        # Resend is where the answer came from, so it needs no telling.
        user.marketing_synced_at = datetime.now(UTC)
        db.commit()
        result.corrected += 1
        logger.info(
            "Marketing reconcile changed user %s to match Resend", user.id
        )

    return result


def main() -> int:
    """Run the weekly check against the core database.

    Returns:
        The exit status: 0 when nobody failed, so a scheduled run goes
        red only when something needs a person to look.
    """
    from app.db.core_db import CoreSessionLocal

    if not is_configured():
        print(
            "Resend contact settings are not configured "
            "(RESEND_CONTACTS_API_KEY, RESEND_NEWSLETTER_SEGMENT_ID, "
            "RESEND_NEWSLETTER_TOPIC_ID). Nothing to do."
        )
        return 1

    db = CoreSessionLocal()
    try:
        try:
            result = reconcile(db)
        except MarketingSyncError as exc:
            print(f"Could not read the list from Resend: {exc}")
            return 1
    finally:
        db.close()

    print(
        f"Sent first {result.sent}, still unsent {result.unsent}. "
        f"Matched {result.matched}, corrected {result.corrected}, "
        f"missing from Resend {result.missing}, "
        f"left for next time {result.skipped}, failed {result.failed}."
    )
    return 1 if (result.failed or result.unsent) else 0


if __name__ == "__main__":
    sys.exit(main())
