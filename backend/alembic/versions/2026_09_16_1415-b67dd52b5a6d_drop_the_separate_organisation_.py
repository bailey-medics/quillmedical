"""drop the separate organisation membership table

The contract half of merging the two membership tables. Every row was
copied across against the organisation's own row in the tree by the
previous step, and nothing reads or writes this table any more: what used
to be a table is now a query over the merged one, under the same name, so
the call sites did not have to change.

The downgrade rebuilds the table and fills it back in from the merged
one, so nothing is lost by going back a step.

Revision ID: b67dd52b5a6d
Revises: c1f2a3b4d5e6
Create Date: 2026-09-16 14:15:11.851128

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b67dd52b5a6d"
down_revision: str | None = "c1f2a3b4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_table("organisation_member")  # migration-check: allow-destructive


def downgrade() -> None:
    op.create_table(
        "organisation_member",
        sa.Column(
            "organisation_id",
            sa.INTEGER(),
            autoincrement=False,
            nullable=False,
        ),
        sa.Column(
            "user_id", sa.INTEGER(), autoincrement=False, nullable=False
        ),
        sa.Column(
            "capacity",
            sa.VARCHAR(length=50),
            server_default=sa.text("'trainee'::character varying"),
            autoincrement=False,
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["organisations.id"],
            name=op.f("organisation_member_organisation_id_fkey"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("organisation_member_user_id_fkey"),
        ),
        sa.PrimaryKeyConstraint(
            "organisation_id", "user_id", name=op.f("organisation_member_pkey")
        ),
    )

    # Fill it back in from the merged table: an organisation membership is
    # a row there against the organisation's own row in the tree.
    op.get_bind().execute(
        sa.text(
            "INSERT INTO organisation_member "
            "(organisation_id, user_id, capacity) "
            "SELECT o.id, s.user_id, s.capacity "
            "FROM site_member s "
            "JOIN organisations o ON o.org_unit_id = s.site_id"
        )
    )
