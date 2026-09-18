"""a place remembers the prefix its media is filed under

Media lives at ``{prefix}/{module}/{asset}`` in a bucket and the signed
cookie covers that path, so every object of one module at one place has
to share a prefix — a second number for the same place would need a
second cookie nobody issues.

That prefix is the organisation's own id, which is the last thing the
organisations table is load-bearing for. Recording it on the place lets
the table go without moving a single object: everything already written
stays addressable, and a place created afterwards files under its own
id, there being no second number for it to have.

Null means "my own id", which is why the column is nullable rather than
backfilled for every place. Only the places that are organisations get a
value, and only because they already have objects under it.

Revision ID: 7ba791482ca6
Revises: ce56e29bc8a6
Create Date: 2026-09-17 21:58:06.712334

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7ba791482ca6"
down_revision: str | None = "ce56e29bc8a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "org_unit", sa.Column("media_prefix_id", sa.Integer(), nullable=True)
    )

    # Left null where the two numbers already agree, which is the common
    # case on a small installation: the fallback gives the same answer,
    # and a stored number that repeats the id is one more thing that can
    # drift from it.
    op.execute(
        sa.text(
            "UPDATE org_unit SET media_prefix_id = organisations.id "
            "FROM organisations "
            "WHERE organisations.org_unit_id = org_unit.id "
            "AND organisations.id <> org_unit.id"
        )
    )


def downgrade() -> None:
    # migration-check: allow-destructive
    # The column only ever restated what the organisations table says,
    # which is still there at this revision, so nothing is lost.
    op.drop_column("org_unit", "media_prefix_id")
