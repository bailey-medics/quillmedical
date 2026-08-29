"""Phase 7 walkthrough: test destructive migration B.

The second destructive migration, added to move the change-set hash and prove
a new comment is appended rather than the first being edited. Ships with its
marker from the start - step 1 already covered the missing-marker path. Delete
this file before the walkthrough branch is closed; it must never reach main.

Revision ID: b2b2b2b2b2b2
Revises: a1a1a1a1a1a1
Create Date: 2026-08-29

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# migration-check: allow-destructive
revision: str = "b2b2b2b2b2b2"
down_revision: str | None = "a1a1a1a1a1a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add and drop a second test column, giving the gate a second finding."""
    # Self-cancelling, as in migration A: the gate parses for the call rather
    # than running anything, so this leaves the schema untouched and keeps
    # alembic_drift_check happy.
    op.add_column(
        "users", sa.Column("walkthrough_column_b", sa.String(), nullable=True)
    )
    op.drop_column("users", "walkthrough_column_b")


def downgrade() -> None:
    """Restore the test column.

    Asymmetric for the same reason as migration A: upgrade() leaves no column
    behind, and check_migrations.py rejects an empty downgrade.
    """
    op.add_column(
        "users", sa.Column("walkthrough_column_b", sa.String(), nullable=True)
    )
