"""point features patients and conversations at places

Features, patient lists and the organisations on a conversation all named
an organisation. They now name that organisation's own row in the tree,
which is the same thing said in the tree's terms.

**The columns are renamed rather than quietly repointed.** They hold a
different number than they used to, so a call site that had not been
moved across would have matched a different place without saying so.
Renaming makes the missed one fail loudly instead.

Additive only: the old columns stay, and the contract migration that
follows removes them.

Revision ID: f5a6b7c8d9e0
Revises: 4d6f4568dede
Create Date: 2026-09-16 14:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f5a6b7c8d9e0"
down_revision: str | None = "4d6f4568dede"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: Each table with the delete rule its old organisation column carried,
#: so the move changes where the column points and nothing else.
TABLES: tuple[tuple[str, str | None], ...] = (
    ("organisation_features", "CASCADE"),
    ("organisation_patient_member", None),
    ("message_organisation", "CASCADE"),
)


def upgrade() -> None:
    bind = op.get_bind()

    for table, ondelete in TABLES:
        op.add_column(
            table, sa.Column("org_unit_id", sa.Integer(), nullable=True)
        )
        op.create_foreign_key(
            f"fk_{table}_org_unit_id_sites",
            table,
            "sites",
            ["org_unit_id"],
            ["id"],
            ondelete=ondelete,
        )
        bind.execute(
            sa.text(
                f"UPDATE {table} SET org_unit_id = ("
                "  SELECT o.org_unit_id FROM organisations o"
                f"  WHERE o.id = {table}.organisation_id"
                ")"
            )
        )
        stranded = bind.execute(
            sa.text(f"SELECT COUNT(*) FROM {table} WHERE org_unit_id IS NULL")
        ).scalar_one()
        if stranded:
            raise RuntimeError(
                f"{stranded} row(s) in {table} name an organisation with no "
                "row in the tree. Every organisation should have one; check "
                "for rows pointing at an organisation that has been deleted, "
                "and remove them before migrating."
            )

    op.create_index(
        op.f("ix_organisation_features_org_unit_id"),
        "organisation_features",
        ["org_unit_id"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_org_unit_feature",
        "organisation_features",
        ["org_unit_id", "feature_key"],
    )
    op.create_check_constraint(
        "ck_organisation_features_place_required",
        "organisation_features",
        "org_unit_id IS NOT NULL",
    )


def downgrade() -> None:
    op.drop_constraint(  # migration-check: allow-destructive
        "ck_organisation_features_place_required",
        "organisation_features",
        type_="check",
    )
    op.drop_constraint(  # migration-check: allow-destructive
        "uq_org_unit_feature", "organisation_features", type_="unique"
    )
    op.drop_index(
        op.f("ix_organisation_features_org_unit_id"),
        table_name="organisation_features",
    )
    for table, _ondelete in TABLES:
        op.drop_constraint(  # migration-check: allow-destructive
            f"fk_{table}_org_unit_id_sites", table, type_="foreignkey"
        )
        # migration-check: allow-destructive
        op.drop_column(table, "org_unit_id")
