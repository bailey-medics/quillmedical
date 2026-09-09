"""rename organisation staff to members with a capacity

Not everyone in organisation_staff_member is staff. Registration puts
teaching delegates there so that anything outside teaching can find them,
and with only two columns nothing could tell a student from a consultant —
so the organisation admin page listed them together, and the messaging
self-join check had to fall back on asking what platform level someone held.

Written by hand. Autogenerate proposed create_table plus drop_table, which
would have discarded every row: it reads a rename as one table appearing and
another disappearing. The same trap as the site_member rename.

The backfill marks a row as trainee when that person is a trainee at a site
belonging to that same organisation. Scoped to the organisation deliberately
— someone may be a trainee at one trust and staff at another, and marking
both rows from a single site membership would take away access they should
keep. Existing rows say staff, because they were added when the table meant
staff and those people are staff. That is a statement about history, not a
default: once the backfill is done the column's default becomes trainee, so
any later insert that omits a capacity is least-privileged. A row wrongly
marked trainee loses access and someone complains; a row wrongly marked
staff keeps access nobody notices.

Postgres does not rename a table's auto-named constraints, so the primary
key and both foreign keys are renamed explicitly.

Revision ID: f496e9ff5bad
Revises: 65eb4f784273
Create Date: 2026-09-09 15:40:03.293241

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f496e9ff5bad"
down_revision: str | None = "65eb4f784273"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Rename in place, keeping every row, and mark the trainees."""
    op.add_column(
        "organisation_staff_member",
        sa.Column(
            "capacity",
            sa.String(length=50),
            nullable=False,
            server_default="staff",
        ),
    )

    op.execute(
        "UPDATE organisation_staff_member SET capacity = 'trainee' "
        "WHERE (organisation_id, user_id) IN ("
        "  SELECT os.organisation_id, sm.user_id"
        "  FROM site_member sm"
        "  JOIN organisation_site os ON os.site_id = sm.site_id"
        "  WHERE sm.capacity = 'trainee'"
        ")"
    )

    # Existing rows were added when the table meant "staff", so staff is
    # what they say. From here on the default is the narrower capacity, so
    # anything inserted without one is least-privileged rather than
    # silently granted staff access.
    op.alter_column(
        "organisation_staff_member",
        "capacity",
        server_default="trainee",
    )

    op.rename_table("organisation_staff_member", "organisation_member")

    op.execute(
        "ALTER TABLE organisation_member RENAME CONSTRAINT "
        "organisation_staff_member_pkey TO organisation_member_pkey"
    )
    op.execute(
        "ALTER TABLE organisation_member RENAME CONSTRAINT "
        "organisation_staff_member_organisation_id_fkey "
        "TO organisation_member_organisation_id_fkey"
    )
    op.execute(
        "ALTER TABLE organisation_member RENAME CONSTRAINT "
        "organisation_staff_member_user_id_fkey "
        "TO organisation_member_user_id_fkey"
    )


def downgrade() -> None:
    """Reverse the rename and drop the column.

    The trainee marking is lost, because the old table has nowhere to record
    it. It is recoverable from site_member, which is where it came from.
    """
    op.execute(
        "ALTER TABLE organisation_member RENAME CONSTRAINT "
        "organisation_member_user_id_fkey "
        "TO organisation_staff_member_user_id_fkey"
    )
    op.execute(
        "ALTER TABLE organisation_member RENAME CONSTRAINT "
        "organisation_member_organisation_id_fkey "
        "TO organisation_staff_member_organisation_id_fkey"
    )
    op.execute(
        "ALTER TABLE organisation_member RENAME CONSTRAINT "
        "organisation_member_pkey TO organisation_staff_member_pkey"
    )

    op.rename_table("organisation_member", "organisation_staff_member")

    # migration-check: allow-destructive
    # Dropping a column this migration itself added, on the way back to the
    # shape that preceded it.
    op.drop_column("organisation_staff_member", "capacity")
