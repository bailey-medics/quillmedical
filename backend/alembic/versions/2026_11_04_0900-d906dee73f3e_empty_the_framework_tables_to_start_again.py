"""Empty the framework tables, so the sync stores every framework afresh.

The Gloucestershire framework was stored at version 2 with no version 1,
because its first edition was labelled "Pilot" and never numbered. Every
framework now starts at version 1 and the sync refuses one that does not,
so the rows stored so far are removed and the pre-deploy job's sync, which
runs straight after the migrations, stores all four frameworks again from
``shared/competency-definitions/``.

Nothing is lost that the sync does not rebuild: the framework files are
the source, and these tables are a copy of them. The run records in
``passport_framework_sync`` are kept, as the history of past runs.

Revision ID: d906dee73f3e
Revises: d1bc43b69fc0
Create Date: 2026-11-04 09:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d906dee73f3e"
down_revision: str | None = "d1bc43b69fc0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: Children first, so no row is left pointing at one already removed.
#: Each foreign key cascades too; naming every table keeps this correct
#: whatever the database does on delete.
_TABLES = (
    "passport_framework_scope",
    "passport_framework_level",
    "passport_framework_specialty",
    "passport_framework_competency",
    "passport_framework_version",
    "passport_framework",
)


def _empty_the_framework_tables() -> None:
    for table in _TABLES:
        op.execute(f"DELETE FROM {table}")


def upgrade() -> None:
    _empty_the_framework_tables()


def downgrade() -> None:
    # The rows removed cannot be put back as they were. Emptying the
    # tables again is the reversal that works: the older code's sync then
    # stores every framework from its own files, as it did the first time.
    _empty_the_framework_tables()
