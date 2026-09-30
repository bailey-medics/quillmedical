"""Moving teaching to ``manage_teaching``, against Postgres.

Migration ``16834fc0663d`` folds ``teaching_manager`` into
``teaching_admin`` and moves ``manage_teaching_content`` rows to
``manage_teaching``. It is Postgres SQL and cannot run on the SQLite unit
database, so these step back to the revision before it, seed users and rows
with plain SQL, step forward and read what it wrote.

Integration tests, run in the ``alembic_drift_check`` CI job and locally
through ``compose.migrate.yml``, as
``tests/test_user_competency_backfill.py`` describes. Each leaves the
database at head with its seed removed.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.engine import Connection

from alembic import command
from app.db.core_db import core_engine

pytestmark = [pytest.mark.integration, pytest.mark.migration]

BEFORE = "79a6ba344abb"
MOVE = "16834fc0663d"
PREFIX = "manage_teaching_test_"


@pytest.fixture
def before_move() -> Iterator[Config]:
    config = Config("alembic.ini")
    command.upgrade(config, "head")
    _cleanup()
    command.downgrade(config, BEFORE)
    try:
        yield config
    finally:
        _cleanup()
        command.upgrade(config, "head")


def _cleanup() -> None:
    with core_engine.begin() as conn:
        conn.execute(
            text("DELETE FROM users WHERE username LIKE :prefix"),
            {"prefix": f"{PREFIX}%"},
        )
        conn.execute(
            text("DELETE FROM org_unit WHERE name LIKE :prefix"),
            {"prefix": f"{PREFIX}%"},
        )


def _user(conn: Connection, name: str, profession: str) -> int:
    user_id = conn.execute(
        text("""
            INSERT INTO users
                (username, email, password_hash, is_totp_enabled,
                 is_active, base_profession)
            VALUES (:username, :email, 'x', false, true, :profession)
            RETURNING id
        """),
        {
            "username": f"{PREFIX}{name}",
            "email": f"{PREFIX}{name}@example.test",
            "profession": profession,
        },
    ).scalar_one()
    return int(user_id)


def _org(conn: Connection) -> int:
    org_id = conn.execute(
        text("""
            INSERT INTO org_unit (name, type, is_active, created_at,
                                  updated_at)
            VALUES (:name, 'organisation', true, NOW(), NOW())
            RETURNING id
        """),
        {"name": f"{PREFIX}org"},
    ).scalar_one()
    return int(org_id)


def _grant(
    conn: Connection, user_id: int, competency_id: str, source: str
) -> None:
    conn.execute(
        text("""
            INSERT INTO user_competency
                (user_id, competency_id, starts_on, source, created_at)
            VALUES (:user_id, :competency_id, NOW(), :source, NOW())
        """),
        {"user_id": user_id, "competency_id": competency_id, "source": source},
    )


def _practise(
    conn: Connection, user_id: int, org_id: int, competency: str
) -> None:
    conn.execute(
        text("""
            INSERT INTO practising_competency
                (user_id, org_unit_id, competency, authorised_at)
            VALUES (:user_id, :org_id, :competency, NOW())
        """),
        {"user_id": user_id, "org_id": org_id, "competency": competency},
    )


def _current(user_id: int) -> set[str]:
    with core_engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT competency_id FROM user_competency
                 WHERE user_id = :user_id
                   AND (ends_on IS NULL OR ends_on > NOW())
            """),
            {"user_id": user_id},
        )
        return {r[0] for r in rows}


def _closed(user_id: int) -> set[str]:
    with core_engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT competency_id FROM user_competency
                 WHERE user_id = :user_id AND ends_on <= NOW()
            """),
            {"user_id": user_id},
        )
        return {r[0] for r in rows}


def _profession(user_id: int) -> str:
    with core_engine.connect() as conn:
        return str(
            conn.execute(
                text("SELECT base_profession FROM users WHERE id = :id"),
                {"id": user_id},
            ).scalar_one()
        )


def _practising(user_id: int) -> set[str]:
    with core_engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT competency FROM practising_competency
                 WHERE user_id = :user_id
            """),
            {"user_id": user_id},
        )
        return {r[0] for r in rows}


def test_a_teaching_manager_becomes_a_teaching_admin(
    before_move: Config,
) -> None:
    """The profession moves and its manager-only rows close.

    What the old profession seeded goes; the competency the new one
    carries arrives in place of ``manage_teaching_content``.
    """
    with core_engine.begin() as conn:
        user_id = _user(conn, "manager", "teaching_manager")
        for competency in (
            "view_teaching_cases",
            "manage_teaching_content",
            "view_teaching_analytics",
            "manage_users",
            "manage_staff_membership",
            "manage_practising_competencies",
        ):
            _grant(conn, user_id, competency, "profession")

    command.upgrade(before_move, MOVE)

    assert _profession(user_id) == "teaching_admin"
    assert _current(user_id) == {
        "view_teaching_cases",
        "manage_teaching",
        "view_teaching_analytics",
    }
    assert {
        "manage_teaching_content",
        "manage_users",
        "manage_staff_membership",
        "manage_practising_competencies",
    } <= _closed(user_id)


def test_a_hand_granted_manage_users_row_stays_open(
    before_move: Config,
) -> None:
    """Only what the profession seeded is closed."""
    with core_engine.begin() as conn:
        user_id = _user(conn, "granted", "teaching_manager")
        _grant(conn, user_id, "manage_users", "admin")

    command.upgrade(before_move, MOVE)

    assert "manage_users" in _current(user_id)


def test_other_professions_keep_manage_users(before_move: Config) -> None:
    with core_engine.begin() as conn:
        user_id = _user(conn, "clinic", "clinic_manager")
        _grant(conn, user_id, "manage_users", "profession")

    command.upgrade(before_move, MOVE)

    assert _profession(user_id) == "clinic_manager"
    assert "manage_users" in _current(user_id)


def test_practising_rows_move_to_manage_teaching(before_move: Config) -> None:
    with core_engine.begin() as conn:
        user_id = _user(conn, "practising", "teaching_admin")
        org_id = _org(conn)
        _practise(conn, user_id, org_id, "manage_teaching_content")

    command.upgrade(before_move, MOVE)

    assert _practising(user_id) == {"manage_teaching"}


def test_downgrade_moves_the_competency_back(before_move: Config) -> None:
    with core_engine.begin() as conn:
        user_id = _user(conn, "roundtrip", "teaching_admin")
        org_id = _org(conn)
        _grant(conn, user_id, "manage_teaching_content", "profession")
        _practise(conn, user_id, org_id, "manage_teaching_content")

    command.upgrade(before_move, MOVE)
    command.downgrade(before_move, BEFORE)

    current: set[str] = _current(user_id)
    assert "manage_teaching_content" in current
    assert "manage_teaching" not in current
    assert _practising(user_id) == {"manage_teaching_content"}
