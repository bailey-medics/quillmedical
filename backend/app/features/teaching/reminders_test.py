"""Enrolment reminders: who is reminded, when, and how many times."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.email_send import EmailSendError
from app.features.teaching import reminders
from app.features.teaching.models import (
    Assessment,
    ModuleEnrolment,
    QuestionBankConfig,
    QuestionBankOrgStatus,
    TeachingOrgSettings,
)
from app.features.teaching.reminders import (
    ReminderResult,
    due_enrolment_reminders,
    send_enrolment_reminders,
)
from app.models import OrgUnit, User

NOW = datetime(2030, 6, 1, 9, 0, tzinfo=UTC)
BANK = "colonoscopy-optical-diagnosis"
A_DAY = timedelta(days=1)


@pytest.fixture
def org(db_session: Session) -> OrgUnit:
    org = OrgUnit(name="Teaching Org", type="hospital_team")
    db_session.add(org)
    db_session.flush()

    return org


def _user(db: Session, name: str, **fields: Any) -> User:
    user = User(
        username=name,
        email=f"{name}@example.nhs.uk",
        password_hash="x",
        full_name=f"{name.title()} Example",
        is_active=True,
        email_verified=True,
    )

    for field, value in fields.items():
        setattr(user, field, value)

    db.add(user)
    db.flush()

    return user


def _module(
    db: Session,
    org: OrgUnit,
    *,
    every: int | None = 7,
    count: int | None = 6,
    is_live: bool = True,
    active_version: int | None = 1,
) -> QuestionBankConfig:
    """A module the organisation serves, with its reminder schedule."""
    config = QuestionBankConfig(
        org_unit_id=org.id,
        question_bank_id=BANK,
        version=1,
        title="Optical diagnosis",
        description="",
        type="uniform",
        config_yaml={},
        enrolment_reminder_every_days=every,
        enrolment_reminder_count=count,
        synced_by_actor="deploy_bot",
    )
    db.add(config)
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=BANK,
            is_live=is_live,
            active_version=active_version,
        )
    )
    db.flush()

    return config


def _enrol(
    db: Session,
    org: OrgUnit,
    user: User,
    *,
    days_ago: int,
    ends_on: datetime | None = None,
) -> ModuleEnrolment:
    enrolment = ModuleEnrolment(
        user_id=user.id,
        org_unit_id=org.id,
        question_bank_id=BANK,
        starts_on=NOW - timedelta(days=days_ago),
        ends_on=ends_on,
        source="admin",
    )
    db.add(enrolment)
    db.flush()

    return enrolment


def _attempt(
    db: Session, org: OrgUnit, user: User, *, completed: bool, passed: bool
) -> None:
    db.add(
        Assessment(
            user_id=user.id,
            org_unit_id=org.id,
            question_bank_id=BANK,
            bank_version=1,
            started_at=NOW - A_DAY,
            completed_at=NOW - A_DAY if completed else None,
            time_limit_minutes=60,
            total_items=3,
            is_passed=passed if completed else None,
        )
    )
    db.flush()


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Capture what would be sent, in place of sending it."""
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(
        reminders, "send_email", lambda **kwargs: calls.append(kwargs)
    )

    return calls


class TestWhoIsDue:
    """The first goes one interval after enrolling, to somebody who has
    not finished an attempt."""

    def test_a_week_after_enrolling_with_no_attempt(
        self, db_session: Session, org: OrgUnit
    ) -> None:
        _module(db_session, org)
        user = _user(db_session, "sam")
        _enrol(db_session, org, user, days_ago=7)

        [due] = due_enrolment_reminders(db_session, NOW)

        assert due.user.id == user.id

    def test_not_before_the_interval_has_passed(
        self, db_session: Session, org: OrgUnit
    ) -> None:
        _module(db_session, org)
        _enrol(db_session, org, _user(db_session, "sam"), days_ago=6)

        assert due_enrolment_reminders(db_session, NOW) == []

    @pytest.mark.parametrize("passed", [True, False])
    def test_not_once_an_attempt_is_finished_pass_or_fail(
        self, db_session: Session, org: OrgUnit, passed: bool
    ) -> None:
        _module(db_session, org)
        user = _user(db_session, "sam")
        _enrol(db_session, org, user, days_ago=30)
        _attempt(db_session, org, user, completed=True, passed=passed)

        assert due_enrolment_reminders(db_session, NOW) == []

    def test_an_attempt_started_and_not_finished_does_not_count(
        self, db_session: Session, org: OrgUnit
    ) -> None:
        _module(db_session, org)
        user = _user(db_session, "sam")
        _enrol(db_session, org, user, days_ago=30)
        _attempt(db_session, org, user, completed=False, passed=False)

        assert len(due_enrolment_reminders(db_session, NOW)) == 1

    def test_an_attempt_at_another_organisation_does_not_count(
        self, db_session: Session, org: OrgUnit
    ) -> None:
        other = OrgUnit(name="Elsewhere", type="hospital_team")
        db_session.add(other)
        db_session.flush()
        _module(db_session, org)
        user = _user(db_session, "sam")
        _enrol(db_session, org, user, days_ago=30)
        _attempt(db_session, other, user, completed=True, passed=True)

        assert len(due_enrolment_reminders(db_session, NOW)) == 1


class TestWhoIsNot:
    def test_a_module_that_sets_no_schedule_sends_none(
        self, db_session: Session, org: OrgUnit
    ) -> None:
        _module(db_session, org, every=None, count=None)
        _enrol(db_session, org, _user(db_session, "sam"), days_ago=30)

        assert due_enrolment_reminders(db_session, NOW) == []

    @pytest.mark.parametrize(
        "status", [{"is_live": False}, {"active_version": None}]
    )
    def test_a_module_nobody_can_sit_sends_none(
        self, db_session: Session, org: OrgUnit, status: dict[str, Any]
    ) -> None:
        _module(db_session, org, **status)
        _enrol(db_session, org, _user(db_session, "sam"), days_ago=30)

        assert due_enrolment_reminders(db_session, NOW) == []

    @pytest.mark.parametrize(
        "fields", [{"is_active": False}, {"email_verified": False}]
    )
    def test_a_closed_account_or_an_unverified_address(
        self, db_session: Session, org: OrgUnit, fields: dict[str, Any]
    ) -> None:
        _module(db_session, org)
        _enrol(
            db_session, org, _user(db_session, "sam", **fields), days_ago=30
        )

        assert due_enrolment_reminders(db_session, NOW) == []

    def test_somebody_whose_enrolment_has_ended(
        self, db_session: Session, org: OrgUnit
    ) -> None:
        _module(db_session, org)
        _enrol(
            db_session,
            org,
            _user(db_session, "sam"),
            days_ago=30,
            ends_on=NOW - A_DAY,
        )

        assert due_enrolment_reminders(db_session, NOW) == []


class TestHowManyAndHowOften:
    def test_the_next_is_counted_from_the_last_one_sent(
        self, db_session: Session, org: OrgUnit
    ) -> None:
        _module(db_session, org)
        enrolment = _enrol(
            db_session, org, _user(db_session, "sam"), days_ago=60
        )
        enrolment.last_reminded_at = NOW - timedelta(days=6)
        enrolment.reminders_sent = 1

        assert due_enrolment_reminders(db_session, NOW) == []

        enrolment.last_reminded_at = NOW - timedelta(days=7)

        assert len(due_enrolment_reminders(db_session, NOW)) == 1

    def test_it_stops_at_the_number_the_module_gives(
        self, db_session: Session, org: OrgUnit
    ) -> None:
        _module(db_session, org, count=6)
        enrolment = _enrol(
            db_session, org, _user(db_session, "sam"), days_ago=365
        )
        enrolment.last_reminded_at = NOW - timedelta(days=100)
        enrolment.reminders_sent = 6

        assert due_enrolment_reminders(db_session, NOW) == []

    def test_six_weekly_runs_send_six_and_a_seventh_sends_none(
        self,
        db_session: Session,
        org: OrgUnit,
        sent: list[dict[str, Any]],
    ) -> None:
        """EoEETA's schedule, walked a week at a time."""
        _module(db_session, org, every=7, count=6)
        enrolment = _enrol(
            db_session, org, _user(db_session, "sam"), days_ago=0
        )

        for week in range(1, 9):
            send_enrolment_reminders(
                db_session, NOW + timedelta(weeks=week), apply=True
            )

        assert len(sent) == 6
        assert enrolment.reminders_sent == 6


class TestSending:
    def test_sends_to_the_person_and_records_it(
        self,
        db_session: Session,
        org: OrgUnit,
        sent: list[dict[str, Any]],
    ) -> None:
        _module(db_session, org)
        user = _user(db_session, "sam")
        enrolment = _enrol(db_session, org, user, days_ago=7)

        result = send_enrolment_reminders(db_session, NOW, apply=True)

        assert result == ReminderResult(due=1, sent=1, failed=0)
        [email] = sent
        assert email["to"] == user.email
        assert "Optical diagnosis" in email["subject"]
        assert f"/teaching/{BANK}" in email["html_body"]
        assert "Sam Example" in email["html_body"]
        assert enrolment.reminders_sent == 1
        # SQLite hands the time back without its timezone
        assert enrolment.last_reminded_at is not None
        assert enrolment.last_reminded_at.replace(tzinfo=UTC) == NOW

    def test_running_twice_at_once_sends_once(
        self,
        db_session: Session,
        org: OrgUnit,
        sent: list[dict[str, Any]],
    ) -> None:
        _module(db_session, org)
        _enrol(db_session, org, _user(db_session, "sam"), days_ago=7)

        send_enrolment_reminders(db_session, NOW, apply=True)
        send_enrolment_reminders(db_session, NOW, apply=True)

        assert len(sent) == 1

    def test_only_the_last_one_says_it_is_the_last(
        self,
        db_session: Session,
        org: OrgUnit,
        sent: list[dict[str, Any]],
    ) -> None:
        _module(db_session, org, count=2)
        enrolment = _enrol(
            db_session, org, _user(db_session, "sam"), days_ago=7
        )

        send_enrolment_reminders(db_session, NOW, apply=True)
        enrolment.last_reminded_at = NOW - timedelta(days=7)
        send_enrolment_reminders(db_session, NOW, apply=True)

        first, last = sent
        assert "last reminder" not in first["html_body"]
        assert "last reminder" in last["html_body"]

    def test_it_goes_out_for_the_organisation_where_it_has_settings(
        self,
        db_session: Session,
        org: OrgUnit,
        sent: list[dict[str, Any]],
    ) -> None:
        db_session.add(
            TeachingOrgSettings(
                org_unit_id=org.id,
                coordinator_email="lead@example.nhs.uk",
                institution_name="East of England Endoscopy Training Academy",
                email_short_name="EoEETA",
            )
        )
        _module(db_session, org)
        _enrol(db_session, org, _user(db_session, "sam"), days_ago=7)

        send_enrolment_reminders(db_session, NOW, apply=True)

        [email] = sent
        assert email["from_name"] == "EoEETA via Quill Medical"
        assert email["reply_to"] == "lead@example.nhs.uk"

    def test_a_report_counts_and_sends_nothing(
        self,
        db_session: Session,
        org: OrgUnit,
        sent: list[dict[str, Any]],
    ) -> None:
        _module(db_session, org)
        enrolment = _enrol(
            db_session, org, _user(db_session, "sam"), days_ago=7
        )

        result = send_enrolment_reminders(db_session, NOW, apply=False)

        assert result == ReminderResult(due=1, sent=0, failed=0)
        assert sent == []
        assert enrolment.reminders_sent == 0

    def test_one_that_cannot_be_sent_is_not_recorded_and_the_rest_go(
        self,
        db_session: Session,
        org: OrgUnit,
        monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """So the next run tries that one again, and nobody else waits."""
        _module(db_session, org)
        unlucky = _enrol(db_session, org, _user(db_session, "ann"), days_ago=7)
        lucky = _enrol(db_session, org, _user(db_session, "bob"), days_ago=7)

        def flaky(**kwargs: Any) -> None:
            if kwargs["to"].startswith("ann@"):
                raise EmailSendError("could not reach ann@example.nhs.uk")

        monkeypatch.setattr(reminders, "send_email", flaky)

        result = send_enrolment_reminders(db_session, NOW, apply=True)

        assert result == ReminderResult(due=2, sent=1, failed=1)
        assert unlucky.reminders_sent == 0
        assert unlucky.last_reminded_at is None
        assert lucky.reminders_sent == 1
        for record in caplog.records:
            assert "ann@example.nhs.uk" not in record.getMessage()
            assert "ann@example.nhs.uk" not in str(record.__dict__)
