"""Finding stored competency ids that are no longer in the catalogue.

Write-boundary validation stops a bad id being stored. It cannot stop an id
going stale: a competency removed from ``shared/competencies.yaml`` leaves
every row that referenced it pointing at nothing, and no foreign key exists
to refuse the removal.

So this walks the other way — over what is stored — and reports anything the
catalogue no longer recognises. Read-only, and it changes nothing itself:
what to do about a stale id is a decision, not a cleanup.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.base_professions import BASE_PROFESSIONS
from app.cbac.competencies import unknown_competency_ids
from app.models import PractisingCompetency, User


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


def unknown_ids_on_users(db: Session) -> dict[int, list[str]]:
    """Return users whose stored competency lists name unknown ids.

    Covers both JSON columns, since a stale id in ``removed_competencies``
    is as misleading as one in ``additional_competencies`` — it silently
    removes nothing.

    Args:
        db: Database session.

    Returns:
        User id to the unrecognised ids stored against them.
    """
    found: dict[int, list[str]] = {}
    rows = db.execute(
        select(
            User.id,
            User.additional_competencies,
            User.removed_competencies,
        )
    ).all()
    for user_id, additional, removed in rows:
        unknown = unknown_competency_ids(
            list(additional or []) + list(removed or [])
        )
        if unknown:
            found[int(user_id)] = unknown
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
