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
``OrgUnit.records_kept_months_after_closure`` is the number of months,
set by an operator on the organisation's admin page or by the
``set-records-kept`` admin action. An organisation with none has
nothing listed. One organisation's period ending takes
that organisation's records only: somebody enrolled at two keeps the
other's.

A fifth is found the same way: the closed account itself, once two
years have passed and no training records are left on it. It too is
written as a row for a person to decide.

**An account is emptied here, and only one a person has marked.** A
superadmin marks it on the record retention screen, and the run that
follows empties it (``empty_marked_accounts``), because only the admin
job can move a passport's files to the archive. Nothing here closes an
account, and nothing empties one on a timer.

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
)
from app.features.teaching.reminders import add_months
from app.models import (
    Feedback,
    MarketingPreferenceChange,
    OrgUnit,
    RetentionReview,
    User,
)
from app.passport_storage import archive_passport
from app.users.emptying import (
    ArchivePassport,
    empty_account,
    why_it_cannot_be_emptied,
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

#: How long a closed account is kept before it is listed to be emptied,
#: in months. Two years, as section 7 of the privacy policy says.
ACCOUNT_KEPT_MONTHS = 24

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
        newly_awaiting_accounts: Closed accounts that themselves came due
            a decision on this run.
        awaiting: Everything still undecided, of both kinds.
        tell_somebody: Whether this run should say that a decision is
            needed: something is newly due, or a week has passed.
    """

    unaccepted_invites: int
    feedback: int
    marketing_records: int
    newly_awaiting: int = 0
    newly_awaiting_accounts: int = 0
    awaiting: int = 0
    tell_somebody: bool = False


@dataclass(frozen=True)
class PastItsPeriod:
    """One person's records at one organisation, past the period kept."""

    user_id: int
    org_unit_id: int
    closed_at: datetime
    due_on: datetime


@dataclass(frozen=True)
class AccountToEmpty:
    """One closed account, kept as long as an account is."""

    user_id: int
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
    with_a_period = select(
        OrgUnit.id, OrgUnit.records_kept_months_after_closure
    ).where(OrgUnit.records_kept_months_after_closure.is_not(None))

    for org_unit_id, months in db.execute(with_a_period):

        # Nought or less would list them on the day an account closed.
        # Both ways of setting it refuse that; this is for a row written
        # some other way.
        if months is None or months < 1:
            continue

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


def closed_accounts_to_empty(
    db: Session, now: datetime
) -> list[AccountToEmpty]:
    """Whose closed account has been kept as long as an account is.

    Closed two years or more, with no training records left anywhere.
    The records go first, each organisation's by its own decision, so an
    account is never listed while any sponsor's period is still running,
    or while records somebody chose to keep are still there. An
    organisation that has given no period never has its records listed,
    so an account with records there is never listed either.

    The period counts from ``User.deactivated_at``, as it does for
    records, so an account closed with no date or opened again is never
    listed.
    """
    with_records = select(Assessment.user_id).union(
        select(ModuleEnrolment.user_id)
    )
    awaiting_records = select(RetentionReview.user_id).where(
        RetentionReview.subject == "records",
        RetentionReview.decision == "undecided",
    )
    closed = db.execute(
        select(User.id, User.deactivated_at)
        .where(
            User.is_active.is_(False),
            User.deactivated_at.is_not(None),
            User.emptied_at.is_(None),
            User.id.not_in(with_records),
            User.id.not_in(awaiting_records),
        )
        .order_by(User.id)
    )
    found: list[AccountToEmpty] = []

    for user_id, closed_at in closed:
        # The query leaves these out. Said again for the type checker.
        if closed_at is None:
            continue

        due_on = add_months(_aware(closed_at), ACCOUNT_KEPT_MONTHS)

        if due_on <= now:
            found.append(
                AccountToEmpty(
                    user_id=user_id,
                    closed_at=_aware(closed_at),
                    due_on=due_on,
                )
            )

    return found


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
    db: Session, due: PastItsPeriod | AccountToEmpty, now: datetime
) -> bool:
    """Whether this already has a row that settles it for now.

    One still undecided, or one kept whose date to ask again has not
    come.

    For records, a row that says deleted does not: records found after a
    deletion are new ones, made when the account was open again. For an
    account it does, while it is about this closure: the decision is
    made and the account is waiting to be emptied. An account opened and
    closed again since has a later date, and is asked about afresh.
    """
    about_this = (
        (
            RetentionReview.subject == "records",
            RetentionReview.org_unit_id == due.org_unit_id,
        )
        if isinstance(due, PastItsPeriod)
        else (RetentionReview.subject == "account",)
    )
    rows = db.scalars(
        select(RetentionReview).where(
            RetentionReview.user_id == due.user_id, *about_this
        )
    )

    for row in rows:
        if row.decision == "undecided":
            return True

        if row.decision == "deleted":
            if (
                isinstance(due, AccountToEmpty)
                and _aware(row.closed_at) == due.closed_at
            ):
                return True

            continue

        if row.ask_again_on is None or _aware(row.ask_again_on) > now:
            return True

    return False


def _list_for_decision(
    db: Session, now: datetime, *, apply: bool
) -> tuple[int, int, int, bool]:
    """Write a row for each set of records, and each account, newly due.

    Nothing is deleted. Without ``apply`` nothing is written either, and
    the counts are what a real run would give.

    Returns:
        How many sets of records are newly awaiting a decision, how many
        accounts are, how many of both are awaiting one in all, and
        whether somebody should be told.
    """
    newly = 0
    newly_accounts = 0

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

    # After the records, so that an account whose records were listed a
    # moment ago is not listed beside them.
    if apply:
        db.flush()

    for account in closed_accounts_to_empty(db, now):
        if _is_awaiting_or_kept(db, account, now):
            continue

        newly_accounts += 1

        if not apply:
            continue

        db.add(
            RetentionReview(
                subject="account",
                user_id=account.user_id,
                org_unit_id=None,
                closed_at=account.closed_at,
                due_on=account.due_on,
                attempts=0,
                enrolments=0,
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
    listed_now = newly + newly_accounts
    awaiting = len(undecided) if apply else len(undecided) + listed_now

    # Told when something is new, and again once a week has gone by
    # since anybody was last told. Not every night: a message that
    # comes every night stops being read.
    told_long_ago = any(
        row.announced_at is None
        or _aware(row.announced_at) <= now - TOLD_AGAIN_AFTER
        for row in undecided
    )
    tell = awaiting > 0 and (listed_now > 0 or told_long_ago)

    if apply and tell:
        for row in undecided:
            row.announced_at = now

        db.flush()

    return newly, newly_accounts, awaiting, tell


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
    """Do what a person decided about one set of records, or one account.

    Checked again here, at the moment of deciding, and not trusted from
    the list the person was looking at: an account may have been opened
    again since, which clears the date its period was counted from.

    Records are deleted here. An account is not emptied here: the row is
    marked, and the nightly run that follows empties it, because only
    that run can move a passport's files to the archive.

    The rows are flushed, not committed: the caller commits.

    Args:
        db: The database session.
        review: The row being decided.
        delete_them: True to delete the records or empty the account,
            false to keep them.
        note: Why. Needed to keep.
        ask_again_on: For keeping, when to ask again. Needed to keep:
            nothing is kept with no date to come back to it.
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

        if ask_again_on is None:
            return "Give the date to ask again on."

        if _aware(ask_again_on) <= now:
            return "The date to ask again must be in the future."

        review.decision = "kept"
        review.ask_again_on = _aware(ask_again_on)
    elif review.subject == "account":
        still_due = any(
            due.user_id == review.user_id
            for due in closed_accounts_to_empty(db, now)
        )

        if not still_due:
            return (
                "This account is no longer due to be emptied: it has "
                "been opened again, or it has training records. Nothing "
                "was changed."
            )

        review.decision = "deleted"
    else:
        # A row about records has a place: a constraint holds it to
        # that. Said again for the type checker.
        if review.org_unit_id is None:
            return "These records are at no organisation."

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


@dataclass(frozen=True)
class EmptiedResult:
    """What the run did about accounts marked to be emptied.

    Attributes:
        emptied: Accounts emptied, or that a real run would empty.
        no_longer_due: Marked, and left alone: opened again since, or
            with training records again. Not a fault.
        failed: Marked and due, and could not be emptied. A fault.
    """

    emptied: int = 0
    no_longer_due: int = 0
    failed: int = 0


def empty_marked_accounts(
    db: Session,
    now: datetime,
    *,
    apply: bool,
    archive: ArchivePassport | None,
) -> EmptiedResult:
    """Empty each closed account a person has marked to be emptied.

    A row about an account that says deleted is the decision; this is
    the deed. Each account is checked again here, whatever the screen
    showed when it was marked: one opened again since, or closed a
    second time, or with training records again, is left alone.

    **Each account is committed by itself**, as soon as it is emptied,
    because its passport's files have moved by then and a later failure
    must not roll its rows back to point at files that are gone. One
    that fails is rolled back and counted, and the rest go on.

    Args:
        db: The database session. Committed here, account by account.
        now: The moment, recorded as when each was emptied.
        apply: True to empty. False counts and changes nothing.
        archive: Moves a passport's files to the archive.

    Returns:
        How many were emptied, left alone, and failed.
    """
    marked = db.execute(
        select(RetentionReview.user_id, RetentionReview.closed_at)
        .join(User, User.id == RetentionReview.user_id)
        .where(
            RetentionReview.subject == "account",
            RetentionReview.decision == "deleted",
            User.emptied_at.is_(None),
        )
        .order_by(RetentionReview.id)
    ).all()
    emptied = no_longer_due = failed = 0
    seen: set[int] = set()

    for user_id, marked_closed_at in marked:
        if user_id in seen:
            continue

        seen.add(user_id)
        user = db.get(User, user_id)

        # The decision was about one closure. An account opened and
        # closed again since has a later date, and is a new question.
        same_closure = (
            user is not None
            and user.deactivated_at is not None
            and _aware(user.deactivated_at) == _aware(marked_closed_at)
        )

        if (
            user is None
            or not same_closure
            or why_it_cannot_be_emptied(db, user) is not None
        ):
            no_longer_due += 1
            continue

        if not apply:
            emptied += 1
            continue

        try:
            empty_account(db, user, now=now, archive=archive)
            # A deliberate checkpoint: the passport's files have moved,
            # and these rows must not be rolled back by a later account.
            db.commit()
            emptied += 1
        except Exception:
            db.rollback()
            failed += 1

    return EmptiedResult(
        emptied=emptied, no_longer_due=no_longer_due, failed=failed
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

    newly_awaiting, newly_accounts, awaiting, tell_somebody = (
        _list_for_decision(db, now, apply=apply)
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
        newly_awaiting_accounts=newly_accounts,
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
    now = datetime.now(UTC)

    def archive(passport_id: str) -> list[str]:
        """Move one passport's files to where this job archives them."""
        return archive_passport(
            passport_id,
            now.date(),
            archive_bucket=os.environ.get("PASSPORT_ARCHIVE_GCS_BUCKET"),
            archive_root=os.environ.get("PASSPORT_ARCHIVE_LOCAL_ROOT"),
        )

    try:
        result = apply_retention(db, now, apply=apply)
        # This makes its own session, so nothing commits for it.
        db.commit()
        # After the commit, and committing as it goes: see its docstring.
        accounts = empty_marked_accounts(db, now, apply=apply, archive=archive)
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
    print(
        f"{listed} {result.newly_awaiting_accounts} closed accounts "
        "newly due to be emptied"
    )

    emptied = "Emptied" if apply else "Would empty"
    print(f"{emptied} {accounts.emptied} closed accounts marked to be emptied")

    if accounts.no_longer_due:
        print(
            f"Left {accounts.no_longer_due} marked accounts alone: opened "
            "again, or with training records again"
        )

    # Its own line, and only when somebody should act: an alert matches
    # it. A count and no names. Who they are is on the screen, behind a
    # sign-in.
    if apply and result.tell_somebody:
        print(
            f"{DECISION_NEEDED} {result.awaiting} decisions are waiting "
            "about closed accounts past their period"
        )

    # Last, and worded exactly so: the "has not run" alert counts this
    # line. See RUN_FINISHED in retention_test.py.
    print(f"{verb} {result.marketing_records} marketing answer records")

    if not apply:
        print("A report only. Set RETENTION_APPLY=true to delete.")

    # After the line the "has not run" alert counts: the run did
    # finish. Failing it is what tells somebody, through the alert on a
    # scheduled action that failed.
    if accounts.failed:
        print(
            f"✗ {accounts.failed} closed accounts marked to be emptied "
            "could not be. They are left as they were, and tried again "
            "on the next run.",
            file=sys.stderr,
        )
        return 1

    return 0


def set_records_kept() -> int:
    """Set how long one organisation's records outlast a closed account.

    The ``set-records-kept`` admin action. Reads:

    - ``RECORDS_ORG_UNIT_ID``: the organisation, as an org unit id.
    - ``RECORDS_KEPT_MONTHS``: the months, 1 to 600, or ``none`` to stop
      deleting for that organisation.
    - ``RECORDS_APPLY``: ``true`` to change it. Anything else reports
      what it is now and what it would become.

    The org unit must exist. The name is printed before anything is
    changed, so a mistyped id is seen in the report.

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
        org_unit = db.get(OrgUnit, int(org_text))

        if org_unit is None:
            print(f"✗ There is no org unit {org_text}", file=sys.stderr)
            return 1

        was = org_unit.records_kept_months_after_closure
        name = org_unit.name

        if apply:
            org_unit.records_kept_months_after_closure = months
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
