"""Deciding about records past their period, without the screen.

The record retention screen is where a superadmin decides what happens
to a closed account's training records, and to the account itself
(``app.retention_router``). This is the same decision from the admin
job, for when the screen cannot be reached. It carries out nothing the
screen could not: both end in ``app.retention.carry_out_decision``.

Run as the ``decide-retention`` admin action. It reads:

- ``RETENTION_REVIEW_ID``: the row to decide. Left out, it lists every
  row awaiting a decision and changes nothing.
- ``RETENTION_DECISION``: ``delete`` or ``keep``.
- ``RETENTION_NOTE``: why. Needed to keep.
- ``RETENTION_ASK_AGAIN_ON``: for a keep, the date to ask again, as
  ``YYYY-MM-DD``. Needed to keep.
- ``RETENTION_DECIDED_BY``: the username of the superadmin deciding. It
  is recorded on the row, as it is from the screen.
- ``CONFIRM``: the code a dry run prints. Without it nothing is done.

**The code names the row, the decision and what is there now**, so it
can only be known by reading a dry run, and stops being right if the
records change before it is pasted back.

**Nobody is named in what is printed.** This runs in a job whose output
is kept in the logs, so a row is described by its ids, its dates and
its counts. Who they are is on the screen, behind a sign-in.
"""

from __future__ import annotations

import os
import sys
from datetime import UTC, date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import RetentionReview, User
from app.retention import carry_out_decision, delete_training_records

DECISIONS = ("delete", "keep")


def _counts(db: Session, review: RetentionReview) -> tuple[int, int]:
    """The attempts and enrolments a delete would remove, as of now."""
    if review.org_unit_id is None:
        return 0, 0

    return delete_training_records(
        db, review.user_id, review.org_unit_id, apply=False
    )


def describe(db: Session, review: RetentionReview) -> str:
    """One row, in a line that names nobody."""
    due = review.due_on.date().isoformat()

    if review.subject == "account":
        return (
            f"review {review.id}: the account of user {review.user_id}, "
            f"due to be emptied since {due}"
        )

    attempts, enrolments = _counts(db, review)

    return (
        f"review {review.id}: records of user {review.user_id} at org "
        f"unit {review.org_unit_id}, period ended {due}, {attempts} "
        f"attempts and {enrolments} enrolments"
    )


def confirmation(db: Session, review: RetentionReview, decision: str) -> str:
    """What must be pasted back to carry a decision out.

    It holds the counts, so it stops being right if the records change
    between the dry run and the real one.
    """
    attempts, enrolments = _counts(db, review)

    return f"{review.id}:{decision}:{attempts}:{enrolments}"


def _fail(message: str) -> int:
    print(f"✗ {message}", file=sys.stderr)

    return 1


def _ask_again_on(text: str) -> datetime | None:
    """The start of that day, in UTC, or None when it is not a date."""
    try:
        day = date.fromisoformat(text)
    except ValueError:
        return None

    return datetime(day.year, day.month, day.day, tzinfo=UTC)


def _list_awaiting(db: Session) -> int:
    rows = list(
        db.scalars(
            select(RetentionReview)
            .where(RetentionReview.decision == "undecided")
            .order_by(RetentionReview.created_at, RetentionReview.id)
        )
    )

    print(f"{len(rows)} awaiting a decision")

    for row in rows:
        print(describe(db, row))

    if rows:
        print(
            "To decide one, set RETENTION_REVIEW_ID, RETENTION_DECISION "
            "and RETENTION_DECIDED_BY."
        )

    return 0


def _decide(db: Session, review_id: int) -> int:
    decision = os.environ.get("RETENTION_DECISION", "").strip().lower()
    note = os.environ.get("RETENTION_NOTE", "").strip() or None
    again_text = os.environ.get("RETENTION_ASK_AGAIN_ON", "").strip()
    decided_by = os.environ.get("RETENTION_DECIDED_BY", "").strip()
    confirm = os.environ.get("CONFIRM", "").strip()

    if decision not in DECISIONS:
        return _fail("RETENTION_DECISION must be delete or keep")

    ask_again_on = _ask_again_on(again_text) if again_text else None

    if again_text and ask_again_on is None:
        return _fail("RETENTION_ASK_AGAIN_ON must be a date, as YYYY-MM-DD")

    review = db.get(RetentionReview, review_id)

    if review is None:
        return _fail(f"There is no review {review_id}")

    if review.decision != "undecided":
        return _fail(f"Review {review_id} has already been decided")

    code = confirmation(db, review, decision)
    print(describe(db, review))

    if not confirm:
        print(f"Would {decision}. Nothing was changed.")
        print(f"To carry it out, run again with CONFIRM={code}")

        return 0

    if confirm != code:
        return _fail(
            "CONFIRM does not match. Run again without it to read the "
            "code. Nothing was changed."
        )

    operator = db.scalar(select(User).where(User.username == decided_by))

    if (
        operator is None
        or not operator.is_active
        or operator.platform_role != "superadmin"
    ):
        return _fail(
            "RETENTION_DECIDED_BY must be the username of a superadmin. "
            "Nothing was changed."
        )

    refused = carry_out_decision(
        db,
        review,
        delete_them=decision == "delete",
        note=note,
        ask_again_on=ask_again_on,
        decided_by=operator.id,
        now=datetime.now(UTC),
    )

    if refused is not None:
        db.rollback()

        return _fail(f"{refused} Nothing was changed.")

    # This makes its own session, so nothing commits for it.
    db.commit()

    if decision == "keep":
        print(f"✓ Kept. Review {review_id} will be asked about again.")
    elif review.subject == "account":
        print(
            f"✓ Marked. The next nightly run empties the account of "
            f"review {review_id}."
        )
    else:
        print(f"✓ Deleted the records of review {review_id}.")

    return 0


def main() -> int:
    """Run the ``decide-retention`` admin action from the environment.

    Returns:
        The exit status: 0 when it ran, 1 when it could not or refused.
    """
    from app.db.core_db import CoreSessionLocal

    id_text = os.environ.get("RETENTION_REVIEW_ID", "").strip()

    if id_text and not id_text.isdigit():
        return _fail("RETENTION_REVIEW_ID must be a review id")

    db = CoreSessionLocal()

    try:
        if not id_text:
            return _list_awaiting(db)

        return _decide(db, int(id_text))
    except Exception as exc:
        db.rollback()

        return _fail(f"Nothing was changed: {type(exc).__name__}")
    finally:
        db.close()
