"""Approval path test: a clean destructive migration.

Ships WITH its marker and rationale, so every static check passes and the only
thing holding the PR is the environment approval. That isolation is the point:
if the PR is blocked, it can only be the gate. Delete before the branch is
closed; it must never reach main.

Revision ID: f6f6f6f6f6f6
Revises: fa4401ce1b92
Create Date: 2026-08-29

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f6f6f6f6f6f6"
down_revision: str | None = "fa4401ce1b92"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add and drop a test column, so the gate has a drop_column to find."""
    op.add_column(
        "users", sa.Column("approval_path_column", sa.String(), nullable=True)
    )
    # migration-check: allow-destructive
    # Throwaway walkthrough fixture; the column is created and dropped in the
    # same migration, so no real data is at risk.
    op.drop_column("users", "approval_path_column")


def downgrade() -> None:
    """Restore the test column."""
    op.add_column(
        "users", sa.Column("approval_path_column", sa.String(), nullable=True)
    )
