"""drop the old place column

The contract half of renaming ``site_id`` to ``org_unit_id``. Every read
moved across in the previous deploy and nothing writes the old name any
more, so it goes — along with the rules that were written in terms of it.

Three tables lose the column. The membership table keys on the place, so
its primary key moves across too; Postgres marks a new key's columns NOT
NULL itself, which is what makes the place required without a server
default that would make no sense for an id.

The downgrade puts the column, the key and the rules back and fills the
values in from the new column, so nothing is lost by going back a step.

Revision ID: 13db821d08b5
Revises: 5e2f6ff0b0fb
Create Date: 2026-09-16 16:01:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "13db821d08b5"
down_revision: str | None = "5e2f6ff0b0fb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # --- the membership table keys on the place ---
    op.drop_constraint(  # migration-check: allow-destructive
        "site_member_pkey", "site_member", type_="primary"
    )
    op.create_primary_key(
        "site_member_pkey", "site_member", ["org_unit_id", "user_id"]
    )
    op.drop_constraint(  # migration-check: allow-destructive
        "site_member_site_id_fkey", "site_member", type_="foreignkey"
    )
    # migration-check: allow-destructive
    op.drop_column("site_member", "site_id")

    # --- what may be practised where ---
    op.drop_constraint(  # migration-check: allow-destructive
        "ck_practising_competency_place_required",
        "practising_competency",
        type_="check",
    )
    op.create_check_constraint(
        "ck_practising_competency_place_required",
        "practising_competency",
        "org_unit_id IS NOT NULL",
    )
    op.drop_constraint(  # migration-check: allow-destructive
        "uq_practising_competency_place",
        "practising_competency",
        type_="unique",
    )
    op.drop_index(
        "ix_practising_competency_site", table_name="practising_competency"
    )
    # Replaces both the single-column index added alongside the new name
    # and the pair the old name carried: one index answering "who here may
    # practise this" is enough.
    op.drop_index(
        op.f("ix_practising_competency_org_unit_id"),
        table_name="practising_competency",
    )
    op.create_index(
        "ix_practising_competency_org_unit",
        "practising_competency",
        ["org_unit_id", "competency"],
        unique=False,
    )
    op.drop_constraint(  # migration-check: allow-destructive
        "practising_competency_site_id_fkey",
        "practising_competency",
        type_="foreignkey",
    )
    # migration-check: allow-destructive
    op.drop_column("practising_competency", "site_id")

    # --- the posts a place holds ---
    op.drop_constraint(  # migration-check: allow-destructive
        "ck_position_place_required", "position", type_="check"
    )
    op.create_check_constraint(
        "ck_position_place_required", "position", "org_unit_id IS NOT NULL"
    )
    op.drop_constraint(  # migration-check: allow-destructive
        "uq_position_place_kind", "position", type_="unique"
    )
    op.drop_constraint(  # migration-check: allow-destructive
        "position_site_id_fkey", "position", type_="foreignkey"
    )
    # migration-check: allow-destructive
    op.drop_column("position", "site_id")


def downgrade() -> None:
    bind = op.get_bind()

    for table, fk_name in (
        ("position", "position_site_id_fkey"),
        ("practising_competency", "practising_competency_site_id_fkey"),
        ("site_member", "site_member_site_id_fkey"),
    ):
        op.add_column(table, sa.Column("site_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            fk_name, table, "sites", ["site_id"], ["id"], ondelete="CASCADE"
        )
        bind.execute(sa.text(f"UPDATE {table} SET site_id = org_unit_id"))

    op.create_unique_constraint(
        "uq_position_place_kind", "position", ["site_id", "kind"]
    )
    op.drop_constraint(  # migration-check: allow-destructive
        "ck_position_place_required", "position", type_="check"
    )
    op.create_check_constraint(
        "ck_position_place_required", "position", "site_id IS NOT NULL"
    )

    op.create_unique_constraint(
        "uq_practising_competency_place",
        "practising_competency",
        ["user_id", "site_id", "competency"],
    )
    op.drop_index(
        "ix_practising_competency_org_unit",
        table_name="practising_competency",
    )
    op.create_index(
        "ix_practising_competency_site",
        "practising_competency",
        ["site_id", "competency"],
        unique=False,
    )
    op.create_index(
        op.f("ix_practising_competency_org_unit_id"),
        "practising_competency",
        ["org_unit_id"],
        unique=False,
    )
    op.drop_constraint(  # migration-check: allow-destructive
        "ck_practising_competency_place_required",
        "practising_competency",
        type_="check",
    )
    op.create_check_constraint(
        "ck_practising_competency_place_required",
        "practising_competency",
        "site_id IS NOT NULL",
    )

    op.drop_constraint(  # migration-check: allow-destructive
        "site_member_pkey", "site_member", type_="primary"
    )
    op.create_primary_key(
        "site_member_pkey", "site_member", ["site_id", "user_id"]
    )
