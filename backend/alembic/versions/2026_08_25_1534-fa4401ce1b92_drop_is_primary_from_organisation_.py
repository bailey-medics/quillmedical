"""drop is_primary from organisation membership tables

Revision ID: fa4401ce1b92
Revises: 878bc9300d4f
Create Date: 2026-08-25 15:34:35.603696

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "fa4401ce1b92"
down_revision: str | None = "878bc9300d4f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # migration-check: allow-destructive
    op.drop_column("organisation_patient_member", "is_primary")
    # migration-check: allow-destructive
    op.drop_column("organisation_staff_member", "is_primary")


def downgrade() -> None:
    op.add_column(
        "organisation_staff_member",
        sa.Column(
            "is_primary",
            sa.BOOLEAN(),
            server_default=sa.false(),
            autoincrement=False,
            nullable=False,
        ),
    )
    op.add_column(
        "organisation_patient_member",
        sa.Column(
            "is_primary",
            sa.BOOLEAN(),
            server_default=sa.false(),
            autoincrement=False,
            nullable=False,
        ),
    )
