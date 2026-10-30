"""Reminding somebody enrolled on a module who has not started.

A module says in its own ``module.yaml`` how many days apart to remind
somebody and how many times: ``enrolmentReminderEveryDays`` and
``enrolmentReminderCount``, copied onto its config row at sync. A module
that sets neither sends none.

Somebody is reminded while all of these hold:

- they are enrolled on the module, at an organisation that serves it
- they have no completed attempt at it there, passed or failed
- fewer reminders have gone than the module allows
- the interval has passed since the last one, or since they were
  enrolled for the first
- they do not hold ``manage_teaching``: a teaching admin is enrolled so
  they can try a module, and is not chased to finish it

Each reminder is recorded on the enrolment row as it is sent, so a run
that is repeated, or stopped part-way, never sends one twice.

**A second email tells somebody a pass is due to be repeated.** A module
says how long a pass lasts with ``renewalMonths``. When somebody's latest
pass reaches that age they are told, once. A later pass starts the count
again, which is what "the last successful assessment" means in the
EoEETA agreement that asks for this.

Run as the ``send-teaching-reminders`` admin action, on a schedule. It
reports unless ``REMINDERS_APPLY`` is ``true``.
"""

from __future__ import annotations

import calendar
import logging
import os
import sys
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.email.render import render_email, send_args
from app.email_send import (
    EmailNotAllowedError,
    EmailRateLimitError,
    EmailSendError,
    send_email,
)
from app.features.teaching.email_templates import email_partner
from app.features.teaching.models import (
    Assessment,
    ModuleEnrolment,
    QuestionBankConfig,
    QuestionBankOrgStatus,
    TeachingOrgSettings,
)
from app.models import User

logger = logging.getLogger(__name__)

#: Holders run the modules rather than take them, so are never reminded.
NOT_REMINDED = "manage_teaching"


@dataclass(frozen=True)
class DueReminder:
    """One reminder that should go now.

    Attributes:
        enrolment: The enrolment it is about.
        user: Who is enrolled.
        config: The version of the module their organisation serves.
    """

    enrolment: ModuleEnrolment
    user: User
    config: QuestionBankConfig


@dataclass(frozen=True)
class ReminderResult:
    """What a run did.

    Attributes:
        due: How many reminders were due.
        sent: How many of them went. Always 0 for a report.
        failed: How many could not be sent.
    """

    due: int
    sent: int
    failed: int


def _aware(value: datetime) -> datetime:
    """*value* with a timezone.

    SQLite hands a timezone-aware column back without one, so a naive
    value is read as UTC, which is what was written.
    """
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _served_config(
    db: Session, org_unit_id: int, question_bank_id: str
) -> QuestionBankConfig | None:
    """The version of a module an organisation serves, or None.

    None for a module that is not live there or has nothing promoted:
    nobody can sit it, so nobody is reminded to.
    """
    status = db.scalar(
        select(QuestionBankOrgStatus).where(
            QuestionBankOrgStatus.org_unit_id == org_unit_id,
            QuestionBankOrgStatus.question_bank_id == question_bank_id,
        )
    )

    if status is None or not status.is_live or status.active_version is None:
        return None

    return db.scalar(
        select(QuestionBankConfig).where(
            QuestionBankConfig.org_unit_id == org_unit_id,
            QuestionBankConfig.question_bank_id == question_bank_id,
            QuestionBankConfig.version == status.active_version,
        )
    )


def _has_completed_attempt(db: Session, enrolment: ModuleEnrolment) -> bool:
    """Whether they have finished an attempt at the module, pass or fail."""
    found = db.scalar(
        select(Assessment.id)
        .where(
            Assessment.user_id == enrolment.user_id,
            Assessment.org_unit_id == enrolment.org_unit_id,
            Assessment.question_bank_id == enrolment.question_bank_id,
            Assessment.completed_at.is_not(None),
        )
        .limit(1)
    )

    return found is not None


def due_enrolment_reminders(db: Session, now: datetime) -> list[DueReminder]:
    """Every reminder that should go at *now*.

    Args:
        db: The database session.
        now: The moment to judge by.

    Returns:
        The reminders due, in enrolment order.
    """
    # unique(): User eager-loads collections through joins, so each
    # enrolment would otherwise come back once for each row of them.
    rows = (
        db.execute(
            select(ModuleEnrolment, User)
            .join(User, User.id == ModuleEnrolment.user_id)
            .where(User.is_active.is_(True), User.email_verified.is_(True))
            .order_by(ModuleEnrolment.id)
        )
        .unique()
        .all()
    )
    due: list[DueReminder] = []

    for enrolment, user in rows:
        if not enrolment.is_current(now):
            continue
        if NOT_REMINDED in user.get_final_competencies():
            continue

        config = _served_config(
            db, enrolment.org_unit_id, enrolment.question_bank_id
        )

        if config is None:
            continue

        every = config.enrolment_reminder_every_days
        count = config.enrolment_reminder_count

        if every is None or count is None:
            continue
        if enrolment.reminders_sent >= count:
            continue

        counted_from = enrolment.last_reminded_at or enrolment.starts_on

        if now < _aware(counted_from) + timedelta(days=every):
            continue
        if _has_completed_attempt(db, enrolment):
            continue

        due.append(DueReminder(enrolment=enrolment, user=user, config=config))

    return due


def _send(db: Session, reminder: DueReminder) -> None:
    """Send one reminder. Raises what ``send_email`` raises."""
    enrolment = reminder.enrolment
    config = reminder.config
    count = config.enrolment_reminder_count or 0
    org_settings = db.scalar(
        select(TeachingOrgSettings).where(
            TeachingOrgSettings.org_unit_id == enrolment.org_unit_id
        )
    )
    rendered = render_email(
        "enrolment_reminder.html.j2",
        "quill",
        {
            "name": reminder.user.full_name or reminder.user.username,
            "module_title": config.title,
            "module_url": (
                f"{settings.FRONTEND_URL}/teaching/"
                f"{enrolment.question_bank_id}"
            ),
            "is_last": enrolment.reminders_sent + 1 >= count,
        },
        partner=email_partner(org_settings, config.title),
    )

    send_email(to=reminder.user.email, **send_args(rendered))


def send_enrolment_reminders(
    db: Session, now: datetime, *, apply: bool
) -> ReminderResult:
    """Send every reminder that is due, or count them.

    Args:
        db: The database session.
        now: The moment to judge by, and to record against each send.
        apply: True to send. False counts and sends nothing.

    Returns:
        How many were due, sent and failed.
    """
    due = due_enrolment_reminders(db, now)

    if not apply:
        return ReminderResult(due=len(due), sent=0, failed=0)

    sent = 0
    failed = 0

    for reminder in due:
        enrolment = reminder.enrolment

        try:
            _send(db, reminder)
        except (
            EmailNotAllowedError,
            EmailRateLimitError,
            EmailSendError,
        ) as exc:
            failed += 1
            # The enrolment's id and the kind of failure. Never the
            # address, and never the error's own words, which may hold it.
            logger.warning(
                "enrolment reminder not sent",
                extra={
                    "enrolment_id": enrolment.id,
                    "reason": type(exc).__name__,
                },
            )

            continue

        enrolment.last_reminded_at = now
        enrolment.reminders_sent += 1
        # Committed after each send on purpose. An email that has gone
        # must be recorded even if a later one fails or the job is
        # stopped, or the next run would send it again.
        db.commit()
        sent += 1

    return ReminderResult(due=len(due), sent=sent, failed=failed)


@dataclass(frozen=True)
class DueRenewal:
    """One pass whose holder should be told now that it is due again.

    Attributes:
        assessment: The pass: their latest at this module.
        user: Who passed.
        config: The version of the module their organisation serves.
        passed_at: When they passed.
    """

    assessment: Assessment
    user: User
    config: QuestionBankConfig
    passed_at: datetime


def add_months(moment: datetime, months: int) -> datetime:
    """*moment* moved on by whole calendar months.

    The day is kept where the month has it and pulled back to the
    month's last day where it does not: 31 January and one month is 28
    or 29 February.
    """
    index = moment.month - 1 + months
    year = moment.year + index // 12
    month = index % 12 + 1
    day = min(moment.day, calendar.monthrange(year, month)[1])

    return moment.replace(year=year, month=month, day=day)


def _is_enrolled(db: Session, assessment: Assessment, now: datetime) -> bool:
    """Whether they are still enrolled on the module they passed."""
    enrolments = db.scalars(
        select(ModuleEnrolment).where(
            ModuleEnrolment.user_id == assessment.user_id,
            ModuleEnrolment.org_unit_id == assessment.org_unit_id,
            ModuleEnrolment.question_bank_id == assessment.question_bank_id,
        )
    )

    return any(enrolment.is_current(now) for enrolment in enrolments)


def due_renewal_notices(db: Session, now: datetime) -> list[DueRenewal]:
    """Every pass whose holder should be told at *now*.

    Only somebody's **latest** pass at a module counts. An older pass has
    been repeated already, so it is never due, however old it is.

    Args:
        db: The database session.
        now: The moment to judge by.

    Returns:
        The notices due, oldest pass first.
    """
    rows = (
        db.execute(
            select(Assessment, User)
            .join(User, User.id == Assessment.user_id)
            .where(
                Assessment.is_passed.is_(True),
                Assessment.completed_at.is_not(None),
                User.is_active.is_(True),
                User.email_verified.is_(True),
            )
            .order_by(Assessment.completed_at.desc(), Assessment.id.desc())
        )
        .unique()
        .all()
    )
    seen: set[tuple[int, int, str]] = set()
    due: list[DueRenewal] = []

    for assessment, user in rows:
        key = (
            assessment.user_id,
            assessment.org_unit_id,
            assessment.question_bank_id,
        )

        # Newest first, so the first one met for a key is the latest pass
        # and every other is one they have since repeated.
        if key in seen:
            continue

        seen.add(key)

        # The query asks for a finish time; this is for the type checker.
        if assessment.completed_at is None:
            continue
        if assessment.renewal_notice_sent_at is not None:
            continue

        config = _served_config(
            db, assessment.org_unit_id, assessment.question_bank_id
        )

        if config is None or config.renewal_months is None:
            continue

        passed_at = _aware(assessment.completed_at)

        if now < add_months(passed_at, config.renewal_months):
            continue
        if not _is_enrolled(db, assessment, now):
            continue

        due.append(
            DueRenewal(
                assessment=assessment,
                user=user,
                config=config,
                passed_at=passed_at,
            )
        )

    due.reverse()

    return due


def _send_renewal(db: Session, renewal: DueRenewal) -> None:
    """Send one notice. Raises what ``send_email`` raises."""
    assessment = renewal.assessment
    config = renewal.config
    passed_at = renewal.passed_at
    org_settings = db.scalar(
        select(TeachingOrgSettings).where(
            TeachingOrgSettings.org_unit_id == assessment.org_unit_id
        )
    )
    rendered = render_email(
        "renewal_notice.html.j2",
        "quill",
        {
            "name": renewal.user.full_name or renewal.user.username,
            "module_title": config.title,
            "passed_on": f"{passed_at.day} {passed_at:%B %Y}",
            "module_url": (
                f"{settings.FRONTEND_URL}/teaching/"
                f"{assessment.question_bank_id}"
            ),
        },
        partner=email_partner(org_settings, config.title),
    )

    send_email(to=renewal.user.email, **send_args(rendered))


def send_renewal_notices(
    db: Session, now: datetime, *, apply: bool
) -> ReminderResult:
    """Tell everybody whose pass is due to be repeated, or count them.

    Args:
        db: The database session.
        now: The moment to judge by, and to record against each send.
        apply: True to send. False counts and sends nothing.

    Returns:
        How many were due, sent and failed.
    """
    due = due_renewal_notices(db, now)

    if not apply:
        return ReminderResult(due=len(due), sent=0, failed=0)

    sent = 0
    failed = 0

    for renewal in due:
        assessment = renewal.assessment

        try:
            _send_renewal(db, renewal)
        except (
            EmailNotAllowedError,
            EmailRateLimitError,
            EmailSendError,
        ) as exc:
            failed += 1
            logger.warning(
                "renewal notice not sent",
                extra={
                    "assessment_id": assessment.id,
                    "reason": type(exc).__name__,
                },
            )

            continue

        assessment.renewal_notice_sent_at = now
        # Committed after each send, for the reason given in
        # send_enrolment_reminders: this notice goes once.
        db.commit()
        sent += 1

    return ReminderResult(due=len(due), sent=sent, failed=failed)


def main() -> int:
    """Run the reminders from the environment and print the counts.

    Reads ``REMINDERS_APPLY``. Anything but ``true`` is a report.

    Returns:
        The exit status: 0 when every email due was sent, or for a
        report; 1 when it could not run or any could not be sent.
    """
    from app.db.core_db import CoreSessionLocal

    apply = os.environ.get("REMINDERS_APPLY", "").strip().lower() == "true"
    db = CoreSessionLocal()

    now = datetime.now(UTC)

    try:
        result = send_enrolment_reminders(db, now, apply=apply)
        renewals = send_renewal_notices(db, now, apply=apply)
    except Exception as exc:
        db.rollback()
        print(
            f"✗ The reminders could not run: {type(exc).__name__}",
            file=sys.stderr,
        )

        return 1
    finally:
        db.close()

    if not apply:
        print(f"Would send {result.due} enrolment reminders")
        print(f"Would send {renewals.due} renewal notices")
        print("A report only. Set REMINDERS_APPLY=true to send.")

        return 0

    print(f"Sent {result.sent} of {result.due} enrolment reminders")
    print(f"Sent {renewals.sent} of {renewals.due} renewal notices")

    failed = result.failed + renewals.failed

    if failed:
        print(f"✗ {failed} could not be sent", file=sys.stderr)

        return 1

    return 0
