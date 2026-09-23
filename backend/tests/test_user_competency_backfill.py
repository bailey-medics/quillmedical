"""The backfill of ``user_competency``, against a real Postgres.

Migration ``61e9c9b15ac6`` is Postgres SQL — ``json_array_elements_text``,
``LATERAL``, ``GREATEST`` — and cannot run on the SQLite unit database,
which is built from model metadata rather than the migration chain. So
these run the migration itself: step back to the revision before it,
seed users and entitlements with plain SQL, step forward, and read what
it wrote.

Integration tests, excluded from ``just ub``. They run in the
``alembic_drift_check`` CI job against its throwaway Postgres, and
locally against the throwaway database ``compose.migrate.yml`` provides:

    docker compose -p quill-migrate-<worktree> -f compose.migrate.yml \\
        run --rm migrate sh -lc \\
        'alembic upgrade head && pytest -m migration \\
         tests/test_user_competency_backfill.py'

Each test leaves the database at head with its seed removed, because the
drift check shares the database and runs after.
"""

from __future__ import annotations

import importlib.util
import pathlib
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from types import ModuleType
from typing import Any

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.engine import Connection

from alembic import command
from app.db.core_db import core_engine

pytestmark = [pytest.mark.integration, pytest.mark.migration]

BEFORE = "baff1a11eeb2"
BACKFILL = "61e9c9b15ac6"

MIGRATION = (
    pathlib.Path(__file__).parent.parent
    / "alembic"
    / "versions"
    / "2026_09_23_1334-61e9c9b15ac6_backfill_user_competency_from_the_json_.py"
)

#: Every seeded username carries this, so cleanup finds them all and
#: nothing else.
PREFIX = "backfill_test_"


def _migration() -> ModuleType:
    """Load the migration module, to run its statements a second time."""
    spec = importlib.util.spec_from_file_location("backfill", MIGRATION)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def alembic_config() -> Config:
    return Config("alembic.ini")


@pytest.fixture
def before_backfill(alembic_config: Config) -> Iterator[Config]:
    """The database one revision short of the backfill, and head after."""
    command.upgrade(alembic_config, "head")
    _cleanup()
    command.downgrade(alembic_config, BEFORE)
    try:
        yield alembic_config
    finally:
        _cleanup()
        command.upgrade(alembic_config, "head")


def _cleanup() -> None:
    with core_engine.begin() as conn:
        conn.execute(
            text("DELETE FROM users WHERE username LIKE :prefix"),
            {"prefix": f"{PREFIX}%"},
        )


def _user(
    conn: Connection,
    name: str,
    *,
    additional: str = "[]",
    removed: str = "[]",
) -> int:
    """Insert a user with raw JSON for the two lists, returning the id."""
    user_id = conn.execute(
        text("""
            INSERT INTO users
                (username, email, password_hash, is_totp_enabled,
                 is_active, base_profession, additional_competencies,
                 removed_competencies)
            VALUES
                (:username, :email, 'x', false, true, 'patient',
                 CAST(:additional AS json), CAST(:removed AS json))
            RETURNING id
        """),
        {
            "username": f"{PREFIX}{name}",
            "email": f"{PREFIX}{name}@example.test",
            "additional": additional,
            "removed": removed,
        },
    ).scalar_one()
    return int(user_id)


def _entitlement(
    conn: Connection,
    user_id: int,
    *,
    source: str,
    starts_on: datetime,
    ends_on: datetime,
) -> None:
    conn.execute(
        text("""
            INSERT INTO passport_write_entitlement
                (user_id, source, starts_on, ends_on, created_at)
            VALUES (:user_id, :source, :starts_on, :ends_on, NOW())
        """),
        {
            "user_id": user_id,
            "source": source,
            "starts_on": starts_on,
            "ends_on": ends_on,
        },
    )


def _rows(user_id: int) -> list[dict[str, Any]]:
    with core_engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT competency_id, granted, starts_on, ends_on, source,
                       granted_by
                  FROM user_competency
                 WHERE user_id = :user_id
                 ORDER BY competency_id, granted
            """),
            {"user_id": user_id},
        )
        return [dict(row._mapping) for row in result]


def test_both_lists_are_copied(before_backfill: Config) -> None:
    """A grant for each addition and a removal for each removal.

    Undated, because the JSON never recorded when anything started, and
    ``migrated``, so the rows say where they came from.
    """
    with core_engine.begin() as conn:
        user_id = _user(
            conn,
            "lists",
            additional='["certify_death", "prescribe_non_controlled"]',
            removed='["access_own_patient_records"]',
        )

    command.upgrade(before_backfill, BACKFILL)

    rows = _rows(user_id)
    assert [(r["competency_id"], r["granted"]) for r in rows] == [
        ("access_own_patient_records", False),
        ("certify_death", True),
        ("prescribe_non_controlled", True),
    ]
    assert {r["source"] for r in rows} == {"migrated"}
    assert all(r["starts_on"] is None for r in rows)
    assert all(r["ends_on"] is None for r in rows)


def test_a_stale_id_is_carried_across(before_backfill: Config) -> None:
    """Losing a grant silently is worse than carrying a meaningless one."""
    with core_engine.begin() as conn:
        user_id = _user(conn, "stale", additional='["a_retired_competency"]')

    command.upgrade(before_backfill, BACKFILL)

    assert [r["competency_id"] for r in _rows(user_id)] == [
        "a_retired_competency"
    ]


def test_passport_write_comes_from_the_entitlement_alone(
    before_backfill: Config,
) -> None:
    """One dated row, never an undated one beside it.

    An undated ``passport_write`` row would be current forever, and the
    entitlement would never lapse.
    """
    starts_on = datetime.now(UTC) - timedelta(days=10)
    ends_on = starts_on + timedelta(days=365)
    with core_engine.begin() as conn:
        user_id = _user(conn, "holder", additional='["passport_write"]')
        _entitlement(
            conn,
            user_id,
            source="organisation",
            starts_on=starts_on,
            ends_on=ends_on,
        )

    command.upgrade(before_backfill, BACKFILL)

    rows = _rows(user_id)
    assert len(rows) == 1
    assert rows[0]["competency_id"] == "passport_write"
    assert rows[0]["granted"] is True
    assert rows[0]["starts_on"] == starts_on
    assert rows[0]["ends_on"] == ends_on
    assert rows[0]["source"] == "organisation"


def test_an_entitlement_without_the_competency_is_copied_closed(
    before_backfill: Config,
) -> None:
    """They cannot write today, and must not gain it when reads move.

    Left out, the record of the term would go with the entitlement table.
    """
    starts_on = datetime.now(UTC) - timedelta(days=10)
    with core_engine.begin() as conn:
        user_id = _user(conn, "not_holder")
        _entitlement(
            conn,
            user_id,
            source="individual",
            starts_on=starts_on,
            ends_on=starts_on + timedelta(days=365),
        )

    command.upgrade(before_backfill, BACKFILL)

    rows = _rows(user_id)
    assert len(rows) == 1
    assert rows[0]["starts_on"] == starts_on
    assert rows[0]["ends_on"] <= datetime.now(UTC)


def test_what_the_dual_write_wrote_is_not_copied_again(
    before_backfill: Config,
) -> None:
    """Somebody saved since the table arrived already has their rows."""
    starts_on = datetime.now(UTC) - timedelta(days=1)
    ends_on = starts_on + timedelta(days=365)
    with core_engine.begin() as conn:
        user_id = _user(
            conn,
            "dual_written",
            additional='["certify_death", "passport_write"]',
        )
        _entitlement(
            conn,
            user_id,
            source="organisation",
            starts_on=starts_on,
            ends_on=ends_on,
        )
        for competency, row_starts, row_ends, source in (
            ("certify_death", starts_on, None, "admin"),
            ("passport_write", starts_on, ends_on, "organisation"),
        ):
            conn.execute(
                text("""
                    INSERT INTO user_competency
                        (user_id, competency_id, granted, starts_on,
                         ends_on, source, granted_by, created_at)
                    VALUES
                        (:user_id, :competency, true, :starts_on,
                         :ends_on, :source, :user_id, NOW())
                """),
                {
                    "user_id": user_id,
                    "competency": competency,
                    "starts_on": row_starts,
                    "ends_on": row_ends,
                    "source": source,
                },
            )

    command.upgrade(before_backfill, BACKFILL)

    assert len(_rows(user_id)) == 2


def test_running_it_twice_adds_nothing(before_backfill: Config) -> None:
    with core_engine.begin() as conn:
        user_id = _user(
            conn,
            "twice",
            additional='["certify_death", "passport_write"]',
            removed='["access_own_patient_records"]',
        )
        _entitlement(
            conn,
            user_id,
            source="organisation",
            starts_on=datetime.now(UTC),
            ends_on=datetime.now(UTC) + timedelta(days=365),
        )

    command.upgrade(before_backfill, BACKFILL)
    first = _rows(user_id)

    migration = _migration()
    with core_engine.begin() as conn:
        conn.execute(
            text(migration._copy_list("additional_competencies", granted=True))
        )
        conn.execute(
            text(migration._copy_list("removed_competencies", granted=False))
        )
        conn.execute(text(migration._copy_entitlements()))

    assert _rows(user_id) == first
    assert len(first) == 3


def test_a_list_that_is_not_an_array_copies_nothing(
    before_backfill: Config,
) -> None:
    """One malformed row must not fail the deploy for everybody."""
    with core_engine.begin() as conn:
        user_id = _user(conn, "malformed", additional="null")

    command.upgrade(before_backfill, BACKFILL)

    assert _rows(user_id) == []


def test_downgrade_removes_only_what_the_backfill_wrote(
    before_backfill: Config,
) -> None:
    """A row the dual-write wrote names its administrator and survives."""
    with core_engine.begin() as conn:
        user_id = _user(conn, "downgrade", additional='["certify_death"]')
        admin_id = _user(conn, "downgrade_admin")
        conn.execute(
            text("""
                INSERT INTO user_competency
                    (user_id, competency_id, granted, source, granted_by,
                     created_at)
                VALUES
                    (:user_id, 'prescribe_non_controlled', true, 'admin',
                     :admin_id, NOW())
            """),
            {"user_id": user_id, "admin_id": admin_id},
        )

    command.upgrade(before_backfill, BACKFILL)
    assert len(_rows(user_id)) == 2

    command.downgrade(before_backfill, BEFORE)

    assert [r["competency_id"] for r in _rows(user_id)] == [
        "prescribe_non_controlled"
    ]
