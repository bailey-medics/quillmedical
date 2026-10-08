"""Filling, vacating and querying positions.

A position is a slot an org_unit has. It exists whether or not anyone
fills it, which is what separates it from a competency: "this org_unit has
no clinical lead" is a state worth chasing, where a competency nobody holds
is simply absent.

Holding is recorded as dated rows rather than a column on the position, so
the post outlives its holders and its history stays queryable - "who was
Caldicott Guardian in March?" is a question about the slot over time.

Appointment is checked against the person's competency at that org_unit, using
``can_practise_at``: holding the competency somewhere is not enough, it has
to be authorised where the post is.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.scoped import can_practise_at
from app.models import OrgUnit, Position, PositionHolding, User


def _today() -> date:
    """Today in UTC, so a test can compare against a known value."""
    return datetime.now(UTC).date()


def holdings_on(
    db: Session, position: Position, on_date: date | None = None
) -> list[PositionHolding]:
    """Return the holdings in force on one date.

    Two different questions, and the answer differs:

    - **Now** (``on_date`` omitted) means holdings that have not ended. If
      someone was removed from the post this morning, they do not hold it
      this afternoon.
    - **On a date** means holdings in force at any point that day, with
      both dates inclusive. Someone whose holding ended on the 30th held
      the post on the 30th, which is what a review of that date needs to be
      told.

    A replacement made on one day therefore shows both people on that
    day, which is true: each held the post for part of it. ``appoint``
    does not count the one who has gone against ``max_holders``.

    Args:
        db: Database session.
        position: The post.
        on_date: The date to ask about, or None for "now".

    Returns:
        The holdings in force.
    """
    query = select(PositionHolding).where(
        PositionHolding.position_id == position.id
    )

    if on_date is None:
        query = query.where(
            PositionHolding.started_on <= _today(),
            PositionHolding.ended_on.is_(None),
        )
    else:
        query = query.where(
            PositionHolding.started_on <= on_date,
            (PositionHolding.ended_on.is_(None))
            | (PositionHolding.ended_on >= on_date),
        )

    return list(db.execute(query).scalars().all())


def is_vacant(
    db: Session, position: Position, on_date: date | None = None
) -> bool:
    """Whether nobody holds the post on one date.

    Args:
        db: Database session.
        position: The post.
        on_date: The date to ask about, defaulting to today.

    Returns:
        True when no holding is in force.
    """
    return not holdings_on(db, position, on_date)


def appoint(
    db: Session,
    position: Position,
    user: User,
    *,
    started_on: date | None = None,
    appointed_by: User | None = None,
) -> PositionHolding:
    """Appoint someone to a post.

    Args:
        db: Database session.
        position: The post being filled.
        user: The person taking it up.
        started_on: When, defaulting to today.
        appointed_by: Who made the appointment.

    Returns:
        The new holding.

    Raises:
        ValueError: If the post requires a competency the person is not
            authorised to practise at that org_unit, or if filling it
            would exceed ``max_holders``. Somebody whose holding ends on
            or before the start date does not count against the limit:
            they have gone, so the post is free to fill that same day.
    """
    start = started_on or _today()

    if position.requires_competency is not None:
        # A post with no org_unit has no org_unit to be authorised at, so
        # nobody qualifies for it. Failing closed rather than raising:
        # the column is nullable, so the state is representable, and a
        # post nobody can fill is safer than one anybody can.
        allowed = position.org_unit_id is not None and can_practise_at(
            db,
            user,
            position.requires_competency,
            org_unit_id=position.org_unit_id,
        )
        if not allowed:
            raise ValueError(
                f"{user.username} is not authorised to practise "
                f"{position.requires_competency} at this place, so cannot "
                f"hold {position.title}."
            )

    if position.max_holders is not None:
        # Somebody whose last day is the start date has gone, and does
        # not make the post full. Replacing a holder is one act on one
        # day, with no day's gap asked for between the two.
        still_holding = [
            h
            for h in holdings_on(db, position, start)
            if h.ended_on is None or h.ended_on > start
        ]

        if len(still_holding) >= position.max_holders:
            raise ValueError(
                f"{position.title} already has {position.max_holders} "
                "holder(s); vacate one before appointing another."
            )

    holding = PositionHolding(
        position_id=position.id,
        user_id=user.id,
        started_on=start,
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
        User ids, in no particular order.
    """
    return [h.user_id for h in holdings_on(db, position, on_date)]


CLINICAL_LEAD = "clinical_lead"


def clinical_lead_post(db: Session, org_unit: OrgUnit) -> Position:
    """Return an org_unit's clinical lead post, creating it if absent.

    Created on demand rather than with every org_unit, because a post
    nobody has ever tried to fill is not a vacancy anyone is chasing - and
    creating one for every org_unit would fill the table with posts no
    organisation asked for.

    ``requires_competency`` is left unset: what a clinical lead must be
    competent in is not something this code can decide for an organisation,
    and guessing would refuse appointments that are perfectly proper today.

    Args:
        db: Database session.
        org_unit: The org_unit the post belongs to.

    Returns:
        The org_unit's clinical lead post.
    """
    post = db.execute(
        select(Position).where(
            Position.org_unit_id == org_unit.id,
            Position.kind == CLINICAL_LEAD,
        )
    ).scalar_one_or_none()

    if post is None:
        post = Position(
            org_unit_id=org_unit.id,
            kind=CLINICAL_LEAD,
            title="Clinical lead",
            max_holders=1,
        )
        db.add(post)
        db.flush()

    return post


def set_clinical_lead(
    db: Session,
    org_unit: OrgUnit,
    user: User | None,
    *,
    appointed_by: User | None = None,
) -> None:
    """Make someone clinical lead of an org_unit, or leave the post vacant.

    Ends whoever currently holds it before appointing, so the
    change is recorded rather than the previous holder simply vanishing.

    Args:
        db: Database session.
        org_unit: The org_unit the post belongs to.
        user: The new lead, or None to vacate the post.
        appointed_by: Who made the appointment.
    """
    post = clinical_lead_post(db, org_unit)

    for holding in holdings_on(db, post):
        if user is None or holding.user_id != user.id:
            vacate(db, holding)

    if user is None:
        return

    already = [h for h in holdings_on(db, post) if h.user_id == user.id]

    if not already:
        appoint(db, post, user, appointed_by=appointed_by)

    return


def clinical_leads_of(db: Session, org_unit_ids: list[int]) -> dict[int, int]:
    """Return the current clinical lead of each org_unit that has one.

    Args:
        db: Database session.
        org_unit_ids: The org_units to look up.

    Returns:
        Org_unit id to the user id of its clinical lead. Org_units with a
        vacant post are absent, which is what "no clinical lead" means.
    """
    if not org_unit_ids:
        return {}

    rows = db.execute(
        select(Position.org_unit_id, PositionHolding.user_id)
        .join(PositionHolding, PositionHolding.position_id == Position.id)
        .where(
            Position.org_unit_id.in_(org_unit_ids),
            Position.kind == CLINICAL_LEAD,
            PositionHolding.started_on <= _today(),
            PositionHolding.ended_on.is_(None),
        )
    ).all()

    return {int(unit_id): int(user_id) for unit_id, user_id in rows}
