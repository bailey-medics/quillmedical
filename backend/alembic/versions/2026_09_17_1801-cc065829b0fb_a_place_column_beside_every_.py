"""a place column beside every organisation column

The expand step of moving teaching and the passport off organisation
ids. Each of these tables answers "which organisation?" with a row id
from ``organisations``, a table that is going: an organisation is a place
at the top of a tree, and a place id is the only id there will be.

The new column is nullable for exactly as long as the move takes. Every
existing row is backfilled here, the application writes both columns from
this deploy, reads switch to the new one in the next, and the old column
is dropped in the one after that.

Revision ID: cc065829b0fb
Revises: 2c9a41b7e8d3
Create Date: 2026-09-17 18:01:50.004637

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "cc065829b0fb"
down_revision: str | None = "2c9a41b7e8d3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: Every table whose ``organisation_id`` is being joined by a place id.
TABLES = (
    "assessments",
    "module_media_link",
    "passport_assessor_registration_verification",
    "question_bank_configs",
    "question_bank_items",
    "question_bank_org_status",
    "question_bank_syncs",
    "teaching_org_settings",
)


def upgrade() -> None:
    """Add the place column, and fill it in for every existing row."""
    for table in TABLES:
        op.add_column(
            table, sa.Column("org_unit_id", sa.Integer(), nullable=True)
        )
        op.create_index(
            f"ix_{table}_org_unit_id", table, ["org_unit_id"], unique=False
        )
        op.create_foreign_key(
            f"fk_{table}_org_unit_id",
            table,
            "org_unit",
            ["org_unit_id"],
            ["id"],
            ondelete="CASCADE",
        )
        # Each organisation already names its own place, so the backfill
        # is a join rather than a guess. Rows written between this
        # migration and the deploy that follows it carry both columns,
        # because that deploy is the one that starts writing the new one.
        op.execute(
            sa.text(
                f"UPDATE {table} SET org_unit_id = organisations.org_unit_id "
                f"FROM organisations "
                f"WHERE organisations.id = {table}.organisation_id"
            )
        )


def downgrade() -> None:
    """Take the place column away again, leaving the organisation one."""
    for table in reversed(TABLES):
        op.drop_constraint(
            f"fk_{table}_org_unit_id", table, type_="foreignkey"
        )
        op.drop_index(f"ix_{table}_org_unit_id", table_name=table)
        op.drop_column(table, "org_unit_id")
