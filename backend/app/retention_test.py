"""Retention: what goes when its period ends, and what must stay."""

import re
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import retention
from app.features.passport.models import Passport, PassportAssessorInvite
from app.features.teaching.models import (
    Assessment,
    AssessmentAnswer,
    AssessmentAnswerTag,
    ModuleEnrolment,
    TeachingOrgSettings,
)
from app.features.teaching.reminders import add_months
from app.models import Feedback, MarketingPreferenceChange, OrgUnit, User
from app.retention import (
    FEEDBACK_KEPT,
    MARKETING_RECORD_KEPT,
    UNACCEPTED_INVITE_KEPT,
    apply_retention,
)

NOW = datetime(2030, 6, 1, 12, 0, tzinfo=UTC)

#: The line a real run ends on, as the "has not run" alert counts it in
#: infra/modules/monitoring/main.tf. The two must be the same text:
#: .github/scripts/terraform/scheduled-action-heartbeat.bats holds them to
#: it. Change the line the action prints and this, and that test says the
#: alert has to change too.
RUN_FINISHED = r"^Deleted [0-9]+ marketing answer records$"
PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
A_DAY = timedelta(days=1)
BANK = "colonoscopy-optical-diagnosis"

#: The period the organisation in these tests has given: three and a half
#: years, as EoEETA's is.
MONTHS_KEPT = 42


def _user(db: Session, email: str) -> User:
    user = User(
        username=email,
        email=email,
        password_hash="x",
        full_name="A Clinician",
    )
    db.add(user)
    db.flush()

    return user


def _passport(db: Session) -> User:
    """A holder with a passport, for an invitation to hang from."""
    holder = _user(db, "holder@example.nhs.uk")
    db.add(Passport(id=PASSPORT_ID, user_id=holder.id))
    db.flush()

    return holder


def _invite(
    db: Session,
    holder: User,
    invite_id: str,
    *,
    expires_at: datetime,
    accepted: bool = False,
) -> None:
    invite = PassportAssessorInvite(
        id=invite_id,
        passport_id=PASSPORT_ID,
        invited_by_user_id=holder.id,
        email=f"{invite_id}@example.nhs.uk",
        token_hash=f"hash-{invite_id}",
        expires_at=expires_at,
    )

    if accepted:
        invite.accepted_at = expires_at - A_DAY
        invite.accepted_user_id = holder.id

    db.add(invite)
    db.flush()


def _feedback(db: Session, message: str, *, created_at: datetime) -> None:
    row = Feedback(
        user_id=None,
        category="broken",
        message=message,
        route="/teaching",
        release="abc1234",
        viewport="390x844",
        user_agent="Mozilla/5.0",
        breadcrumbs=[],
        status="new",
    )
    row.created_at = created_at
    db.add(row)
    db.flush()


def _answer(db: Session, user: User, *, created_at: datetime) -> None:
    row = MarketingPreferenceChange(
        user_id=user.id,
        wants_marketing=True,
        source="settings",
    )
    row.created_at = created_at
    db.add(row)
    db.flush()


def _count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


class TestUnacceptedInvitations:
    """Deleted 90 days after they expire, and only if nobody accepted."""

    def test_one_past_the_period_is_deleted(self, db_session: Session) -> None:
        holder = _passport(db_session)
        _invite(
            db_session,
            holder,
            "old",
            expires_at=NOW - UNACCEPTED_INVITE_KEPT - A_DAY,
        )

        result = apply_retention(db_session, NOW, apply=True)

        assert result.unaccepted_invites == 1
        assert _count(db_session, PassportAssessorInvite) == 0

    def test_one_inside_the_period_stays(self, db_session: Session) -> None:
        """Expired, so no longer usable, but not yet 90 days ago."""
        holder = _passport(db_session)
        _invite(
            db_session,
            holder,
            "recent",
            expires_at=NOW - UNACCEPTED_INVITE_KEPT + A_DAY,
        )

        result = apply_retention(db_session, NOW, apply=True)

        assert result.unaccepted_invites == 0
        assert _count(db_session, PassportAssessorInvite) == 1

    def test_an_accepted_one_is_never_deleted(
        self, db_session: Session
    ) -> None:
        """It is part of the sign-off record, however old it is."""
        holder = _passport(db_session)
        _invite(
            db_session,
            holder,
            "accepted",
            expires_at=NOW - timedelta(days=3650),
            accepted=True,
        )

        result = apply_retention(db_session, NOW, apply=True)

        assert result.unaccepted_invites == 0
        assert _count(db_session, PassportAssessorInvite) == 1


class TestFeedback:
    """Deleted two years after it was sent."""

    def test_old_feedback_goes_and_recent_feedback_stays(
        self, db_session: Session
    ) -> None:
        _feedback(db_session, "old", created_at=NOW - FEEDBACK_KEPT - A_DAY)
        _feedback(db_session, "recent", created_at=NOW - FEEDBACK_KEPT + A_DAY)

        result = apply_retention(db_session, NOW, apply=True)

        assert result.feedback == 1
        assert list(db_session.scalars(select(Feedback.message))) == ["recent"]


class TestMarketingRecords:
    """Kept for six years after somebody's last answer."""

    def test_records_go_once_the_last_answer_is_old_enough(
        self, db_session: Session
    ) -> None:
        user = _user(db_session, "old@example.nhs.uk")
        _answer(
            db_session,
            user,
            created_at=NOW - MARKETING_RECORD_KEPT - timedelta(days=400),
        )
        _answer(
            db_session, user, created_at=NOW - MARKETING_RECORD_KEPT - A_DAY
        )

        result = apply_retention(db_session, NOW, apply=True)

        assert result.marketing_records == 2
        assert _count(db_session, MarketingPreferenceChange) == 0

    def test_a_recent_answer_keeps_every_earlier_one(
        self, db_session: Session
    ) -> None:
        """The period runs from the last answer, not from each one."""
        user = _user(db_session, "recent@example.nhs.uk")
        _answer(
            db_session,
            user,
            created_at=NOW - MARKETING_RECORD_KEPT - timedelta(days=400),
        )
        _answer(db_session, user, created_at=NOW - A_DAY)

        result = apply_retention(db_session, NOW, apply=True)

        assert result.marketing_records == 0
        assert _count(db_session, MarketingPreferenceChange) == 2

    def test_old_records_of_one_person_leave_the_next_persons(
        self, db_session: Session
    ) -> None:
        old = _user(db_session, "old@example.nhs.uk")
        recent = _user(db_session, "recent@example.nhs.uk")
        _answer(
            db_session, old, created_at=NOW - MARKETING_RECORD_KEPT - A_DAY
        )
        _answer(db_session, recent, created_at=NOW - A_DAY)

        apply_retention(db_session, NOW, apply=True)

        kept = list(db_session.scalars(select(MarketingPreferenceChange)))
        assert [row.user_id for row in kept] == [recent.id]

    def test_the_current_answer_on_the_account_is_left(
        self, db_session: Session
    ) -> None:
        """Only the record goes. The policy keeps the answer itself for
        as long as the account exists."""
        user = _user(db_session, "old@example.nhs.uk")
        user.marketing_emails = True
        _answer(
            db_session, user, created_at=NOW - MARKETING_RECORD_KEPT - A_DAY
        )

        apply_retention(db_session, NOW, apply=True)

        db_session.refresh(user)
        assert user.marketing_emails is True


def _org(db: Session, name: str, *, months: int | None) -> OrgUnit:
    """An organisation with its teaching settings, and its period."""
    org = OrgUnit(name=name, type="hospital_team")
    db.add(org)
    db.flush()
    db.add(
        TeachingOrgSettings(
            org_unit_id=org.id,
            coordinator_email="lead@example.nhs.uk",
            institution_name=name,
            records_kept_months_after_closure=months,
        )
    )
    db.flush()

    return org


def _closed(db: Session, email: str, *, closed_at: datetime | None) -> User:
    """Somebody whose account was closed at *closed_at*."""
    user = _user(db, email)
    user.is_active = False
    # After the line above: closing stamps today, and the test wants then.
    user.deactivated_at = closed_at
    db.flush()

    return user


def _records(db: Session, org: OrgUnit, user: User) -> None:
    """One attempt with an answer and its tag, and one enrolment."""
    assessment = Assessment(
        user_id=user.id,
        org_unit_id=org.id,
        question_bank_id=BANK,
        bank_version=1,
        # Finished: somebody may hold one attempt in progress on a module,
        # and the tests give one person records at two organisations.
        completed_at=NOW - timedelta(days=1999),
        time_limit_minutes=60,
        total_items=1,
        is_passed=True,
    )
    db.add(assessment)
    db.flush()
    answer = AssessmentAnswer(
        assessment_id=assessment.id, item_id=1, display_order=0
    )
    db.add(answer)
    db.flush()
    db.add(AssessmentAnswerTag(answer_id=answer.id, tag="adenoma"))
    db.add(
        ModuleEnrolment(
            user_id=user.id,
            org_unit_id=org.id,
            question_bank_id=BANK,
            starts_on=NOW - timedelta(days=2000),
            source="admin",
        )
    )
    db.flush()


def _past_the_period() -> datetime:
    """A closing date whose period ended yesterday."""
    return add_months(NOW, -MONTHS_KEPT) - A_DAY


class TestClosedAccountRecords:
    """A sponsor's records go when its period after closure has passed."""

    def test_records_past_the_period_are_deleted_with_their_answers(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_past_the_period()
        )
        _records(db_session, org, user)

        result = apply_retention(db_session, NOW, apply=True)

        assert result.closed_account_assessments == 1
        assert result.closed_account_enrolments == 1
        assert _count(db_session, Assessment) == 0
        assert _count(db_session, AssessmentAnswer) == 0
        assert _count(db_session, AssessmentAnswerTag) == 0
        assert _count(db_session, ModuleEnrolment) == 0

    def test_records_inside_the_period_stay(self, db_session: Session) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(
            db_session,
            "recent@example.nhs.uk",
            closed_at=add_months(NOW, -MONTHS_KEPT) + A_DAY,
        )
        _records(db_session, org, user)

        result = apply_retention(db_session, NOW, apply=True)

        assert result.closed_account_assessments == 0
        assert _count(db_session, Assessment) == 1
        assert _count(db_session, AssessmentAnswer) == 1
        assert _count(db_session, ModuleEnrolment) == 1

    def test_the_period_ends_on_the_day_itself(
        self, db_session: Session
    ) -> None:
        """Three and a half years to the day is past the period."""
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(
            db_session,
            "exact@example.nhs.uk",
            closed_at=add_months(NOW, -MONTHS_KEPT),
        )
        _records(db_session, org, user)

        assert (
            apply_retention(
                db_session, NOW, apply=True
            ).closed_account_assessments
            == 1
        )

    def test_an_open_account_keeps_its_records_however_old(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _user(db_session, "here@example.nhs.uk")
        _records(db_session, org, user)

        result = apply_retention(db_session, NOW, apply=True)

        assert result.closed_account_assessments == 0
        assert _count(db_session, Assessment) == 1

    def test_an_account_closed_with_no_date_keeps_its_records(
        self, db_session: Session
    ) -> None:
        """One closed before the date was recorded. The period cannot be
        counted, so nothing is deleted on a guess."""
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(db_session, "old@example.nhs.uk", closed_at=None)
        _records(db_session, org, user)

        result = apply_retention(db_session, NOW, apply=True)

        assert result.closed_account_assessments == 0
        assert _count(db_session, Assessment) == 1

    def test_an_account_opened_again_keeps_its_records(
        self, db_session: Session
    ) -> None:
        """Reopening clears the date, so the period starts again."""
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(
            db_session, "back@example.nhs.uk", closed_at=_past_the_period()
        )
        _records(db_session, org, user)
        user.is_active = True
        db_session.flush()

        result = apply_retention(db_session, NOW, apply=True)

        assert result.closed_account_assessments == 0
        assert _count(db_session, Assessment) == 1

    def test_an_organisation_with_no_period_has_nothing_deleted(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "No instruction", months=None)
        user = _closed(
            db_session,
            "gone@example.nhs.uk",
            closed_at=NOW - timedelta(days=36500),
        )
        _records(db_session, org, user)

        result = apply_retention(db_session, NOW, apply=True)

        assert result.closed_account_assessments == 0
        assert _count(db_session, Assessment) == 1
        assert _count(db_session, ModuleEnrolment) == 1

    def test_a_period_of_nought_deletes_nothing(
        self, db_session: Session
    ) -> None:
        """It would delete on the day an account closed."""
        org = _org(db_session, "Mistyped", months=0)
        user = _closed(
            db_session,
            "gone@example.nhs.uk",
            closed_at=NOW - timedelta(days=36500),
        )
        _records(db_session, org, user)

        result = apply_retention(db_session, NOW, apply=True)

        assert result.closed_account_assessments == 0
        assert _count(db_session, Assessment) == 1

    def test_one_organisations_period_leaves_another_organisations_records(
        self, db_session: Session
    ) -> None:
        """Somebody with records at two keeps the ones still in period."""
        short = _org(db_session, "Short", months=12)
        long = _org(db_session, "Long", months=120)
        user = _closed(
            db_session,
            "both@example.nhs.uk",
            closed_at=add_months(NOW, -24),
        )
        _records(db_session, short, user)
        _records(db_session, long, user)

        apply_retention(db_session, NOW, apply=True)

        kept = list(db_session.scalars(select(Assessment.org_unit_id)))
        assert kept == [long.id]
        enrolled = list(
            db_session.scalars(select(ModuleEnrolment.org_unit_id))
        )
        assert enrolled == [long.id]
        assert _count(db_session, AssessmentAnswer) == 1
        assert _count(db_session, AssessmentAnswerTag) == 1

    def test_one_persons_period_leaves_the_next_persons_records(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        gone = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_past_the_period()
        )
        here = _user(db_session, "here@example.nhs.uk")
        _records(db_session, org, gone)
        _records(db_session, org, here)

        apply_retention(db_session, NOW, apply=True)

        assert list(db_session.scalars(select(Assessment.user_id))) == [
            here.id
        ]
        assert _count(db_session, AssessmentAnswerTag) == 1

    def test_somebody_only_enrolled_has_the_enrolment_deleted(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_past_the_period()
        )
        db_session.add(
            ModuleEnrolment(
                user_id=user.id,
                org_unit_id=org.id,
                question_bank_id=BANK,
                starts_on=NOW - timedelta(days=2000),
                source="admin",
            )
        )
        db_session.flush()

        result = apply_retention(db_session, NOW, apply=True)

        assert result.closed_account_assessments == 0
        assert result.closed_account_enrolments == 1
        assert _count(db_session, ModuleEnrolment) == 0

    def test_the_account_itself_is_left(self, db_session: Session) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_past_the_period()
        )
        _records(db_session, org, user)

        apply_retention(db_session, NOW, apply=True)

        assert db_session.get(User, user.id) is not None

    def test_a_report_counts_and_leaves_every_row(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_past_the_period()
        )
        _records(db_session, org, user)

        result = apply_retention(db_session, NOW, apply=False)

        assert result.closed_account_assessments == 1
        assert result.closed_account_enrolments == 1
        assert _count(db_session, Assessment) == 1
        assert _count(db_session, AssessmentAnswer) == 1
        assert _count(db_session, AssessmentAnswerTag) == 1
        assert _count(db_session, ModuleEnrolment) == 1


class TestSetRecordsKept:
    """The admin action that records a sponsor's period."""

    @pytest.fixture
    def org(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> OrgUnit:
        """An organisation with no period, and the action handed the
        test session."""
        import app.db.core_db as core_db

        monkeypatch.setattr(core_db, "CoreSessionLocal", lambda: db_session)
        monkeypatch.setattr(db_session, "close", lambda: None)
        org = _org(db_session, "Academy", months=None)
        db_session.commit()
        monkeypatch.setenv("RECORDS_ORG_UNIT_ID", str(org.id))
        monkeypatch.setenv("RECORDS_KEPT_MONTHS", "42")
        monkeypatch.delenv("RECORDS_APPLY", raising=False)

        return org

    def _months(self, db: Session, org: OrgUnit) -> int | None:
        db.expire_all()

        return db.scalar(
            select(
                TeachingOrgSettings.records_kept_months_after_closure
            ).where(TeachingOrgSettings.org_unit_id == org.id)
        )

    def test_it_only_reports_by_default(
        self,
        org: OrgUnit,
        db_session: Session,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        assert retention.set_records_kept() == 0

        out = capsys.readouterr().out
        assert "Academy" in out
        assert "Would change" in out
        assert "from not deleted to kept 42 months" in out
        assert self._months(db_session, org) is None

    def test_it_sets_the_period_when_told_to(
        self,
        org: OrgUnit,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        monkeypatch.setenv("RECORDS_APPLY", "true")

        assert retention.set_records_kept() == 0

        assert "Changed" in capsys.readouterr().out
        assert self._months(db_session, org) == 42

    def test_none_stops_deleting_for_that_organisation(
        self,
        org: OrgUnit,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setenv("RECORDS_APPLY", "true")
        assert retention.set_records_kept() == 0
        monkeypatch.setenv("RECORDS_KEPT_MONTHS", "none")

        assert retention.set_records_kept() == 0

        assert self._months(db_session, org) is None

    @pytest.mark.parametrize("months", ["0", "-3", "601", "", "3.5", "soon"])
    def test_a_period_that_is_not_1_to_600_months_is_refused(
        self,
        org: OrgUnit,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
        months: str,
    ) -> None:
        monkeypatch.setenv("RECORDS_APPLY", "true")
        monkeypatch.setenv("RECORDS_KEPT_MONTHS", months)

        assert retention.set_records_kept() == 1

        assert "RECORDS_KEPT_MONTHS" in capsys.readouterr().err
        assert self._months(db_session, org) is None

    def test_an_organisation_with_no_settings_is_refused(
        self,
        org: OrgUnit,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        """No row is made, so a mistyped id cannot land on a stranger."""
        monkeypatch.setenv("RECORDS_APPLY", "true")
        monkeypatch.setenv("RECORDS_ORG_UNIT_ID", str(org.id + 500))

        assert retention.set_records_kept() == 1

        assert "no teaching settings" in capsys.readouterr().err
        assert _count(db_session, TeachingOrgSettings) == 1

    def test_an_id_that_is_not_a_number_is_refused(
        self,
        org: OrgUnit,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        monkeypatch.setenv("RECORDS_ORG_UNIT_ID", "academy")

        assert retention.set_records_kept() == 1

        assert "RECORDS_ORG_UNIT_ID" in capsys.readouterr().err


class TestReportOnly:
    """Without ``apply`` it counts and deletes nothing."""

    def test_a_report_counts_and_leaves_every_row(
        self, db_session: Session
    ) -> None:
        holder = _passport(db_session)
        _invite(
            db_session,
            holder,
            "old",
            expires_at=NOW - UNACCEPTED_INVITE_KEPT - A_DAY,
        )
        _feedback(db_session, "old", created_at=NOW - FEEDBACK_KEPT - A_DAY)
        _answer(
            db_session, holder, created_at=NOW - MARKETING_RECORD_KEPT - A_DAY
        )

        result = apply_retention(db_session, NOW, apply=False)

        assert result == retention.RetentionResult(
            unaccepted_invites=1, feedback=1, marketing_records=1
        )
        assert _count(db_session, PassportAssessorInvite) == 1
        assert _count(db_session, Feedback) == 1
        assert _count(db_session, MarketingPreferenceChange) == 1

    def test_nothing_due_is_all_zeroes(self, db_session: Session) -> None:
        result = apply_retention(db_session, NOW, apply=True)

        assert result == retention.RetentionResult(
            unaccepted_invites=0, feedback=0, marketing_records=0
        )


class TestMain:
    """The admin action: a report unless told to delete."""

    @pytest.fixture
    def session(
        self, db_session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> Session:
        """Hand ``main`` the test session, and stop it closing it."""
        import app.db.core_db as core_db

        monkeypatch.setattr(core_db, "CoreSessionLocal", lambda: db_session)
        monkeypatch.setattr(db_session, "close", lambda: None)
        _feedback(
            db_session,
            "old",
            created_at=datetime.now(UTC) - FEEDBACK_KEPT - A_DAY,
        )
        db_session.commit()

        return db_session

    def test_it_only_reports_by_default(
        self,
        session: Session,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        monkeypatch.delenv("RETENTION_APPLY", raising=False)

        assert retention.main() == 0

        out = capsys.readouterr().out
        assert "Would delete 1 feedback messages" in out
        assert "RETENTION_APPLY=true" in out
        assert _count(session, Feedback) == 1

    def test_it_deletes_when_told_to(
        self,
        session: Session,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        monkeypatch.setenv("RETENTION_APPLY", "true")

        assert retention.main() == 0

        assert "Deleted 1 feedback messages" in capsys.readouterr().out
        assert _count(session, Feedback) == 0

    def test_a_real_run_ends_on_the_line_the_alert_counts(
        self,
        session: Session,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        """Once, so that one run is one count."""
        monkeypatch.setenv("RETENTION_APPLY", "true")

        assert retention.main() == 0

        lines = capsys.readouterr().out.splitlines()
        assert len([ln for ln in lines if re.search(RUN_FINISHED, ln)]) == 1

    def test_a_report_does_not_print_the_line_the_alert_counts(
        self,
        session: Session,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        """A report run by hand must not look like the nightly run."""
        monkeypatch.delenv("RETENTION_APPLY", raising=False)

        assert retention.main() == 0

        lines = capsys.readouterr().out.splitlines()
        assert not [ln for ln in lines if re.search(RUN_FINISHED, ln)]

    def test_a_failed_run_does_not_print_the_line_the_alert_counts(
        self,
        session: Session,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        def explode(*args: object, **kwargs: object) -> None:
            raise RuntimeError("no database")

        monkeypatch.setenv("RETENTION_APPLY", "true")
        monkeypatch.setattr(retention, "apply_retention", explode)

        assert retention.main() == 1

        lines = capsys.readouterr().out.splitlines()
        assert not [ln for ln in lines if re.search(RUN_FINISHED, ln)]

    def test_a_failure_prints_no_detail_and_exits_1(
        self,
        session: Session,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        """The error's own words could carry a row's contents."""

        def explode(*args: object, **kwargs: object) -> None:
            raise RuntimeError("feedback from mark@example.org")

        monkeypatch.setattr(retention, "apply_retention", explode)

        assert retention.main() == 1

        captured = capsys.readouterr()
        assert "mark@example.org" not in captured.out + captured.err
        assert "RuntimeError" in captured.err
