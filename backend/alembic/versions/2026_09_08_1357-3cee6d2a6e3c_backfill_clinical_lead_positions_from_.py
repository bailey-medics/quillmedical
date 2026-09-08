"""backfill clinical lead positions from the site role column

The backfill step of moving clinical lead onto positions. Every site with a
clinical_lead row in site_staff_member gets a clinical lead post and a
holding for whoever is in it, so the reads that have just moved across
return what they did before.

started_on is the date of the migration rather than a guess at when the
person actually took the post. Inventing a start date would put a claim in
the record that nothing supports, and the honest answer to "since when?" is
"at least since we started recording it".

requires_competency is left unset. What a clinical lead must be competent in
is a decision for an organisation, and setting one here would refuse
appointments that are proper today.

The column is untouched and still written. It goes in the contract step,
which also removes it from the site response and so is a breaking API
change needing its own deploy.

Revision ID: 3cee6d2a6e3c
Revises: c067f8e61534
Create Date: 2026-09-08 13:57:45.791427

"""

from collections.abc import Sequence
from datetime import date

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "3cee6d2a6e3c"
down_revision: str | None = "c067f8e61534"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Create a clinical lead post and holding for each existing lead."""
    connection = op.get_bind()

    leads = connection.execute(
        sa.text(
            "SELECT site_id, user_id FROM site_staff_member "
            "WHERE role = 'clinical_lead'"
        )
    ).fetchall()

    for site_id, user_id in leads:
        position_id = connection.execute(
            sa.text(
                "SELECT id FROM position "
                "WHERE site_id = :site_id AND kind = 'clinical_lead'"
            ),
            {"site_id": site_id},
        ).scalar()

        if position_id is None:
            connection.execute(
                sa.text(
                    "INSERT INTO position "
                    "(site_id, kind, title, max_holders) "
                    "VALUES (:site_id, 'clinical_lead', "
                    "'Clinical lead', 1)"
                ),
                {"site_id": site_id},
            )
            position_id = connection.execute(
                sa.text(
                    "SELECT id FROM position "
                    "WHERE site_id = :site_id AND kind = 'clinical_lead'"
                ),
                {"site_id": site_id},
            ).scalar()

        already_held = connection.execute(
            sa.text(
                "SELECT 1 FROM position_holding "
                "WHERE position_id = :position_id "
                "AND user_id = :user_id AND ended_on IS NULL"
            ),
            {"position_id": position_id, "user_id": user_id},
        ).scalar()

        if not already_held:
            connection.execute(
                sa.text(
                    "INSERT INTO position_holding "
                    "(position_id, user_id, started_on, is_acting) "
                    "VALUES (:position_id, :user_id, :started_on, false)"
                ),
                {
                    "position_id": position_id,
                    "user_id": user_id,
                    "started_on": date.today(),
                },
            )


def downgrade() -> None:
    """Remove the clinical lead posts this migration created.

    Only clinical lead posts, and only where the role column still names
    the same person — anything appointed since is a real decision that a
    downgrade has no business undoing.
    """
    connection = op.get_bind()

    connection.execute(
        sa.text(
            "DELETE FROM position_holding WHERE position_id IN ("
            "  SELECT p.id FROM position p"
            "  WHERE p.kind = 'clinical_lead' AND p.site_id IS NOT NULL"
            ") AND user_id IN ("
            "  SELECT s.user_id FROM site_staff_member s"
            "  WHERE s.role = 'clinical_lead'"
            ")"
        )
    )
    connection.execute(
        sa.text(
            "DELETE FROM position WHERE kind = 'clinical_lead' "
            "AND site_id IS NOT NULL AND id NOT IN ("
            "  SELECT position_id FROM position_holding"
            ")"
        )
    )
