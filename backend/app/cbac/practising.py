"""Resolving what a person may practise at one org_unit.

Two facts, kept separate:

- The **ceiling** - what a person is qualified for at all. Lives on the user,
  resolved by ``User.get_final_competencies``.
- **Where they may practise it** - one row per person, org_unit and competency
  in ``practising_competency``.

Healthcare draws the same line as credentialing versus privileging: what
someone is qualified for, then what they are authorised to do at a particular
site. What they may actually do here is the intersection of the two.

- **The competency comes first.** Nobody is authorised to practise at an
  org_unit something they do not hold: ``authorise_practice`` refuses it.
  That is how medicine works, where privileges follow qualification.
- **Losing a competency removes it everywhere.** When somebody stops
  holding one, their rows for it are deleted by ``withdraw_not_held``, so
  regaining it means being authorised at each org_unit again.
- A ceiling with no row behind it does nothing, so being qualified is not the
  same as being authorised to practise here.

One gap, which reads close it: a grant with an end date runs out with no
code running, so its rows are still there the next morning. They have no
effect, because every read takes the intersection, and they are deleted the
next time that person's competencies are saved.

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
    """Build the "this row is for this org_unit" part of a query.

    Every query in this module filters ``practising_competency`` rows to
    one org_unit. They all use this, so each one matches an org_unit the
    same way.

    Args:
        org_unit_id: The org_unit to match.

    Returns:
        A condition to pass to ``.where()``.
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
        org_unit_id: The org_unit - an organisation's own row in the tree, or
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
        org_unit_id: The org_unit - an organisation's own row in the tree, or
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

    The other direction the design has to answer - "who here can act as
    clinical lead?" - and the reason the org_unit is carried on the row rather
    than reached through a membership.

    Ceilings are deliberately not applied here: this is a candidate list, and
    filtering it by every user's ceiling would mean loading every user. Check
    ``can_practise_at`` before acting on a name from it.

    Args:
        db: Database session.
        competency: A competency id from ``shared/competency-definitions/``.
        org_unit_id: The org_unit - an organisation's own row in the tree, or
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
    authorised_by: int | None,
) -> bool:
    """Record that somebody may practise a competency at one org_unit.

    The competency comes first: the person must already hold it, and
    this raises ValueError if they do not. It is not a grant of the
    competency itself, so a caller giving both does the grant first.

    Authorising the same thing twice is not an error and writes nothing:
    the row already there keeps who authorised it and when.

    Whether the caller may write the row at all is decided before this
    is called.

    Args:
        db: Database session.
        user_id: The person being authorised.
        org_unit_id: Where.
        competency: A competency id from ``shared/competency-definitions/``.
        authorised_by: The user making the decision, or None where
            nobody is signed in to be named: somebody registering
            through a centre's own link is admitted by the link.

    Returns:
        True if a row was written, False if it was already there.

    Raises:
        ValueError: If there is no such person, or they do not hold the
            competency. The routes refuse this first, with a message for
            the caller; this is the backstop for every other writer.
    """
    person = db.get(User, user_id)

    if person is None:
        raise ValueError(f"No user {user_id} to authorise.")

    if competency not in person.get_final_competencies():
        raise ValueError(
            f"User {user_id} does not hold {competency}, so cannot be "
            "authorised to practise it anywhere."
        )

    existing_competency = db.scalar(
        select(PractisingCompetency.id).where(
            PractisingCompetency.user_id == user_id,
            PractisingCompetency.competency == competency,
            _org_unit_clause(org_unit_id),
        )
    )

    if existing_competency is not None:
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
        db: Database session.
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


def withdraw_not_held(db: Session, user: User) -> int:
    """Delete somebody's practising rows for competencies they do not hold.

    The rule this keeps: nobody may practise at an org_unit a competency
    they do not hold. ``authorise_practice`` enforces it when a row is
    written, by refusing a competency the person does not hold. This
    enforces it afterwards, for somebody who held one, was authorised at
    several org_units, and then lost it. Nothing checks those rows again,
    so without this they would stay.

    Called whenever a competency is taken away, so that losing one ends it
    at every org_unit at once. Getting it back does not bring the rows
    back: each org_unit authorises them again. A row left behind would do
    nothing while the competency was gone, because every read takes what
    is held and what is authorised together, and would then authorise
    them at every org_unit again the moment it was regained, with nobody
    there having decided it.

    Args:
        db: Database session. The delete is flushed, not committed.
        user: The person, with their competency rows already settled.

    Returns:
        How many rows were deleted.
    """
    held = set(user.get_final_competencies())
    not_held = [
        row_id
        for row_id, competency in db.execute(
            select(
                PractisingCompetency.id, PractisingCompetency.competency
            ).where(PractisingCompetency.user_id == user.id)
        ).all()
        if competency not in held
    ]

    if not not_held:
        return 0

    db.execute(
        delete(PractisingCompetency).where(
            PractisingCompetency.id.in_(not_held)
        )
    )
    db.flush()

    return len(not_held)
