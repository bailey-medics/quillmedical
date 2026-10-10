"""Renaming ``external_assessor`` to ``passport_external_assessor``.

Migration ``4fd333faf33b`` moves ``users.base_profession`` to the new id
and its downgrade moves it back. Run in the ``alembic_drift_check`` CI job
with ``-m migration``, and locally through ``compose.migrate.yml``, as
``tests/user_competency_backfill_test.py`` describes.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from alembic.config import Config
from sqlalchemy import text

from alembic import command
from app.db.core_db import core_engine

pytestmark = [pytest.mark.integration, pytest.mark.migration]

BEFORE = "16834fc0663d"
RENAME = "4fd333faf33b"

PREFIX = "rename_assessor_test_"


@pytest.fixture
def before_rename() -> Iterator[Config]:
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


def _user(name: str, profession: str) -> int:
    with core_engine.begin() as conn:
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


def _profession(user_id: int) -> str:
    with core_engine.connect() as conn:
        return str(
            conn.execute(
                text("SELECT base_profession FROM users WHERE id = :id"),
                {"id": user_id},
            ).scalar_one()
        )


def test_the_assessor_is_renamed_and_nobody_else_is(
    before_rename: Config,
) -> None:
    assessor = _user("assessor", "external_assessor")
    consultant = _user("consultant", "consultant")

    command.upgrade(before_rename, RENAME)

    assert _profession(assessor) == "passport_external_assessor"
    assert _profession(consultant) == "consultant"


def test_the_downgrade_puts_the_old_id_back(before_rename: Config) -> None:
    assessor = _user("assessor", "external_assessor")

    command.upgrade(before_rename, RENAME)
    command.downgrade(before_rename, BEFORE)

    assert _profession(assessor) == "external_assessor"
