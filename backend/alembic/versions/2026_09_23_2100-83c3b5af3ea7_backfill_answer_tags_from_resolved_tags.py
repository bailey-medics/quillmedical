"""backfill answer tags from resolved_tags

Copies every answer's `resolved_tags` JSON list into
`assessment_answer_tag` rows, one per tag. Scoring still reads the JSON:
switching it to the rows is a separate change, and must not deploy until
this has.

The application has written rows beside the JSON since the change before
this one, so an answer that already has rows is skipped whole: its rows
are already the copy.

A value that is not a JSON array copies nothing rather than failing, so
one malformed answer cannot block the deploy. Duplicate tags within one
list are copied once, as the unique constraint requires.

Written by hand: there is no model change for `just migrate` to find.

Revision ID: 83c3b5af3ea7
Revises: aa35480f3d40
Create Date: 2026-09-23 21:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "83c3b5af3ea7"
down_revision: str | None = "aa35480f3d40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COPY = """
    INSERT INTO assessment_answer_tag (answer_id, tag)
    SELECT DISTINCT a.id, tags.value
      FROM assessment_answers a
     CROSS JOIN LATERAL json_array_elements_text(
               CASE WHEN json_typeof(a.resolved_tags) = 'array'
                    THEN a.resolved_tags
                    ELSE '[]'::json
               END
           ) AS tags(value)
     WHERE tags.value <> ''
       AND NOT EXISTS (
               SELECT 1
                 FROM assessment_answer_tag existing
                WHERE existing.answer_id = a.id
           )
"""


def upgrade() -> None:
    """Copy every answer's tags into rows.

    Idempotent: an answer with any row is skipped, so re-running adds
    nothing.
    """
    op.execute(COPY)


def downgrade() -> None:
    """Empty the table.

    Its rows cannot be told apart from the ones the application wrote, and
    they need not be: at this revision every row is a copy of
    `resolved_tags`, which is still written and still what scoring reads.
    The revision before rebuilds rows as answers are given or changed.
    """
    op.execute("DELETE FROM assessment_answer_tag")
