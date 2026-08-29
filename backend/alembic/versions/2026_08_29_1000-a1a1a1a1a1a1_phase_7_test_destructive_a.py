"""Phase 7 walkthrough: test destructive migration A.

Exists only to exercise the destructive-migration review gate. Shipped first
without the allow-destructive marker (step 1) to prove the marker gates the
static check and not the CI detection; the marker is added in step 2. Delete
this file before the walkthrough branch is closed - it must never reach main.

Revision ID: a1a1a1a1a1a1
Revises: fa4401ce1b92
Create Date: 2026-08-29

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# migration-check: allow-destructive
revision: str = "a1a1a1a1a1a1"
down_revision: str | None = "fa4401ce1b92"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add and drop a test column, so the gate has a drop_column to find."""
    # Self-cancelling on purpose: the gate parses for a drop_column call
    # rather than running anything, so this puts one in the file while
    # leaving the schema untouched. That is also why models.py declares no
    # walkthrough_column_a - if it did, alembic_drift_check would fail.
    op.add_column(
        "users", sa.Column("walkthrough_column_a", sa.String(), nullable=True)
    )
    op.drop_column("users", "walkthrough_column_a")


def downgrade() -> None:
    """Restore the test column.

    Asymmetric by necessity: upgrade() leaves no column behind, so this adds
    one that was never there. check_migrations.py rejects an empty or
    pass-only downgrade, and this migration is never merged or deployed, so
    the asymmetry costs nothing.
    """
    op.add_column(
        "users", sa.Column("walkthrough_column_a", sa.String(), nullable=True)
    )
