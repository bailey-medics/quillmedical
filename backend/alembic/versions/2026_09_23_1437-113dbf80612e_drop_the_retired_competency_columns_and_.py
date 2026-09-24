"""drop the retired competency columns and entitlement table

The contract half of moving competencies onto `user_competency` rows. The
two JSON lists on `users`, `additional_competencies` and
`removed_competencies`, and the `passport_write_entitlement` table have
all been replaced by rows: the lists by grant and removal rows, the table
by the `ends_on` of a `passport_write` grant. Every row was copied by
`61e9c9b15ac6`, nothing has read either store since the switch to rows,
and nothing has written them since the change after that.

`26434c1eb0a4`, the revision before this, took both columns out of every
statement the application sends, so the revision still serving while
this runs is not broken by it. Nothing queries the table at all.

Approved as a destructive change on 23 September 2026. See
docs/docs/plans/2026-09-23-user-competency-table-plan.md.

Revision ID: 113dbf80612e
Revises: 26434c1eb0a4
Create Date: 2026-09-23 14:37:44.462268

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "113dbf80612e"
down_revision: str | None = "26434c1eb0a4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # migration-check: allow-destructive
    #
    # Replaced by dated `passport_write` rows in `user_competency`, which
    # carry the same start, end, source and org_unit. Nothing queries it.
    # Its indexes go with it.
    op.drop_table("passport_write_entitlement")
    # migration-check: allow-destructive
    #
    # Replaced by grant and removal rows in `user_competency`. Neither
    # column appears in any statement the application sends.
    op.drop_column("users", "removed_competencies")
    # migration-check: allow-destructive
    op.drop_column("users", "additional_competencies")


def downgrade() -> None:
    """Recreate the columns and the table, empty.

    The shape comes back and the data does not: both columns return as
    empty lists and the table with no rows. Everything they held is in
    `user_competency`, which this leaves alone, and the application of the
    previous revision reads only that.
    """
    op.add_column(
        "users",
        sa.Column(
            "additional_competencies",
            postgresql.JSON(astext_type=sa.Text()),
            server_default=sa.text("'[]'::json"),
            autoincrement=False,
            nullable=False,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "removed_competencies",
            postgresql.JSON(astext_type=sa.Text()),
            server_default=sa.text("'[]'::json"),
            autoincrement=False,
            nullable=False,
        ),
    )
    op.create_table(
        "passport_write_entitlement",
        sa.Column("id", sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column(
            "user_id", sa.INTEGER(), autoincrement=False, nullable=False
        ),
        sa.Column(
            "source",
            sa.VARCHAR(length=20),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column(
            "org_unit_id", sa.INTEGER(), autoincrement=False, nullable=True
        ),
        sa.Column(
            "starts_on",
            postgresql.TIMESTAMP(timezone=True),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column(
            "ends_on",
            postgresql.TIMESTAMP(timezone=True),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column(
            "created_at",
            postgresql.TIMESTAMP(timezone=True),
            autoincrement=False,
            nullable=False,
        ),
        sa.CheckConstraint(
            "source::text = ANY (ARRAY['organisation'::character varying, 'individual'::character varying]::text[])",
            name=op.f("ck_passport_write_entitlement_source"),
        ),
        sa.CheckConstraint(
            "ends_on > starts_on",
            name=op.f("ck_passport_write_entitlement_ends_after_start"),
        ),
        sa.ForeignKeyConstraint(
            ["org_unit_id"],
            ["org_unit.id"],
            name=op.f("passport_write_entitlement_org_unit_id_fkey"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("passport_write_entitlement_user_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint(
            "id", name=op.f("passport_write_entitlement_pkey")
        ),
    )
    op.create_index(
        op.f("ix_passport_write_entitlement_user_id"),
        "passport_write_entitlement",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_passport_write_entitlement_user_ends"),
        "passport_write_entitlement",
        ["user_id", "ends_on"],
        unique=False,
    )
    op.create_index(
        op.f("ix_passport_write_entitlement_org_unit_id"),
        "passport_write_entitlement",
        ["org_unit_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_passport_write_entitlement_ends_on"),
        "passport_write_entitlement",
        ["ends_on"],
        unique=False,
    )
