"""add unique clinical lead per site constraint

Revision ID: 6b4cd8726e1f
Revises: 197844c56085
Create Date: 2026-05-22 12:18:43.980276

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "6b4cd8726e1f"
down_revision: Union[str, None] = "197844c56085"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_site_staff_one_clinical_lead",
        "site_staff_member",
        ["site_id"],
        unique=True,
        postgresql_where=sa.text("role = 'clinical_lead'"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_site_staff_one_clinical_lead",
        table_name="site_staff_member",
    )
