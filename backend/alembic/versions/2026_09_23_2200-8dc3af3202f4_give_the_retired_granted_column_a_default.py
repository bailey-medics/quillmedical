"""give the retired granted column a default

`user_competency.granted` is retired: every current row is a grant, and
nothing reads the column since removal rows were closed. The next
migration drops it. This one lets the application stop mentioning it
first, so that a revision still serving traffic while the drop runs has
nothing in its statements that the drop could break.

The application stops mentioning it by deferring the column, which keeps
it out of every SELECT, and by never setting it, which keeps it out of
every INSERT. A new row then needs the database to fill the NOT NULL
column itself, and that is what this adds: a server default of true.

Not destructive, and no data changes. Written by hand because
`compare_server_default` is off in `env.py`, so autogenerate cannot see a
server default.

Revision ID: 8dc3af3202f4
Revises: 83c3b5af3ea7
Create Date: 2026-09-23 22:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8dc3af3202f4"
down_revision: str | None = "83c3b5af3ea7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Default the retired column to true."""
    op.alter_column(
        "user_competency",
        "granted",
        existing_type=sa.Boolean(),
        existing_nullable=False,
        server_default=sa.text("true"),
    )


def downgrade() -> None:
    """Remove the default again.

    Only safe once the application sets the column itself, as it did
    before this revision.
    """
    op.alter_column(
        "user_competency",
        "granted",
        existing_type=sa.Boolean(),
        existing_nullable=False,
        server_default=None,
    )
