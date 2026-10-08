"""Giving teaching members their place, against Postgres.

Migration ``3d7a91c5e6f2`` writes a ``practising_competency`` row for
``take_teaching_modules`` wherever a holder is already a member, and
first seeds the teaching accounts that registered themselves and were
never given a teaching competency at all. It is Postgres SQL and cannot
run on the SQLite unit database, so these step back to the revision
before it, seed with plain SQL, step forward and read what it wrote.

Integration tests, run in the ``alembic_drift_check`` CI job, as
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

BEFORE = "7d0086c2b783"
PLACE = "3d7a91c5e6f2"
PREFIX = "teaching_place_test_"

RESULTS = "view_teaching_results"
MODULES = "take_teaching_modules"


@pytest.fixture
def before_place() -> Iterator[Config]:
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


def _join(conn: Connection, user_id: int, org_id: int) -> None:
    conn.execute(
        text("""
            INSERT INTO org_unit_member (org_unit_id, user_id, capacity)
            VALUES (:org_id, :user_id, 'trainee')
        """),
        {"org_id": org_id, "user_id": user_id},
    )


def _places(user_id: int) -> set[int]:
    with core_engine.connect() as conn:
        rows = conn.execute(
            text("""
                SELECT org_unit_id FROM practising_competency
                 WHERE user_id = :user_id AND competency = :competency
            """),
            {"user_id": user_id, "competency": MODULES},
        )
        return {int(r[0]) for r in rows}


def test_a_member_who_holds_it_gets_a_place(before_place: Config) -> None:
    with core_engine.begin() as conn:
        user_id = _user(conn, "member", "teaching_delegate")
        org_id = _org(conn)
        _grant(conn, user_id, RESULTS, "profession")
        _grant(conn, user_id, MODULES, "profession")
        _join(conn, user_id, org_id)

    command.upgrade(before_place, PLACE)

    assert _places(user_id) == {org_id}


def test_a_member_who_does_not_hold_it_gets_none(
    before_place: Config,
) -> None:
    with core_engine.begin() as conn:
        user_id = _user(conn, "consultant", "consultant")
        org_id = _org(conn)
        _join(conn, user_id, org_id)

    command.upgrade(before_place, PLACE)

    assert _places(user_id) == set()


def test_a_never_seeded_delegate_is_given_both_and_a_place(
    before_place: Config,
) -> None:
    """The self-registered delegate: the profession and no teaching row."""
    with core_engine.begin() as conn:
        user_id = _user(conn, "registered", "teaching_delegate")
        org_id = _org(conn)
        _grant(conn, user_id, "access_own_patient_records", "profession")
        _join(conn, user_id, org_id)

    command.upgrade(before_place, PLACE)

    assert {RESULTS, MODULES} <= _current(user_id)
    assert _places(user_id) == {org_id}


def test_somebody_it_was_taken_from_is_left_without(
    before_place: Config,
) -> None:
    """A closed row says an administrator decided; that stands."""
    with core_engine.begin() as conn:
        user_id = _user(conn, "removed", "teaching_delegate")
        org_id = _org(conn)
        _join(conn, user_id, org_id)
        conn.execute(
            text("""
                INSERT INTO user_competency
                    (user_id, competency_id, starts_on, ends_on, source,
                     created_at)
                VALUES (:user_id, :competency_id,
                        NOW() - INTERVAL '2 days',
                        NOW() - INTERVAL '1 day', 'profession', NOW())
            """),
            {"user_id": user_id, "competency_id": MODULES},
        )

    command.upgrade(before_place, PLACE)

    assert _current(user_id) == set()
    assert _places(user_id) == set()


def test_running_it_twice_writes_nothing_new(before_place: Config) -> None:
    with core_engine.begin() as conn:
        user_id = _user(conn, "twice", "teaching_delegate")
        org_id = _org(conn)
        _grant(conn, user_id, RESULTS, "profession")
        _grant(conn, user_id, MODULES, "profession")
        _join(conn, user_id, org_id)

    command.upgrade(before_place, PLACE)
    command.downgrade(before_place, BEFORE)
    command.upgrade(before_place, PLACE)

    assert _places(user_id) == {org_id}
