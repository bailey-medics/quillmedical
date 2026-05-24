"""add is_active to sites table

Revision ID: 2e24f1879e51
Revises: 6b4cd8726e1f
Create Date: 2026-05-24 13:58:56.887650

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "2e24f1879e51"
down_revision: Union[str, None] = "6b4cd8726e1f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sites",
        sa.Column(
            "is_active", sa.Boolean(), server_default="true", nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_column("sites", "is_active")
