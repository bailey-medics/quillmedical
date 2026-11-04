"""A framework_sync role that may only read and add framework rows.

The framework sync job signs in as its own service account, through IAM
(Identity and Access Management), not as the user every other workload
shares. That account's database user holds nothing until it is granted,
so this role is all it gets: it may read the framework tables and add
rows to them, and record its own runs, and nothing else. It cannot
delete a row, change a stored version, or read any other table, so even
a bug in the sync cannot reach the rest of the database.

The role cannot sign in itself. The migrations job grants it to the
sync job's database user on every run, by name from
FRAMEWORK_SYNC_DB_USER, because Terraform makes that user and may do so
before or after this migration runs. See
``grant_framework_sync_role`` in backend/scripts/admin_cli.py.

A table added to the framework later needs its own grant to this role,
in the migration that adds it.

Revision ID: 79b9d509f6f6
Revises: d906dee73f3e
Create Date: 2026-11-04 14:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "79b9d509f6f6"
down_revision: str | None = "d906dee73f3e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: Read and add. The sync never changes or removes a stored version.
_ADDED_TO = (
    "passport_framework",
    "passport_framework_version",
    "passport_framework_specialty",
    "passport_framework_competency",
    "passport_framework_level",
    "passport_framework_scope",
)

#: The run record is added at the start of a run and finished at its end.
_RUN_RECORD = "passport_framework_sync"

#: The id sequences behind the tables above. passport_framework is keyed
#: by its framework id, so it has none.
_SEQUENCES = tuple(
    f"{table}_id_seq" for table in (*_ADDED_TO[1:], _RUN_RECORD)
)


def upgrade() -> None:
    op.execute(
        "DO $$ BEGIN "
        "IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = "
        "'framework_sync') THEN CREATE ROLE framework_sync NOLOGIN; "
        "END IF; END $$"
    )

    for table in _ADDED_TO:
        op.execute(f"GRANT SELECT, INSERT ON {table} TO framework_sync")

    op.execute(
        f"GRANT SELECT, INSERT, UPDATE ON {_RUN_RECORD} TO framework_sync"
    )

    for sequence in _SEQUENCES:
        op.execute(f"GRANT USAGE ON SEQUENCE {sequence} TO framework_sync")


def downgrade() -> None:
    # Revoking first, so the role owns nothing and holds nothing, and can
    # then be dropped. Dropping it also ends its grant to the sync job's
    # user, which then holds nothing again.
    for table in (*_ADDED_TO, _RUN_RECORD):
        op.execute(f"REVOKE ALL ON {table} FROM framework_sync")

    for sequence in _SEQUENCES:
        op.execute(f"REVOKE ALL ON SEQUENCE {sequence} FROM framework_sync")

    op.execute("DROP ROLE IF EXISTS framework_sync")
