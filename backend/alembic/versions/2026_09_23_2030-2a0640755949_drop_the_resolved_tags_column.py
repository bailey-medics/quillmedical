"""drop the resolved tags column

Drops `assessment_answers.resolved_tags`, the JSON list of the chosen
option's tags on each answer. `assessment_answer_tag` rows replaced it:
every answer's tags were copied by `83c3b5af3ea7`, scoring has read the
rows since the change after that, and nothing has written or named the
column since the change after that.

Approved as a destructive change on 23 September 2026. See
docs/docs/plans/2026-09-23-resolved-tags-plan.md.

Revision ID: 2a0640755949
Revises: 7774a15142c1
Create Date: 2026-09-23 20:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2a0640755949"
down_revision: str | None = "7774a15142c1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # migration-check: allow-destructive
    #
    # Replaced by `assessment_answer_tag` rows, which hold the same tags.
    op.drop_column("assessment_answers", "resolved_tags")


def downgrade() -> None:
    """Recreate the column, and fill it back from the rows.

    The rows hold the same tags the column did, so nothing is lost going
    back. An answer with no rows gets null, as an unanswered one had.
    """
    op.add_column(
        "assessment_answers",
        sa.Column("resolved_tags", sa.JSON(), nullable=True),
    )
    op.execute("""
        UPDATE assessment_answers a
           SET resolved_tags = tags.list
          FROM (
                SELECT answer_id, json_agg(tag ORDER BY tag) AS list
                  FROM assessment_answer_tag
                 GROUP BY answer_id
               ) AS tags
         WHERE tags.answer_id = a.id
    """)
