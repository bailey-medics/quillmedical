"""One writer per passport: the lock's key, and when the lock is taken."""

# cspell:words xact

import hashlib
from typing import Any

import pytest
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.features.passport import router
from app.features.passport.locking import (
    LOCK_NAMESPACE,
    lock_key,
    lock_passport_for_write,
)

PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
OTHER_ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90"

LOCK = "SELECT pg_advisory_xact_lock(:namespace, :key)"


class _Dialect:
    def __init__(self, name: str) -> None:
        self.name = name


class _Bind:
    def __init__(self, dialect: str) -> None:
        self.dialect = _Dialect(dialect)


class RecordingSession:
    """Stands in for a session: keeps each statement and what it was sent.

    The unit tests run on SQLite, which has no advisory locks, so what
    can be checked here is which statement is sent and with what. That
    a second writer really waits is Postgres's to do.

    Args:
        dialect: The database the session says it is talking to.
    """

    def __init__(self, dialect: str = "postgresql") -> None:
        self.statements: list[str] = []
        self.parameters: list[dict[str, int]] = []
        self._bind = _Bind(dialect)

    def get_bind(self) -> _Bind:
        return self._bind

    def execute(self, statement: Any, parameters: dict[str, int]) -> None:
        self.statements.append(str(statement))
        self.parameters.append(parameters)


def _request(method: str, passport_id: str | None) -> Request:
    """A request as the router's lock sees it: a method and a path."""
    params = {} if passport_id is None else {"passport_id": passport_id}

    return Request(
        {
            "type": "http",
            "method": method,
            "path": "/api/passport",
            "headers": [],
            "path_params": params,
        }
    )


def _lock_for(session: RecordingSession, request: Request) -> None:
    router._lock_the_passport_being_written(
        request,
        session,  # type: ignore[arg-type]
    )


# --- lock_key ---------------------------------------------------------------


@pytest.mark.parametrize(
    "passport_id", [PASSPORT_ID, OTHER_ID, "0" * 32, "f" * 32]
)
def test_the_key_is_the_first_four_bytes_of_the_ids_hash_read_as_signed(
    passport_id: str,
) -> None:
    first_four = hashlib.sha256(passport_id.encode()).digest()[:4]

    assert lock_key(passport_id) == int.from_bytes(
        first_four, "big", signed=True
    )


def test_keys_come_out_on_both_sides_of_zero_and_inside_32_bits() -> None:
    """The top bit is folded, so Postgres is never handed a key too large."""
    keys = [lock_key(f"{number:032x}") for number in range(200)]

    assert min(keys) < 0 < max(keys)
    assert all(-(2**31) <= key <= 2**31 - 1 for key in keys)


def test_two_hundred_passports_do_not_share_a_key() -> None:
    """Sharing one would be slow and not wrong, but it should be rare."""
    keys = {lock_key(f"{number:032x}") for number in range(200)}

    assert len(keys) == 200


# --- lock_passport_for_write ------------------------------------------------


def test_the_lock_is_named_by_the_namespace_and_the_passports_key() -> None:
    session = RecordingSession()

    lock_passport_for_write(
        session,  # type: ignore[arg-type]
        PASSPORT_ID,
    )

    assert session.statements == [LOCK]
    assert session.parameters == [
        {"namespace": LOCK_NAMESPACE, "key": lock_key(PASSPORT_ID)}
    ]


def test_the_lock_is_the_kind_the_transaction_releases() -> None:
    """Nothing is sent to release it: the commit or the rollback does."""
    session = RecordingSession()

    lock_passport_for_write(
        session,  # type: ignore[arg-type]
        PASSPORT_ID,
    )

    assert "xact" in session.statements[0]
    assert not any("unlock" in sql for sql in session.statements)


def test_another_passport_is_another_lock_in_the_same_namespace() -> None:
    session = RecordingSession()

    lock_passport_for_write(
        session,  # type: ignore[arg-type]
        PASSPORT_ID,
    )
    lock_passport_for_write(
        session,  # type: ignore[arg-type]
        OTHER_ID,
    )

    first, second = session.parameters

    assert first["namespace"] == second["namespace"]
    assert first["key"] != second["key"]


def test_a_database_with_no_advisory_locks_is_sent_nothing() -> None:
    session = RecordingSession("sqlite")

    lock_passport_for_write(
        session,  # type: ignore[arg-type]
        PASSPORT_ID,
    )

    assert session.statements == []


def test_the_unit_test_database_takes_the_lock_without_complaint(
    db_session: Session,
) -> None:
    """Every passport route test goes through this, on SQLite."""
    lock_passport_for_write(db_session, PASSPORT_ID)


# --- which requests take it -------------------------------------------------


@pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
def test_a_request_that_writes_to_a_passport_locks_it(method: str) -> None:
    session = RecordingSession()

    _lock_for(session, _request(method, PASSPORT_ID))

    assert session.statements == [LOCK]
    assert session.parameters[0]["key"] == lock_key(PASSPORT_ID)


@pytest.mark.parametrize("method", ["GET", "HEAD", "OPTIONS"])
def test_a_request_that_only_reads_takes_no_lock(method: str) -> None:
    session = RecordingSession()

    _lock_for(session, _request(method, PASSPORT_ID))

    assert session.statements == []


def test_a_route_that_names_no_passport_takes_no_lock() -> None:
    session = RecordingSession()

    _lock_for(session, _request("POST", None))

    assert session.statements == []


@pytest.mark.parametrize(
    "not_an_id", ["me", "3F2A8C1E4B7D49F0A6C2E8B1D5A7F309", "abc", "../etc"]
)
def test_a_path_that_is_not_a_passport_id_takes_no_lock(
    not_an_id: str,
) -> None:
    """The route refuses it; nothing is locked on a stranger's word."""
    session = RecordingSession()

    _lock_for(session, _request("POST", not_an_id))

    assert session.statements == []


def test_the_lock_is_on_the_router_and_so_on_every_route() -> None:
    held = [
        dependency.dependency
        for dependency in router.passport_router.dependencies
    ]

    assert router._lock_the_passport_being_written in held
