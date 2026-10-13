"""Retention: what goes when its period ends, and what must stay."""

import re
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
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
from app.models import (
    Feedback,
    MarketingPreferenceChange,
    OrgUnit,
    RetentionReview,
    User,
)
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
    """An organisation and its period. It has no teaching settings: the
    period is the organisation's own, whether or not it teaches."""
    org = OrgUnit(
        name=name,
        type="hospital_team",
        records_kept_months_after_closure=months,
    )
    db.add(org)
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


def _reviews(db: Session) -> list[RetentionReview]:
    return list(db.scalars(select(RetentionReview).order_by("id")))


class TestClosedAccountRecords:
    """Records past a sponsor's period are listed for a decision, and
    the nightly run deletes none of them."""

    def test_records_past_the_period_are_listed_and_not_deleted(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        closed_at = _past_the_period()
        user = _closed(db_session, "gone@example.nhs.uk", closed_at=closed_at)
        _records(db_session, org, user)

        result = apply_retention(db_session, NOW, apply=True)

        assert result.newly_awaiting == 1
        assert result.awaiting == 1
        assert _count(db_session, Assessment) == 1
        assert _count(db_session, AssessmentAnswer) == 1
        assert _count(db_session, AssessmentAnswerTag) == 1
        assert _count(db_session, ModuleEnrolment) == 1
        [row] = _reviews(db_session)
        assert (row.user_id, row.org_unit_id) == (user.id, org.id)
        assert row.decision == "undecided"
        assert (row.attempts, row.enrolments) == (1, 1)
        assert retention._aware(row.due_on) == add_months(
            closed_at, MONTHS_KEPT
        )

    def test_a_second_run_does_not_list_them_twice(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_past_the_period()
        )
        _records(db_session, org, user)
        apply_retention(db_session, NOW, apply=True)

        result = apply_retention(db_session, NOW + A_DAY, apply=True)

        assert result.newly_awaiting == 0
        assert result.awaiting == 1
        assert len(_reviews(db_session)) == 1

    def test_records_inside_the_period_are_not_listed(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(
            db_session,
            "recent@example.nhs.uk",
            closed_at=add_months(NOW, -MONTHS_KEPT) + A_DAY,
        )
        _records(db_session, org, user)

        result = apply_retention(db_session, NOW, apply=True)

        assert result.newly_awaiting == 0
        assert _reviews(db_session) == []

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

        assert apply_retention(db_session, NOW, apply=True).newly_awaiting == 1

    def test_an_open_account_is_not_listed_however_old(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _user(db_session, "here@example.nhs.uk")
        _records(db_session, org, user)

        assert apply_retention(db_session, NOW, apply=True).newly_awaiting == 0

    def test_an_account_closed_with_no_date_is_not_listed(
        self, db_session: Session
    ) -> None:
        """One closed before the date was recorded. The period cannot be
        counted, so nothing is asked on a guess."""
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(db_session, "old@example.nhs.uk", closed_at=None)
        _records(db_session, org, user)

        assert apply_retention(db_session, NOW, apply=True).newly_awaiting == 0

    def test_an_account_opened_again_is_not_listed(
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

        assert apply_retention(db_session, NOW, apply=True).newly_awaiting == 0

    def test_an_organisation_with_no_period_lists_nobody(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "No instruction", months=None)
        user = _closed(
            db_session,
            "gone@example.nhs.uk",
            closed_at=NOW - timedelta(days=36500),
        )
        _records(db_session, org, user)

        assert apply_retention(db_session, NOW, apply=True).newly_awaiting == 0

    def test_a_period_of_nought_lists_nobody(
        self, db_session: Session
    ) -> None:
        """It would ask on the day an account closed."""
        org = _org(db_session, "Mistyped", months=0)
        user = _closed(
            db_session,
            "gone@example.nhs.uk",
            closed_at=NOW - timedelta(days=36500),
        )
        _records(db_session, org, user)

        assert apply_retention(db_session, NOW, apply=True).newly_awaiting == 0

    def test_only_the_organisation_whose_period_ended_is_listed(
        self, db_session: Session
    ) -> None:
        """Somebody with records at two is asked about one."""
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

        assert [row.org_unit_id for row in _reviews(db_session)] == [short.id]

    def test_a_report_counts_and_writes_no_row(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_past_the_period()
        )
        _records(db_session, org, user)

        result = apply_retention(db_session, NOW, apply=False)

        assert result.newly_awaiting == 1
        assert result.awaiting == 1
        assert _reviews(db_session) == []


class TestAskingAgain:
    """What has been decided, and when somebody is told."""

    @pytest.fixture
    def listed(self, db_session: Session) -> RetentionReview:
        """One set of records, listed by a first run."""
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_past_the_period()
        )
        _records(db_session, org, user)
        apply_retention(db_session, NOW, apply=True)
        [row] = _reviews(db_session)

        return row

    def test_somebody_is_told_when_records_are_newly_due(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_past_the_period()
        )
        _records(db_session, org, user)

        assert apply_retention(db_session, NOW, apply=True).tell_somebody

    def test_they_are_not_told_again_the_next_night(
        self, listed: RetentionReview, db_session: Session
    ) -> None:
        result = apply_retention(db_session, NOW + A_DAY, apply=True)

        assert result.awaiting == 1
        assert not result.tell_somebody

    def test_they_are_told_again_after_a_week(
        self, listed: RetentionReview, db_session: Session
    ) -> None:
        week = retention.TOLD_AGAIN_AFTER

        assert not apply_retention(
            db_session, NOW + week - A_DAY, apply=True
        ).tell_somebody
        assert apply_retention(
            db_session, NOW + week, apply=True
        ).tell_somebody
        assert not apply_retention(
            db_session, NOW + week + A_DAY, apply=True
        ).tell_somebody

    def test_nobody_is_told_when_nothing_is_waiting(
        self, db_session: Session
    ) -> None:
        assert not apply_retention(db_session, NOW, apply=True).tell_somebody

    def test_records_kept_are_not_listed_again_before_their_date(
        self, listed: RetentionReview, db_session: Session
    ) -> None:
        listed.decision = "kept"
        listed.ask_again_on = NOW + timedelta(days=180)
        db_session.flush()

        result = apply_retention(db_session, NOW + A_DAY, apply=True)

        assert result.newly_awaiting == 0
        assert result.awaiting == 0

    def test_records_kept_are_listed_again_once_their_date_comes(
        self, listed: RetentionReview, db_session: Session
    ) -> None:
        listed.decision = "kept"
        listed.ask_again_on = NOW + timedelta(days=180)
        db_session.flush()

        result = apply_retention(
            db_session, NOW + timedelta(days=180), apply=True
        )

        assert result.newly_awaiting == 1
        assert [row.decision for row in _reviews(db_session)] == [
            "kept",
            "undecided",
        ]

    def test_new_records_after_a_deletion_are_listed_afresh(
        self, listed: RetentionReview, db_session: Session
    ) -> None:
        """The account was opened, used and closed again."""
        listed.decision = "deleted"
        db_session.flush()

        result = apply_retention(db_session, NOW + A_DAY, apply=True)

        assert result.newly_awaiting == 1


def _two_years_ago() -> datetime:
    """A closing date that an account's own period ended on yesterday."""
    return add_months(NOW, -retention.ACCOUNT_KEPT_MONTHS) - A_DAY


def _about_accounts(db: Session) -> list[RetentionReview]:
    return [row for row in _reviews(db) if row.subject == "account"]


class TestClosedAccountItself:
    """An account closed two years, with no records left, is listed for
    a decision. The nightly run empties nothing."""

    def test_an_account_closed_two_years_with_no_records_is_listed(
        self, db_session: Session
    ) -> None:
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_two_years_ago()
        )

        result = apply_retention(db_session, NOW, apply=True)

        assert result.newly_awaiting_accounts == 1
        assert result.newly_awaiting == 0
        assert result.awaiting == 1
        assert result.tell_somebody
        [row] = _reviews(db_session)
        assert row.subject == "account"
        assert row.user_id == user.id
        assert row.org_unit_id is None
        assert row.decision == "undecided"
        # The test database hands a stored time back with no zone.
        assert retention._aware(row.due_on) == add_months(
            _two_years_ago(), retention.ACCOUNT_KEPT_MONTHS
        )

    def test_the_run_leaves_the_account_as_it_was(
        self, db_session: Session
    ) -> None:
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_two_years_ago()
        )

        apply_retention(db_session, NOW, apply=True)

        db_session.refresh(user)
        assert user.email == "gone@example.nhs.uk"
        assert user.full_name == "A Clinician"

    def test_a_second_run_does_not_list_it_twice(
        self, db_session: Session
    ) -> None:
        _closed(db_session, "gone@example.nhs.uk", closed_at=_two_years_ago())
        apply_retention(db_session, NOW, apply=True)

        result = apply_retention(db_session, NOW + A_DAY, apply=True)

        assert result.newly_awaiting_accounts == 0
        assert len(_reviews(db_session)) == 1

    def test_the_period_ends_on_the_day_itself(
        self, db_session: Session
    ) -> None:
        _closed(
            db_session,
            "today@example.nhs.uk",
            closed_at=add_months(NOW, -retention.ACCOUNT_KEPT_MONTHS),
        )
        _closed(
            db_session,
            "tomorrow@example.nhs.uk",
            closed_at=add_months(NOW, -retention.ACCOUNT_KEPT_MONTHS) + A_DAY,
        )

        result = apply_retention(db_session, NOW, apply=True)

        assert result.newly_awaiting_accounts == 1

    def test_an_open_account_is_never_listed(
        self, db_session: Session
    ) -> None:
        _user(db_session, "here@example.nhs.uk")

        result = apply_retention(db_session, NOW, apply=True)

        assert result.newly_awaiting_accounts == 0

    def test_an_account_closed_with_no_date_is_not_listed(
        self, db_session: Session
    ) -> None:
        _closed(db_session, "undated@example.nhs.uk", closed_at=None)

        result = apply_retention(db_session, NOW, apply=True)

        assert result.newly_awaiting_accounts == 0

    def test_an_account_with_records_left_is_not_listed(
        self, db_session: Session
    ) -> None:
        """Even at an organisation that has given no period at all."""
        org = _org(db_session, "Academy", months=None)
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_past_the_period()
        )
        _records(db_session, org, user)

        result = apply_retention(db_session, NOW, apply=True)

        assert result.newly_awaiting_accounts == 0
        assert _reviews(db_session) == []

    def test_somebody_only_enrolled_is_not_listed(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=None)
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

        assert result.newly_awaiting_accounts == 0

    def test_records_and_the_account_are_not_listed_on_the_same_run(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_past_the_period()
        )
        _records(db_session, org, user)

        result = apply_retention(db_session, NOW, apply=True)

        assert result.newly_awaiting == 1
        assert result.newly_awaiting_accounts == 0

    def test_the_account_is_listed_once_its_records_are_deleted(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_past_the_period()
        )
        _records(db_session, org, user)
        apply_retention(db_session, NOW, apply=True)
        [records] = _reviews(db_session)
        retention.carry_out_decision(
            db_session,
            records,
            delete_them=True,
            note=None,
            ask_again_on=None,
            decided_by=user.id,
            now=NOW,
        )

        result = apply_retention(db_session, NOW + A_DAY, apply=True)

        assert result.newly_awaiting_accounts == 1
        [account] = _about_accounts(db_session)
        assert account.user_id == user.id

    def test_a_report_counts_and_writes_no_row(
        self, db_session: Session
    ) -> None:
        _closed(db_session, "gone@example.nhs.uk", closed_at=_two_years_ago())

        result = apply_retention(db_session, NOW, apply=False)

        assert result.newly_awaiting_accounts == 1
        assert result.awaiting == 1
        assert _reviews(db_session) == []


class TestDecidingAboutAnAccount:
    """Marked to be emptied, or kept. Nothing here empties one."""

    @pytest.fixture
    def listed(self, db_session: Session) -> RetentionReview:
        _closed(db_session, "gone@example.nhs.uk", closed_at=_two_years_ago())
        apply_retention(db_session, NOW, apply=True)
        [row] = _reviews(db_session)

        return row

    def _decide(
        self,
        db: Session,
        row: RetentionReview,
        *,
        delete_them: bool,
        note: str | None = None,
        ask_again_on: datetime | None = None,
    ) -> str | None:
        return retention.carry_out_decision(
            db,
            row,
            delete_them=delete_them,
            note=note,
            ask_again_on=ask_again_on,
            decided_by=row.user_id,
            now=NOW,
        )

    def test_delete_marks_it_and_leaves_the_account_as_it_was(
        self, listed: RetentionReview, db_session: Session
    ) -> None:
        assert self._decide(db_session, listed, delete_them=True) is None

        assert listed.decision == "deleted"
        assert listed.decided_at == NOW
        user = db_session.get(User, listed.user_id)
        assert user is not None
        assert user.email == "gone@example.nhs.uk"

    def test_one_marked_is_not_listed_again(
        self, listed: RetentionReview, db_session: Session
    ) -> None:
        self._decide(db_session, listed, delete_them=True)

        result = apply_retention(db_session, NOW + A_DAY, apply=True)

        assert result.newly_awaiting_accounts == 0
        assert len(_reviews(db_session)) == 1

    def test_one_opened_and_closed_again_is_asked_about_afresh(
        self, listed: RetentionReview, db_session: Session
    ) -> None:
        """The decision was about the first closure, not this one."""
        self._decide(db_session, listed, delete_them=True)
        user = db_session.get(User, listed.user_id)
        assert user is not None
        user.deactivated_at = _two_years_ago() + A_DAY

        later = NOW + timedelta(days=30)
        result = apply_retention(db_session, later, apply=True)

        assert result.newly_awaiting_accounts == 1

    def test_one_opened_again_since_is_refused(
        self, listed: RetentionReview, db_session: Session
    ) -> None:
        user = db_session.get(User, listed.user_id)
        assert user is not None
        user.is_active = True
        user.deactivated_at = None
        db_session.flush()

        refused = self._decide(db_session, listed, delete_them=True)

        assert refused is not None
        assert "no longer due" in refused
        assert listed.decision == "undecided"

    def test_one_that_has_gained_records_is_refused(
        self, listed: RetentionReview, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=None)
        user = db_session.get(User, listed.user_id)
        assert user is not None
        _records(db_session, org, user)

        refused = self._decide(db_session, listed, delete_them=True)

        assert refused is not None
        assert listed.decision == "undecided"

    def test_keep_needs_a_note(
        self, listed: RetentionReview, db_session: Session
    ) -> None:
        refused = self._decide(
            db_session,
            listed,
            delete_them=False,
            ask_again_on=NOW + timedelta(days=90),
        )

        assert refused is not None
        assert "why" in refused
        assert listed.decision == "undecided"

    def test_keep_needs_a_date_to_ask_again_on(
        self, listed: RetentionReview, db_session: Session
    ) -> None:
        refused = self._decide(
            db_session, listed, delete_them=False, note="Dispute"
        )

        assert refused == "Give the date to ask again on."
        assert listed.decision == "undecided"
        assert listed.ask_again_on is None

    def test_one_kept_is_not_listed_before_its_date_and_is_after(
        self, listed: RetentionReview, db_session: Session
    ) -> None:
        again = NOW + timedelta(days=90)
        self._decide(
            db_session,
            listed,
            delete_them=False,
            note="Dispute",
            ask_again_on=again,
        )

        before = apply_retention(db_session, NOW + A_DAY, apply=True)
        after = apply_retention(db_session, again + A_DAY, apply=True)

        assert before.newly_awaiting_accounts == 0
        assert after.newly_awaiting_accounts == 1


class TestTheShapeOfARow:
    """Records are somewhere; an account is not."""

    def test_a_second_undecided_row_about_one_account_is_refused(
        self, db_session: Session
    ) -> None:
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_two_years_ago()
        )

        def row() -> RetentionReview:
            return RetentionReview(
                subject="account",
                user_id=user.id,
                closed_at=NOW,
                due_on=NOW,
                attempts=0,
                enrolments=0,
            )

        db_session.add(row())
        db_session.flush()
        db_session.add(row())

        with pytest.raises(IntegrityError):
            db_session.flush()

    def test_a_row_about_records_must_name_an_organisation(
        self, db_session: Session
    ) -> None:
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_two_years_ago()
        )
        db_session.add(
            RetentionReview(
                subject="records",
                user_id=user.id,
                closed_at=NOW,
                due_on=NOW,
                attempts=0,
                enrolments=0,
            )
        )

        with pytest.raises(IntegrityError):
            db_session.flush()


class TestDeletingTrainingRecords:
    """What a decision to delete calls. The nightly run never does."""

    def test_it_deletes_attempts_answers_tags_and_enrolments(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_past_the_period()
        )
        _records(db_session, org, user)

        counts = retention.delete_training_records(
            db_session, user.id, org.id, apply=True
        )

        assert counts == (1, 1)
        assert _count(db_session, Assessment) == 0
        assert _count(db_session, AssessmentAnswer) == 0
        assert _count(db_session, AssessmentAnswerTag) == 0
        assert _count(db_session, ModuleEnrolment) == 0

    def test_it_leaves_another_organisations_records(
        self, db_session: Session
    ) -> None:
        one = _org(db_session, "One", months=12)
        other = _org(db_session, "Other", months=12)
        user = _closed(
            db_session, "both@example.nhs.uk", closed_at=_past_the_period()
        )
        _records(db_session, one, user)
        _records(db_session, other, user)

        retention.delete_training_records(
            db_session, user.id, one.id, apply=True
        )

        assert list(db_session.scalars(select(Assessment.org_unit_id))) == [
            other.id
        ]
        assert list(
            db_session.scalars(select(ModuleEnrolment.org_unit_id))
        ) == [other.id]
        assert _count(db_session, AssessmentAnswer) == 1
        assert _count(db_session, AssessmentAnswerTag) == 1

    def test_it_leaves_the_next_persons_records(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        gone = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_past_the_period()
        )
        here = _user(db_session, "here@example.nhs.uk")
        _records(db_session, org, gone)
        _records(db_session, org, here)

        retention.delete_training_records(
            db_session, gone.id, org.id, apply=True
        )

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

        counts = retention.delete_training_records(
            db_session, user.id, org.id, apply=True
        )

        assert counts == (0, 1)
        assert _count(db_session, ModuleEnrolment) == 0

    def test_without_apply_it_counts_and_leaves_every_row(
        self, db_session: Session
    ) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_past_the_period()
        )
        _records(db_session, org, user)

        counts = retention.delete_training_records(
            db_session, user.id, org.id, apply=False
        )

        assert counts == (1, 1)
        assert _count(db_session, Assessment) == 1
        assert _count(db_session, ModuleEnrolment) == 1

    def test_the_account_itself_is_left(self, db_session: Session) -> None:
        org = _org(db_session, "Academy", months=MONTHS_KEPT)
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_past_the_period()
        )
        _records(db_session, org, user)

        retention.delete_training_records(
            db_session, user.id, org.id, apply=True
        )

        assert db_session.get(User, user.id) is not None


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
            select(OrgUnit.records_kept_months_after_closure).where(
                OrgUnit.id == org.id
            )
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

    def test_an_org_unit_that_does_not_exist_is_refused(
        self,
        org: OrgUnit,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        monkeypatch.setenv("RECORDS_APPLY", "true")
        monkeypatch.setenv("RECORDS_ORG_UNIT_ID", str(org.id + 500))

        assert retention.set_records_kept() == 1

        assert "There is no org unit" in capsys.readouterr().err
        assert self._months(db_session, org) is None

    def test_the_period_on_the_teaching_settings_row_is_not_read(
        self, org: OrgUnit, db_session: Session
    ) -> None:
        """The retired column: a number left there lists nobody."""
        db_session.add(
            TeachingOrgSettings(
                org_unit_id=org.id,
                coordinator_email="lead@example.nhs.uk",
                institution_name="Academy",
                records_kept_months_after_closure=1,
            )
        )
        user = _closed(
            db_session, "gone@example.nhs.uk", closed_at=_past_the_period()
        )
        _records(db_session, org, user)

        result = apply_retention(db_session, NOW, apply=True)

        assert result.newly_awaiting == 0

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

    def test_a_real_run_asks_for_a_decision_and_names_nobody(
        self,
        session: Session,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        org = _org(session, "Academy", months=1)
        user = _closed(
            session,
            "gone@example.nhs.uk",
            closed_at=datetime.now(UTC) - timedelta(days=400),
        )
        _records(session, org, user)
        session.commit()
        monkeypatch.setenv("RETENTION_APPLY", "true")

        assert retention.main() == 0

        out = capsys.readouterr().out
        assert "Listed 1 closed accounts" in out
        assert f"{retention.DECISION_NEEDED} 1 decisions are waiting" in out
        assert "gone@example.nhs.uk" not in out
        assert "A Clinician" not in out
        assert "Academy" not in out
        assert _count(session, Assessment) == 1

    def test_a_report_does_not_ask_for_a_decision(
        self,
        session: Session,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        """The alert matches that line, and a report is not an event."""
        org = _org(session, "Academy", months=1)
        user = _closed(
            session,
            "gone@example.nhs.uk",
            closed_at=datetime.now(UTC) - timedelta(days=400),
        )
        _records(session, org, user)
        session.commit()
        monkeypatch.delenv("RETENTION_APPLY", raising=False)

        assert retention.main() == 0

        out = capsys.readouterr().out
        assert "Would list 1 closed accounts" in out
        assert retention.DECISION_NEEDED not in out

    def test_a_run_with_nothing_waiting_does_not_ask(
        self,
        session: Session,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        monkeypatch.setenv("RETENTION_APPLY", "true")

        assert retention.main() == 0

        assert retention.DECISION_NEEDED not in capsys.readouterr().out

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
