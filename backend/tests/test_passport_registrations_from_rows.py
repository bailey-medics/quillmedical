"""What the passport says somebody is registered with comes from rows.

Commit trailers, frozen sign-off records and the admin's verification
check all read the person's current ``professional_registration`` rows.
The retired ``professional_registrations`` JSON column is neither read nor
named in any statement, so these set it to something else and check it is
ignored.

See ``docs/docs/plans/2026-09-23-professional-registrations-plan.md``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.features.passport.router import (
    _registration_dicts,
    _registration_strings,
)
from app.models import ProfessionalRegistration, User
from app.security import hash_password
from tests.registrations import declare


def _user(db: Session, username: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        base_profession="external_assessor",
        professional_registrations={"GMC": "0000000"},
    )
    db.add(user)
    db.commit()
    return user


def test_the_rows_are_described_not_the_json(db_session: Session) -> None:
    user = _user(db_session, "rows_not_json")
    declare(user, {"NMC": "99AB1234"})
    db_session.commit()

    assert _registration_strings(user) == ["NMC 99AB1234"]
    assert _registration_dicts(user) == [
        {"body": "NMC", "number": "99AB1234", "verified": False}
    ]


def test_a_closed_registration_is_not_described(db_session: Session) -> None:
    """A number somebody once held and no longer does."""
    user = _user(db_session, "closed")
    user.registrations.append(
        ProfessionalRegistration(
            authority="GMC",
            number="1111111",
            ends_on=datetime.now(UTC) - timedelta(days=1),
        )
    )
    declare(user, {"GMC": "2222222"})
    db_session.commit()

    assert _registration_strings(user) == ["GMC 2222222"]


def test_somebody_with_no_rows_describes_nothing(db_session: Session) -> None:
    user = _user(db_session, "no_rows")

    assert _registration_strings(user) == []
    assert _registration_dicts(user) == []


def test_no_statement_names_the_retired_column(db_session: Session) -> None:
    """The drop that follows cannot break a revision still serving."""
    seen: list[str] = []

    def record(*args: Any) -> None:
        seen.append(args[2])

    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", record)
    try:
        user = User(
            username="no_json",
            email="no_json@example.test",
            password_hash=hash_password("Password123!"),
            base_profession="external_assessor",
        )
        declare(user, {"GMC": "1234567"})
        db_session.add(user)
        db_session.commit()
        user.full_name = "Renamed"
        db_session.commit()
        db_session.expire_all()
        assert _registration_strings(user) == ["GMC 1234567"]
    finally:
        event.remove(engine, "before_cursor_execute", record)

    assert seen
    assert [sql for sql in seen if "professional_registrations" in sql] == []
