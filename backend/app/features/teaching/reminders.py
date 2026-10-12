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

Each reminder is recorded on the enrolment row as it is sent, so a run
that is repeated, or stopped part-way, never sends one twice.

Run as the ``send-teaching-reminders`` admin action, on a schedule. It
reports unless ``REMINDERS_APPLY`` is ``true``.
"""

from __future__ import annotations

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


def main() -> int:
    """Run the reminders from the environment and print the counts.

    Reads ``REMINDERS_APPLY``. Anything but ``true`` is a report.

    Returns:
        The exit status: 0 when every reminder due was sent, or for a
        report; 1 when it could not run or any could not be sent.
    """
    from app.db.core_db import CoreSessionLocal

    apply = os.environ.get("REMINDERS_APPLY", "").strip().lower() == "true"
    db = CoreSessionLocal()

    try:
        result = send_enrolment_reminders(db, datetime.now(UTC), apply=apply)
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
        print("A report only. Set REMINDERS_APPLY=true to send.")

        return 0

    print(f"Sent {result.sent} of {result.due} enrolment reminders")

    if result.failed:
        print(f"✗ {result.failed} could not be sent", file=sys.stderr)

        return 1

    return 0
