"""The backfill of ``assessment_answer_tag``, against a real Postgres.

Migration ``83c3b5af3ea7`` copies every answer's ``resolved_tags`` into
rows. It is Postgres SQL and cannot run on the SQLite unit database, so
these step back to the revision before it, seed an answer chain with
plain SQL, step forward and read the rows. Integration tests, run in the
``alembic_drift_check`` CI job and locally through ``compose.migrate.yml``,
as ``tests/test_user_competency_backfill.py`` describes.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from alembic.config import Config
from sqlalchemy import text

from alembic import command
from app.db.core_db import core_engine

pytestmark = [pytest.mark.integration, pytest.mark.migration]

BEFORE = "aa35480f3d40"
BACKFILL = "83c3b5af3ea7"

PREFIX = "tag_backfill_test_"


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
    """Remove the seeded chain; answers and tags go with it by cascade."""
    with core_engine.begin() as conn:
        conn.execute(
            text("DELETE FROM users WHERE username LIKE :prefix"),
            {"prefix": f"{PREFIX}%"},
        )
        conn.execute(
            text("DELETE FROM org_unit WHERE name LIKE :prefix"),
            {"prefix": f"{PREFIX}%"},
        )


def _answers(*resolved: str) -> list[int]:
    """Seed one assessment with an answer per raw JSON value given."""
    with core_engine.begin() as conn:
        org_id = conn.execute(
            text("""
                INSERT INTO org_unit (name, type, is_active, created_at,
                                      updated_at)
                VALUES (:name, 'organisation', true, NOW(), NOW())
                RETURNING id
            """),
            {"name": f"{PREFIX}org"},
        ).scalar_one()
        user_id = conn.execute(
            text("""
                INSERT INTO users
                    (username, email, password_hash, is_totp_enabled,
                     is_active, base_profession)
                VALUES (:username, :email, 'x', false, true, 'patient')
                RETURNING id
            """),
            {
                "username": f"{PREFIX}learner",
                "email": f"{PREFIX}learner@example.test",
            },
        ).scalar_one()
        item_id = conn.execute(
            text("""
                INSERT INTO question_bank_items
                    (org_unit_id, question_bank_id, bank_version, images,
                     metadata_json, status, created_at)
                VALUES (:org_id, 'bank', 1, '[]', '{}', 'published', NOW())
                RETURNING id
            """),
            {"org_id": org_id},
        ).scalar_one()
        assessment_id = conn.execute(
            text("""
                INSERT INTO assessments
                    (user_id, org_unit_id, question_bank_id, bank_version,
                     started_at, time_limit_minutes, total_items)
                VALUES (:user_id, :org_id, 'bank', 1, NOW(), 60, 3)
                RETURNING id
            """),
            {"user_id": user_id, "org_id": org_id},
        ).scalar_one()
        ids = []
        for order, raw in enumerate(resolved):
            ids.append(
                int(
                    conn.execute(
                        text("""
                            INSERT INTO assessment_answers
                                (assessment_id, item_id, display_order,
                                 resolved_tags)
                            VALUES (:assessment_id, :item_id, :order,
                                    CAST(:raw AS json))
                            RETURNING id
                        """),
                        {
                            "assessment_id": assessment_id,
                            "item_id": item_id,
                            "order": order,
                            "raw": raw,
                        },
                    ).scalar_one()
                )
            )
    return ids


def _tags(answer_id: int) -> list[str]:
    with core_engine.connect() as conn:
        return list(
            conn.execute(
                text("""
                    SELECT tag FROM assessment_answer_tag
                     WHERE answer_id = :answer_id ORDER BY tag
                """),
                {"answer_id": answer_id},
            ).scalars()
        )


def test_each_tag_becomes_a_row(before_backfill: Config) -> None:
    (answer,) = _answers('["high_confidence", "adenoma"]')

    command.upgrade(before_backfill, BACKFILL)

    assert _tags(answer) == ["adenoma", "high_confidence"]


def test_a_repeated_tag_is_copied_once(before_backfill: Config) -> None:
    (answer,) = _answers('["correct", "correct"]')

    command.upgrade(before_backfill, BACKFILL)

    assert _tags(answer) == ["correct"]


def test_unanswered_and_malformed_copy_nothing(
    before_backfill: Config,
) -> None:
    """Null is an answer not yet given; an object is one bad row."""
    unanswered, malformed = _answers("null", '{"not": "a list"}')

    command.upgrade(before_backfill, BACKFILL)

    assert _tags(unanswered) == []
    assert _tags(malformed) == []


def test_an_answer_with_rows_already_is_skipped(
    before_backfill: Config,
) -> None:
    """The application's rows are already the copy."""
    (answer,) = _answers('["high_confidence", "adenoma"]')
    with core_engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO assessment_answer_tag (answer_id, tag)
                VALUES (:answer_id, 'high_confidence')
            """),
            {"answer_id": answer},
        )

    command.upgrade(before_backfill, BACKFILL)

    assert _tags(answer) == ["high_confidence"]
