"""The backfill of ``professional_registration``, against a real Postgres.

Migration ``f14aae5e8d17`` copies every user's ``professional_registrations``
JSON into rows. It is Postgres SQL and cannot run on the SQLite unit
database, so these step back to the revision before it, seed users with
plain SQL, step forward and read the rows. Run in the
``alembic_drift_check`` CI job with ``-m migration``, and locally through
``compose.migrate.yml``, as ``tests/test_user_competency_backfill.py``
describes.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from alembic.config import Config
from sqlalchemy import text

from alembic import command
from app.db.core_db import core_engine

pytestmark = [pytest.mark.integration, pytest.mark.migration]

BEFORE = "2eedb5e4d200"
BACKFILL = "f14aae5e8d17"

PREFIX = "registration_backfill_test_"


@pytest.fixture
def before_backfill() -> Iterator[Config]:
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


def _user(name: str, registrations: str | None) -> int:
    """A user whose JSON column holds ``registrations``, raw."""
    with core_engine.begin() as conn:
        user_id = conn.execute(
            text("""
                INSERT INTO users
                    (username, email, password_hash, is_totp_enabled,
                     is_active, base_profession, professional_registrations)
                VALUES (:username, :email, 'x', false, true,
                        'external_assessor', CAST(:raw AS json))
                RETURNING id
            """),
            {
                "username": f"{PREFIX}{name}",
                "email": f"{PREFIX}{name}@example.test",
                "raw": registrations,
            },
        ).scalar_one()
    return int(user_id)


def _rows(user_id: int) -> list[tuple[str, str]]:
    with core_engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT authority, number FROM professional_registration
                 WHERE user_id = :user_id AND ends_on IS NULL
                 ORDER BY authority
            """),
            {"user_id": user_id},
        )
        return [(row.authority, row.number) for row in result]


def test_each_registration_becomes_a_row(before_backfill: Config) -> None:
    user_id = _user("two", '{"GMC": "1234567", "NMC": "99AB1234"}')

    command.upgrade(before_backfill, BACKFILL)

    assert _rows(user_id) == [("GMC", "1234567"), ("NMC", "99AB1234")]


def test_a_number_stored_as_a_number_is_copied_as_text(
    before_backfill: Config,
) -> None:
    user_id = _user("numeric", '{"GMC": 1234567}')

    command.upgrade(before_backfill, BACKFILL)

    assert _rows(user_id) == [("GMC", "1234567")]


def test_an_unlisted_body_is_carried_across(before_backfill: Config) -> None:
    """Losing a registration is worse than keeping one the list lacks."""
    user_id = _user("unlisted", '{"General Medical": "1234567"}')

    command.upgrade(before_backfill, BACKFILL)

    assert _rows(user_id) == [("General Medical", "1234567")]


def test_empty_null_and_malformed_copy_nothing(
    before_backfill: Config,
) -> None:
    """One bad row must not block the deploy for everybody."""
    empty = _user("empty", '{"": ""}')
    null = _user("null", None)
    listed = _user("list", '["GMC", "1234567"]')

    command.upgrade(before_backfill, BACKFILL)

    assert _rows(empty) == []
    assert _rows(null) == []
    assert _rows(listed) == []


def test_a_user_with_rows_already_is_skipped(before_backfill: Config) -> None:
    """The application's row is already the copy."""
    user_id = _user("dual_written", '{"GMC": "1234567"}')
    with core_engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO professional_registration
                    (user_id, authority, number, declared_at, created_at)
                VALUES (:user_id, 'GMC', '1234567', NOW(), NOW())
            """),
            {"user_id": user_id},
        )

    command.upgrade(before_backfill, BACKFILL)

    assert _rows(user_id) == [("GMC", "1234567")]
