"""organisation passport grants do not lapse

Clears `ends_on` on every current `passport_write` grant whose `source`
is `organisation`. Somebody given the passport through a site or an
organisation keeps it indefinitely; only a subscription somebody buys for
themselves, `source` `individual`, runs out. Those rows keep their dates.

The rows being cleared were written with a year's end date, by
onboarding, by the backfill from `passport_write_entitlement`, and by the
user editor. None had reached it.

Written by hand: there is no model change for `just migrate` to find.

Revision ID: 57deea9f9ea6
Revises: 2a2a7b1ea83a
Create Date: 2026-09-23 20:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "57deea9f9ea6"
down_revision: str | None = "2a2a7b1ea83a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Take the end date off every current organisation passport grant."""
    op.execute("""
        UPDATE user_competency
           SET ends_on = NULL
         WHERE competency_id = 'passport_write'
           AND granted = true
           AND source = 'organisation'
           AND ends_on > NOW()
    """)


def downgrade() -> None:
    """Put back the year each one was written with.

    Every organisation grant this cleared was written a year before its
    end, so `starts_on` plus a year restores it. A row with no
    `starts_on` is left with no end, which none were when this was
    written: every writer of an organisation grant recorded its start.
    """
    op.execute("""
        UPDATE user_competency
           SET ends_on = starts_on + INTERVAL '365 days'
         WHERE competency_id = 'passport_write'
           AND granted = true
           AND source = 'organisation'
           AND ends_on IS NULL
           AND starts_on IS NOT NULL
    """)
