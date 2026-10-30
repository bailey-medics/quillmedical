"""Tests for using a two-factor code once, and for the lockout."""

from datetime import UTC, datetime, timedelta, tzinfo

import pyotp
import pytest
from sqlalchemy.orm import Session

from app.models import User
from app.security import generate_totp_secret
from app.users.totp import (
    LOCKOUT,
    MAX_FAILED_ATTEMPTS,
    record_totp_failure,
    totp_locked,
    use_totp_code,
)


def _with_two_factor(db: Session, user: User) -> pyotp.TOTP:
    user.totp_secret = generate_totp_secret()
    user.is_totp_enabled = True
    db.commit()

    return pyotp.TOTP(user.totp_secret)


def _current_step(totp: pyotp.TOTP) -> int:
    return int(totp.timecode(datetime.now(UTC)))


#: The moment the window tests run at, a quarter of the way into a step.
MOMENT = datetime(2026, 10, 16, 12, 0, 15, tzinfo=UTC)


class _Frozen(datetime):
    """`datetime`, but `now()` is always `MOMENT`."""

    @classmethod
    def now(cls, tz: tzinfo | None = None) -> _Frozen:
        return cls.fromtimestamp(MOMENT.timestamp(), tz)


@pytest.fixture
def frozen(monkeypatch: pytest.MonkeyPatch) -> int:
    """Stop the clock `totp_step_matched` reads at `MOMENT`; its step."""
    monkeypatch.setattr("app.security.datetime", _Frozen)

    return int(MOMENT.timestamp() // 30)


class TestACodeIsUsedOnce:
    def test_a_right_code_is_accepted_and_its_step_recorded(
        self, db_session: Session, test_user: User
    ) -> None:
        totp = _with_two_factor(db_session, test_user)

        assert use_totp_code(db_session, test_user, totp.now()) is True
        db_session.refresh(test_user)
        assert test_user.totp_last_step is not None

    def test_the_same_code_is_refused_the_second_time(
        self, db_session: Session, test_user: User
    ) -> None:
        totp = _with_two_factor(db_session, test_user)
        code = totp.now()

        assert use_totp_code(db_session, test_user, code) is True
        assert use_totp_code(db_session, test_user, code) is False

    def test_a_code_from_a_step_already_used_is_refused(
        self, db_session: Session, test_user: User
    ) -> None:
        totp = _with_two_factor(db_session, test_user)
        step = _current_step(totp)
        test_user.totp_last_step = step
        db_session.commit()

        assert use_totp_code(db_session, test_user, totp.now()) is False

    def test_a_code_from_a_later_step_is_accepted(
        self, db_session: Session, test_user: User
    ) -> None:
        totp = _with_two_factor(db_session, test_user)
        test_user.totp_last_step = _current_step(totp) - 1
        db_session.commit()

        assert use_totp_code(db_session, test_user, totp.now()) is True

    def test_a_wrong_code_is_refused_and_records_nothing(
        self, db_session: Session, test_user: User
    ) -> None:
        _with_two_factor(db_session, test_user)

        assert use_totp_code(db_session, test_user, "000000") is False
        db_session.refresh(test_user)
        assert test_user.totp_last_step is None


class TestTheWindowOfOneStepEitherSide:
    """A wider window is safe only because a code is used once."""

    def test_a_code_from_the_step_before_is_accepted_once(
        self, db_session: Session, test_user: User, frozen: int
    ) -> None:
        totp = _with_two_factor(db_session, test_user)
        code = totp.generate_otp(frozen - 1)

        assert use_totp_code(db_session, test_user, code) is True
        assert use_totp_code(db_session, test_user, code) is False

    def test_a_code_from_the_step_after_is_accepted_once(
        self, db_session: Session, test_user: User, frozen: int
    ) -> None:
        totp = _with_two_factor(db_session, test_user)
        code = totp.generate_otp(frozen + 1)

        assert use_totp_code(db_session, test_user, code) is True
        assert use_totp_code(db_session, test_user, code) is False

    def test_a_code_from_before_the_last_one_used_is_refused(
        self, db_session: Session, test_user: User, frozen: int
    ) -> None:
        """Inside the window, but older than the last code used: a phone
        whose clock runs ahead has already spent the steps up to it."""
        totp = _with_two_factor(db_session, test_user)

        assert (
            use_totp_code(db_session, test_user, totp.generate_otp(frozen + 1))
            is True
        )
        assert (
            use_totp_code(db_session, test_user, totp.generate_otp(frozen))
            is False
        )
        assert (
            use_totp_code(db_session, test_user, totp.generate_otp(frozen - 1))
            is False
        )


class TestWrongCodesLockTheAccount:
    def test_the_limit_is_three_wrong_codes_for_fifteen_minutes(
        self,
    ) -> None:
        assert MAX_FAILED_ATTEMPTS == 3
        assert LOCKOUT == timedelta(minutes=15)

    def test_wrong_codes_below_the_limit_only_count(
        self, db_session: Session, test_user: User
    ) -> None:
        for _ in range(MAX_FAILED_ATTEMPTS - 1):
            record_totp_failure(db_session, test_user, now=MOMENT)

        db_session.refresh(test_user)
        assert test_user.totp_failed_attempts == MAX_FAILED_ATTEMPTS - 1
        assert totp_locked(test_user, now=MOMENT) is False

    def test_the_limit_locks_the_account_and_resets_the_count(
        self, db_session: Session, test_user: User
    ) -> None:
        for _ in range(MAX_FAILED_ATTEMPTS):
            record_totp_failure(db_session, test_user, now=MOMENT)

        db_session.refresh(test_user)
        assert test_user.totp_failed_attempts == 0
        assert totp_locked(test_user, now=MOMENT) is True

    def test_the_lock_ends_when_its_time_is_up(
        self, db_session: Session, test_user: User
    ) -> None:
        for _ in range(MAX_FAILED_ATTEMPTS):
            record_totp_failure(db_session, test_user, now=MOMENT)

        db_session.refresh(test_user)
        just_before = MOMENT + LOCKOUT - timedelta(seconds=1)
        assert totp_locked(test_user, now=just_before) is True
        assert totp_locked(test_user, now=MOMENT + LOCKOUT) is False

    def test_a_failure_survives_the_request_being_rolled_back(
        self, db_session: Session, test_user: User
    ) -> None:
        """The route raises after a wrong code, which rolls back; the
        count is committed first so it is not lost with it."""
        record_totp_failure(db_session, test_user, now=MOMENT)
        db_session.rollback()

        db_session.refresh(test_user)
        assert test_user.totp_failed_attempts == 1

    def test_a_right_code_clears_the_count(
        self, db_session: Session, test_user: User
    ) -> None:
        totp = _with_two_factor(db_session, test_user)
        record_totp_failure(db_session, test_user, now=MOMENT)

        assert use_totp_code(db_session, test_user, totp.now()) is True
        db_session.refresh(test_user)
        assert test_user.totp_failed_attempts == 0
        assert test_user.totp_locked_until is None

    def test_an_account_never_locked_is_not_locked(
        self, test_user: User
    ) -> None:
        assert totp_locked(test_user) is False
