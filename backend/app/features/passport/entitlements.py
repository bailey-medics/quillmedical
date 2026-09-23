# backend/app/features/passport/entitlements.py
"""Granting and resolving the right to write to a passport.

``passport_write`` is the competency, and a ``user_competency`` row
granting it carries its term: it is held until that row's ``ends_on``. One
row answers both questions that used to take two tables, whether somebody
may write at all and whether the arrangement that paid for it is still
running.

The two are granted together, in one request, for the same reason the
competency and the membership are: a new starter who holds the
competency and no entitlement can reach the passport and not write to
it, which looks exactly like a bug.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.passport.models import (
    PASSPORT_ENTITLEMENT_DAYS,
    PassportWriteEntitlement,
)
from app.models import User, UserCompetency


def current_entitlement_end(db: Session, user_id: int) -> datetime | None:
    """When this person's right to write runs out, or None if it has.

    Read from the dated ``passport_write`` rows in ``user_competency``,
    which is where the term now lives. ``passport_write_entitlement`` is
    still written beside them, and read by nothing.

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


def grant_entitlement_at_onboarding(
    db: Session,
    user: User,
    org_unit_id: int,
    competencies: list[str],
    *,
    granted_by: int | None = None,
) -> None:
    """Give somebody a term of writing, where the grant includes it.

    Called from the routes that put somebody into an org_unit. Does
    nothing unless ``passport_write`` is among the competencies being
    granted, so an ordinary onboarding is untouched.

    **Idempotent while one is current.** Adding somebody to a second
    org_unit, or correcting their capacity, must not quietly extend
    their term: the arrangement that pays is a fact about an agreement,
    not about how many times a form was saved. A fresh term is written
    only when nothing current remains.

    **The term is written twice while storage moves.** Once as a
    ``passport_write_entitlement`` row, which is what the gate reads
    today, and once as a dated ``passport_write`` row in
    ``user_competency``, which is where the gate will read it. The two
    carry the same dates, source and org_unit, so the backfill can
    recognise the second as already copied. See the user competency
    table plan.

    Args:
        db: Core database session.
        user: The person being onboarded.
        org_unit_id: The org_unit whose arrangement pays for it.
        competencies: What they are being granted in this request.
        granted_by: The administrator doing the onboarding.
    """
    if "passport_write" not in competencies:
        return

    if current_entitlement_end(db, user.id) is not None:
        return

    starts_on = datetime.now(UTC)
    ends_on = starts_on + timedelta(days=PASSPORT_ENTITLEMENT_DAYS)

    db.add(
        PassportWriteEntitlement(
            user_id=user.id,
            source="organisation",
            org_unit_id=org_unit_id,
            starts_on=starts_on,
            ends_on=ends_on,
        )
    )
    user.competency_grants.append(
        UserCompetency(
            competency_id="passport_write",
            granted=True,
            starts_on=starts_on,
            ends_on=ends_on,
            source="organisation",
            org_unit_id=org_unit_id,
            granted_by=granted_by,
        )
    )
    db.flush()
