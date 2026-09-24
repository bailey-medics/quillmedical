"""Seeding existing users' profession competencies, against Postgres.

Migration ``56f3ad035100`` writes a ``profession`` row for each competency
a user's base profession grants. It is Postgres SQL and cannot run on the
SQLite unit database, so these step back to the revision before it, seed
users and rows with plain SQL, step forward and read what it wrote.

Integration tests, run in the ``alembic_drift_check`` CI job and locally
through ``compose.migrate.yml``, as
``tests/test_user_competency_backfill.py`` describes. Each leaves the
database at head with its seed removed.
"""

from __future__ import annotations

import importlib.util
import pathlib
from collections.abc import Iterator
from types import ModuleType
from typing import Any

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.engine import Connection

from alembic import command
from app.db.core_db import core_engine

pytestmark = [pytest.mark.integration, pytest.mark.migration]

BEFORE = "113dbf80612e"
SEED = "56f3ad035100"

MIGRATION = (
    pathlib.Path(__file__).parent.parent
    / "alembic"
    / "versions"
    / "2026_09_23_1730-56f3ad035100_seed_competency_rows_from_each_user_s_.py"
)

PREFIX = "seed_test_"


def _migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("seed", MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def before_seed() -> Iterator[Config]:
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


def _row(
    conn: Connection,
    user_id: int,
    competency_id: str,
    *,
    granted: bool,
    source: str = "admin",
) -> None:
    conn.execute(
        text("""
            INSERT INTO user_competency
                (user_id, competency_id, granted, starts_on, source,
                 created_at)
            VALUES (:user_id, :competency_id, :granted, NOW(), :source,
                    NOW())
        """),
        {
            "user_id": user_id,
            "competency_id": competency_id,
            "granted": granted,
            "source": source,
        },
    )


def _rows(user_id: int) -> list[dict[str, Any]]:
    with core_engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT competency_id, granted, source, starts_on
                  FROM user_competency
                 WHERE user_id = :user_id
                 ORDER BY competency_id, granted
            """),
            {"user_id": user_id},
        )
        return [dict(row._mapping) for row in result]


def test_every_template_competency_is_seeded(before_seed: Config) -> None:
    template = _migration().TEMPLATES["teaching_delegate"]
    with core_engine.begin() as conn:
        user_id = _user(conn, "delegate", "teaching_delegate")

    command.upgrade(before_seed, SEED)

    rows = _rows(user_id)
    assert [r["competency_id"] for r in rows] == sorted(template)
    assert {r["source"] for r in rows} == {"profession"}
    assert all(r["starts_on"] is None for r in rows)


def test_a_removed_competency_is_not_seeded(before_seed: Config) -> None:
    """Removed means not held, so no grant row is written for it."""
    with core_engine.begin() as conn:
        user_id = _user(conn, "withheld", "patient")
        _row(conn, user_id, "access_own_patient_records", granted=False)

    command.upgrade(before_seed, SEED)

    assert [(r["competency_id"], r["granted"]) for r in _rows(user_id)] == [
        ("access_own_patient_records", False)
    ]


def test_a_competency_already_granted_is_not_seeded_again(
    before_seed: Config,
) -> None:
    """Somebody the application has already seeded keeps their rows."""
    with core_engine.begin() as conn:
        user_id = _user(conn, "already", "patient")
        _row(
            conn,
            user_id,
            "access_own_patient_records",
            granted=True,
            source="profession",
        )

    command.upgrade(before_seed, SEED)

    rows = _rows(user_id)
    assert len(rows) == 1
    assert rows[0]["starts_on"] is not None


def test_an_unknown_profession_seeds_nothing(before_seed: Config) -> None:
    with core_engine.begin() as conn:
        user_id = _user(conn, "unknown", "not_a_profession")

    command.upgrade(before_seed, SEED)

    assert _rows(user_id) == []


def test_running_it_twice_adds_nothing(before_seed: Config) -> None:
    with core_engine.begin() as conn:
        user_id = _user(conn, "twice", "teaching_delegate")

    command.upgrade(before_seed, SEED)
    first = _rows(user_id)
    with core_engine.begin() as conn:
        conn.execute(text(_migration()._seed()))

    assert _rows(user_id) == first


def test_downgrade_removes_only_what_it_seeded(before_seed: Config) -> None:
    """A row the application seeded carries a start, and survives."""
    with core_engine.begin() as conn:
        seeded_by_app = _user(conn, "by_app", "patient")
        _row(
            conn,
            seeded_by_app,
            "access_own_patient_records",
            granted=True,
            source="profession",
        )
        seeded_here = _user(conn, "here", "patient")

    command.upgrade(before_seed, SEED)
    assert len(_rows(seeded_here)) == 1

    command.downgrade(before_seed, BEFORE)

    assert _rows(seeded_here) == []
    assert len(_rows(seeded_by_app)) == 1
