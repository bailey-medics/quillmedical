"""add_patient_metadata_table

Revision ID: pm001
Revises: 65817fed5f7a
Create Date: 2026-02-19 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "pm001"
down_revision: Union[str, None] = "65817fed5f7a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create patient_metadata table.

    This table stores application-specific metadata for patients, including
    activation status. Patient data is stored in FHIR, but this table tracks
    Quill Medical-specific attributes.

    Fields:
        - id: Primary key
        - patient_id: FHIR Patient resource ID (unique, indexed)
        - is_active: Whether patient is active (default: true)
    """
    op.create_table(
        "patient_metadata",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("patient_id", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("patient_id"),
    )
    op.create_index(
        op.f("ix_patient_metadata_patient_id"),
        "patient_metadata",
        ["patient_id"],
        unique=True,
    )


def downgrade() -> None:
    """Drop patient_metadata table."""
    op.drop_index(
        op.f("ix_patient_metadata_patient_id"), table_name="patient_metadata"
    )
    op.drop_table("patient_metadata")
