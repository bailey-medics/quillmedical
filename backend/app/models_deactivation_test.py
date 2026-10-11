"""When an account is closed, the date is kept, wherever it is closed from."""

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.models import User


def _user(db: Session, **fields: object) -> User:
    user = User(
        username="sam",
        email="sam@example.nhs.uk",
        password_hash="x",
        **fields,
    )
    db.add(user)
    db.flush()

    return user


class TestDeactivatedAt:
    def test_an_active_account_has_no_date(self, db_session: Session) -> None:
        assert _user(db_session).deactivated_at is None
        assert _user_reloaded(db_session).deactivated_at is None

    def test_closing_an_account_records_when(
        self, db_session: Session
    ) -> None:
        user = _user(db_session)
        before = datetime.now(UTC)

        user.is_active = False

        assert user.deactivated_at is not None
        assert before <= user.deactivated_at <= datetime.now(UTC)

    def test_closing_it_again_keeps_the_first_date(
        self, db_session: Session
    ) -> None:
        """Or a retention period could be put off for ever by saving the
        account again."""
        user = _user(db_session)
        user.is_active = False
        first = datetime.now(UTC) - timedelta(days=400)
        user.deactivated_at = first

        user.is_active = False

        assert user.deactivated_at == first

    def test_reopening_clears_it_and_closing_again_starts_afresh(
        self, db_session: Session
    ) -> None:
        user = _user(db_session)
        user.is_active = False
        user.deactivated_at = datetime.now(UTC) - timedelta(days=400)

        user.is_active = True

        assert user.deactivated_at is None

        user.is_active = False

        assert user.deactivated_at is not None
        assert datetime.now(UTC) - user.deactivated_at < timedelta(minutes=1)

    def test_an_account_made_closed_has_a_date(
        self, db_session: Session
    ) -> None:
        assert _user(db_session, is_active=False).deactivated_at is not None

    def test_the_date_is_stored(self, db_session: Session) -> None:
        user = _user(db_session)
        user.is_active = False
        db_session.commit()
        db_session.expire_all()

        assert _user_reloaded(db_session).deactivated_at is not None


def _user_reloaded(db: Session) -> User:
    return db.query(User).filter(User.username == "sam").one()
