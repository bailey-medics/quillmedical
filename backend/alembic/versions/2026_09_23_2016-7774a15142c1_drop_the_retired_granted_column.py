"""drop the retired granted column

Deletes the old removal rows, then drops `user_competency.granted`.

`granted` false marked a removal: this person did not hold something their
base profession gave, while the profession was added to everybody's rows
on every request. Since the profession only seeds rows, not holding a
competency is having no current row for it. The removal rows were closed
by `2a2a7b1ea83a`, and nothing has read or written the column since
`8dc3af3202f4` took it out of every statement.

**The removal rows are deleted, not kept.** Without the column that marked
them, a closed removal row would read as a grant that ran from its
`starts_on` to its `ends_on`: that somebody held a competency they had in
fact been refused. Keeping them would turn history into its opposite.

Approved as a destructive change on 23 September 2026. See
docs/docs/plans/2026-09-23-user-competency-table-plan.md.

Revision ID: 7774a15142c1
Revises: 8dc3af3202f4
Create Date: 2026-09-23 20:16:28.887994

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7774a15142c1"
down_revision: str | None = "8dc3af3202f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Removal rows first, while the column that marks them still exists.
    op.execute("DELETE FROM user_competency WHERE granted = false")
    # migration-check: allow-destructive
    #
    # Every remaining row is a grant, and no statement names the column.
    op.drop_column("user_competency", "granted")


def downgrade() -> None:
    """Recreate the column, with every row a grant.

    The removal rows deleted by `upgrade` do not come back. Every row left
    was a grant, which is what the restored default says.
    """
    op.add_column(
        "user_competency",
        sa.Column(
            "granted",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
    )
