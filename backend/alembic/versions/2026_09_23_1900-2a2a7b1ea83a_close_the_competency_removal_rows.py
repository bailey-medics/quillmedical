"""close the competency removal rows

Closes every current `user_competency` row with `granted` false by setting
its `ends_on` to now.

A removal row said "their profession gives this and they do not hold it",
which mattered while the profession's template was added to somebody's
rows on every request. Since that stopped, only grant rows count: not
holding a competency is having no current grant row for it, and the
seeding that preceded the switch skipped every removed competency, so
that is already true of everybody a removal row describes. Nothing reads
or writes removal rows any more.

Closed rather than deleted, so who removed what, and when, is kept. Not
destructive: no row or column goes. The `granted` column is dropped in a
change of its own.

Written by hand: there is no model change for `just migrate` to find.

Revision ID: 2a2a7b1ea83a
Revises: 56f3ad035100
Create Date: 2026-09-23 19:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2a2a7b1ea83a"
down_revision: str | None = "56f3ad035100"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Close every current removal row, all at one moment.

    `NOW()` is the start of the transaction, so every row closed here
    carries the same `ends_on`, which is how `downgrade` finds them.
    `GREATEST` keeps a row whose start is in the future valid against
    `ck_user_competency_ends_after_start`.
    """
    op.execute("""
        UPDATE user_competency
           SET ends_on = GREATEST(COALESCE(starts_on, NOW()), NOW())
         WHERE granted = false
           AND (ends_on IS NULL OR ends_on > NOW())
    """)


def downgrade() -> None:
    """Reopen the removal rows this closed.

    They share the latest `ends_on` of any removal row, because `upgrade`
    closed them all at one moment and nothing has written a removal row
    since. A removal row that had a future end before `upgrade` comes
    back with no end, which none did when this was written.
    """
    op.execute("""
        UPDATE user_competency
           SET ends_on = NULL
         WHERE granted = false
           AND ends_on = (
                   SELECT MAX(ends_on)
                     FROM user_competency
                    WHERE granted = false
               )
    """)
