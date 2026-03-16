"""Add org-scoped access models.

- fhir_patient_id on users
- external_patient_access table
- message_organisation association table

Revision ID: org001
Revises: msg002
Create Date: 2026-03-15 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "org001"
down_revision: Union[str, None] = "msg002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # fhir_patient_id on users
    op.add_column(
        "users",
        sa.Column(
            "fhir_patient_id",
            sa.String(255),
            nullable=True,
            unique=True,
        ),
    )

    # external_patient_access
    op.create_table(
        "external_patient_access",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "patient_id",
            sa.String(255),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "granted_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "revoked_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "access_level",
            sa.String(20),
            server_default="full",
            nullable=False,
        ),
        sa.UniqueConstraint(
            "user_id", "patient_id", name="uq_external_user_patient"
        ),
    )

    # message_organisation association table
    op.create_table(
        "message_organisation",
        sa.Column(
            "conversation_id",
            sa.Integer(),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "organisation_id",
            sa.Integer(),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            primary_key=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("message_organisation")
    op.drop_table("external_patient_access")
    op.drop_column("users", "fhir_patient_id")
