"""Dropping ``user_competency.granted``, against Postgres.

Migration ``7774a15142c1`` deletes the old removal rows and drops the
column. Without the column, a kept removal row would read as a grant, so
these pin that the removals go and the grants stay. Integration tests, run
in the ``alembic_drift_check`` CI job and locally through
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

BEFORE = "8dc3af3202f4"
DROP = "7774a15142c1"

PREFIX = "drop_granted_test_"


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


def test_removal_rows_go_and_grants_stay(before_drop: Config) -> None:
    with core_engine.begin() as conn:
        user_id = conn.execute(
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
        for competency_id, granted in (
            ("certify_death", True),
            ("access_own_patient_records", False),
        ):
            conn.execute(
                text("""
                    INSERT INTO user_competency
                        (user_id, competency_id, granted, starts_on,
                         ends_on, source, created_at)
                    VALUES (:user_id, :competency_id, :granted, NOW(),
                            CASE WHEN :granted THEN NULL ELSE NOW() END,
                            'admin', NOW())
                """),
                {
                    "user_id": user_id,
                    "competency_id": competency_id,
                    "granted": granted,
                },
            )

    command.upgrade(before_drop, DROP)

    with core_engine.connect() as conn:
        left = list(
            conn.execute(
                text("""
                    SELECT competency_id FROM user_competency
                     WHERE user_id = :user_id
                """),
                {"user_id": user_id},
            ).scalars()
        )
    assert left == ["certify_death"]
