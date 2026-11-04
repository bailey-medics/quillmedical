"""Two writers to one passport take turns, on a real Postgres.

The unit tests run on SQLite, which has no advisory locks, so
``locking_test.py`` can only check which statement is sent. This checks
what the statement does: a second writer to the same passport waits
until the first one's transaction ends, and a writer to a different
passport does not wait at all. See ``app/features/passport/locking.py``.

Run by the ``alembic_drift_check`` CI job, which runs
``pytest -m migration`` against its Postgres. Locally, against the
throwaway database ``compose.migrate.yml`` provides:

    docker compose -p quill-migrate-<worktree> -f compose.migrate.yml \\
        run --rm migrate sh -lc \\
        'alembic upgrade head && pytest -m migration'
"""

# cspell:words xact

from __future__ import annotations

import threading
import time
from collections.abc import Iterator

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker
from starlette.requests import Request

from app.db.core_db import core_engine
from app.features.passport import router
from app.features.passport.locking import (
    LOCK_NAMESPACE,
    lock_key,
    lock_passport_for_write,
)

pytestmark = [pytest.mark.integration, pytest.mark.migration]

PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
OTHER_ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90"

#: How long the first writer holds the lock in the waiting test. Long
#: enough that a second writer that did not wait would plainly finish
#: first, short enough to keep the suite quick.
HOLD_SECONDS = 0.5

_Sessions = sessionmaker(bind=core_engine)


@pytest.fixture
def first() -> Iterator[Session]:
    """One writer's session, on its own connection."""
    with _Sessions() as session:
        yield session
        session.rollback()


@pytest.fixture
def second() -> Iterator[Session]:
    """Another writer's session, on a connection of its own."""
    with _Sessions() as session:
        yield session
        session.rollback()


def _free(session: Session, passport_id: str) -> bool:
    """Whether this session can take the passport's lock without waiting.

    ``pg_try_advisory_xact_lock`` takes the lock if it is free and answers
    false at once if it is not, so the test never hangs. A lock it takes
    lasts until this session's transaction ends.
    """
    taken = session.execute(
        text("SELECT pg_try_advisory_xact_lock(:namespace, :key)"),
        {"namespace": LOCK_NAMESPACE, "key": lock_key(passport_id)},
    ).scalar_one()

    return bool(taken)


def _writing(passport_id: str) -> Request:
    """A request that writes to the passport, as the router's lock sees it."""
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": f"/api/passport/{passport_id}/logbook",
            "headers": [],
            "path_params": {"passport_id": passport_id},
        }
    )


def test_a_second_writer_to_the_same_passport_is_kept_out(
    first: Session, second: Session
) -> None:
    lock_passport_for_write(first, PASSPORT_ID)

    assert not _free(second, PASSPORT_ID)


def test_a_writer_to_another_passport_is_not_kept_out(
    first: Session, second: Session
) -> None:
    lock_passport_for_write(first, PASSPORT_ID)

    assert _free(second, OTHER_ID)


def test_the_lock_is_released_when_the_transaction_ends(
    first: Session, second: Session
) -> None:
    """Nothing releases it by hand: the commit does."""
    lock_passport_for_write(first, PASSPORT_ID)
    first.commit()

    assert _free(second, PASSPORT_ID)


def test_the_lock_is_released_when_the_transaction_rolls_back(
    first: Session, second: Session
) -> None:
    """A request that fails leaves the passport writable."""
    lock_passport_for_write(first, PASSPORT_ID)
    first.rollback()

    assert _free(second, PASSPORT_ID)


def test_a_second_writer_waits_until_the_first_one_commits(
    first: Session, second: Session
) -> None:
    """The second writer goes on only once the first has finished.

    So it reads the passport after the first writer's commit, and writes
    on top of it rather than beside it.
    """
    lock_passport_for_write(first, PASSPORT_ID)
    order: list[str] = []

    def write_second() -> None:
        lock_passport_for_write(second, PASSPORT_ID)
        order.append("second has the lock")

    waiting = threading.Thread(target=write_second)
    waiting.start()

    time.sleep(HOLD_SECONDS)
    order.append("first commits")
    first.commit()

    waiting.join(timeout=10)

    assert not waiting.is_alive()
    assert order == ["first commits", "second has the lock"]


def test_every_write_through_the_router_takes_the_real_lock(
    first: Session, second: Session
) -> None:
    """The router's own dependency, not only the function it calls."""
    router._lock_the_passport_being_written(_writing(PASSPORT_ID), first)

    assert not _free(second, PASSPORT_ID)
