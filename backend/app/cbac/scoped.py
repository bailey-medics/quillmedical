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

Every read of a place goes through this module. That is deliberate: the place
is two nullable columns rather than one, and confining the branch here means
the storage can change later without touching call sites. See
``docs/docs/plans/2026-09-06-org-scoped-access-findings.md``.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.models import PractisingCompetency, User


def _place_clause(
    organisation_id: int | None, site_id: int | None
) -> ColumnElement[bool]:
    """Build the where-clause for exactly one kind of place.

    Args:
        organisation_id: The organisation, or None.
        site_id: The site, or None.

    Returns:
        The matching column comparison.

    Raises:
        ValueError: If both or neither were given. A caller that cannot say
            which place it means has a bug, and guessing is what this whole
            module exists to stop.
    """
    if (organisation_id is None) == (site_id is None):
        raise ValueError("Name exactly one place: organisation_id or site_id")
    if organisation_id is not None:
        return PractisingCompetency.organisation_id == organisation_id
    return PractisingCompetency.site_id == site_id


def competencies_at(
    db: Session,
    user: User,
    *,
    organisation_id: int | None = None,
    site_id: int | None = None,
) -> set[str]:
    """Return what ``user`` may practise at one place.

    Args:
        db: Database session.
        user: The person asked about.
        organisation_id: The organisation, when the place is an organisation.
        site_id: The site, when the place is a site.

    Returns:
        The competencies authorised at that place, narrowed to the user's own
        ceiling. Empty when nothing is authorised there.

    Raises:
        ValueError: If both or neither place was given.
    """
    authorised = set(
        db.execute(
            select(PractisingCompetency.competency).where(
                PractisingCompetency.user_id == user.id,
                _place_clause(organisation_id, site_id),
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
    organisation_id: int | None = None,
    site_id: int | None = None,
) -> bool:
    """Whether ``user`` may practise ``competency`` at one place.

    Args:
        db: Database session.
        user: The person asked about.
        competency: A competency id from ``shared/competency-definitions/``.
        organisation_id: The organisation, when the place is an organisation.
        site_id: The site, when the place is a site.

    Returns:
        True only if the competency is authorised there *and* within the
        user's ceiling.

    Raises:
        ValueError: If both or neither place was given.
    """
    if competency not in user.get_final_competencies():
        return False

    row = db.execute(
        select(PractisingCompetency.id).where(
            PractisingCompetency.user_id == user.id,
            PractisingCompetency.competency == competency,
            _place_clause(organisation_id, site_id),
        )
    ).first()
    return row is not None


def who_can_practise_at(
    db: Session,
    competency: str,
    *,
    organisation_id: int | None = None,
    site_id: int | None = None,
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
        organisation_id: The organisation, when the place is an organisation.
        site_id: The site, when the place is a site.

    Returns:
        User ids, in no particular order.

    Raises:
        ValueError: If both or neither place was given.
    """
    return [
        int(uid)
        for uid in db.execute(
            select(PractisingCompetency.user_id).where(
                PractisingCompetency.competency == competency,
                _place_clause(organisation_id, site_id),
            )
        )
        .scalars()
        .all()
    ]
