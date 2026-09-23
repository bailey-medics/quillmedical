"""Finding stored competency ids that are no longer in the catalogue.

Write-boundary validation stops a bad id being stored. It cannot stop an id
going stale: a competency removed from ``shared/competency-definitions/`` leaves
every row that referenced it pointing at nothing, and no foreign key exists
to refuse the removal.

So this walks the other way — over what is stored — and reports anything the
catalogue no longer recognises. Read-only, and it changes nothing itself:
what to do about a stale id is a decision, not a cleanup.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.cbac.base_professions import BASE_PROFESSIONS
from app.cbac.competencies import (
    retired_competency_ids,
    unknown_competency_ids,
)
from app.models import PractisingCompetency, UserCompetency


def unknown_ids_in_base_professions() -> dict[str, list[str]]:
    """Return base professions naming competencies the catalogue lacks.

    Static: both files ship in the repository, so this is drift between two
    checked-in YAMLs rather than bad data.

    Returns:
        Profession id to the unrecognised competency ids it names. Empty
        when the two files agree.
    """
    found: dict[str, list[str]] = {}
    for profession in BASE_PROFESSIONS:
        unknown = unknown_competency_ids(profession.base_competencies)
        if unknown:
            found[profession.id] = unknown
    return found


def _current_ids_by_user(db: Session) -> dict[int, list[str]]:
    """Every competency id on a current ``user_competency`` row, per user.

    Grants and removals alike, since a stale id on a removal is as
    misleading as one on a grant — it silently removes nothing. Closed rows
    are left out: they record what somebody could once do, and mislead
    nobody about what they can do now.

    One query over the rows, which is what the JSON columns this replaced
    could not offer: there, every user had to be read and each list parsed
    in Python.
    """
    now = datetime.now(UTC)
    rows = db.execute(
        select(UserCompetency.user_id, UserCompetency.competency_id)
        .where(
            or_(
                UserCompetency.ends_on.is_(None),
                UserCompetency.ends_on > now,
            )
        )
        .distinct()
    ).all()
    found: dict[int, list[str]] = {}
    for user_id, competency_id in rows:
        found.setdefault(int(user_id), []).append(competency_id)
    return {user_id: sorted(ids) for user_id, ids in found.items()}


def unknown_ids_on_users(db: Session) -> dict[int, list[str]]:
    """Return users whose current competency rows name unknown ids.

    Args:
        db: Database session.

    Returns:
        User id to the unrecognised ids held against them.
    """
    found: dict[int, list[str]] = {}
    for user_id, ids in _current_ids_by_user(db).items():
        unknown = unknown_competency_ids(ids)
        if unknown:
            found[user_id] = unknown
    return found


def unknown_ids_in_practising_competencies(db: Session) -> dict[int, str]:
    """Return practising rows naming a competency the catalogue lacks.

    Args:
        db: Database session.

    Returns:
        Row id to the unrecognised competency id it names.
    """
    rows = db.execute(
        select(PractisingCompetency.id, PractisingCompetency.competency)
    ).all()
    return {
        int(row_id): competency
        for row_id, competency in rows
        if unknown_competency_ids([competency])
    }


def retired_ids_in_practising_competencies(db: Session) -> dict[int, str]:
    """Return practising rows holding a competency that has been retired.

    Not an error, and deliberately separate from the unknown-id checks
    above. These rows were valid when written and stay readable; retiring a
    competency stops new ones being granted, it does not revoke the access
    anyone already has. Revoking is deleting these rows, which is a
    deliberate act rather than a consequence of editing a YAML file.

    So this is a cleanup queue: what someone would work through if they
    intended the retirement to end the practice as well.

    Args:
        db: Database session.

    Returns:
        Row id to the retired competency id it names.
    """
    rows = db.execute(
        select(PractisingCompetency.id, PractisingCompetency.competency)
    ).all()
    return {
        int(row_id): competency
        for row_id, competency in rows
        if retired_competency_ids([competency])
    }


def retired_ids_on_users(db: Session) -> dict[int, list[str]]:
    """Return users whose current competency rows hold retired ids.

    The same cleanup queue, for ``user_competency``.

    Args:
        db: Database session.

    Returns:
        User id to the retired ids held against them.
    """
    found: dict[int, list[str]] = {}
    for user_id, ids in _current_ids_by_user(db).items():
        retired = retired_competency_ids(ids)
        if retired:
            found[user_id] = retired
    return found
