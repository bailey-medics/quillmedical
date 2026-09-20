"""loosen the two place columns

The first of three steps giving practising competencies and positions one
place column instead of a pair.

Organisations and sites were different tables, so a row pointed at one or
the other and a check constraint policed that exactly one was set. They
are one table now, so the pair is a single column — but the check refuses
a row with both set, and the backfill has to set both for a moment. So it
goes first, together with the partial unique indexes that only existed
because one of the two columns was always NULL.

Nothing is lost here: both columns survive, and the downgrade puts the
rules back.

Revision ID: d2e3f4a5b6c7
Revises: b67dd52b5a6d
Create Date: 2026-09-16 14:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d2e3f4a5b6c7"
down_revision: str | None = "b67dd52b5a6d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(  # migration-check: allow-destructive
        "ck_practising_competency_one_place",
        "practising_competency",
        type_="check",
    )
    op.drop_constraint(  # migration-check: allow-destructive
        "ck_position_one_place", "position", type_="check"
    )
    op.drop_index(
        "uq_practising_competency_org", table_name="practising_competency"
    )
    op.drop_index(
        "uq_practising_competency_site", table_name="practising_competency"
    )
    op.drop_index("uq_position_org_kind", table_name="position")
    op.drop_index("uq_position_site_kind", table_name="position")


def downgrade() -> None:
    op.create_index(
        "uq_practising_competency_org",
        "practising_competency",
        ["user_id", "organisation_id", "competency"],
        unique=True,
        postgresql_where=sa.text("organisation_id IS NOT NULL"),
        sqlite_where=sa.text("organisation_id IS NOT NULL"),
    )
    op.create_index(
        "uq_practising_competency_site",
        "practising_competency",
        ["user_id", "site_id", "competency"],
        unique=True,
        postgresql_where=sa.text("site_id IS NOT NULL"),
        sqlite_where=sa.text("site_id IS NOT NULL"),
    )
    op.create_index(
        "uq_position_org_kind",
        "position",
        ["organisation_id", "kind"],
        unique=True,
        postgresql_where=sa.text("organisation_id IS NOT NULL"),
        sqlite_where=sa.text("organisation_id IS NOT NULL"),
    )
    op.create_index(
        "uq_position_site_kind",
        "position",
        ["site_id", "kind"],
        unique=True,
        postgresql_where=sa.text("site_id IS NOT NULL"),
        sqlite_where=sa.text("site_id IS NOT NULL"),
    )
    op.create_check_constraint(
        "ck_practising_competency_one_place",
        "practising_competency",
        "(organisation_id IS NOT NULL) <> (site_id IS NOT NULL)",
    )
    op.create_check_constraint(
        "ck_position_one_place",
        "position",
        "(organisation_id IS NOT NULL) <> (site_id IS NOT NULL)",
    )
