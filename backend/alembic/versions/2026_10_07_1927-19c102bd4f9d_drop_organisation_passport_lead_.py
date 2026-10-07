"""drop organisation passport lead specialties

Revision ID: 19c102bd4f9d
Revises: df9cdddba0b2
Create Date: 2026-10-07 19:27:37.572048

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "19c102bd4f9d"
down_revision: str | None = "df9cdddba0b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The lead specialties an organisation named while a passport holder
    # chose a specialty. Frameworks replaced specialties, and an
    # organisation's lead frameworks live in org_unit_passport_framework.
    # No row here could be carried across: each names a specialty, and
    # no specialty is a framework. Nothing reads the table any more.
    op.drop_index(
        op.f("ix_org_unit_passport_specialty_org_unit_id"),
        table_name="org_unit_passport_specialty",
    )
    # migration-check: allow-destructive
    op.drop_table("org_unit_passport_specialty")


def downgrade() -> None:
    op.create_table(
        "org_unit_passport_specialty",
        sa.Column("id", sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column(
            "org_unit_id", sa.INTEGER(), autoincrement=False, nullable=False
        ),
        sa.Column(
            "specialty_id",
            sa.VARCHAR(length=100),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column(
            "position", sa.INTEGER(), autoincrement=False, nullable=False
        ),
        sa.Column("set_by", sa.INTEGER(), autoincrement=False, nullable=True),
        sa.Column(
            "set_at",
            postgresql.TIMESTAMP(timezone=True),
            autoincrement=False,
            nullable=False,
        ),
        sa.CheckConstraint(
            '"position" >= 1',
            name=op.f("ck_org_unit_passport_specialty_position"),
        ),
        sa.ForeignKeyConstraint(
            ["org_unit_id"],
            ["org_unit.id"],
            name=op.f("org_unit_passport_specialty_org_unit_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["set_by"],
            ["users.id"],
            name=op.f("org_unit_passport_specialty_set_by_fkey"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint(
            "id", name=op.f("org_unit_passport_specialty_pkey")
        ),
        sa.UniqueConstraint(
            "org_unit_id",
            "position",
            name=op.f("uq_org_unit_passport_specialty_unit_position"),
        ),
        sa.UniqueConstraint(
            "org_unit_id",
            "specialty_id",
            name=op.f("uq_org_unit_passport_specialty_unit_specialty"),
        ),
    )
    op.create_index(
        op.f("ix_org_unit_passport_specialty_org_unit_id"),
        "org_unit_passport_specialty",
        ["org_unit_id"],
        unique=False,
    )
