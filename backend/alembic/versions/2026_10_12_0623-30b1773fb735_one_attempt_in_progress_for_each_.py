"""one attempt in progress for each learner and bank

A learner may hold one unfinished attempt on a question bank, and no
more. A unique index over the learner and the bank holds that,
counting only attempts with no completion time, so finished attempts
are not limited. The organisation is not part of it: a learner who can
sit one bank through two organisations holds one attempt, at the
organisation they started it at.

The index cannot be made while anybody holds two. So first, for each
learner and bank with more than one unfinished attempt, all but the
newest is finished. The newest is the one started last,
and of two started at the same moment the one with the higher id.

Those spare attempts are closed unmarked. A migration cannot mark an
attempt: marking is the application's code, which changes, where a
migration is frozen once merged. So each is given a completion time
and nothing else: ``is_passed`` and ``score_breakdown`` stay null and
no exam reference is written. Where the attempt had a time limit that
has passed, its completion time is the moment the time ended;
otherwise it is now. Such a row reads as finished, with no result.

App production held no real learners when this was written, so no
such row is expected there.

Revision ID: 30b1773fb735
Revises: 57ed659606ec
Create Date: 2026-10-12 06:23:27.011681

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "30b1773fb735"
down_revision: str | None = "57ed659606ec"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INDEX = "uq_assessments_one_in_progress"

# True for an attempt whose time limit has passed. A limit of 0 means
# the attempt is not timed, as ``deadline_of`` reads it.
_OUT_OF_TIME = """
    spare.time_limit_minutes > 0
    AND spare.started_at
        + spare.time_limit_minutes * interval '1 minute' < now()
"""

# Finish every unfinished attempt that has a newer unfinished one beside
# it, for the same learner and bank. The whole statement
# reads the table as it was before any row changed, so the newest of
# each group is the only one left unfinished.
#
# A row closed here reads as "finished, no result": it has a completion
# time, and ``is_passed`` and ``score_breakdown`` are left null because
# nothing here can mark it.
_FINISH_ALL_BUT_THE_NEWEST = f"""
    UPDATE assessments AS spare
    SET completed_at = CASE
            WHEN {_OUT_OF_TIME}
            THEN spare.started_at
                + spare.time_limit_minutes * interval '1 minute'
            ELSE now()
        END
    WHERE spare.completed_at IS NULL
      AND EXISTS (
            SELECT 1
            FROM assessments AS newer
            WHERE newer.user_id = spare.user_id
              AND newer.question_bank_id = spare.question_bank_id
              AND newer.completed_at IS NULL
              AND (
                    newer.started_at > spare.started_at
                    OR (
                        newer.started_at = spare.started_at
                        AND newer.id > spare.id
                    )
              )
      )
"""  # noqa: S608 - no value from outside is put into this statement


def upgrade() -> None:
    op.execute(_FINISH_ALL_BUT_THE_NEWEST)

    op.create_index(
        INDEX,
        "assessments",
        ["user_id", "question_bank_id"],
        unique=True,
        postgresql_where=sa.text("completed_at IS NULL"),
        sqlite_where=sa.text("completed_at IS NULL"),
    )


def downgrade() -> None:
    # The attempts finished above stay finished: which they were is not
    # recorded, and opening them again would hand a learner two.
    op.drop_index(
        INDEX,
        table_name="assessments",
        postgresql_where=sa.text("completed_at IS NULL"),
        sqlite_where=sa.text("completed_at IS NULL"),
    )
