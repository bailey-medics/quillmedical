# backend/app/features/passport/cover.py
"""An org_unit paying for its members' passport writing.

``passport_write`` is sold. One way to get it is to belong to an org_unit
whose cover is switched on: a ``passport_write`` feature row beside the
``passport`` one. This module is the whole of that rule, so the feature
route and every route that changes a membership ask one place.

A grant made here is a ``user_competency`` row with ``source``
``organisation``, ``org_unit_id`` the covering org_unit, and no end. It
ends only when the cover is switched off, or when a trainee leaves.
``sync_competency_rows`` leaves it alone, so saving the user editor never
ends it by accident.

- **Who is covered**: members in the ``staff`` or ``trainee`` capacity.
  Never ``external``, so adding somebody from outside does not give them
  free writing, and never ``patient``.
- **Leaving**: a member of staff who leaves keeps writing. A trainee who
  is removed, or moved to ``external``, loses it, because a rotation is
  not a career move away from the team.
- **Switching off** closes every grant this org_unit made, leavers
  included.

See ``docs/docs/plans/2026-09-30-passport-professions-plan.md``.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OrgUnitFeature, User, UserCompetency, org_unit_member

#: The feature key that switches an org_unit's cover on.
COVER_FEATURE = "passport_write"

#: The competency the cover grants.
COVERED_COMPETENCY = "passport_write"

#: The ``user_competency`` source of a grant made by cover.
COVER_SOURCE = "organisation"

#: The membership capacities that are covered.
COVERED_CAPACITIES: frozenset[str] = frozenset({"staff", "trainee"})


def is_covered(db: Session, org_unit_id: int) -> bool:
    """Whether *org_unit_id* has its cover switched on.

    Args:
        db: Core database session.
        org_unit_id: The org_unit.

    Returns:
        True when a ``passport_write`` feature row exists there.
    """
    return (
        db.scalar(
            select(OrgUnitFeature.id).where(
                OrgUnitFeature.org_unit_id == org_unit_id,
                OrgUnitFeature.feature_key == COVER_FEATURE,
            )
        )
        is not None
    )


def _current_cover_rows(
    db: Session, org_unit_id: int, user_id: int | None = None
) -> list[UserCompetency]:
    """The current grants *org_unit_id*'s cover made, optionally for one person."""
    now = datetime.now(UTC)
    query = select(UserCompetency).where(
        UserCompetency.competency_id == COVERED_COMPETENCY,
        UserCompetency.source == COVER_SOURCE,
        UserCompetency.org_unit_id == org_unit_id,
        (UserCompetency.ends_on.is_(None)) | (UserCompetency.ends_on > now),
    )
    if user_id is not None:
        query = query.where(UserCompetency.user_id == user_id)
    return list(db.scalars(query).all())


def _grant(
    db: Session, org_unit_id: int, user_id: int, granted_by: int | None
) -> None:
    """Give one person cover from one org_unit, unless they already have it."""
    if _current_cover_rows(db, org_unit_id, user_id):
        return
    db.add(
        UserCompetency(
            user_id=user_id,
            competency_id=COVERED_COMPETENCY,
            starts_on=datetime.now(UTC),
            ends_on=None,
            source=COVER_SOURCE,
            granted_by=granted_by,
            org_unit_id=org_unit_id,
        )
    )


def _close(db: Session, org_unit_id: int, user_id: int | None = None) -> int:
    """End the current grants *org_unit_id*'s cover made.

    Returns:
        How many grants were ended.
    """
    now = datetime.now(UTC)
    rows = _current_cover_rows(db, org_unit_id, user_id)
    for row in rows:
        row.ends_on = now
    return len(rows)


def switch_on(db: Session, org_unit_id: int, switched_by: User) -> int:
    """Grant writing to every covered member, now that the cover is on.

    Somebody who already has a current grant from this org_unit is
    skipped, so switching off and on again duplicates nothing.

    Args:
        db: Core database session. The caller commits.
        org_unit_id: The org_unit whose cover was switched on.
        switched_by: Who switched it on, recorded as ``granted_by``.

    Returns:
        How many members are covered.
    """
    members = db.scalars(
        select(org_unit_member.c.user_id).where(
            org_unit_member.c.org_unit_id == org_unit_id,
            org_unit_member.c.capacity.in_(COVERED_CAPACITIES),
        )
    ).all()
    for user_id in members:
        _grant(db, org_unit_id, int(user_id), switched_by.id)
    db.flush()
    return len(members)


def switch_off(db: Session, org_unit_id: int) -> int:
    """End every grant this org_unit's cover made, leavers included.

    Args:
        db: Core database session. The caller commits.
        org_unit_id: The org_unit whose cover was switched off.

    Returns:
        How many grants were ended.
    """
    closed = _close(db, org_unit_id)
    db.flush()
    return closed


def covered_count(db: Session, org_unit_id: int) -> int:
    """How many people hold a current grant from this org_unit's cover.

    What switching it off would take away, for the confirm dialog.

    Args:
        db: Core database session.
        org_unit_id: The org_unit.

    Returns:
        The number of current grants.
    """
    return len(_current_cover_rows(db, org_unit_id))


def membership_changed(
    db: Session,
    org_unit_id: int,
    user_id: int,
    *,
    before: str | None,
    after: str | None,
    changed_by: User | None,
) -> None:
    """Keep one person's cover in step with their membership of one org_unit.

    Call it after the membership row has been written or deleted. Nothing
    happens unless the org_unit's cover is on.

    - Now ``staff`` or ``trainee``: grant writing.
    - Was a ``trainee``, now removed or ``external``: end it.
    - Anything else, including a member of staff leaving: no change.

    Args:
        db: Core database session. The caller commits.
        org_unit_id: The org_unit.
        user_id: The person.
        before: Their capacity there before, or None if not a member.
        after: Their capacity there now, or None if removed.
        changed_by: Who made the change, recorded as ``granted_by``.
    """
    if before == after or not is_covered(db, org_unit_id):
        return
    if after in COVERED_CAPACITIES:
        _grant(
            db,
            org_unit_id,
            user_id,
            changed_by.id if changed_by is not None else None,
        )
    elif before == "trainee":
        _close(db, org_unit_id, user_id)


def capacities_of(db: Session, user_id: int) -> dict[int, str]:
    """Every org_unit *user_id* belongs to, with their capacity there.

    For a caller about to rewrite somebody's memberships in bulk: read
    this before, read it again after, and pass each difference to
    :func:`membership_changed`.

    Args:
        db: Core database session.
        user_id: The person.

    Returns:
        Their capacity, keyed by org_unit id.
    """
    return {
        int(unit_id): str(capacity)
        for unit_id, capacity in db.execute(
            select(
                org_unit_member.c.org_unit_id, org_unit_member.c.capacity
            ).where(org_unit_member.c.user_id == user_id)
        ).all()
    }


def memberships_changed(
    db: Session,
    user_id: int,
    *,
    before: dict[int, str],
    after: dict[int, str],
    changed_by: User | None,
) -> None:
    """Apply :func:`membership_changed` across a bulk rewrite.

    Args:
        db: Core database session. The caller commits.
        user_id: The person.
        before: :func:`capacities_of` before the rewrite.
        after: :func:`capacities_of` after it.
        changed_by: Who made the change.
    """
    for org_unit_id in sorted(before.keys() | after.keys()):
        membership_changed(
            db,
            org_unit_id,
            user_id,
            before=before.get(org_unit_id),
            after=after.get(org_unit_id),
            changed_by=changed_by,
        )
