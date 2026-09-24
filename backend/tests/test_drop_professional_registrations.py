"""Dropping ``users.professional_registrations``, against Postgres.

Migration ``7c33ceaa4550`` drops the column. Its downgrade fills the column
back from the current ``professional_registration`` rows, so going back
loses nothing. Run in the ``alembic_drift_check`` CI job with
``-m migration``, and locally through ``compose.migrate.yml``, as
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

pytestmark = [pytest.mark.integration, pytest.mark.migration]

BEFORE = "f14aae5e8d17"
DROP = "7c33ceaa4550"

PREFIX = "drop_registrations_test_"


@pytest.fixture
def before_drop() -> Iterator[Config]:
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


def _user(name: str) -> int:
    with core_engine.begin() as conn:
        user_id = conn.execute(
            text("""
                INSERT INTO users
                    (username, email, password_hash, is_totp_enabled,
                     is_active, base_profession)
                VALUES (:username, :email, 'x', false, true,
                        'external_assessor')
                RETURNING id
            """),
            {
                "username": f"{PREFIX}{name}",
                "email": f"{PREFIX}{name}@example.test",
            },
        ).scalar_one()
    return int(user_id)


def _registration(user_id: int, number: str, *, ended: bool) -> None:
    with core_engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO professional_registration
                    (user_id, authority, number, declared_at, ends_on,
                     created_at)
                VALUES (:user_id, 'GMC', :number, NOW(),
                        CASE WHEN :ended THEN NOW() - INTERVAL '1 day'
                             ELSE NULL END,
                        NOW())
            """),
            {"user_id": user_id, "number": number, "ended": ended},
        )


def _json(user_id: int) -> Any:
    with core_engine.connect() as conn:
        return conn.execute(
            text("""
                SELECT professional_registrations FROM users
                 WHERE id = :user_id
            """),
            {"user_id": user_id},
        ).scalar_one()


def test_downgrade_fills_the_column_back_from_current_rows(
    before_drop: Config,
) -> None:
    held = _user("held")
    _registration(held, "1111111", ended=True)
    _registration(held, "2222222", ended=False)
    none = _user("none")

    command.upgrade(before_drop, DROP)
    command.downgrade(before_drop, BEFORE)

    assert _json(held) == {"GMC": "2222222"}
    assert _json(none) is None
