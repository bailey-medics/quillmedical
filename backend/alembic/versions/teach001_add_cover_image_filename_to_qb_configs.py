"""Add cover_image_filename to question_bank_configs.

Revision ID: teach001
Revises: 7a44a91ac55a
Create Date: 2026-06-13
"""

from alembic import op
import sqlalchemy as sa

revision = "teach001"
down_revision = "org002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "question_bank_configs",
        sa.Column("cover_image_filename", sa.String(255), nullable=True),
    )
    op.add_column(
        "question_bank_configs",
        sa.Column("cover_image_focus", sa.String(50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("question_bank_configs", "cover_image_focus")
    op.drop_column("question_bank_configs", "cover_image_filename")
