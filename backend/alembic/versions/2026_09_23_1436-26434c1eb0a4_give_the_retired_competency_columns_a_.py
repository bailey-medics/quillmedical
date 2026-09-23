"""give the retired competency columns a server default

`users.additional_competencies` and `users.removed_competencies` are
retired: `user_competency` rows replaced them, and nothing reads or writes
them. The next migration drops them. This one lets the application stop
mentioning them first, so that a revision still serving traffic while the
drop runs has nothing in its statements that the drop could break.

The application stops mentioning them by deferring both columns, which
keeps them out of every SELECT, and by dropping their Python default,
which keeps them out of every INSERT. A new user's row then needs the
database to fill both NOT NULL columns itself, and that is what this adds:
a server default of an empty JSON array.

Not destructive, and no data changes. Written by hand because
`compare_server_default` is off in `env.py`, so autogenerate cannot see a
server default, and `just migrate` correctly refuses an empty `upgrade()`.

Revision ID: 26434c1eb0a4
Revises: 61e9c9b15ac6
Create Date: 2026-09-23 14:36:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "26434c1eb0a4"
down_revision: str | None = "61e9c9b15ac6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLUMNS = ("additional_competencies", "removed_competencies")


def upgrade() -> None:
    """Default both retired columns to an empty array."""
    for column in COLUMNS:
        op.alter_column(
            "users",
            column,
            existing_type=sa.JSON(),
            existing_nullable=False,
            server_default=sa.text("'[]'::json"),
        )


def downgrade() -> None:
    """Remove the defaults again.

    Only safe once the application writes both columns itself, as it did
    before this revision.
    """
    for column in COLUMNS:
        op.alter_column(
            "users",
            column,
            existing_type=sa.JSON(),
            existing_nullable=False,
            server_default=None,
        )
