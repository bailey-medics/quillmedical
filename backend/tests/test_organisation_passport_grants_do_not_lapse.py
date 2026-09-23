"""Clearing the end date on organisation passport grants, against Postgres.

Migration ``57deea9f9ea6`` takes the end date off every current
``passport_write`` grant given through a site or organisation, and leaves
a subscription somebody bought for themselves alone. Integration tests,
run in the ``alembic_drift_check`` CI job and locally through
``compose.migrate.yml``, as ``tests/test_user_competency_backfill.py``
describes.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import pytest
from alembic.config import Config
from sqlalchemy import text

from alembic import command
from app.db.core_db import core_engine

pytestmark = pytest.mark.integration

BEFORE = "2a2a7b1ea83a"
CLEAR = "57deea9f9ea6"

PREFIX = "no_lapse_test_"


@pytest.fixture
def before_clear() -> Iterator[Config]:
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


def _grants() -> tuple[int, datetime]:
    """A user with an organisation grant and an individual one."""
    starts_on = datetime.now(UTC) - timedelta(days=10)
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
                    "username": f"{PREFIX}holder",
                    "email": f"{PREFIX}holder@example.test",
                },
            ).scalar_one()
        )
        for source in ("organisation", "individual"):
            conn.execute(
                text("""
                    INSERT INTO user_competency
                        (user_id, competency_id, granted, starts_on,
                         ends_on, source, created_at)
                    VALUES
                        (:user_id, 'passport_write', true, :starts_on,
                         :ends_on, :source, NOW())
                """),
                {
                    "user_id": user_id,
                    "starts_on": starts_on,
                    "ends_on": starts_on + timedelta(days=365),
                    "source": source,
                },
            )
    return user_id, starts_on


def _ends(user_id: int) -> dict[str, datetime | None]:
    with core_engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT source, ends_on
                  FROM user_competency
                 WHERE user_id = :user_id
            """),
            {"user_id": user_id},
        )
        return {row.source: row.ends_on for row in result}


def test_only_the_organisation_grant_loses_its_end(
    before_clear: Config,
) -> None:
    user_id, starts_on = _grants()

    command.upgrade(before_clear, CLEAR)

    ends = _ends(user_id)
    assert ends["organisation"] is None
    assert ends["individual"] == starts_on + timedelta(days=365)


def test_downgrade_puts_the_year_back(before_clear: Config) -> None:
    user_id, starts_on = _grants()

    command.upgrade(before_clear, CLEAR)
    command.downgrade(before_clear, BEFORE)

    assert _ends(user_id)["organisation"] == starts_on + timedelta(days=365)
