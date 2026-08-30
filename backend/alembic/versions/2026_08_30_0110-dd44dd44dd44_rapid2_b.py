"""Rapid-push test migration B.

Throwaway fixture for the ordering test. Delete with the branch.

Revision ID: dd44dd44dd44
Revises: cc33cc33cc33
Create Date: 2026-08-29

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "dd44dd44dd44"
down_revision: str | None = "cc33cc33cc33"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add and drop a test column, so the gate has a drop_column to find."""
    op.add_column(
        "users", sa.Column("rapid2_b", sa.String(), nullable=True)
    )
    # migration-check: allow-destructive
    # Throwaway fixture; created and dropped in the same migration.
    op.drop_column("users", "rapid2_b")


def downgrade() -> None:
    """Restore the test column."""
    op.add_column(
        "users", sa.Column("rapid2_b", sa.String(), nullable=True)
    )
