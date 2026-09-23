# backend/app/features/passport/entitlements.py
"""Resolving until when somebody may write to their passport.

``passport_write`` is the competency, and a ``user_competency`` row
granting it carries its term: it is held until that row's ``ends_on``. One
row answers both questions that used to take two tables, whether somebody
may write at all and whether the arrangement that paid for it is still
running.

Granting it is ``sync_competency_rows`` in ``app.cbac.grants``, which
dates a ``passport_write`` row as it writes it.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import UserCompetency


def current_entitlement_end(db: Session, user_id: int) -> datetime | None:
    """When this person's right to write runs out, or None if it has.

    Read from the dated ``passport_write`` rows in ``user_competency``,
    which is where the term lives.

    Somebody may hold the entitlement from more than one source at once,
    so the question is whether *any* row is still current and the answer
    is the latest end date among those that are. Losing one source must
    not end the other.

    Args:
        db: Core database session.
        user_id: The person to resolve.

    Returns:
        The furthest-off end date still in the future, or None when
        nothing current remains.
    """
    return db.scalar(
        select(UserCompetency.ends_on)
        .where(
            UserCompetency.user_id == user_id,
            UserCompetency.competency_id == "passport_write",
            UserCompetency.granted.is_(True),
            UserCompetency.ends_on > datetime.now(UTC),
        )
        .order_by(UserCompetency.ends_on.desc())
        .limit(1)
    )
