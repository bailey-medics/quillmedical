"""Bringing learners down to one unfinished attempt, against a real Postgres.

Migration ``30b1773fb735`` makes a unique index over unfinished
attempts, for each learner and bank. Before it can, it
finishes all but the newest unfinished attempt of anybody holding more
than one. That is Postgres SQL and cannot run on the SQLite unit
database, so these step back to the revision before it, seed attempts
with plain SQL, step forward and read the rows.

The attempts it finishes are closed unmarked: a completion time, and
nothing else is written to them.

Integration tests, run in the ``alembic_drift_check`` CI job and
locally through ``compose.migrate.yml``, as
``tests/user_competency_backfill_test.py`` describes.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from alembic import command
from app.db.core_db import core_engine

pytestmark = [pytest.mark.integration, pytest.mark.migration]

BEFORE = "57ed659606ec"
ONE_IN_PROGRESS = "30b1773fb735"

PREFIX = "one_in_progress_test_"
BANK = "polyps"


@pytest.fixture
def before_the_index() -> Iterator[Config]:
    """The database one revision short of the index, and head after."""
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
    """Remove what was seeded; the attempts go with it by cascade."""
    with core_engine.begin() as conn:
        conn.execute(
            text("DELETE FROM users WHERE username LIKE :prefix"),
            {"prefix": f"{PREFIX}%"},
        )
        conn.execute(
            text("DELETE FROM org_unit WHERE name LIKE :prefix"),
            {"prefix": f"{PREFIX}%"},
        )


def _organisation(name: str = "org") -> int:
    with core_engine.begin() as conn:
        org_id: int = conn.execute(
            text("""
                INSERT INTO org_unit (name, type, is_active, created_at,
                                      updated_at)
                VALUES (:name, 'organisation', true, NOW(), NOW())
                RETURNING id
            """),
            {"name": f"{PREFIX}{name}"},
        ).scalar_one()

    return org_id


def _learner(name: str = "learner") -> int:
    with core_engine.begin() as conn:
        user_id: int = conn.execute(
            text("""
                INSERT INTO users
                    (username, email, password_hash, is_totp_enabled,
                     is_active, base_profession)
                VALUES (:username, :email, 'x', false, true, 'patient')
                RETURNING id
            """),
            {
                "username": f"{PREFIX}{name}",
                "email": f"{PREFIX}{name}@example.test",
            },
        ).scalar_one()

    return user_id


def _attempt(
    user_id: int,
    org_id: int,
    *,
    started: datetime,
    minutes: int = 0,
    completed: datetime | None = None,
    bank_id: str = BANK,
) -> int:
    """Seed one attempt, unfinished unless *completed* is given."""
    with core_engine.begin() as conn:
        assessment_id: int = conn.execute(
            text("""
                INSERT INTO assessments
                    (user_id, org_unit_id, question_bank_id, bank_version,
                     started_at, completed_at, time_limit_minutes,
                     total_items)
                VALUES (:user_id, :org_id, :bank_id, 1, :started,
                        :completed, :minutes, 3)
                RETURNING id
            """),
            {
                "user_id": user_id,
                "org_id": org_id,
                "bank_id": bank_id,
                "started": started,
                "completed": completed,
                "minutes": minutes,
            },
        ).scalar_one()

    return assessment_id


def _stored(assessment_id: int) -> Any:
    """One attempt as the database has it now."""
    with core_engine.connect() as conn:
        return conn.execute(
            text("""
                SELECT completed_at, is_passed,
                       score_breakdown, exam_ref
                  FROM assessments WHERE id = :id
            """),
            {"id": assessment_id},
        ).one()


def _now() -> datetime:
    return datetime.now(UTC)


def test_all_but_the_newest_unfinished_attempt_are_finished(
    before_the_index: Config,
) -> None:
    """The newest is the one started last, whatever order they were
    written in. The others are closed unmarked."""
    learner, org = _learner(), _organisation()
    now = _now()
    newest = _attempt(learner, org, started=now - timedelta(minutes=1))
    oldest = _attempt(learner, org, started=now - timedelta(days=3))
    middle = _attempt(learner, org, started=now - timedelta(days=1))

    command.upgrade(before_the_index, ONE_IN_PROGRESS)

    assert _stored(newest).completed_at is None

    for spare in (oldest, middle):
        row = _stored(spare)

        assert row.completed_at is not None
        assert abs(row.completed_at - now) < timedelta(minutes=5)
        assert row.is_passed is None
        assert row.score_breakdown is None
        assert row.exam_ref is None


def test_a_spare_attempt_past_its_time_is_finished_as_at_its_deadline(
    before_the_index: Config,
) -> None:
    learner, org = _learner(), _organisation()
    now = _now()
    started = now - timedelta(days=2)
    spare = _attempt(learner, org, started=started, minutes=30)
    newest = _attempt(learner, org, started=now, minutes=30)

    command.upgrade(before_the_index, ONE_IN_PROGRESS)

    row = _stored(spare)

    assert row.completed_at == started + timedelta(minutes=30)
    assert row.is_passed is None
    assert row.score_breakdown is None
    assert _stored(newest).completed_at is None


def test_a_spare_attempt_still_in_time_is_finished_as_at_now(
    before_the_index: Config,
) -> None:
    learner, org = _learner(), _organisation()
    now = _now()
    spare = _attempt(
        learner, org, started=now - timedelta(minutes=5), minutes=30
    )
    newest = _attempt(learner, org, started=now, minutes=30)

    command.upgrade(before_the_index, ONE_IN_PROGRESS)

    row = _stored(spare)

    assert abs(row.completed_at - now) < timedelta(minutes=5)
    assert _stored(newest).completed_at is None


def test_of_two_started_at_the_same_moment_the_higher_id_is_kept(
    before_the_index: Config,
) -> None:
    learner, org = _learner(), _organisation()
    started = _now() - timedelta(hours=1)
    lower = _attempt(learner, org, started=started)
    higher = _attempt(learner, org, started=started)

    command.upgrade(before_the_index, ONE_IN_PROGRESS)

    assert lower < higher
    assert _stored(lower).completed_at is not None
    assert _stored(higher).completed_at is None


def test_the_newest_is_left_unfinished_even_past_its_time(
    before_the_index: Config,
) -> None:
    """It is the application's to finish, and to mark, when next met."""
    learner, org = _learner(), _organisation()
    now = _now()
    spare = _attempt(learner, org, started=now - timedelta(days=3), minutes=30)
    newest = _attempt(
        learner, org, started=now - timedelta(days=2), minutes=30
    )

    command.upgrade(before_the_index, ONE_IN_PROGRESS)

    assert _stored(spare).completed_at is not None
    assert _stored(newest).completed_at is None


def test_an_attempt_with_no_other_beside_it_is_left_alone(
    before_the_index: Config,
) -> None:
    """Another learner's, one on another bank and a finished one are
    none of them beside it."""
    learner, other = _learner(), _learner("other")
    org = _organisation()
    now = _now()
    old = now - timedelta(days=2)
    handed_in = old + timedelta(minutes=10)
    mine = _attempt(learner, org, started=old)
    theirs = _attempt(other, org, started=now)
    another_bank = _attempt(learner, org, started=now, bank_id="bleeding")
    finished = _attempt(learner, org, started=old, completed=handed_in)
    finished_later = _attempt(learner, org, started=now, completed=now)

    command.upgrade(before_the_index, ONE_IN_PROGRESS)

    for alone in (mine, theirs, another_bank):
        assert _stored(alone).completed_at is None

    assert _stored(finished).completed_at == handed_in
    assert _stored(finished_later).completed_at == now


def test_an_older_attempt_at_another_organisation_is_finished_too(
    before_the_index: Config,
) -> None:
    """The organisation is not part of the rule: one bank, one attempt
    in progress, wherever each was started."""
    learner = _learner()
    org, elsewhere = _organisation(), _organisation("elsewhere")
    now = _now()
    spare = _attempt(learner, elsewhere, started=now - timedelta(days=1))
    newest = _attempt(learner, org, started=now)

    command.upgrade(before_the_index, ONE_IN_PROGRESS)

    assert _stored(spare).completed_at is not None
    assert _stored(newest).completed_at is None

    with pytest.raises(IntegrityError, match="uq_assessments_one_in_progress"):
        _attempt(learner, elsewhere, started=now)


def test_the_index_refuses_a_second_unfinished_attempt_and_no_finished_one(
    before_the_index: Config,
) -> None:
    """Partial on Postgres as on SQLite: finished attempts are not
    limited."""
    learner, org = _learner(), _organisation()
    now = _now()
    command.upgrade(before_the_index, ONE_IN_PROGRESS)
    _attempt(learner, org, started=now, completed=now)
    _attempt(learner, org, started=now, completed=now)
    _attempt(learner, org, started=now)

    with pytest.raises(IntegrityError, match="uq_assessments_one_in_progress"):
        _attempt(learner, org, started=now)


def test_stepping_back_drops_the_index_and_reopens_nothing(
    before_the_index: Config,
) -> None:
    learner, org = _learner(), _organisation()
    now = _now()
    spare = _attempt(learner, org, started=now - timedelta(days=1))
    _attempt(learner, org, started=now)
    command.upgrade(before_the_index, ONE_IN_PROGRESS)

    command.downgrade(before_the_index, BEFORE)

    assert _stored(spare).completed_at is not None
    _attempt(learner, org, started=now)
    _attempt(learner, org, started=now)
