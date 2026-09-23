# backend/app/features/passport/entitlements.py
"""Resolving until when somebody may write to their passport.

``passport_write`` is the competency, and a ``user_competency`` row grants
it. A grant through a site or an organisation has no end: somebody given
the passport by the trust they work at keeps it. A subscription somebody
buys for themselves carries an end date on its row, and lapses then.

Granting it is ``sync_competency_rows`` in ``app.cbac.grants``.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import UserCompetency


def passport_write_ends_on(db: Session, user_id: int) -> datetime | None:
    """When this person's right to write runs out, if it ever does.

    Somebody may hold ``passport_write`` from more than one source at
    once, and losing one must not end the other. So a current grant with
    no end means it never runs out, whatever else they hold, and otherwise
    the answer is the latest end among their current grants.

    Ask whether they hold ``passport_write`` first: this answers None both
    for a grant with no end and for no grant at all.

    Args:
        db: Core database session.
        user_id: The person to resolve.

    Returns:
        The furthest-off end date, or None when a current grant has no
        end or nothing current remains.
    """
    now = datetime.now(UTC)
    ends = db.scalars(
        select(UserCompetency.ends_on).where(
            UserCompetency.user_id == user_id,
            UserCompetency.competency_id == "passport_write",
            UserCompetency.granted.is_(True),
            (UserCompetency.ends_on.is_(None))
            | (UserCompetency.ends_on > now),
        )
    ).all()
    if not ends or any(end is None for end in ends):
        return None
    return max(end for end in ends if end is not None)
