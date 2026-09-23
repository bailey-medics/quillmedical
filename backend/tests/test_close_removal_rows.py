"""Closing the competency removal rows, against Postgres.

Migration ``2a2a7b1ea83a`` closes every current removal row. These step
back to the revision before it, write rows with plain SQL, step forward
and read them. Integration tests, run in the ``alembic_drift_check`` CI
job and locally through ``compose.migrate.yml``, as
``tests/test_user_competency_backfill.py`` describes.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from alembic.config import Config
from sqlalchemy import text

from alembic import command
from app.db.core_db import core_engine

pytestmark = pytest.mark.integration

BEFORE = "56f3ad035100"
CLOSE = "2a2a7b1ea83a"

PREFIX = "close_test_"


@pytest.fixture
def before_close() -> Iterator[Config]:
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


def _user_with_rows() -> int:
    """A user with a current grant, a current removal and a closed one."""
    with core_engine.begin() as conn:
        user_id = int(
            conn.execute(
                text("""
                    INSERT INTO users
                        (username, email, password_hash, is_totp_enabled,
                         is_active, base_profession)
                    VALUES (:username, :email, 'x', false, true, 'patient')
                    RETURNING id
                """),
                {
                    "username": f"{PREFIX}person",
                    "email": f"{PREFIX}person@example.test",
                },
            ).scalar_one()
        )
        for competency_id, granted, ends in (
            ("certify_death", True, None),
            ("access_own_patient_records", False, None),
            ("perform_venepuncture", False, "2026-01-01T00:00:00+00:00"),
        ):
            conn.execute(
                text("""
                    INSERT INTO user_competency
                        (user_id, competency_id, granted, starts_on,
                         ends_on, source, created_at)
                    VALUES
                        (:user_id, :competency_id, :granted,
                         CAST('2025-06-01T00:00:00+00:00' AS timestamptz),
                         CAST(:ends AS timestamptz), 'admin', NOW())
                """),
                {
                    "user_id": user_id,
                    "competency_id": competency_id,
                    "granted": granted,
                    "ends": ends,
                },
            )
    return user_id


def _rows(user_id: int) -> dict[str, dict[str, Any]]:
    with core_engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT competency_id, granted,
                       ends_on IS NULL OR ends_on > NOW() AS current,
                       ends_on
                  FROM user_competency
                 WHERE user_id = :user_id
            """),
            {"user_id": user_id},
        )
        return {row.competency_id: dict(row._mapping) for row in result}


def test_current_removals_are_closed_and_grants_untouched(
    before_close: Config,
) -> None:
    user_id = _user_with_rows()

    command.upgrade(before_close, CLOSE)

    rows = _rows(user_id)
    assert rows["certify_death"]["current"] is True
    assert rows["access_own_patient_records"]["current"] is False
    # Closed before, and keeps the end it already had.
    assert rows["perform_venepuncture"]["ends_on"].year == 2026


def test_downgrade_reopens_only_what_it_closed(before_close: Config) -> None:
    user_id = _user_with_rows()

    command.upgrade(before_close, CLOSE)
    command.downgrade(before_close, BEFORE)

    rows = _rows(user_id)
    assert rows["access_own_patient_records"]["current"] is True
    assert rows["perform_venepuncture"]["current"] is False
