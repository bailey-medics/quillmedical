"""add_cbac_fields_to_users

Revision ID: cbac001
Revises: bdb2df886116
Create Date: 2026-02-11 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "cbac001"
down_revision: Union[str, None] = "bdb2df886116"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add CBAC (Competency-Based Access Control) fields to users table."""
    # Add base_profession column with default value "patient"
    op.add_column(
        "users",
        sa.Column(
            "base_profession",
            sa.String(length=100),
            nullable=False,
            server_default="patient",
        ),
    )

    # Add additional_competencies as JSON array
    op.add_column(
        "users",
        sa.Column(
            "additional_competencies",
            postgresql.JSON(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )

    # Add removed_competencies as JSON array
    op.add_column(
        "users",
        sa.Column(
            "removed_competencies",
            postgresql.JSON(astext_type=sa.Text()),
            nullable=False,
            server_default="[]",
        ),
    )

    # Add professional_registrations as JSON (nullable)
    op.add_column(
        "users",
        sa.Column(
            "professional_registrations",
            postgresql.JSON(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Remove CBAC fields from users table."""
    op.drop_column("users", "professional_registrations")
    op.drop_column("users", "removed_competencies")
    op.drop_column("users", "additional_competencies")
    op.drop_column("users", "base_profession")
