"""the place column gains its new name

The expand half of renaming ``site_id`` to ``org_unit_id``. The table it
points at is becoming ``org_unit``, so a column named after a site would
soon name nothing.

A column rename here is a copy-and-retire across deploys, because the old
revision and the new one run side by side against one schema. This step
adds the new column, fills it in, and starts writing both; a later step
switches every read across, and the one after that removes the old
column.

Both unique rules are in force meanwhile. That is the point: while both
columns hold the place, both have to refuse the same duplicates, or a row
the old rule would have stopped slips in under the new one.

Revision ID: 5e2f6ff0b0fb
Revises: 5b37c5a74902
Create Date: 2026-09-16 15:35:18.895930

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5e2f6ff0b0fb"
down_revision: str | None = "5b37c5a74902"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: Named so the downgrade can find them again. Autogenerate leaves a
#: foreign key unnamed, and an unnamed constraint cannot be dropped.
FK_NAMES = {
    "position": "fk_position_org_unit_id_sites",
    "practising_competency": "fk_practising_competency_org_unit_id_sites",
    "site_member": "fk_site_member_org_unit_id_sites",
}


def upgrade() -> None:
    op.add_column(
        "position", sa.Column("org_unit_id", sa.Integer(), nullable=True)
    )
    op.create_index(
        op.f("ix_position_org_unit_id"),
        "position",
        ["org_unit_id"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_position_org_unit_kind", "position", ["org_unit_id", "kind"]
    )
    op.create_foreign_key(
        FK_NAMES["position"],
        "position",
        "sites",
        ["org_unit_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.add_column(
        "practising_competency",
        sa.Column("org_unit_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        op.f("ix_practising_competency_org_unit_id"),
        "practising_competency",
        ["org_unit_id"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_practising_competency_org_unit",
        "practising_competency",
        ["user_id", "org_unit_id", "competency"],
    )
    op.create_foreign_key(
        FK_NAMES["practising_competency"],
        "practising_competency",
        "sites",
        ["org_unit_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.add_column(
        "site_member", sa.Column("org_unit_id", sa.Integer(), nullable=True)
    )
    op.create_foreign_key(
        FK_NAMES["site_member"],
        "site_member",
        "sites",
        ["org_unit_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # Fill in the new column for every row already there. The writes
    # from here on set both, so nothing arrives with only one.
    bind = op.get_bind()
    for table in ("practising_competency", "position", "site_member"):
        bind.execute(sa.text(f"UPDATE {table} SET org_unit_id = site_id"))


def downgrade() -> None:
    op.drop_constraint(  # migration-check: allow-destructive
        FK_NAMES["site_member"], "site_member", type_="foreignkey"
    )
    # migration-check: allow-destructive
    op.drop_column("site_member", "org_unit_id")
    op.drop_constraint(  # migration-check: allow-destructive
        FK_NAMES["practising_competency"],
        "practising_competency",
        type_="foreignkey",
    )
    op.drop_constraint(  # migration-check: allow-destructive
        "uq_practising_competency_org_unit",
        "practising_competency",
        type_="unique",
    )
    op.drop_index(
        op.f("ix_practising_competency_org_unit_id"),
        table_name="practising_competency",
    )
    # migration-check: allow-destructive
    op.drop_column("practising_competency", "org_unit_id")
    op.drop_constraint(  # migration-check: allow-destructive
        FK_NAMES["position"], "position", type_="foreignkey"
    )
    op.drop_constraint(  # migration-check: allow-destructive
        "uq_position_org_unit_kind", "position", type_="unique"
    )
    op.drop_index(op.f("ix_position_org_unit_id"), table_name="position")
    # migration-check: allow-destructive
    op.drop_column("position", "org_unit_id")
