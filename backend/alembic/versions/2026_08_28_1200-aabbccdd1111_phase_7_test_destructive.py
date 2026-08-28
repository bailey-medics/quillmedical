"""Phase 7 verification: test destructive migration.

This migration is for testing the destructive migration gate only.
It will be deleted after verification completes.

Revision ID: aabbccdd1111
Revises:
Create Date: 2026-08-28

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# migration-check: allow-destructive
revision: str = "aabbccdd1111"
down_revision: str | None = "fa4401ce1b92"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Drop a test column to verify the destructive migration gate detects this."""
    # This is intentionally destructive for testing purposes
    op.drop_column("user", "test_column")


def downgrade() -> None:
    """Restore the test column."""
    op.add_column("user", sa.Column("test_column", sa.String(), nullable=True))
