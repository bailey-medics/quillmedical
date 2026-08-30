"""Rapid-push test migration A.

Throwaway fixture for the ordering test. Delete with the branch.

Revision ID: cc33cc33cc33
Revises: fa4401ce1b92
Create Date: 2026-08-29

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "cc33cc33cc33"
down_revision: str | None = "fa4401ce1b92"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add and drop a test column, so the gate has a drop_column to find."""
    op.add_column(
        "users", sa.Column("rapid2_a", sa.String(), nullable=True)
    )
    # migration-check: allow-destructive
    # Throwaway fixture; created and dropped in the same migration.
    op.drop_column("users", "rapid2_a")


def downgrade() -> None:
    """Restore the test column."""
    op.add_column(
        "users", sa.Column("rapid2_a", sa.String(), nullable=True)
    )
