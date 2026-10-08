"""Changing whether somebody is sent news and updates.

Every route that changes the answer goes through
``set_marketing_preference``, so there is one place that writes the
evidence: a ``marketing_preference_change`` row saying what they were
shown, what they chose and when. See
``docs/docs/plans/2026-10-03-marketing-opt-out-plan.md``.

Marketing is news, new courses and product updates, sent as newsletters
by ``app.marketing.newsletter`` to the people this module says want
them. Everything else Quill sends through ``email_send.py`` is a service
message and is not affected by this choice.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import (
    MarketingPreferenceChange,
    User,
    validate_marketing_preference_source,
)

#: Which wording of the question the register pages show. Bump it whenever
#: that sentence changes, so a change row says what the person agreed to.
MARKETING_WORDING_VERSION = "1"


def set_marketing_preference(
    db: Session,
    user: User,
    *,
    wants: bool,
    source: str,
    wording_version: str | None = None,
    first_answer: bool = False,
) -> bool:
    """Record whether somebody wants news and updates.

    An answer that has not changed writes nothing: the row already there
    says when they chose it, and rewriting it would turn "when did they
    agree?" into "when did they last open Settings?".

    Args:
        db: Database session. The change is flushed, not committed.
        user: The person.
        wants: Whether they want marketing email.
        source: Where the change came from, one of
            ``MARKETING_PREFERENCE_SOURCES``.
        wording_version: Which wording they answered, or None when no page
            asked.
        first_answer: Whether this is the answer given at registration.
            It is recorded even when it matches where an account starts,
            because "they were shown the question and said no" is
            evidence too, and without a row it looks the same as never
            having been asked.

    Returns:
        True if the answer changed, False if it was already that.

    Raises:
        ValueError: If the source is not a known one.
    """
    validate_marketing_preference_source(source)

    changed = user.marketing_emails != wants

    if not changed and not first_answer:
        return False

    db.add(
        MarketingPreferenceChange(
            user_id=user.id,
            wants_marketing=wants,
            source=source,
            wording_version=wording_version,
        )
    )
    user.marketing_emails = wants
    db.flush()

    return changed
