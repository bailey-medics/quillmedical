"""Enrolment reminders: who is reminded, when, and how many times."""

from __future__ import annotations

import re
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
    add_months,
    due_enrolment_reminders,
    due_renewal_notices,
    send_enrolment_reminders,
    send_renewal_notices,
)
from app.models import OrgUnit, User, UserCompetency

NOW = datetime(2030, 6, 1, 9, 0, tzinfo=UTC)
BANK = "colonoscopy-optical-diagnosis"
A_DAY = timedelta(days=1)

#: The line a real run ends on, as the "has not run" alert counts it in
#: infra/modules/monitoring/main.tf. The two must be the same text:
#: .github/scripts/terraform/scheduled-action-heartbeat.bats holds them to
#: it. Change the line the action prints and this, and that test says the
#: alert has to change too.
RUN_FINISHED = r"^Sent [0-9]+ of [0-9]+ renewal notices$"


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
    renewal_months: int | None = None,
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
        renewal_months=renewal_months,
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

    # A teaching admin is enrolled so they can try a module. Their
    # out-of-office answered the reminder, to Quill's own inbox.
    def test_a_teaching_admin(self, db_session: Session, org: OrgUnit) -> None:
        _module(db_session, org)
        admin = _user(db_session, "ada")
        db_session.add(
            UserCompetency(
                user_id=admin.id,
                competency_id="manage_teaching",
                starts_on=NOW - timedelta(days=30),
                source="individual",
            )
        )
        db_session.flush()
        db_session.refresh(admin)
        _enrol(db_session, org, admin, days_ago=30)

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


def _pass(
    db: Session, org: OrgUnit, user: User, *, on: datetime
) -> Assessment:
    """A passed attempt, finished at *on*."""
    assessment = Assessment(
        user_id=user.id,
        org_unit_id=org.id,
        question_bank_id=BANK,
        bank_version=1,
        started_at=on - timedelta(hours=1),
        completed_at=on,
        time_limit_minutes=60,
        total_items=3,
        is_passed=True,
    )
    db.add(assessment)
    db.flush()

    return assessment


THREE_YEARS_AGO = datetime(2027, 6, 1, 9, 0, tzinfo=UTC)


class TestAddMonths:
    def test_three_years_on_is_the_same_day_three_years_later(self) -> None:
        assert add_months(THREE_YEARS_AGO, 36) == NOW

    def test_a_day_the_month_lacks_becomes_its_last_day(self) -> None:
        end_of_january = datetime(2030, 1, 31, tzinfo=UTC)

        assert add_months(end_of_january, 1) == datetime(
            2030, 2, 28, tzinfo=UTC
        )

    def test_a_leap_day_three_years_on_is_the_28th(self) -> None:
        leap_day = datetime(2028, 2, 29, tzinfo=UTC)

        assert add_months(leap_day, 36) == datetime(2031, 2, 28, tzinfo=UTC)

    def test_it_carries_over_the_end_of_a_year(self) -> None:
        november = datetime(2029, 11, 15, tzinfo=UTC)

        assert add_months(november, 3) == datetime(2030, 2, 15, tzinfo=UTC)


class TestRenewalNotices:
    """Told once, when the latest pass reaches the age the module gives."""

    def test_three_years_after_a_pass(
        self, db_session: Session, org: OrgUnit
    ) -> None:
        _module(db_session, org, renewal_months=36)
        user = _user(db_session, "sam")
        _enrol(db_session, org, user, days_ago=1200)
        passed = _pass(db_session, org, user, on=THREE_YEARS_AGO)

        [due] = due_renewal_notices(db_session, NOW)

        assert due.assessment.id == passed.id

    def test_not_the_day_before(
        self, db_session: Session, org: OrgUnit
    ) -> None:
        _module(db_session, org, renewal_months=36)
        user = _user(db_session, "sam")
        _enrol(db_session, org, user, days_ago=1200)
        _pass(db_session, org, user, on=THREE_YEARS_AGO)

        assert due_renewal_notices(db_session, NOW - A_DAY) == []

    def test_a_later_pass_starts_the_count_again(
        self, db_session: Session, org: OrgUnit
    ) -> None:
        """The agreement counts from the last successful assessment."""
        _module(db_session, org, renewal_months=36)
        user = _user(db_session, "sam")
        _enrol(db_session, org, user, days_ago=1200)
        _pass(db_session, org, user, on=THREE_YEARS_AGO)
        _pass(db_session, org, user, on=NOW - timedelta(days=30))

        assert due_renewal_notices(db_session, NOW) == []

    def test_a_failed_attempt_since_does_not_start_it_again(
        self, db_session: Session, org: OrgUnit
    ) -> None:
        _module(db_session, org, renewal_months=36)
        user = _user(db_session, "sam")
        _enrol(db_session, org, user, days_ago=1200)
        _pass(db_session, org, user, on=THREE_YEARS_AGO)
        _attempt(db_session, org, user, completed=True, passed=False)

        assert len(due_renewal_notices(db_session, NOW)) == 1

    def test_a_module_that_gives_no_period_tells_nobody(
        self, db_session: Session, org: OrgUnit
    ) -> None:
        _module(db_session, org, renewal_months=None)
        user = _user(db_session, "sam")
        _enrol(db_session, org, user, days_ago=1200)
        _pass(db_session, org, user, on=THREE_YEARS_AGO)

        assert due_renewal_notices(db_session, NOW) == []

    def test_somebody_no_longer_enrolled_is_not_told(
        self, db_session: Session, org: OrgUnit
    ) -> None:
        """They could not repeat it if they were."""
        _module(db_session, org, renewal_months=36)
        user = _user(db_session, "sam")
        _enrol(db_session, org, user, days_ago=1200, ends_on=NOW - A_DAY)
        _pass(db_session, org, user, on=THREE_YEARS_AGO)

        assert due_renewal_notices(db_session, NOW) == []

    def test_a_closed_account_is_not_told(
        self, db_session: Session, org: OrgUnit
    ) -> None:
        _module(db_session, org, renewal_months=36)
        user = _user(db_session, "sam", is_active=False)
        _enrol(db_session, org, user, days_ago=1200)
        _pass(db_session, org, user, on=THREE_YEARS_AGO)

        assert due_renewal_notices(db_session, NOW) == []

    def test_it_is_sent_once_and_names_the_day_they_passed(
        self,
        db_session: Session,
        org: OrgUnit,
        sent: list[dict[str, Any]],
    ) -> None:
        _module(db_session, org, renewal_months=36)
        user = _user(db_session, "sam")
        _enrol(db_session, org, user, days_ago=1200)
        passed = _pass(db_session, org, user, on=THREE_YEARS_AGO)

        first = send_renewal_notices(db_session, NOW, apply=True)
        second = send_renewal_notices(db_session, NOW + A_DAY, apply=True)

        assert first == ReminderResult(due=1, sent=1, failed=0)
        assert second == ReminderResult(due=0, sent=0, failed=0)
        [email] = sent
        assert email["to"] == user.email
        assert "due to be repeated" in email["subject"]
        assert "1 June 2027" in email["html_body"]
        assert passed.renewal_notice_sent_at is not None

    def test_a_report_counts_and_sends_nothing(
        self,
        db_session: Session,
        org: OrgUnit,
        sent: list[dict[str, Any]],
    ) -> None:
        _module(db_session, org, renewal_months=36)
        user = _user(db_session, "sam")
        _enrol(db_session, org, user, days_ago=1200)
        passed = _pass(db_session, org, user, on=THREE_YEARS_AGO)

        result = send_renewal_notices(db_session, NOW, apply=False)

        assert result == ReminderResult(due=1, sent=0, failed=0)
        assert sent == []
        assert passed.renewal_notice_sent_at is None

    def test_one_that_cannot_be_sent_is_tried_again_next_time(
        self,
        db_session: Session,
        org: OrgUnit,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        _module(db_session, org, renewal_months=36)
        user = _user(db_session, "sam")
        _enrol(db_session, org, user, days_ago=1200)
        passed = _pass(db_session, org, user, on=THREE_YEARS_AGO)

        def refuse(**kwargs: Any) -> None:
            raise EmailSendError("could not reach the mail provider")

        monkeypatch.setattr(reminders, "send_email", refuse)

        result = send_renewal_notices(db_session, NOW, apply=True)

        assert result == ReminderResult(due=1, sent=0, failed=1)
        assert passed.renewal_notice_sent_at is None
        assert len(due_renewal_notices(db_session, NOW)) == 1


class TestMain:
    """The admin action: a report unless told to send."""

    @pytest.fixture
    def one_of_each_due(
        self,
        db_session: Session,
        org: OrgUnit,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """One reminder and one notice due right now, and ``main`` handed
        the test session."""
        import app.db.core_db as core_db

        monkeypatch.setattr(core_db, "CoreSessionLocal", lambda: db_session)
        monkeypatch.setattr(db_session, "close", lambda: None)
        now = datetime.now(UTC)
        _module(db_session, org, renewal_months=36)
        starter = _user(db_session, "ann")
        db_session.add(
            ModuleEnrolment(
                user_id=starter.id,
                org_unit_id=org.id,
                question_bank_id=BANK,
                starts_on=now - timedelta(days=8),
                source="admin",
            )
        )
        holder = _user(db_session, "bob")
        db_session.add(
            ModuleEnrolment(
                user_id=holder.id,
                org_unit_id=org.id,
                question_bank_id=BANK,
                starts_on=now - timedelta(days=1500),
                source="admin",
            )
        )
        _pass(db_session, org, holder, on=now - timedelta(days=1200))
        db_session.commit()

    def test_it_only_reports_by_default(
        self,
        one_of_each_due: None,
        sent: list[dict[str, Any]],
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        monkeypatch.delenv("REMINDERS_APPLY", raising=False)

        assert reminders.main() == 0

        out = capsys.readouterr().out
        assert "Would send 1 enrolment reminders" in out
        assert "Would send 1 renewal notices" in out
        assert sent == []

    def test_it_sends_both_kinds_when_told_to(
        self,
        one_of_each_due: None,
        sent: list[dict[str, Any]],
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        monkeypatch.setenv("REMINDERS_APPLY", "true")

        assert reminders.main() == 0

        out = capsys.readouterr().out
        assert "Sent 1 of 1 enrolment reminders" in out
        assert "Sent 1 of 1 renewal notices" in out
        assert {email["to"] for email in sent} == {
            "ann@example.nhs.uk",
            "bob@example.nhs.uk",
        }

    def test_a_real_run_ends_on_the_line_the_alert_counts(
        self,
        one_of_each_due: None,
        sent: list[dict[str, Any]],
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        """Once, so that one run is one count."""
        monkeypatch.setenv("REMINDERS_APPLY", "true")

        assert reminders.main() == 0

        lines = capsys.readouterr().out.splitlines()
        assert len([ln for ln in lines if re.search(RUN_FINISHED, ln)]) == 1

    def test_a_report_does_not_print_the_line_the_alert_counts(
        self,
        one_of_each_due: None,
        sent: list[dict[str, Any]],
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        """A report run by hand must not look like the daily run."""
        monkeypatch.delenv("REMINDERS_APPLY", raising=False)

        assert reminders.main() == 0

        lines = capsys.readouterr().out.splitlines()
        assert not [ln for ln in lines if re.search(RUN_FINISHED, ln)]

    def test_a_run_that_could_not_start_does_not_print_the_line(
        self,
        one_of_each_due: None,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        def explode(*args: object, **kwargs: object) -> None:
            raise RuntimeError("no database")

        monkeypatch.setenv("REMINDERS_APPLY", "true")
        monkeypatch.setattr(reminders, "send_enrolment_reminders", explode)

        assert reminders.main() == 1

        lines = capsys.readouterr().out.splitlines()
        assert not [ln for ln in lines if re.search(RUN_FINISHED, ln)]

    def test_a_send_that_fails_makes_the_run_fail(
        self,
        one_of_each_due: None,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        """So the workflow goes red and somebody looks."""

        def refuse(**kwargs: Any) -> None:
            raise EmailSendError("could not reach bob@example.nhs.uk")

        monkeypatch.setattr(reminders, "send_email", refuse)
        monkeypatch.setenv("REMINDERS_APPLY", "true")

        assert reminders.main() == 1

        captured = capsys.readouterr()
        assert "2 could not be sent" in captured.err
        assert "example.nhs.uk" not in captured.out + captured.err
