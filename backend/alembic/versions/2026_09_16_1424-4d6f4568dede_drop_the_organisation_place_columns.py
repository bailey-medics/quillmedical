"""drop the organisation place columns

The last of three steps. The rows all name a place in the tree now, so
the column that named an organisation instead has nothing left to say.

The downgrade puts the columns back and fills them in from the tree, so
the pair reads as it did: a row whose place is an organisation's own row
names that organisation again.

Revision ID: 4d6f4568dede
Revises: e3f4a5b6c7d8
Create Date: 2026-09-16 14:24:34.439286

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4d6f4568dede"
down_revision: str | None = "e3f4a5b6c7d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(  # migration-check: allow-destructive
        op.f("position_organisation_id_fkey"), "position", type_="foreignkey"
    )
    # migration-check: allow-destructive
    op.drop_column("position", "organisation_id")
    op.drop_index(
        op.f("ix_practising_competency_org"),
        table_name="practising_competency",
    )
    op.drop_constraint(  # migration-check: allow-destructive
        op.f("practising_competency_organisation_id_fkey"),
        "practising_competency",
        type_="foreignkey",
    )
    op.drop_column(  # migration-check: allow-destructive
        "practising_competency", "organisation_id"
    )


def downgrade() -> None:
    op.add_column(
        "practising_competency",
        sa.Column(
            "organisation_id", sa.INTEGER(), autoincrement=False, nullable=True
        ),
    )
    op.create_foreign_key(
        op.f("practising_competency_organisation_id_fkey"),
        "practising_competency",
        "organisations",
        ["organisation_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        op.f("ix_practising_competency_org"),
        "practising_competency",
        ["organisation_id", "competency"],
        unique=False,
    )
    op.add_column(
        "position",
        sa.Column(
            "organisation_id", sa.INTEGER(), autoincrement=False, nullable=True
        ),
    )
    op.create_foreign_key(
        op.f("position_organisation_id_fkey"),
        "position",
        "organisations",
        ["organisation_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # Name the organisation again wherever the place is an organisation's
    # own row in the tree. A place inside one keeps naming the place.
    bind = op.get_bind()
    for table in ("practising_competency", "position"):
        bind.execute(
            sa.text(
                f"UPDATE {table} SET organisation_id = ("
                "  SELECT o.id FROM organisations o"
                f"  WHERE o.org_unit_id = {table}.site_id"
                ")"
            )
        )
