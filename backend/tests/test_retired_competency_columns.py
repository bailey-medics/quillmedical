"""The retired competency columns appear in no statement the app sends.

``users.additional_competencies`` and ``users.removed_competencies`` are
dropped by the change after this one. A revision still serving while that
drop runs must not mention them, or every query of ``users`` fails until
the new revision takes over. These pin that nothing the application sends
to the database names either column.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.models import User
from app.security import hash_password

RETIRED = ("additional_competencies", "removed_competencies")


@pytest.fixture
def statements(db_session: Session) -> Iterator[list[str]]:
    """Every SQL statement sent on the test session's connection."""
    seen: list[str] = []
    engine = db_session.get_bind()

    def record(*args: Any) -> None:
        seen.append(args[2])

    event.listen(engine, "before_cursor_execute", record)
    try:
        yield seen
    finally:
        event.remove(engine, "before_cursor_execute", record)


def _mentions_retired(sql: str) -> bool:
    return any(column in sql for column in RETIRED)


def test_loading_a_user_does_not_select_them(db_session: Session) -> None:
    assert not _mentions_retired(str(select(User)))


def test_creating_and_updating_a_user_does_not_name_them(
    db_session: Session, statements: list[str]
) -> None:
    """The database fills both from its own default."""
    user = User(
        username="no_json",
        email="no_json@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="patient",
    )
    db_session.add(user)
    db_session.commit()
    user.full_name = "Renamed"
    db_session.commit()
    db_session.refresh(user)

    assert statements
    assert [sql for sql in statements if _mentions_retired(sql)] == []


def test_a_new_user_still_gets_an_empty_list(db_session: Session) -> None:
    """NOT NULL is still satisfied, by the server default."""
    user = User(
        username="defaulted",
        email="defaulted@example.test",
        password_hash=hash_password("Password123!"),
        base_profession="patient",
    )
    db_session.add(user)
    db_session.commit()

    assert user.additional_competencies == []
    assert user.removed_competencies == []
