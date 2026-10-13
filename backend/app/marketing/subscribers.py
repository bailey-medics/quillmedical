"""People on the mailing list who have no open Quill account.

They are held in ``newsletter_subscriber``, apart from ``users``. This
module is the one place a subscriber's answer is changed, as
``app.marketing.preferences`` is for an account holder's.

**Somebody is on the list or has an open account, never both.** An
address that is verified on an open account is folded into it
(``fold_into_account``). When an account is closed its owner's answer
goes the other way (``move_to_list``), because closing an account is not
the person saying "stop emailing me", and the list is what outlives the
account. Opening it again folds them back.
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

    # A closed account's answer is on the list, where ``move_to_list``
    # put it. Folding it back would take them off the newsletter.
    if not user.is_active:
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


def _latest_answer(
    db: Session, user: User
) -> MarketingPreferenceChange | None:
    """The most recent answer an account holder gave, if they ever did."""
    return db.scalar(
        select(MarketingPreferenceChange)
        .where(MarketingPreferenceChange.user_id == user.id)
        .order_by(
            MarketingPreferenceChange.created_at.desc(),
            MarketingPreferenceChange.id.desc(),
        )
        .limit(1)
    )


def answer_to_carry(db: Session, user: User) -> bool | None:
    """What a closed account's owner goes onto the list as, if at all.

    **Their stored answer stands.** Mark, 14 October: however it was
    given, at registration, on the invitation page or with the switch in
    Settings, and whoever brought them to Quill, a sponsor or nobody.

    - **A yes** goes on as subscribed.
    - **A no** goes on as unsubscribed. Holding it is what stops a later
      import of an older list putting them back.
    - **Somebody never asked** has no answer stored, so there is nothing
      to carry and they are not moved.
    - **An address nobody verified** is never moved. It may be somebody
      else's, and an open account with one is not sent newsletters
      either.

    Args:
        db: Database session.
        user: The account holder.

    Returns:
        True for subscribed, False for a refusal to carry, None when
        they are not moved.
    """
    if not user.email_verified:
        return None

    latest = _latest_answer(db, user)

    if not user.marketing_emails:
        # Never asked is not a refusal: there is nothing to carry.
        return None if latest is None else False

    return True


def _hand_sends_to_list(
    db: Session, user: User, subscriber: NewsletterSubscriber
) -> None:
    """Hand an account's record of what it was sent to its list entry.

    ``_move_sends`` the other way, for the same reason: a campaign
    stopped half way and run again would otherwise reach them twice,
    once as an account and once from the list.
    """
    had = set(
        db.scalars(
            select(NewsletterSend.campaign).where(
                NewsletterSend.subscriber_id == subscriber.id
            )
        )
    )

    for send in db.scalars(
        select(NewsletterSend).where(NewsletterSend.user_id == user.id)
    ):
        if send.campaign in had:
            db.delete(send)
        else:
            send.subscriber_id = subscriber.id
            send.user_id = None

    db.flush()


def move_to_list(
    db: Session, user: User, *, their_newest_word: bool = False
) -> NewsletterSubscriber | None:
    """Put a closed account's owner on the newsletter list.

    Called when an account is closed. Their name, address and answer go
    onto the list, which is kept apart from accounts and outlives this
    one. See ``answer_to_carry`` for who goes on, and as what.

    **A "no" already on the list survives**, as it does when a list
    entry is folded into an account. The one exception is
    ``their_newest_word``: the person has just used an unsubscribe link
    themselves, and what they said a moment ago stands over anything
    older.

    Args:
        db: Database session. Changes are flushed, not committed.
        user: The account holder, whose account is closed.
        their_newest_word: True when the account's answer was given by
            the person just now.

    Returns:
        Their list entry, or None when they are not on the list.
    """
    wants = answer_to_carry(db, user)
    subscriber = db.scalar(
        select(NewsletterSubscriber).where(
            NewsletterSubscriber.email == user.email
        )
    )

    if wants is None:
        return subscriber

    if subscriber is None:
        subscriber = NewsletterSubscriber(
            email=user.email, name=user.full_name
        )
        db.add(subscriber)
        set_subscribed(subscriber, wants=wants)
        db.flush()
    else:
        if their_newest_word or not wants:
            set_subscribed(subscriber, wants=wants)

        if subscriber.name is None and user.full_name:
            subscriber.name = user.full_name

    _hand_sends_to_list(db, user, subscriber)
    db.flush()

    return subscriber


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
                User.is_active.is_(True),
                User.email.in_(select(NewsletterSubscriber.email)),
            )
        )
        .unique()
        .all()
    )

    return sum(1 for user in users if fold_into_account(db, user))
