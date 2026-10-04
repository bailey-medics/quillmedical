"""split view teaching cases in two

`view_teaching_cases` is retired and replaced by two competencies:
`view_teaching_results`, which opens teaching and somebody's own past
results and certificates, and `take_teaching_modules`, which opens the
modules themselves. See
`docs/docs/plans/2026-10-04-teaching-access-results-modules-and-enrolment-plan.md`.

In order:

1. For each current `view_teaching_cases` grant row, open a row for each
   of the two new competencies with the same `source`, `org_unit_id`,
   `granted_by` and `ends_on`, unless the person already holds it. Then
   close the old row. Rows are closed, never deleted, so the history
   still says who held the old competency.
2. For each `practising_competency` row for `view_teaching_cases`, write
   a row for each new competency at the same org unit, unless one is
   there, then remove the old row. A practising row has no dates: its
   existence is the authorisation, so there is no history to close.

Nobody gains or loses anything: whoever could read lessons before may
now do everything a learner does, which is what the old label promised.

Written by hand: there is no model change for `just migrate` to find,
and the recipe refuses an empty revision.

Revision ID: 8c1f4e2a9b37
Revises: 2736214b7eb1
Create Date: 2026-10-04 20:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8c1f4e2a9b37"
down_revision: str | None = "2736214b7eb1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: Frozen here as literals: a migration cannot read the catalogue, which
#: moves on.
OLD = "view_teaching_cases"
RESULTS = "view_teaching_results"
MODULES = "take_teaching_modules"


def _open_grant_rows(held: str, new: str) -> None:
    """Open a *new* row beside each current *held* row."""
    op.execute(f"""
        INSERT INTO user_competency
            (user_id, competency_id, starts_on, ends_on, source,
             org_unit_id, granted_by, created_at)
        SELECT old.user_id, '{new}', now(), old.ends_on, old.source,
               old.org_unit_id, old.granted_by, now()
          FROM user_competency AS old
         WHERE old.competency_id = '{held}'
           AND (old.ends_on IS NULL OR old.ends_on > now())
           AND NOT EXISTS (
               SELECT 1 FROM user_competency AS already
                WHERE already.user_id = old.user_id
                  AND already.competency_id = '{new}'
                  AND (already.ends_on IS NULL OR already.ends_on > now())
           )
    """)


def _close_grant_rows(competency: str) -> None:
    """Close every current row for *competency*."""
    op.execute(f"""
        UPDATE user_competency
           SET ends_on = now()
         WHERE competency_id = '{competency}'
           AND (ends_on IS NULL OR ends_on > now())
    """)


def _copy_practising_rows(held: str, new: str) -> None:
    """Write a *new* practising row beside each *held* one."""
    op.execute(f"""
        INSERT INTO practising_competency
            (user_id, org_unit_id, competency, authorised_by,
             authorised_at)
        SELECT pc.user_id, pc.org_unit_id, '{new}', pc.authorised_by,
               pc.authorised_at
          FROM practising_competency AS pc
         WHERE pc.competency = '{held}'
           AND NOT EXISTS (
               SELECT 1 FROM practising_competency AS other
                WHERE other.user_id = pc.user_id
                  AND other.org_unit_id IS NOT DISTINCT FROM pc.org_unit_id
                  AND other.competency = '{new}'
           )
    """)


def _drop_practising_rows(competency: str) -> None:
    """Remove every practising row for *competency*."""
    op.execute(f"""
        DELETE FROM practising_competency WHERE competency = '{competency}'
    """)


def upgrade() -> None:
    """Give each holder of the old competency both new ones."""
    _open_grant_rows(OLD, RESULTS)
    _open_grant_rows(OLD, MODULES)
    _close_grant_rows(OLD)
    _copy_practising_rows(OLD, RESULTS)
    _copy_practising_rows(OLD, MODULES)
    _drop_practising_rows(OLD)


def downgrade() -> None:
    """Give `view_teaching_cases` back to whoever may take modules.

    The old competency was checked on lessons and video, which is what
    `take_teaching_modules` now opens, so that is the one read. Both new
    competencies are then closed: the code being stepped back to knows
    neither.
    """
    _open_grant_rows(MODULES, OLD)
    _close_grant_rows(RESULTS)
    _close_grant_rows(MODULES)
    _copy_practising_rows(MODULES, OLD)
    _drop_practising_rows(RESULTS)
    _drop_practising_rows(MODULES)
