"""People on the mailing list who have no Quill account.

They are held in ``newsletter_subscriber``, apart from ``users``. This
module is the one place a subscriber's answer is changed, as
``app.marketing.preferences`` is for an account holder's.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.models import NewsletterSubscriber


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
