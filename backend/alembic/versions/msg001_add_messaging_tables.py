"""Add messaging tables.

Revision ID: msg001
Revises: 4c072d8106a9
Create Date: 2025-01-01 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "msg001"
down_revision: Union[str, None] = "4c072d8106a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "fhir_conversation_id",
            sa.String(length=64),
            nullable=False,
        ),
        sa.Column("patient_id", sa.String(length=64), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=True),
        sa.Column(
            "status",
            sa.String(length=32),
            server_default="new",
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_conversations_fhir_conversation_id",
        "conversations",
        ["fhir_conversation_id"],
        unique=True,
    )
    op.create_index(
        "ix_conversations_patient_id",
        "conversations",
        ["patient_id"],
    )

    op.create_table(
        "conversation_participants",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column(
            "role",
            sa.String(length=32),
            server_default="participant",
            nullable=False,
        ),
        sa.Column(
            "joined_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_read_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "conversation_id",
            "user_id",
            name="uq_conversation_participant",
        ),
    )
    op.create_index(
        "ix_conversation_participants_conversation_id",
        "conversation_participants",
        ["conversation_id"],
    )
    op.create_index(
        "ix_conversation_participants_user_id",
        "conversation_participants",
        ["user_id"],
    )

    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "fhir_communication_id",
            sa.String(length=64),
            nullable=False,
        ),
        sa.Column("conversation_id", sa.Integer(), nullable=False),
        sa.Column("sender_id", sa.Integer(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("amends_id", sa.Integer(), nullable=True),
        sa.Column("redacted_at", sa.DateTime(), nullable=True),
        sa.Column("redacted_by_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"],
            ["conversations.id"],
        ),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["amends_id"], ["messages.id"]),
        sa.ForeignKeyConstraint(["redacted_by_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_messages_fhir_communication_id",
        "messages",
        ["fhir_communication_id"],
        unique=True,
    )
    op.create_index(
        "ix_messages_conversation_id",
        "messages",
        ["conversation_id"],
    )


def downgrade() -> None:
    op.drop_table("messages")
    op.drop_table("conversation_participants")
    op.drop_table("conversations")
