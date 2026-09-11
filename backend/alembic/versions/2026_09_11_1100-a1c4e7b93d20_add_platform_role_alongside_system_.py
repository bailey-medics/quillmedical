"""add platform role alongside system permissions

The expand half of replacing `system_permissions` with `platform_role`.
Adds the new column and backfills it from the old one; nothing reads it
for authorisation yet, and `system_permissions` is untouched.

`system_permissions` held one field's worth of two unrelated ideas.
`admin` and `staff` are things a person is *somewhere* — now expressed as
membership at an organisation or site, plus the competencies they hold
there. `superadmin` is not: it says the person operates Quill itself,
which is true everywhere or nowhere. `platform_role` keeps only that
question, with two values and no ranking between them.

The backfill is therefore not a copy. Every row becomes `member` except
those that said `superadmin`, because the other three levels have no
meaning in the new column — they were about a place, and a place is not
what this column records.

Purely additive: no column is dropped and no existing value is changed.
The contract half, dropping `system_permissions`, is a separate migration
once every caller has moved.

Revision ID: a1c4e7b93d20
Revises: 4937cb81e5ae
Create Date: 2026-09-11 11:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1c4e7b93d20"
down_revision: str | None = "4937cb81e5ae"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add `platform_role` and backfill it from `system_permissions`."""
    # NOT NULL with a server default, so existing rows are valid the
    # moment the column exists rather than in a second statement.
    op.add_column(
        "users",
        sa.Column(
            "platform_role",
            sa.String(length=20),
            nullable=False,
            server_default="member",
        ),
    )

    # Only superadmin carries over. The other three levels described a
    # relationship to a place, which this column does not record.
    op.execute("""
        UPDATE users
           SET platform_role = 'superadmin'
         WHERE system_permissions = 'superadmin'
        """)


def downgrade() -> None:
    """Drop `platform_role`, leaving `system_permissions` as it was.

    Reversible without loss: `system_permissions` was never modified, so
    it still holds everything this column was derived from.
    """
    # migration-check: allow-destructive
    op.drop_column("users", "platform_role")
