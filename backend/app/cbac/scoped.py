"""Resolving what a person may practise at one org_unit.

Two facts, kept separate:

- The **ceiling** – what a person is qualified for at all. Lives on the user,
  resolved by ``User.get_final_competencies``.
- **Where they may practise it** – one row per person, org_unit and competency
  in ``practising_competency``.

Healthcare draws the same line as credentialing versus privileging: what
someone is qualified for, then what they are authorised to do at a particular
site. What they may actually do here is the intersection of the two.

- A row beyond someone's ceiling has no effect, so a lapsed qualification
  narrows every org_unit at once without a single row being touched.
- A ceiling with no row behind it does nothing, so being qualified is not the
  same as being authorised to practise here.

Every read of an org_unit goes through this module. That is deliberate, and it
paid for itself: the org_unit used to be two nullable columns and is now one,
and confining the branch here meant the storage could change without
touching a single call site. See
``docs/docs/plans/2026-09-06-org-scoped-access-findings.md``.

Every write goes through it too: ``authorise_practice`` and
``withdraw_practice``. The org_unit routes wrote the row inline until the
user form came to write the same rows, at which point two copies of "a
repeat is not an error, and an unchanged row keeps its author" would have
been free to drift. Who may write a row is not decided here: that is the
caller's question, answered by ``practice_refusal`` in
``app/org_units/router.py``.
"""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.models import PractisingCompetency, User


def _org_unit_clause(org_unit_id: int) -> ColumnElement[bool]:
    """Build the where-clause for one org_unit.

    One column on the row, one argument here. This used to take an
    organisation id or a site id and translate the first, because an
    organisation was a row in another table; an organisation is an org_unit
    now, so the two collapse and there is nothing left to mistake one
    for the other.

    Args:
        org_unit_id: The org_unit – an organisation's own row in the tree, or
            any org_unit beneath one.

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
    """Return what ``user`` may practise at one org_unit.

    Args:
        db: Database session.
        user: The person asked about.
        org_unit_id: The org_unit – an organisation's own row in the tree, or
            any org_unit beneath one.

    Returns:
        The competencies authorised at that org_unit, narrowed to the user's own
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


def authorised_at(db: Session, user_id: int, *, org_unit_id: int) -> set[str]:
    """Return every competency authorised for somebody at one org_unit.

    The rows as written, with no ceiling applied: what the place has
    decided, whether or not the person holds the competency today. For
    what they may actually do there, which is the intersection, ask
    ``competencies_at``. This is for a caller settling the rows
    themselves, which has to see the ones that have no effect too so as
    to leave them alone.

    Args:
        db: Database session.
        user_id: The person asked about.
        org_unit_id: The org_unit.

    Returns:
        The competency ids with a row there. Empty when there are none.
    """
    return set(
        db.execute(
            select(PractisingCompetency.competency).where(
                PractisingCompetency.user_id == user_id,
                _org_unit_clause(org_unit_id),
            )
        )
        .scalars()
        .all()
    )


def can_practise_at(
    db: Session,
    user: User,
    competency: str,
    *,
    org_unit_id: int,
) -> bool:
    """Whether ``user`` may practise ``competency`` at one org_unit.

    Args:
        db: Database session.
        user: The person asked about.
        competency: A competency id from ``shared/competency-definitions/``.
        org_unit_id: The org_unit – an organisation's own row in the tree, or
            any org_unit beneath one.

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
    """Return the ids of everyone authorised for ``competency`` at one org_unit.

    The other direction the design has to answer – "who here can act as
    clinical lead?" – and the reason the org_unit is carried on the row rather
    than reached through a membership.

    Ceilings are deliberately not applied here: this is a candidate list, and
    filtering it by every user's ceiling would mean loading every user. Check
    ``can_practise_at`` before acting on a name from it.

    Args:
        db: Database session.
        competency: A competency id from ``shared/competency-definitions/``.
        org_unit_id: The org_unit – an organisation's own row in the tree, or
            any org_unit beneath one.

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


def authorise_practice(
    db: Session,
    *,
    user_id: int,
    org_unit_id: int,
    competency: str,
    authorised_by: int,
) -> bool:
    """Record that somebody may practise a competency at one org_unit.

    Authorising the same thing twice is not an error and writes nothing:
    the row already there keeps who authorised it and when. Rewriting it
    would turn "who authorised this?" into "who last saved the form?".

    Not a grant of the competency itself, and not a check of it: a row
    beyond somebody's ceiling is allowed and has no effect until the
    ceiling catches up. Whether the caller may write the row at all is
    decided before this is called.

    Args:
        db: Database session. The row is flushed, not committed.
        user_id: The person being authorised.
        org_unit_id: Where.
        competency: A competency id from ``shared/competency-definitions/``.
        authorised_by: The user making the decision.

    Returns:
        True if a row was written, False if it was already there.
    """
    existing = db.scalar(
        select(PractisingCompetency.id).where(
            PractisingCompetency.user_id == user_id,
            PractisingCompetency.competency == competency,
            _org_unit_clause(org_unit_id),
        )
    )
    if existing is not None:
        return False

    db.add(
        PractisingCompetency(
            user_id=user_id,
            org_unit_id=org_unit_id,
            competency=competency,
            authorised_by=authorised_by,
        )
    )
    db.flush()
    return True


def withdraw_practice(
    db: Session,
    *,
    user_id: int,
    org_unit_id: int,
    competency: str,
) -> None:
    """Stop somebody practising a competency at one org_unit.

    The row is deleted and nothing is recorded in its place: absence is
    already the unauthorised state. Withdrawing something that was not
    authorised is not an error, because the caller asked for it to be
    unauthorised here and it is.

    Their competency itself is untouched, and so is every row they hold
    at any other org_unit.

    Args:
        db: Database session. The delete is flushed, not committed.
        user_id: The person.
        org_unit_id: Where.
        competency: A competency id from ``shared/competency-definitions/``.
    """
    db.execute(
        delete(PractisingCompetency).where(
            PractisingCompetency.user_id == user_id,
            PractisingCompetency.competency == competency,
            _org_unit_clause(org_unit_id),
        )
    )
    db.flush()
