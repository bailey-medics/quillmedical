"""backfill professional registrations from the JSON

Copies every user's `professional_registrations` JSON object into
`professional_registration` rows, one per body and number. Nothing reads
the rows yet: switching reads is a separate change, and must not deploy
until this has.

The application has written a row beside the JSON since the change before
this one, so a user who already has any row is skipped whole: their rows
are already the copy.

`declared_at` is when this runs. Nothing recorded when a registration was
declared, and `users` has no creation date to stand in for it.

A body the jurisdiction config does not list is copied as stored rather
than dropped: losing a registration during a storage change is worse than
keeping one the list does not know. A value that is not a JSON object, or
an empty body or number, copies nothing, so one malformed row cannot block
the deploy.

Written by hand: there is no model change for `just migrate` to find.

Revision ID: f14aae5e8d17
Revises: 2eedb5e4d200
Create Date: 2026-09-24 13:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f14aae5e8d17"
down_revision: str | None = "2eedb5e4d200"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COPY = """
    INSERT INTO professional_registration
        (user_id, authority, number, declared_at, ends_on, created_at)
    SELECT u.id,
           LEFT(TRIM(r.key), 50),
           LEFT(TRIM(r.value), 50),
           NOW(),
           CAST(NULL AS timestamptz),
           NOW()
      FROM users u
     CROSS JOIN LATERAL json_each_text(
               CASE WHEN json_typeof(u.professional_registrations) = 'object'
                    THEN u.professional_registrations
                    ELSE '{}'::json
               END
           ) AS r(key, value)
     WHERE TRIM(r.key) <> ''
       AND COALESCE(TRIM(r.value), '') <> ''
       AND NOT EXISTS (
               SELECT 1
                 FROM professional_registration existing
                WHERE existing.user_id = u.id
           )
"""


def upgrade() -> None:
    """Copy every user's registrations into rows.

    Idempotent: a user with any row is skipped, so re-running adds
    nothing.
    """
    op.execute(COPY)


def downgrade() -> None:
    """Empty the table.

    Its rows cannot be told apart from the ones the application wrote, and
    need not be: at this revision every row is a copy of the JSON, which
    is still written and still what everything reads.
    """
    op.execute("DELETE FROM professional_registration")
