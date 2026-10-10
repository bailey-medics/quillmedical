"""Splitting ``view_teaching_cases`` in two, against Postgres.

Migration ``8c1f4e2a9b37`` gives every holder of ``view_teaching_cases``
both ``view_teaching_results`` and ``take_teaching_modules``, and closes
the old row. It is Postgres SQL and cannot run on the SQLite unit
database, so these step back to the revision before it, seed users and
rows with plain SQL, step forward and read what it wrote.

Integration tests, run in the ``alembic_drift_check`` CI job and locally
through ``compose.migrate.yml``, as
``tests/user_competency_backfill_test.py`` describes. Each leaves the
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

BEFORE = "2736214b7eb1"
SPLIT = "8c1f4e2a9b37"
PREFIX = "teaching_split_test_"

OLD = "view_teaching_cases"
NEW = {"view_teaching_results", "take_teaching_modules"}


@pytest.fixture
def before_split() -> Iterator[Config]:
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
    user_id: int = conn.execute(
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
    org_id: int = conn.execute(
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


def test_a_holder_gets_both_new_competencies(before_split: Config) -> None:
    """The old row closes and one opens for each new competency."""
    with core_engine.begin() as conn:
        user_id = _user(conn, "delegate", "teaching_delegate")
        _grant(conn, user_id, OLD, "profession")

    command.upgrade(before_split, SPLIT)

    assert _current(user_id) == NEW
    assert OLD in _closed(user_id)


def test_somebody_without_it_gains_nothing(before_split: Config) -> None:
    """Nobody is handed teaching who did not have it."""
    with core_engine.begin() as conn:
        user_id = _user(conn, "consultant", "consultant")
        _grant(conn, user_id, "access_patient_records", "profession")

    command.upgrade(before_split, SPLIT)

    assert _current(user_id) == {"access_patient_records"}


def test_a_closed_row_is_not_carried_over(before_split: Config) -> None:
    """Somebody who had it taken away stays without it."""
    with core_engine.begin() as conn:
        user_id = _user(conn, "removed", "teaching_delegate")
        conn.execute(
            text("""
                INSERT INTO user_competency
                    (user_id, competency_id, starts_on, ends_on, source,
                     created_at)
                VALUES (:user_id, :competency_id, NOW() - INTERVAL '2 days',
                        NOW() - INTERVAL '1 day', 'profession', NOW())
            """),
            {"user_id": user_id, "competency_id": OLD},
        )

    command.upgrade(before_split, SPLIT)

    assert _current(user_id) == set()


def test_practising_rows_are_copied_to_both(before_split: Config) -> None:
    """A row at an org unit becomes one for each new competency there."""
    with core_engine.begin() as conn:
        user_id = _user(conn, "practising", "teaching_delegate")
        org_id = _org(conn)
        _grant(conn, user_id, OLD, "profession")
        _practise(conn, user_id, org_id, OLD)

    command.upgrade(before_split, SPLIT)

    assert _practising(user_id) == NEW


def test_running_it_twice_changes_nothing(before_split: Config) -> None:
    """Idempotent: a second run finds nothing left to move."""
    with core_engine.begin() as conn:
        user_id = _user(conn, "twice", "teaching_delegate")
        _grant(conn, user_id, OLD, "profession")

    command.upgrade(before_split, SPLIT)
    command.downgrade(before_split, BEFORE)
    command.upgrade(before_split, SPLIT)

    assert _current(user_id) == NEW


def test_downgrade_gives_the_old_competency_back(
    before_split: Config,
) -> None:
    """Stepping back leaves a holder with what the old code checks."""
    with core_engine.begin() as conn:
        user_id = _user(conn, "back", "teaching_delegate")
        _grant(conn, user_id, OLD, "profession")

    command.upgrade(before_split, SPLIT)
    command.downgrade(before_split, BEFORE)

    assert _current(user_id) == {OLD}
