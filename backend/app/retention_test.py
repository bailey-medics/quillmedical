"""Retention: what goes when its period ends, and what must stay."""

import re
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import retention
from app.features.passport.models import Passport, PassportAssessorInvite
from app.models import Feedback, MarketingPreferenceChange, User
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
