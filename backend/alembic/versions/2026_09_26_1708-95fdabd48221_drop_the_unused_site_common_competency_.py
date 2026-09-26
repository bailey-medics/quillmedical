"""drop the unused site common competency table

The table was built for a per-site "commonly used here" shortlist in the
passport's competency picker. Nothing ever wrote a row to it and no route
exposed it. The holder's own specialty, from ``shared/passport-specialties/``,
now orders the picker instead, and two ways of ordering one list would clash.

Revision ID: 95fdabd48221
Revises: 3fb0540ae00c
Create Date: 2026-09-26 17:08:21.794308

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "95fdabd48221"
down_revision: str | None = "3fb0540ae00c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index(
        op.f("ix_site_common_competency_org_unit_id"),
        table_name="site_common_competency",
    )
    # migration-check: allow-destructive
    #
    # The table has never held a row: no route or job ever wrote to it.
    op.drop_table("site_common_competency")


def downgrade() -> None:
    op.create_table(
        "site_common_competency",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("competency_id", sa.String(length=100), nullable=False),
        sa.Column(
            "position",
            sa.Integer(),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("org_unit_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["org_unit_id"],
            ["org_unit.id"],
            name=op.f("fk_site_common_competency_org_unit_id"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "id", name=op.f("site_common_competency_pkey")
        ),
        sa.UniqueConstraint(
            "org_unit_id",
            "competency_id",
            name=op.f("uq_site_common_competency_place"),
        ),
    )
    op.create_index(
        op.f("ix_site_common_competency_org_unit_id"),
        "site_common_competency",
        ["org_unit_id"],
        unique=False,
    )
