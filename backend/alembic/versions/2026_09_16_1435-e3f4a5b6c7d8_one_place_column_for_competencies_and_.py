"""one place column for competencies and positions

The second of three steps. Every row that named an organisation now names
that organisation's own row in the tree, which is where the one place
column points.

The place is required, and said so by a check constraint rather than by
making the column NOT NULL. A NOT NULL column added to a populated table
has to carry a server default, and there is no sensible default for the
id of a place — so the rule is written as a constraint, which says the
same thing and needs no default.

The unique rules come back as ordinary constraints. They were two partial
indexes each, because one of the two place columns was always NULL and SQL
treats NULLs as distinct, so a constraint over all the columns never fired.

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-09-16 14:35:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e3f4a5b6c7d8"
down_revision: str | None = "d2e3f4a5b6c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BACKFILL = (
    "UPDATE {table} SET site_id = ("
    "  SELECT o.org_unit_id FROM organisations o"
    "  WHERE o.id = {table}.organisation_id"
    ") "
    "WHERE {table}.organisation_id IS NOT NULL "
    "AND {table}.site_id IS NULL"
)

STRANDED = "SELECT COUNT(*) FROM {table} WHERE site_id IS NULL"


def upgrade() -> None:
    bind = op.get_bind()

    for table in ("practising_competency", "position"):
        bind.execute(sa.text(BACKFILL.format(table=table)))

        stranded = bind.execute(
            sa.text(STRANDED.format(table=table))
        ).scalar_one()
        if stranded:
            raise RuntimeError(
                f"{stranded} row(s) in {table} name no place that exists in "
                "the tree. Every organisation should have a row there; check "
                "for rows pointing at an organisation that has been deleted, "
                "and remove them before migrating."
            )

    op.create_unique_constraint(
        "uq_practising_competency_place",
        "practising_competency",
        ["user_id", "site_id", "competency"],
    )
    op.create_unique_constraint(
        "uq_position_place_kind", "position", ["site_id", "kind"]
    )
    op.create_check_constraint(
        "ck_practising_competency_place_required",
        "practising_competency",
        "site_id IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_position_place_required", "position", "site_id IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_constraint(  # migration-check: allow-destructive
        "ck_practising_competency_place_required",
        "practising_competency",
        type_="check",
    )
    op.drop_constraint(  # migration-check: allow-destructive
        "ck_position_place_required", "position", type_="check"
    )
    op.drop_constraint(  # migration-check: allow-destructive
        "uq_practising_competency_place",
        "practising_competency",
        type_="unique",
    )
    op.drop_constraint(  # migration-check: allow-destructive
        "uq_position_place_kind", "position", type_="unique"
    )

    # Put the rows that named an organisation back the way they were, so
    # the pair of columns is once again exactly one of the two.
    bind = op.get_bind()
    for table in ("practising_competency", "position"):
        bind.execute(
            sa.text(
                f"UPDATE {table} SET site_id = NULL "
                f"WHERE {table}.organisation_id IS NOT NULL"
            )
        )
