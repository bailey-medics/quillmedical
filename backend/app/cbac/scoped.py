"""Resolving what a person may practise at one place.

Two facts, kept separate:

- The **ceiling** — what a person is qualified for at all. Lives on the user,
  resolved by ``User.get_final_competencies``.
- **Where they may practise it** — one row per person, place and competency
  in ``practising_competency``.

Healthcare draws the same line as credentialing versus privileging: what
someone is qualified for, then what they are authorised to do at a particular
site. What they may actually do here is the intersection of the two.

- A row beyond someone's ceiling has no effect, so a lapsed qualification
  narrows every place at once without a single row being touched.
- A ceiling with no row behind it does nothing, so being qualified is not the
  same as being authorised to practise here.

Every read of a place goes through this module. That is deliberate, and it
paid for itself: the place used to be two nullable columns and is now one,
and confining the branch here meant the storage could change without
touching a single call site. See
``docs/docs/plans/2026-09-06-org-scoped-access-findings.md``.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.models import PractisingCompetency, User


def _org_unit_clause(org_unit_id: int) -> ColumnElement[bool]:
    """Build the where-clause for one place.

    One column on the row, one argument here. This used to take an
    organisation id or a site id and translate the first, because an
    organisation was a row in another table; an organisation is a place
    now, so the two collapse and there is nothing left to mistake one
    for the other.

    Args:
        org_unit_id: The place — an organisation's own row in the tree, or
            any place beneath one.

    Returns:
        The matching column comparison.
    """
    return PractisingCompetency.org_unit_id == org_unit_id


def competencies_at(
    db: Session,
    user: User,
    *,
    org_unit_id: int,
) -> set[str]:
    """Return what ``user`` may practise at one place.

    Args:
        db: Database session.
        user: The person asked about.
        org_unit_id: The place — an organisation's own row in the tree, or
            any place beneath one.

    Returns:
        The competencies authorised at that place, narrowed to the user's own
        ceiling. Empty when nothing is authorised there.
    """
    authorised = set(
        db.execute(
            select(PractisingCompetency.competency).where(
                PractisingCompetency.user_id == user.id,
                _org_unit_clause(org_unit_id),
            )
        )
        .scalars()
        .all()
    )
    return authorised & set(user.get_final_competencies())


def can_practise_at(
    db: Session,
    user: User,
    competency: str,
    *,
    org_unit_id: int,
) -> bool:
    """Whether ``user`` may practise ``competency`` at one place.

    Args:
        db: Database session.
        user: The person asked about.
        competency: A competency id from ``shared/competency-definitions/``.
        org_unit_id: The place — an organisation's own row in the tree, or
            any place beneath one.

    Returns:
        True only if the competency is authorised there *and* within the
        user's ceiling.
    """
    if competency not in user.get_final_competencies():
        return False

    row = db.execute(
        select(PractisingCompetency.id).where(
            PractisingCompetency.user_id == user.id,
            PractisingCompetency.competency == competency,
            _org_unit_clause(org_unit_id),
        )
    ).first()
    return row is not None


def who_can_practise_at(
    db: Session,
    competency: str,
    *,
    org_unit_id: int,
) -> list[int]:
    """Return the ids of everyone authorised for ``competency`` at one place.

    The other direction the design has to answer — "who here can act as
    clinical lead?" — and the reason the place is carried on the row rather
    than reached through a membership.

    Ceilings are deliberately not applied here: this is a candidate list, and
    filtering it by every user's ceiling would mean loading every user. Check
    ``can_practise_at`` before acting on a name from it.

    Args:
        db: Database session.
        competency: A competency id from ``shared/competency-definitions/``.
        org_unit_id: The place — an organisation's own row in the tree, or
            any place beneath one.

    Returns:
        User ids, in no particular order.
    """
    return [
        int(uid)
        for uid in db.execute(
            select(PractisingCompetency.user_id).where(
                PractisingCompetency.competency == competency,
                _org_unit_clause(org_unit_id),
            )
        )
        .scalars()
        .all()
    ]
