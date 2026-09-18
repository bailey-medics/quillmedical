"""drop the temporary site owner column

The contract half of moving ownership onto the tree. ``sites.parent_id``
now says who owns a place, and the organisation accountable for it is
found by walking up to the root, so the temporary owner column has
nothing left to say.

Kept apart from the migration that builds the tree, so the additive work
can go out first and this can follow a release later if the deploy calls
for it.

Revision ID: 7b41d0aa93c8
Revises: 4036207fe698
Create Date: 2026-09-16 13:25:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7b41d0aa93c8"
down_revision: str | None = "4036207fe698"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FK_NAME = "fk_sites_organisation_id_organisations"
ROOT_TYPE = "organisation"


def upgrade() -> None:
    op.drop_index(op.f("ix_sites_organisation_id"), table_name="sites")
    op.drop_constraint(  # migration-check: allow-destructive
        op.f(FK_NAME), "sites", type_="foreignkey"
    )
    op.drop_column(  # migration-check: allow-destructive
        "sites", "organisation_id"
    )


def downgrade() -> None:
    op.add_column(
        "sites",
        sa.Column(
            "organisation_id",
            sa.INTEGER(),
            autoincrement=False,
            nullable=True,
        ),
    )
    op.create_foreign_key(
        op.f(FK_NAME),
        "sites",
        "organisations",
        ["organisation_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        op.f("ix_sites_organisation_id"),
        "sites",
        ["organisation_id"],
        unique=False,
    )

    # Put the column back the way the tree answers it: walk each place up
    # to its root and read off the organisation that root stands for. A
    # ward three levels down had an owner before the tree existed, so
    # filling in only direct children would quietly lose it.
    op.get_bind().execute(
        sa.text(
            "WITH RECURSIVE tree AS ("
            "  SELECT id, id AS root FROM sites WHERE parent_id IS NULL"
            "  UNION ALL"
            "  SELECT s.id, t.root FROM sites s"
            "  JOIN tree t ON s.parent_id = t.id"
            ") "
            "UPDATE sites SET organisation_id = ("
            "  SELECT o.id FROM tree t"
            "  JOIN organisations o ON o.org_unit_id = t.root"
            "  WHERE t.id = sites.id"
            ") "
            "WHERE sites.type <> :type"
        ),
        {"type": ROOT_TYPE},
    )
