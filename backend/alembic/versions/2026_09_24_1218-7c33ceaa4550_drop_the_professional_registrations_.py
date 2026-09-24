"""drop the professional registrations column

Drops `users.professional_registrations`, the JSON object of registering
body to number. `professional_registration` rows replaced it: every user's
registrations were copied by `f14aae5e8d17`, the passport has read the
rows since the change after that, and nothing has written or named the
column since the change after that.

The verification table's own copy of the body and number,
`registration_authority` and `registration_number` on
`passport_assessor_registration_verification`, stays: pointing it at the
rows instead is deferred.

Approved as a destructive change on 24 September 2026. See
docs/docs/plans/2026-09-23-professional-registrations-plan.md.

Revision ID: 7c33ceaa4550
Revises: f14aae5e8d17
Create Date: 2026-09-24 12:18:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c33ceaa4550"
down_revision: str | None = "f14aae5e8d17"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # migration-check: allow-destructive
    #
    # Replaced by `professional_registration` rows, which hold the same
    # registrations.
    op.drop_column("users", "professional_registrations")


def downgrade() -> None:
    """Recreate the column, and fill it back from the current rows.

    The rows hold the same registrations the column did, so going back
    loses nothing. A user with no current row gets null, as one who never
    declared a registration had. A closed row is a number no longer held,
    so it is left out.
    """
    op.add_column(
        "users",
        sa.Column("professional_registrations", sa.JSON(), nullable=True),
    )
    op.execute("""
        UPDATE users u
           SET professional_registrations = regs.object
          FROM (
                SELECT user_id, json_object_agg(authority, number) AS object
                  FROM professional_registration
                 WHERE ends_on IS NULL OR ends_on > NOW()
                 GROUP BY user_id
               ) AS regs
         WHERE regs.user_id = u.id
    """)
