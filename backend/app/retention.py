"""Deleting what the privacy policy says is no longer kept.

Section 7 of the privacy policy gives a period for each kind of data.
Three of them are carried out here, from the database alone:

- an assessor invitation nobody accepted, 90 days after it expires
- feedback, two years after it was sent
- the record of somebody's answers about news and updates, six years
  after the last one

A fourth is found here and **not** carried out: a sponsor's training
records about somebody whose account is closed, once the period that
sponsor has given has passed. Deleting those cannot be undone once the
backups have turned over, so the run writes each as a
``RetentionReview`` row and a person decides. ``delete_training_records``
is what that decision calls.

Run as the ``apply-retention`` admin action, on a schedule. It reports
unless ``RETENTION_APPLY`` is ``true``, so a run by hand counts what
would go and deletes nothing.

**A sponsor's period is theirs, and held for each organisation.**
``TeachingOrgSettings.records_kept_months_after_closure`` is the number
of months, set by the ``set-records-kept`` admin action. An organisation
with none has nothing deleted. One organisation's period ending takes
that organisation's records only: somebody enrolled at two keeps the
other's.

**Nothing here closes or deletes an account.**

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
from app.features.teaching.models import (
    Assessment,
    AssessmentAnswer,
    AssessmentAnswerTag,
    ModuleEnrolment,
    TeachingOrgSettings,
)
from app.features.teaching.reminders import add_months
from app.models import (
    Feedback,
    MarketingPreferenceChange,
    RetentionReview,
    User,
)

#: How long an invitation nobody accepted is kept after it expires.
UNACCEPTED_INVITE_KEPT = timedelta(days=90)

#: How long feedback is kept after it was sent. Two years.
FEEDBACK_KEPT = timedelta(days=2 * 365)

#: How long the record of somebody's marketing answers is kept after the
#: last of them. Six years.
MARKETING_RECORD_KEPT = timedelta(days=6 * 365)

#: The longest period ``set-records-kept`` will take, in months. Fifty
#: years: well past any retention rule, and short enough to catch a
#: number typed as days.
MOST_MONTHS_KEPT = 600

#: How often somebody is told again that records are awaiting a decision.
#: They are told at once when a new one is due, whatever this says.
TOLD_AGAIN_AFTER = timedelta(days=7)

#: How the line that asks for a decision starts. An alert in
#: infra/modules/monitoring/main.tf matches it, and
#: .github/scripts/terraform/retention-decision-alert.bats holds the two
#: to the same words.
DECISION_NEEDED = "Decision needed:"


@dataclass(frozen=True)
class RetentionResult:
    """How many rows are past their period, by kind.

    Attributes:
        unaccepted_invites: Assessor invitations nobody accepted.
        feedback: Feedback messages.
        marketing_records: Rows recording an answer about news and updates.
        newly_awaiting: Closed accounts whose records at an organisation
            came due a decision on this run.
        awaiting: Every such set of records still undecided.
        tell_somebody: Whether this run should say that a decision is
            needed: something is newly due, or a week has passed.
    """

    unaccepted_invites: int
    feedback: int
    marketing_records: int
    newly_awaiting: int = 0
    awaiting: int = 0
    tell_somebody: bool = False


@dataclass(frozen=True)
class PastItsPeriod:
    """One person's records at one organisation, past the period kept."""

    user_id: int
    org_unit_id: int
    closed_at: datetime
    due_on: datetime


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


def _aware(moment: datetime) -> datetime:
    """*moment* with a time zone. SQLite hands a stored one back bare."""
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def closed_accounts_past_their_period(
    db: Session, now: datetime
) -> list[PastItsPeriod]:
    """Who has records at an organisation whose period for them has ended.

    One entry for each organisation, so that a person with records at
    two is listed for the one whose period has ended and not for the
    other.

    The period counts from ``User.deactivated_at``. An account closed
    with no date, as one closed before the column existed is, is never
    listed, and nor is one that has been opened again, which clears the
    date.
    """
    found: dict[tuple[int, int], PastItsPeriod] = {}
    with_a_period = select(TeachingOrgSettings).where(
        TeachingOrgSettings.records_kept_months_after_closure.is_not(None)
    )

    for settings in db.scalars(with_a_period):
        months = settings.records_kept_months_after_closure

        # Nought or less would delete on the day an account closed.
        # ``set-records-kept`` refuses it; this is for a row written some
        # other way.
        if months is None or months < 1:
            continue

        org_unit_id = settings.org_unit_id
        attempted = select(Assessment.user_id).where(
            Assessment.org_unit_id == org_unit_id
        )
        enrolled = select(ModuleEnrolment.user_id).where(
            ModuleEnrolment.org_unit_id == org_unit_id
        )
        closed = db.execute(
            select(User.id, User.deactivated_at).where(
                User.is_active.is_(False),
                User.deactivated_at.is_not(None),
                User.id.in_(attempted.union(enrolled)),
            )
        )

        for user_id, closed_at in closed:
            # The query leaves these out. Said again for the type checker.
            if closed_at is None:
                continue

            due_on = add_months(_aware(closed_at), months)

            if due_on <= now:
                found[(user_id, org_unit_id)] = PastItsPeriod(
                    user_id=user_id,
                    org_unit_id=org_unit_id,
                    closed_at=_aware(closed_at),
                    due_on=due_on,
                )

    return [found[key] for key in sorted(found)]


def delete_training_records(
    db: Session, user_id: int, org_unit_id: int, *, apply: bool
) -> tuple[int, int]:
    """Count, and when asked delete, one person's records at one place.

    Never called by the nightly run. A person decides, and the decision
    calls this.

    Their attempts with every answer and its tags, and their enrolments.
    Each table is deleted by name, the furthest from the attempt first:
    the database would cascade from the attempt, but the test database
    does not, and a delete that relies on it would be untested.

    Returns:
        How many attempts and how many enrolments.
    """
    assessment_ids = list(
        db.scalars(
            select(Assessment.id).where(
                Assessment.user_id == user_id,
                Assessment.org_unit_id == org_unit_id,
            )
        )
    )
    theirs_here = (
        ModuleEnrolment.user_id == user_id,
        ModuleEnrolment.org_unit_id == org_unit_id,
    )
    enrolments = (
        db.scalar(
            select(func.count())
            .select_from(ModuleEnrolment)
            .where(*theirs_here)
        )
        or 0
    )

    if not apply:
        return len(assessment_ids), enrolments

    if assessment_ids:
        answer_ids = select(AssessmentAnswer.id).where(
            AssessmentAnswer.assessment_id.in_(assessment_ids)
        )
        db.execute(
            delete(AssessmentAnswerTag).where(
                AssessmentAnswerTag.answer_id.in_(answer_ids)
            )
        )
        db.execute(
            delete(AssessmentAnswer).where(
                AssessmentAnswer.assessment_id.in_(assessment_ids)
            )
        )
        db.execute(delete(Assessment).where(Assessment.id.in_(assessment_ids)))

    db.execute(delete(ModuleEnrolment).where(*theirs_here))

    return len(assessment_ids), enrolments


def _is_awaiting_or_kept(
    db: Session, due: PastItsPeriod, now: datetime
) -> bool:
    """Whether these records already have a row that settles them for now.

    One still undecided, or one kept whose date to ask again has not
    come. A row that says deleted does not: records found after a
    deletion are new ones, made when the account was open again.
    """
    rows = db.scalars(
        select(RetentionReview).where(
            RetentionReview.user_id == due.user_id,
            RetentionReview.org_unit_id == due.org_unit_id,
            RetentionReview.decision.in_(("undecided", "kept")),
        )
    )

    for row in rows:
        if row.decision == "undecided":
            return True

        if row.ask_again_on is None or _aware(row.ask_again_on) > now:
            return True

    return False


def _list_for_decision(
    db: Session, now: datetime, *, apply: bool
) -> tuple[int, int, bool]:
    """Write a row for each set of records newly past its period.

    Nothing is deleted. Without ``apply`` nothing is written either, and
    the counts are what a real run would give.

    Returns:
        How many are newly awaiting a decision, how many are awaiting one
        in all, and whether somebody should be told.
    """
    newly = 0

    for due in closed_accounts_past_their_period(db, now):
        if _is_awaiting_or_kept(db, due, now):
            continue

        newly += 1

        if not apply:
            continue

        attempts, enrolments = delete_training_records(
            db, due.user_id, due.org_unit_id, apply=False
        )
        db.add(
            RetentionReview(
                user_id=due.user_id,
                org_unit_id=due.org_unit_id,
                closed_at=due.closed_at,
                due_on=due.due_on,
                attempts=attempts,
                enrolments=enrolments,
            )
        )

    if apply:
        db.flush()

    undecided = list(
        db.scalars(
            select(RetentionReview).where(
                RetentionReview.decision == "undecided"
            )
        )
    )
    awaiting = len(undecided) if apply else len(undecided) + newly

    # Told when something is new, and again once a week has gone by
    # since anybody was last told. Not every night: a message that
    # comes every night stops being read.
    told_long_ago = any(
        row.announced_at is None
        or _aware(row.announced_at) <= now - TOLD_AGAIN_AFTER
        for row in undecided
    )
    tell = awaiting > 0 and (newly > 0 or told_long_ago)

    if apply and tell:
        for row in undecided:
            row.announced_at = now

        db.flush()

    return newly, awaiting, tell


#: How long records that were kept wait before somebody is asked again,
#: when the person deciding gives no date of their own.
ASK_AGAIN_AFTER_MONTHS = 12


def carry_out_decision(
    db: Session,
    review: RetentionReview,
    *,
    delete_them: bool,
    note: str | None,
    ask_again_on: datetime | None,
    decided_by: int,
    now: datetime,
) -> str | None:
    """Do what a person decided about one set of records.

    Checked again here, at the moment of deciding, and not trusted from
    the list the person was looking at: an account may have been opened
    again since, which clears the date its period was counted from.

    The rows are flushed, not committed: the caller commits.

    Args:
        db: The database session.
        review: The row being decided.
        delete_them: True to delete the records, false to keep them.
        note: Why. Needed to keep.
        ask_again_on: For keeping, when to ask again.
        decided_by: The user id of who decided.
        now: The moment of the decision.

    Returns:
        Why it was refused, or None when it was carried out.
    """
    if review.decision != "undecided":
        return "This has already been decided."

    note = (note or "").strip() or None

    if not delete_them:
        if note is None:
            return "Say why these records are being kept."

        again = ask_again_on or add_months(now, ASK_AGAIN_AFTER_MONTHS)

        if _aware(again) <= now:
            return "The date to ask again must be in the future."

        review.decision = "kept"
        review.ask_again_on = _aware(again)
    else:
        still_due = any(
            (due.user_id, due.org_unit_id)
            == (review.user_id, review.org_unit_id)
            for due in closed_accounts_past_their_period(db, now)
        )

        if not still_due:
            return (
                "This account is no longer past its period: it has been "
                "opened again, or the period has changed. Nothing was "
                "deleted."
            )

        attempts, enrolments = delete_training_records(
            db, review.user_id, review.org_unit_id, apply=True
        )
        # What was deleted, which may be more than was there when the
        # row was first listed.
        review.attempts = attempts
        review.enrolments = enrolments
        review.decision = "deleted"

    review.note = note
    review.decided_by = decided_by
    review.decided_at = now
    db.flush()

    return None


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

    newly_awaiting, awaiting, tell_somebody = _list_for_decision(
        db, now, apply=apply
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
        newly_awaiting=newly_awaiting,
        awaiting=awaiting,
        tell_somebody=tell_somebody,
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
    listed = "Listed" if apply else "Would list"
    print(
        f"{listed} {result.newly_awaiting} closed accounts whose records "
        "are newly past their period"
    )

    # Its own line, and only when somebody should act: an alert matches
    # it. A count and no names. Who they are is on the screen, behind a
    # sign-in.
    if apply and result.tell_somebody:
        print(
            f"{DECISION_NEEDED} {result.awaiting} closed accounts have "
            "training records past their period, awaiting a decision"
        )

    # Last, and worded exactly so: the "has not run" alert counts this
    # line. See RUN_FINISHED in retention_test.py.
    print(f"{verb} {result.marketing_records} marketing answer records")

    if not apply:
        print("A report only. Set RETENTION_APPLY=true to delete.")

    return 0


def set_records_kept() -> int:
    """Set how long one organisation's records outlast a closed account.

    The ``set-records-kept`` admin action. Reads:

    - ``RECORDS_ORG_UNIT_ID``: the organisation, as an org unit id.
    - ``RECORDS_KEPT_MONTHS``: the months, 1 to 600, or ``none`` to stop
      deleting for that organisation.
    - ``RECORDS_APPLY``: ``true`` to change it. Anything else reports
      what it is now and what it would become.

    The organisation must already have its teaching settings. This makes
    no row, so a mistyped id cannot give a period to the wrong place
    unnoticed.

    Returns:
        The exit status: 0 when it ran, 1 when it could not.
    """
    from app.db.core_db import CoreSessionLocal

    org_text = os.environ.get("RECORDS_ORG_UNIT_ID", "").strip()
    months_text = os.environ.get("RECORDS_KEPT_MONTHS", "").strip().lower()
    apply = os.environ.get("RECORDS_APPLY", "").strip().lower() == "true"

    if not org_text.isdigit():
        print("✗ RECORDS_ORG_UNIT_ID must be an org unit id", file=sys.stderr)
        return 1

    months: int | None = None

    if months_text != "none":
        if not months_text.isdigit() or not (
            1 <= int(months_text) <= MOST_MONTHS_KEPT
        ):
            print(
                f"✗ RECORDS_KEPT_MONTHS must be 1 to {MOST_MONTHS_KEPT}, "
                "or none",
                file=sys.stderr,
            )
            return 1

        months = int(months_text)

    db = CoreSessionLocal()

    try:
        settings = db.scalar(
            select(TeachingOrgSettings).where(
                TeachingOrgSettings.org_unit_id == int(org_text)
            )
        )

        if settings is None:
            print(
                f"✗ Org unit {org_text} has no teaching settings",
                file=sys.stderr,
            )
            return 1

        was = settings.records_kept_months_after_closure
        name = settings.institution_name

        if apply:
            settings.records_kept_months_after_closure = months
            # This makes its own session, so nothing commits for it.
            db.commit()
    except Exception as exc:
        db.rollback()
        print(f"✗ Nothing was changed: {type(exc).__name__}", file=sys.stderr)
        return 1
    finally:
        db.close()

    def said(value: int | None) -> str:
        return "not deleted" if value is None else f"kept {value} months"

    verb = "Changed" if apply else "Would change"

    print(f"{name} (org unit {org_text})")
    print(
        f"{verb} records of a closed account from {said(was)} "
        f"to {said(months)}"
    )

    if not apply:
        print("A report only. Set RECORDS_APPLY=true to change it.")

    return 0
