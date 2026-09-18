"""membership moves onto the place tree

Membership at an organisation and membership at a ward are the same fact
about the same person, so the two tables become one, keyed on a place in
the tree. An organisation's place is its own row — its root.

Two things happen here:

* ``site_member.capacity`` gains the ``trainee`` server default that
  ``organisation_member.capacity`` already had. Least privilege: an insert
  that forgets to say gets the narrower capacity. Without this the merge
  would quietly lose that behaviour, and a row wrongly marked staff keeps
  access nobody notices.
* Every organisation membership is copied across against the root row.

Nothing is removed. The old table is still written and still read; the
readers move across in the next step, and the table goes after that.

Revision ID: c1f2a3b4d5e6
Revises: 7b41d0aa93c8
Create Date: 2026-09-16 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c1f2a3b4d5e6"
down_revision: str | None = "7b41d0aa93c8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ROOT_TYPE = "organisation"


def upgrade() -> None:
    op.alter_column(
        "site_member",
        "capacity",
        existing_type=sa.String(length=50),
        existing_nullable=False,
        server_default="trainee",
    )

    # A person already recorded at the root keeps what is there: this runs
    # after the application has begun writing both tables, so a row that
    # is already present is the newer of the two.
    op.get_bind().execute(
        sa.text(
            "INSERT INTO site_member (site_id, user_id, capacity) "
            "SELECT o.org_unit_id, m.user_id, m.capacity "
            "FROM organisation_member m "
            "JOIN organisations o ON o.id = m.organisation_id "
            "WHERE o.org_unit_id IS NOT NULL "
            "AND NOT EXISTS ("
            "  SELECT 1 FROM site_member s"
            "  WHERE s.site_id = o.org_unit_id AND s.user_id = m.user_id"
            ")"
        )
    )


def downgrade() -> None:
    # Take the copied rows back out. Only memberships of a root are
    # touched: a membership of a ward was never part of this move.
    op.get_bind().execute(
        sa.text(
            "DELETE FROM site_member WHERE site_id IN ("
            "  SELECT id FROM sites WHERE type = :type"
            ")"
        ),
        {"type": ROOT_TYPE},
    )

    op.alter_column(
        "site_member",
        "capacity",
        existing_type=sa.String(length=50),
        existing_nullable=False,
        server_default=None,
    )
