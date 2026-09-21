# backend/app/features/passport/entitlements.py
"""Granting and resolving the right to write to a passport.

``passport_write`` is the competency; an entitlement row is until when.
Both are needed to write, and they answer different questions: the
competency is whether somebody may hold a passport at all, the
entitlement is whether the arrangement that paid for it is still
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


def current_entitlement_end(db: Session, user_id: int) -> datetime | None:
    """When this person's right to write runs out, or None if it has.

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
        select(PassportWriteEntitlement.ends_on)
        .where(
            PassportWriteEntitlement.user_id == user_id,
            PassportWriteEntitlement.ends_on > datetime.now(UTC),
        )
        .order_by(PassportWriteEntitlement.ends_on.desc())
        .limit(1)
    )


def grant_entitlement_at_onboarding(
    db: Session,
    user_id: int,
    org_unit_id: int,
    competencies: list[str],
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

    Args:
        db: Core database session.
        user_id: The person being onboarded.
        org_unit_id: The org_unit whose arrangement pays for it.
        competencies: What they are being granted in this request.
    """
    if "passport_write" not in competencies:
        return

    if current_entitlement_end(db, user_id) is not None:
        return

    db.add(
        PassportWriteEntitlement(
            user_id=user_id,
            source="organisation",
            org_unit_id=org_unit_id,
            ends_on=datetime.now(UTC)
            + timedelta(days=PASSPORT_ENTITLEMENT_DAYS),
        )
    )
    db.flush()
