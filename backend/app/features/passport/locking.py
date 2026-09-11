"""One writer per passport, using a Postgres advisory lock.

A passport is a git repository, and two concurrent writes to one
repository is the shape of problem git is least good at. The store
already refuses a write built on a stale read, so nothing can be
silently lost — but a refusal means the caller's work is wasted, and a
second attempt can lose the race again.

So writes to one passport are serialised, using the database every
request already has. After VPR: *the database acts as a traffic light.*

**Why an advisory lock rather than a row lock.** There is nothing to lock
— the thing being protected is a directory, not a row. An advisory lock
is exactly a named mutex the database happens to hold, which is what is
wanted, and it needs no table and no cleanup: Postgres releases it when
the connection goes, so a crashed worker does not leave a passport
permanently unwritable.

**Different passports never block each other.** The lock is keyed on the
passport id, so two holders writing at once are two locks. Only one
person's own concurrent writes serialise, and those are rare.

**Stated non-goals**, after VPR: no distributed consensus, no message
queue, no shared filesystem lock. The approach is intentionally boring.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import text
from sqlalchemy.orm import Session

#: Namespace for every passport lock, so a key cannot collide with an
#: advisory lock taken elsewhere in the application. Postgres advisory
#: locks are global to the database, and two features picking the same
#: integer by chance would block each other for no visible reason.
LOCK_NAMESPACE = 0x5041_5353  # "PASS"


class PassportLockError(Exception):
    """The lock could not be taken."""


class PassportBusyError(PassportLockError):
    """Another write to this passport is in progress.

    Surfaced rather than waited on where the caller asked not to block,
    so a request returns promptly instead of holding a connection open
    behind somebody else's write.
    """


def lock_key(passport_id: str) -> int:
    """The advisory lock key for one passport.

    A passport id is 32 hex characters, which does not fit in the 32-bit
    second half of a two-key advisory lock, so it is hashed. Collisions
    are harmless in the only way that matters: two passports sharing a
    key would serialise against each other unnecessarily, which is slow
    rather than wrong.

    Args:
        passport_id: The passport's id.

    Returns:
        A signed 32-bit integer, as Postgres expects.
    """
    digest = hashlib.sha256(passport_id.encode()).digest()
    unsigned = int.from_bytes(digest[:4], "big")

    # Postgres advisory lock keys are signed 32-bit integers, so fold the
    # top bit rather than letting the driver complain about the range.
    return unsigned - 0x1_0000_0000 if unsigned > 0x7FFF_FFFF else unsigned


@contextmanager
def passport_write_lock(
    session: Session, passport_id: str, *, wait: bool = True
) -> Iterator[None]:
    """Hold the write lock for one passport.

    Args:
        session: The core database session the request already has.
        passport_id: Which passport to lock.
        wait: Whether to wait for the lock. True blocks until it is
            free, which is right for an ordinary write; False raises
            immediately, which suits a background job that can come back
            later rather than hold a connection.

    Yields:
        Nothing. The lock is held for the duration of the block.

    Raises:
        PassportBusyError: If *wait* is False and the lock is held.

    Notes:
        The lock is released explicitly on the way out, and again by
        Postgres if the connection drops. Explicit release matters
        because a pooled connection outlives the request: a lock left
        behind would be held by whatever borrowed that connection next.
    """
    key = lock_key(passport_id)

    if wait:
        session.execute(
            text("SELECT pg_advisory_lock(:namespace, :key)"),
            {"namespace": LOCK_NAMESPACE, "key": key},
        )
    else:
        acquired = session.execute(
            text("SELECT pg_try_advisory_lock(:namespace, :key)"),
            {"namespace": LOCK_NAMESPACE, "key": key},
        ).scalar()

        if not acquired:
            raise PassportBusyError(
                f"Another write to passport {passport_id} is in progress."
            )

    try:
        yield
    finally:
        # Best effort, and deliberately not raising: this runs while an
        # exception may already be propagating, and replacing the real
        # cause with a lock-release failure would hide the actual fault.
        # Postgres releases the lock when the connection closes anyway.
        try:
            session.execute(
                text("SELECT pg_advisory_unlock(:namespace, :key)"),
                {"namespace": LOCK_NAMESPACE, "key": key},
            )
        except Exception:  # noqa: BLE001, S110 - see the comment above
            pass
