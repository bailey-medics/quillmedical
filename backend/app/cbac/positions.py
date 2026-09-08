"""Filling, vacating and querying positions.

A position is a slot an organisation or site has. It exists whether or not
anyone fills it, which is what separates it from a competency: "this site
has no clinical lead" is a state worth chasing, where a competency nobody
holds is simply absent.

Holding is recorded as dated rows rather than a column on the position, so
the post outlives its holders and its history stays queryable — "who was
Caldicott Guardian in March?" is a question about the slot over time.

Appointment is checked against the person's competency at that place, using
``can_practise_at``: holding the competency somewhere is not enough, it has
to be authorised where the post is.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.scoped import can_practise_at
from app.models import Position, PositionHolding, User


def _today() -> date:
    """Today in UTC, so a test can compare against a known value."""
    return datetime.now(UTC).date()


def holdings_on(
    db: Session, position: Position, on_date: date | None = None
) -> list[PositionHolding]:
    """Return the holdings in force on one date.

    **Both dates are inclusive.** Someone whose holding ends on the 30th
    still held the post on the 30th, which is what an incident review on
    that date needs to be told. A handover is therefore the outgoing holder
    ending one day and the incoming starting the next, not both on the same
    day — appointing a successor before the predecessor's last day has
    passed counts as two holders and is refused by ``max_holders``.

    Args:
        db: Database session.
        position: The post.
        on_date: The date to ask about, defaulting to today.

    Returns:
        Holdings that had started and had not ended on that date,
        substantive and acting alike.
    """
    when = on_date or _today()
    return list(
        db.execute(
            select(PositionHolding).where(
                PositionHolding.position_id == position.id,
                PositionHolding.started_on <= when,
                (PositionHolding.ended_on.is_(None))
                | (PositionHolding.ended_on >= when),
            )
        )
        .scalars()
        .all()
    )


def is_vacant(
    db: Session, position: Position, on_date: date | None = None
) -> bool:
    """Whether nobody substantively holds the post on one date.

    Acting cover does not fill a vacancy: someone covering leave is not the
    post-holder, and a post with only acting cover is exactly the state
    worth chasing.

    Args:
        db: Database session.
        position: The post.
        on_date: The date to ask about, defaulting to today.

    Returns:
        True when no substantive holding is in force.
    """
    return not [
        h for h in holdings_on(db, position, on_date) if not h.is_acting
    ]


def appoint(
    db: Session,
    position: Position,
    user: User,
    *,
    started_on: date | None = None,
    is_acting: bool = False,
    appointed_by: User | None = None,
) -> PositionHolding:
    """Appoint someone to a post.

    Args:
        db: Database session.
        position: The post being filled.
        user: The person taking it up.
        started_on: When, defaulting to today.
        is_acting: Whether this is temporary cover.
        appointed_by: Who made the appointment.

    Returns:
        The new holding.

    Raises:
        ValueError: If the post requires a competency the person is not
            authorised to practise at that place, or if filling it
            substantively would exceed ``max_holders``. Acting cover does
            not count against the limit, because covering leave must not be
            blocked by the person being covered for.
    """
    start = started_on or _today()

    if position.requires_competency is not None:
        allowed = can_practise_at(
            db,
            user,
            position.requires_competency,
            organisation_id=position.organisation_id,
            site_id=position.site_id,
        )
        if not allowed:
            raise ValueError(
                f"{user.username} is not authorised to practise "
                f"{position.requires_competency} at this place, so cannot "
                f"hold {position.title}."
            )

    if not is_acting and position.max_holders is not None:
        substantive = [
            h for h in holdings_on(db, position, start) if not h.is_acting
        ]
        if len(substantive) >= position.max_holders:
            raise ValueError(
                f"{position.title} already has {position.max_holders} "
                "holder(s); vacate one before appointing another."
            )

    holding = PositionHolding(
        position_id=position.id,
        user_id=user.id,
        started_on=start,
        is_acting=is_acting,
        appointed_by=appointed_by.id if appointed_by else None,
    )
    db.add(holding)
    db.flush()
    return holding


def vacate(
    db: Session,
    holding: PositionHolding,
    ended_on: date | None = None,
) -> PositionHolding:
    """End a holding, leaving the row in place.

    The row stays because the history is the point: who held the post, and
    when, is what an incident review asks for.

    Args:
        db: Database session.
        holding: The holding to end.
        ended_on: When it ended, defaulting to today.

    Returns:
        The same holding, now ended.

    Raises:
        ValueError: If the end date precedes the start, or the holding has
            already ended.
    """
    end = ended_on or _today()

    if holding.ended_on is not None:
        raise ValueError("This holding has already ended.")
    if end < holding.started_on:
        raise ValueError("A holding cannot end before it started.")

    holding.ended_on = end
    db.flush()
    return holding


def holders_of(
    db: Session, position: Position, on_date: date | None = None
) -> list[int]:
    """Return the ids of everyone holding a post on one date.

    Args:
        db: Database session.
        position: The post.
        on_date: The date to ask about, defaulting to today.

    Returns:
        User ids, acting and substantive alike, in no particular order.
    """
    return [h.user_id for h in holdings_on(db, position, on_date)]
