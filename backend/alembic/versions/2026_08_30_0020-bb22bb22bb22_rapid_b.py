"""Rapid-push test migration B.

Throwaway fixture for the ordering test. Delete with the branch.

Revision ID: bb22bb22bb22
Revises: aa11aa11aa11
Create Date: 2026-08-29

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "bb22bb22bb22"
down_revision: str | None = "aa11aa11aa11"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add and drop a test column, so the gate has a drop_column to find."""
    op.add_column(
        "users", sa.Column("rapid_b", sa.String(), nullable=True)
    )
    # migration-check: allow-destructive
    # Throwaway fixture; created and dropped in the same migration.
    op.drop_column("users", "rapid_b")


def downgrade() -> None:
    """Restore the test column."""
    op.add_column(
        "users", sa.Column("rapid_b", sa.String(), nullable=True)
    )
