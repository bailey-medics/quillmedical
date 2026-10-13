"""record when an account was emptied, and let it lose its profession

Revision ID: e606412a820c
Revises: 266b9e37a717
Create Date: 2026-10-13 18:52:22.023305

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e606412a820c"
down_revision: str | None = "266b9e37a717"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("emptied_at", sa.DateTime(timezone=True), nullable=True),
    )
    # An emptied account keeps no profession: what kind of work its owner
    # did could help identify them. Every live account still has one.
    op.alter_column(
        "users",
        "base_profession",
        existing_type=sa.String(length=100),
        nullable=True,
    )


def downgrade() -> None:
    # The column must be filled before it can be required again. An
    # emptied account had its profession wiped, and "patient" is what a
    # new account is given when none is said.
    op.execute(
        "UPDATE users SET base_profession = 'patient' "
        "WHERE base_profession IS NULL"
    )
    op.alter_column(
        "users",
        "base_profession",
        existing_type=sa.String(length=100),
        nullable=False,
    )
    op.drop_column("users", "emptied_at")
