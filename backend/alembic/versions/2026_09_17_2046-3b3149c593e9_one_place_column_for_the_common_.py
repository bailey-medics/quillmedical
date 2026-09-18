"""one place column for the common competency shortlist

``site_common_competency`` carried ``site_id`` and ``organisation_id``
with a check constraint saying exactly one was set — a ward's shortlist,
with the trust's as a fallback. A trust is a place now, so the two
collapse into ``org_unit_id`` and the constraint goes with them: one
column says "exactly one" by existing.

Done in a single migration rather than expand-contract because no code
reads or writes this table yet — the picker it feeds is unbuilt — so no
serving revision depends on either column. The rows are carried across
all the same, in case a deployment has any.

Revision ID: 3b3149c593e9
Revises: 184d3bf70929
Create Date: 2026-09-17 20:46:09.294117

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3b3149c593e9"
down_revision: str | None = "184d3bf70929"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE = "site_common_competency"


def upgrade() -> None:
    op.add_column(TABLE, sa.Column("org_unit_id", sa.Integer(), nullable=True))

    # A site row already names a place. An organisation row names the
    # organisation's own row in the tree, which is the same list under
    # the id everything else uses.
    op.execute(
        sa.text(f"UPDATE {TABLE} SET org_unit_id = site_id")
    )  # noqa: S608
    op.execute(
        sa.text(
            f"UPDATE {TABLE} SET org_unit_id = organisations.org_unit_id "  # noqa: S608
            "FROM organisations "
            f"WHERE organisations.id = {TABLE}.organisation_id "  # noqa: S608
            f"AND {TABLE}.org_unit_id IS NULL"  # noqa: S608
        )
    )

    # Required from here. Every row is filled by the two statements
    # above — the check constraint being dropped below guaranteed one of
    # the two columns was set — so no default is needed, and none would
    # make sense for a foreign key.
    op.alter_column(
        TABLE,
        "org_unit_id",
        existing_type=sa.INTEGER(),
        nullable=False,
        server_default=None,
    )
    op.create_index(
        "ix_site_common_competency_org_unit_id",
        TABLE,
        ["org_unit_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_site_common_competency_org_unit_id",
        TABLE,
        "org_unit",
        ["org_unit_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_unique_constraint(
        "uq_site_common_competency_place",
        TABLE,
        ["org_unit_id", "competency_id"],
    )

    # migration-check: allow-destructive
    # The pair and the constraint that policed it. Their rows were
    # copied into the new column above.
    op.drop_constraint(
        "ck_site_common_competency_one_place", TABLE, type_="check"
    )
    # migration-check: allow-destructive
    op.drop_constraint("uq_site_common_competency_site", TABLE, type_="unique")
    # migration-check: allow-destructive
    op.drop_constraint("uq_site_common_competency_org", TABLE, type_="unique")
    # migration-check: allow-destructive
    op.drop_index("ix_site_common_competency_site_id", table_name=TABLE)
    # migration-check: allow-destructive
    op.drop_index(
        "ix_site_common_competency_organisation_id", table_name=TABLE
    )
    # migration-check: allow-destructive
    op.drop_constraint(
        "site_common_competency_site_id_fkey", TABLE, type_="foreignkey"
    )
    # migration-check: allow-destructive
    op.drop_constraint(
        "site_common_competency_organisation_id_fkey",
        TABLE,
        type_="foreignkey",
    )
    # migration-check: allow-destructive
    op.drop_column(TABLE, "site_id")
    # migration-check: allow-destructive
    op.drop_column(TABLE, "organisation_id")


def downgrade() -> None:
    op.add_column(TABLE, sa.Column("site_id", sa.INTEGER(), nullable=True))
    op.add_column(
        TABLE, sa.Column("organisation_id", sa.INTEGER(), nullable=True)
    )

    # A place that an organisation stands for goes back to the
    # organisation column; every other place was a site.
    op.execute(
        sa.text(
            f"UPDATE {TABLE} SET organisation_id = organisations.id "  # noqa: S608
            "FROM organisations "
            f"WHERE organisations.org_unit_id = {TABLE}.org_unit_id"  # noqa: S608
        )
    )
    op.execute(
        sa.text(
            f"UPDATE {TABLE} SET site_id = org_unit_id "  # noqa: S608
            "WHERE organisation_id IS NULL"
        )
    )

    op.create_foreign_key(
        "site_common_competency_site_id_fkey",
        TABLE,
        "org_unit",
        ["site_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "site_common_competency_organisation_id_fkey",
        TABLE,
        "organisations",
        ["organisation_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_site_common_competency_site_id", TABLE, ["site_id"], unique=False
    )
    op.create_index(
        "ix_site_common_competency_organisation_id",
        TABLE,
        ["organisation_id"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_site_common_competency_site", TABLE, ["site_id", "competency_id"]
    )
    op.create_unique_constraint(
        "uq_site_common_competency_org",
        TABLE,
        ["organisation_id", "competency_id"],
    )
    op.create_check_constraint(
        "ck_site_common_competency_one_place",
        TABLE,
        "(site_id IS NULL) <> (organisation_id IS NULL)",
    )

    op.drop_constraint(
        "uq_site_common_competency_place", TABLE, type_="unique"
    )
    op.drop_constraint(
        "fk_site_common_competency_org_unit_id", TABLE, type_="foreignkey"
    )
    op.drop_index("ix_site_common_competency_org_unit_id", table_name=TABLE)
    op.drop_column(TABLE, "org_unit_id")
