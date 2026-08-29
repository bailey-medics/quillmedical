"""Walkthrough 2: test destructive migration, shipped with no marker.

Exercises the tightened proximity rule and the requirement that a break is
recorded whether or not its paperwork arrived. The marker string is not
written anywhere in this file, not even in prose. Delete before the branch is
closed; it must never reach main.

Revision ID: c3c3c3c3c3c3
Revises: fa4401ce1b92
Create Date: 2026-08-29

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c3c3c3c3c3c3"
down_revision: str | None = "fa4401ce1b92"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add and drop a test column, so the gate has a drop_column to find."""
    op.add_column(
        "users", sa.Column("walkthrough2_column", sa.String(), nullable=True)
    )
    op.drop_column("users", "walkthrough2_column")


def downgrade() -> None:
    """Restore the test column."""
    op.add_column(
        "users", sa.Column("walkthrough2_column", sa.String(), nullable=True)
    )
