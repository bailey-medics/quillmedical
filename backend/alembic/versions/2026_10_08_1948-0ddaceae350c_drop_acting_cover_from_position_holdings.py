"""drop acting cover from position holdings

Revision ID: 0ddaceae350c
Revises: 19c102bd4f9d
Create Date: 2026-10-08 19:48:57.465402

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0ddaceae350c"
down_revision: str | None = "19c102bd4f9d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Whether a holding was temporary cover for somebody on leave. Nothing
    # ever set it: no route passed it and no page showed it, so every row
    # holds false and dropping the column loses no information.
    # migration-check: allow-destructive
    op.drop_column("position_holding", "is_acting")


def downgrade() -> None:
    # Every row was false, so false restores exactly what was there. The
    # server default is what lets a NOT NULL column be added to a table
    # that already has rows.
    op.add_column(
        "position_holding",
        sa.Column(
            "is_acting",
            sa.BOOLEAN(),
            server_default=sa.false(),
            autoincrement=False,
            nullable=False,
        ),
    )
