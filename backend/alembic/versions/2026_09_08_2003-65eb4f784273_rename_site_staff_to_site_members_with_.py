"""rename site staff to site members with a capacity

site_staff_member was a lie about a third of its rows: register, the public
self-registration route, inserts teaching delegates, who are not employed by
the site. One membership table per place, and a capacity column saying what
kind of member.

clinical_lead stops being a capacity. It is a post, held in position and
position_holding, and the earlier backfill already created one for every
site that had a lead — so those rows become plain staff members here rather
than losing anything.

Written by hand. Autogenerate proposed dropping and recreating the table,
which would have discarded every row: it sees a rename as an unrelated table
appearing and another disappearing.

Postgres does not rename a table's auto-named indexes and constraints, so
the primary key and both foreign keys are renamed explicitly. Without that,
autogenerate flags the leftovers for ever.

Revision ID: 65eb4f784273
Revises: 3cee6d2a6e3c
Create Date: 2026-09-08 20:03:22.836392

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "65eb4f784273"
down_revision: str | None = "3cee6d2a6e3c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Rename the table and column in place, keeping every row."""
    # The partial unique index is defined on role, so it goes first. One
    # lead per site is now max_holders on the post, which can also express
    # a vacancy and acting cover.
    op.drop_index(
        "ix_site_staff_one_clinical_lead", table_name="site_staff_member"
    )

    op.alter_column("site_staff_member", "role", new_column_name="capacity")

    # Anyone recorded as clinical lead is a member in the ordinary way; the
    # post records that they lead, and the earlier backfill created it.
    op.execute(
        "UPDATE site_staff_member SET capacity = 'staff' "
        "WHERE capacity = 'clinical_lead'"
    )

    op.rename_table("site_staff_member", "site_member")

    # Postgres keeps the old auto-generated names after a rename.
    op.execute(
        "ALTER TABLE site_member RENAME CONSTRAINT "
        "site_staff_member_pkey TO site_member_pkey"
    )
    op.execute(
        "ALTER TABLE site_member RENAME CONSTRAINT "
        "site_staff_member_site_id_fkey TO site_member_site_id_fkey"
    )
    op.execute(
        "ALTER TABLE site_member RENAME CONSTRAINT "
        "site_staff_member_user_id_fkey TO site_member_user_id_fkey"
    )


def downgrade() -> None:
    """Reverse the rename, restoring the column and the old index.

    Rows that were clinical leads came back as staff and cannot be told
    apart afterwards, so the lead is read back out of the post.
    """
    op.execute(
        "ALTER TABLE site_member RENAME CONSTRAINT "
        "site_member_user_id_fkey TO site_staff_member_user_id_fkey"
    )
    op.execute(
        "ALTER TABLE site_member RENAME CONSTRAINT "
        "site_member_site_id_fkey TO site_staff_member_site_id_fkey"
    )
    op.execute(
        "ALTER TABLE site_member RENAME CONSTRAINT "
        "site_member_pkey TO site_staff_member_pkey"
    )

    op.rename_table("site_member", "site_staff_member")

    op.alter_column("site_staff_member", "capacity", new_column_name="role")

    op.execute(
        "UPDATE site_staff_member SET role = 'clinical_lead' "
        "WHERE (site_id, user_id) IN ("
        "  SELECT p.site_id, h.user_id"
        "  FROM position p"
        "  JOIN position_holding h ON h.position_id = p.id"
        "  WHERE p.kind = 'clinical_lead'"
        "    AND p.site_id IS NOT NULL"
        "    AND h.is_acting = false"
        "    AND h.ended_on IS NULL"
        ")"
    )

    op.create_index(
        "ix_site_staff_one_clinical_lead",
        "site_staff_member",
        ["site_id"],
        unique=True,
        postgresql_where=sa.text("role = 'clinical_lead'"),
        sqlite_where=sa.text("role = 'clinical_lead'"),
    )
