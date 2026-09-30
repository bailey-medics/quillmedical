"""move teaching to manage teaching

`manage_teaching` replaces `manage_teaching_content`: one competency for
curating the question banks and for signing up the delegates who sit them,
whose holder may grant only what its whitelist in
`shared/competency-definitions/teaching.yaml` names. And `teaching_admin`
becomes the one teaching profession that carries it, so `teaching_manager`
goes. See `docs/docs/plans/2026-09-30-manage-teaching-competency-plan.md`.

In order:

1. Close the `manage_users`, `manage_staff_membership` and
   `manage_practising_competencies` rows that `teaching_manager` seeded
   (`source` `profession`) on its holders, because `teaching_admin` does
   not grant them. A row somebody granted by hand stays open.
2. Move every `teaching_manager` holder to `teaching_admin`.
3. For each current `manage_teaching_content` grant row, open a
   `manage_teaching` row with the same `source`, `org_unit_id` and
   `granted_by`, then close the old one. Rows are closed, never deleted,
   so the history still says who held the old competency.
4. Point each `practising_competency` row for `manage_teaching_content` at
   `manage_teaching` instead. A practising row has no dates: its
   existence is the authorisation, so there is no history to close.

Written by hand: there is no model change for `just migrate` to find,
and the recipe refuses an empty revision.

Revision ID: 16834fc0663d
Revises: 79a6ba344abb
Create Date: 2026-09-30 12:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "16834fc0663d"
down_revision: str | None = "79a6ba344abb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD = "manage_teaching_content"
NEW = "manage_teaching"

#: What `teaching_manager` granted beyond `teaching_admin`, frozen here as
#: a literal: a migration cannot read the YAML, which moves on.
MANAGER_ONLY = (
    "manage_users",
    "manage_staff_membership",
    "manage_practising_competencies",
)

#: A row is current while it has no end, or its end is still to come.
CURRENT = "(ends_on IS NULL OR ends_on > now())"


def _move_grant_rows(old: str, new: str) -> None:
    """Open a *new* row beside each current *old* row, then close it."""
    op.execute(f"""
        INSERT INTO user_competency
            (user_id, competency_id, starts_on, ends_on, source,
             org_unit_id, granted_by, created_at)
        SELECT old.user_id, '{new}', now(), old.ends_on, old.source,
               old.org_unit_id, old.granted_by, now()
          FROM user_competency AS old
         WHERE old.competency_id = '{old}'
           AND (old.ends_on IS NULL OR old.ends_on > now())
           AND NOT EXISTS (
               SELECT 1 FROM user_competency AS held
                WHERE held.user_id = old.user_id
                  AND held.competency_id = '{new}'
                  AND (held.ends_on IS NULL OR held.ends_on > now())
           )
    """)
    op.execute(f"""
        UPDATE user_competency
           SET ends_on = now()
         WHERE competency_id = '{old}'
           AND {CURRENT}
    """)


def _move_practising_rows(old: str, new: str) -> None:
    """Point each practising row at *new*, unless one is already there."""
    op.execute(f"""
        UPDATE practising_competency AS pc
           SET competency = '{new}'
         WHERE pc.competency = '{old}'
           AND NOT EXISTS (
               SELECT 1 FROM practising_competency AS other
                WHERE other.user_id = pc.user_id
                  AND other.org_unit_id = pc.org_unit_id
                  AND other.competency = '{new}'
           )
    """)
    # Any left over duplicate one already pointing at *new*, which says
    # the same thing, so they go.
    op.execute(f"""
        DELETE FROM practising_competency WHERE competency = '{old}'
    """)


def upgrade() -> None:
    """Close the manager-only rows, merge the professions, move the rows."""
    manager_only = ", ".join(f"'{c}'" for c in MANAGER_ONLY)
    op.execute(f"""
        UPDATE user_competency
           SET ends_on = now()
         WHERE source = 'profession'
           AND competency_id IN ({manager_only})
           AND {CURRENT}
           AND user_id IN (
               SELECT id FROM users WHERE base_profession = 'teaching_manager'
           )
    """)
    op.execute("""
        UPDATE users
           SET base_profession = 'teaching_admin'
         WHERE base_profession = 'teaching_manager'
    """)
    _move_grant_rows(OLD, NEW)
    _move_practising_rows(OLD, NEW)


def downgrade() -> None:
    """Move the rows back to `manage_teaching_content`.

    Only the competency moves back. A former `teaching_manager` cannot be
    told apart from a `teaching_admin` once moved, so professions stay as
    they are, and the manager-only rows closed by `upgrade` stay closed.
    Anybody who needs them again is granted them by hand.
    """
    _move_grant_rows(NEW, OLD)
    _move_practising_rows(NEW, OLD)
