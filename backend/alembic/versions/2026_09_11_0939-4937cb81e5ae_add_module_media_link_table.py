"""add module media link table

Links an MDX media reference to an uploaded file, per organisation.

The reference in the content repository is a stable key rather than a
filename, so the mapping between the two has to be stored: it cannot be
derived, because media arrives through the admin upload UI rather than
the content repository. Unique on (organisation, question bank, key) —
one video per reference.

Purely additive. No existing row is touched and nothing is dropped.

Revision ID: 4937cb81e5ae
Revises: f496e9ff5bad
Create Date: 2026-09-11 09:39:51.488062

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4937cb81e5ae"
down_revision: str | None = "f496e9ff5bad"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "module_media_link",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("organisation_id", sa.Integer(), nullable=False),
        sa.Column("question_bank_id", sa.String(length=255), nullable=False),
        sa.Column("media_key", sa.String(length=255), nullable=False),
        sa.Column("asset_id", sa.String(length=64), nullable=False),
        sa.Column("original_filename", sa.String(length=500), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("uploaded_by", sa.Integer(), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["organisation_id"], ["organisations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organisation_id",
            "question_bank_id",
            "media_key",
            name="uq_module_media_link_org_bank_key",
        ),
    )
    op.create_index(
        op.f("ix_module_media_link_organisation_id"),
        "module_media_link",
        ["organisation_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_module_media_link_organisation_id"),
        table_name="module_media_link",
    )
    op.drop_table("module_media_link")
