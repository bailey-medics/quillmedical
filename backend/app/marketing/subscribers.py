"""People on the mailing list who have no Quill account.

They are held in ``newsletter_subscriber``, apart from ``users``. This
module is the one place a subscriber's answer is changed, as
``app.marketing.preferences`` is for an account holder's.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.marketing.preferences import set_marketing_preference
from app.models import (
    MarketingPreferenceChange,
    NewsletterSend,
    NewsletterSubscriber,
    User,
)


def set_subscribed(subscriber: NewsletterSubscriber, *, wants: bool) -> bool:
    """Record whether a subscriber is sent newsletters.

    The row itself is the record: there is no history table for
    somebody with no account. ``unsubscribed_at`` says when they last
    left, and is cleared if they come back.

    Args:
        subscriber: The person.
        wants: Whether they want newsletters.

    Returns:
        True if the answer changed. The caller's session saves it.
    """
    if subscriber.subscribed == wants:
        return False

    subscriber.subscribed = wants
    subscriber.unsubscribed_at = None if wants else datetime.now(UTC)

    return True


def _has_answered(db: Session, user: User) -> bool:
    """Whether an account holder has ever been asked and answered."""
    return bool(
        db.scalar(
            select(
                exists().where(MarketingPreferenceChange.user_id == user.id)
            )
        )
    )


def _move_sends(
    db: Session, subscriber: NewsletterSubscriber, user: User
) -> None:
    """Hand a subscriber's record of what they were sent to their account.

    Without this a campaign they had already had as a subscriber would
    be sent to them again as an account holder.
    """
    had = set(
        db.scalars(
            select(NewsletterSend.campaign).where(
                NewsletterSend.user_id == user.id
            )
        )
    )

    for send in db.scalars(
        select(NewsletterSend).where(
            NewsletterSend.subscriber_id == subscriber.id
        )
    ):
        if send.campaign in had:
            db.delete(send)
        else:
            send.user_id = user.id
            send.subscriber_id = None
    db.flush()


def fold_into_account(db: Session, user: User) -> bool:
    """Keep one record of somebody who is on the list and has an account.

    Nothing is done until the account's address is verified: before that
    it may be somebody else's mistyping, and the mailing list row goes on
    working. Once it is, they are the same person, the account is the
    record that is kept, and the mailing list row is deleted.

    **A "no" from the mailing list always survives.** Registration is an
    opt-out, so somebody who had unsubscribed and then registered
    without noticing the box would otherwise be put back on.

    Otherwise the account's own answer stands, being the more recent.
    The one case left is an account that has never been asked, because
    somebody else made it for them: there is no answer to stand, so the
    mailing list's "yes" is carried across, and they go on getting the
    news they asked for until they are asked and say otherwise.

    Args:
        db: Database session. Changes are flushed, not committed.
        user: The account holder.

    Returns:
        True if there was a mailing list row and it was folded in.
    """
    if not user.email_verified:
        return False

    subscriber = db.scalar(
        select(NewsletterSubscriber).where(
            NewsletterSubscriber.email == user.email
        )
    )

    if subscriber is None:
        return False

    if not subscriber.subscribed:
        set_marketing_preference(db, user, wants=False, source="mailing_list")
    elif not _has_answered(db, user):
        set_marketing_preference(db, user, wants=True, source="mailing_list")

    _move_sends(db, subscriber, user)
    db.delete(subscriber)
    db.flush()

    return True


def fold_all(db: Session) -> int:
    """Fold in every subscriber whose address is a verified account's.

    Run when the mailing list is imported, since an address in the file
    may belong to somebody who registered long ago.

    Args:
        db: Database session. Changes are flushed, not committed.

    Returns:
        How many were folded in.
    """
    users = (
        db.scalars(
            select(User).where(
                User.email_verified.is_(True),
                User.email.in_(select(NewsletterSubscriber.email)),
            )
        )
        .unique()
        .all()
    )

    return sum(1 for user in users if fold_into_account(db, user))
