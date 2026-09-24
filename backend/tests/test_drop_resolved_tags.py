"""Dropping ``assessment_answers.resolved_tags``, against Postgres.

Migration ``2a0640755949`` drops the column. Its downgrade fills the column
back from the ``assessment_answer_tag`` rows, so going back loses nothing.
Integration tests, run in the ``alembic_drift_check`` CI job and locally
through ``compose.migrate.yml``, as ``tests/test_user_competency_backfill.py``
describes.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from alembic.config import Config
from sqlalchemy import text

from alembic import command
from app.db.core_db import core_engine
from tests.test_answer_tag_backfill import _answers, _cleanup

pytestmark = [pytest.mark.integration, pytest.mark.migration]

BEFORE = "7774a15142c1"
DROP = "2a0640755949"


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


def test_downgrade_fills_the_column_back_from_the_rows(
    before_drop: Config,
) -> None:
    answered, unanswered = _answers('["adenoma"]', "null")
    with core_engine.begin() as conn:
        for tag in ("high_confidence", "adenoma"):
            conn.execute(
                text("""
                    INSERT INTO assessment_answer_tag (answer_id, tag)
                    VALUES (:answer_id, :tag)
                    ON CONFLICT DO NOTHING
                """),
                {"answer_id": answered, "tag": tag},
            )

    command.upgrade(before_drop, DROP)
    command.downgrade(before_drop, BEFORE)

    with core_engine.connect() as conn:
        result = conn.execute(
            text("""
                SELECT id, resolved_tags FROM assessment_answers
                 WHERE id IN (:answered, :unanswered)
            """),
            {"answered": answered, "unanswered": unanswered},
        )
        rows: dict[int, list[str] | None] = {
            int(row.id): row.resolved_tags for row in result
        }
    assert rows[answered] == ["adenoma", "high_confidence"]
    assert rows[unanswered] is None
