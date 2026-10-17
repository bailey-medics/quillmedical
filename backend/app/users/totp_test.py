"""Tests for using a two-factor code once."""

from datetime import UTC, datetime, tzinfo

import pyotp
import pytest
from sqlalchemy.orm import Session

from app.models import User
from app.security import generate_totp_secret
from app.users.totp import use_totp_code


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
