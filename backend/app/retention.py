"""Deleting what the privacy policy says is no longer kept.

Section 7 of the privacy policy gives a period for each kind of data.
Three of them can be carried out from the database alone, and are here:

- an assessor invitation nobody accepted, 90 days after it expires
- feedback, two years after it was sent
- the record of somebody's answers about news and updates, six years
  after the last one

Run as the ``apply-retention`` admin action, on a schedule. It reports
unless ``RETENTION_APPLY`` is ``true``, so a run by hand counts what
would go and deletes nothing.

**Nothing here closes or deletes an account.** The policy keeps an
account for two years after it is closed, and nothing records when that
was; that needs a column of its own before it can be carried out.

**Counts only are printed.** A line saying whose feedback went would put
into the logs what was just taken out of the database.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.features.passport.models import PassportAssessorInvite
from app.models import Feedback, MarketingPreferenceChange

#: How long an invitation nobody accepted is kept after it expires.
UNACCEPTED_INVITE_KEPT = timedelta(days=90)

#: How long feedback is kept after it was sent. Two years.
FEEDBACK_KEPT = timedelta(days=2 * 365)

#: How long the record of somebody's marketing answers is kept after the
#: last of them. Six years.
MARKETING_RECORD_KEPT = timedelta(days=6 * 365)


@dataclass(frozen=True)
class RetentionResult:
    """How many rows are past their period, by kind.

    Attributes:
        unaccepted_invites: Assessor invitations nobody accepted.
        feedback: Feedback messages.
        marketing_records: Rows recording an answer about news and updates.
    """

    unaccepted_invites: int
    feedback: int
    marketing_records: int


def _unaccepted_invite_ids(db: Session, now: datetime) -> list[str]:
    """Invitations nobody accepted that expired long enough ago.

    An accepted invitation is never returned: the policy says it becomes
    part of the sign-off record.
    """
    earliest_kept = now - UNACCEPTED_INVITE_KEPT

    return list(
        db.scalars(
            select(PassportAssessorInvite.id).where(
                PassportAssessorInvite.accepted_at.is_(None),
                PassportAssessorInvite.expires_at < earliest_kept,
            )
        )
    )


def _old_feedback_ids(db: Session, now: datetime) -> list[int]:
    """Feedback sent longer ago than it is kept for."""
    earliest_kept = now - FEEDBACK_KEPT

    return list(
        db.scalars(
            select(Feedback.id).where(Feedback.created_at < earliest_kept)
        )
    )


def _users_with_old_marketing_records(db: Session, now: datetime) -> list[int]:
    """People whose last answer about news is older than the record is kept.

    The period runs from the **last** answer, so one recent answer keeps
    every earlier one: together they are the evidence of what somebody
    chose and when.
    """
    earliest_kept = now - MARKETING_RECORD_KEPT
    last_answer = func.max(MarketingPreferenceChange.created_at)

    return list(
        db.scalars(
            select(MarketingPreferenceChange.user_id)
            .group_by(MarketingPreferenceChange.user_id)
            .having(last_answer < earliest_kept)
        )
    )


def apply_retention(
    db: Session, now: datetime, *, apply: bool
) -> RetentionResult:
    """Count, and when asked delete, everything past its period.

    The rows are flushed, not committed: the caller commits.

    Args:
        db: The database session.
        now: The moment the periods are measured from.
        apply: True to delete. False counts and leaves every row.

    Returns:
        How many rows of each kind were past their period.
    """
    invite_ids = _unaccepted_invite_ids(db, now)
    feedback_ids = _old_feedback_ids(db, now)
    user_ids = _users_with_old_marketing_records(db, now)

    marketing_records = 0

    if user_ids:
        marketing_records = (
            db.scalar(
                select(func.count())
                .select_from(MarketingPreferenceChange)
                .where(MarketingPreferenceChange.user_id.in_(user_ids))
            )
            or 0
        )

    if apply:
        if invite_ids:
            db.execute(
                delete(PassportAssessorInvite).where(
                    PassportAssessorInvite.id.in_(invite_ids)
                )
            )
        if feedback_ids:
            db.execute(delete(Feedback).where(Feedback.id.in_(feedback_ids)))
        if user_ids:
            db.execute(
                delete(MarketingPreferenceChange).where(
                    MarketingPreferenceChange.user_id.in_(user_ids)
                )
            )
        db.flush()

    return RetentionResult(
        unaccepted_invites=len(invite_ids),
        feedback=len(feedback_ids),
        marketing_records=marketing_records,
    )


def main() -> int:
    """Run retention from the environment and print the counts.

    Reads ``RETENTION_APPLY``. Anything but ``true`` is a report.

    Returns:
        The exit status: 0 when it ran, 1 when it could not.
    """
    from app.db.core_db import CoreSessionLocal

    apply = os.environ.get("RETENTION_APPLY", "").strip().lower() == "true"
    db = CoreSessionLocal()

    try:
        result = apply_retention(db, datetime.now(UTC), apply=apply)
        # This makes its own session, so nothing commits for it.
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"✗ Nothing was deleted: {type(exc).__name__}", file=sys.stderr)
        return 1
    finally:
        db.close()

    verb = "Deleted" if apply else "Would delete"

    print(f"{verb} {result.unaccepted_invites} unaccepted invitations")
    print(f"{verb} {result.feedback} feedback messages")
    print(f"{verb} {result.marketing_records} marketing answer records")

    if not apply:
        print("A report only. Set RETENTION_APPLY=true to delete.")

    return 0
