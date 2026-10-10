"""One writer per passport, using a Postgres advisory lock.

A passport is a git repository, and two concurrent writes to one
repository is the shape of problem git is least good at. The store
already refuses a write built on a stale read, so nothing can be
silently lost - but a refusal means the caller's work is wasted, and a
second attempt can lose the race again.

So writes to one passport are serialised, using the database every
request already has. After VPR: *the database acts as a traffic light.*

**Every request that writes to a passport takes the lock**, through
``_lock_the_passport_being_written`` in the passport router. It is a
dependency of the whole router and not of each route, so a route added
later is covered without anybody remembering.

**The lock lasts for the transaction, and nothing releases it by hand.**
A request is one transaction (see ``get_core_db``), so the lock is held
from the first check to the commit, which covers reading the passport's
head, building the change and writing it. Postgres drops the lock at the
commit or the rollback. The other kind of advisory lock belongs to the
connection and must be released by a second statement on that same
connection, and a pooled session cannot promise which connection it
has: a release sent down the wrong one does nothing, and the lock stays
with a connection that goes back to the pool.

**Why an advisory lock rather than a row lock.** There is nothing to lock
- the thing being protected is a directory, not a row. An advisory lock
is exactly a named mutex the database happens to hold, which is what is
wanted, and it needs no table and no cleanup: Postgres releases it when
the transaction ends, however it ends, so a crashed worker does not
leave a passport permanently unwritable.

**Different passports never block each other.** The lock is keyed on the
passport id, so two holders writing at once are two locks. Only one
person's own concurrent writes serialise, and those are rare.

**Stated non-goals**, after VPR: no distributed consensus, no message
queue, no shared filesystem lock. The approach is intentionally boring.
"""

# cspell:words xact

from __future__ import annotations

import hashlib

from sqlalchemy import text
from sqlalchemy.orm import Session

#: Namespace for every passport lock, so a key cannot collide with an
#: advisory lock taken elsewhere in the application. Postgres advisory
#: locks are global to the database, and two features picking the same
#: integer by chance would block each other for no visible reason.
LOCK_NAMESPACE = 0x5041_5353  # "PASS"


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


def lock_passport_for_write(session: Session, passport_id: str) -> None:
    """Take the write lock for one passport, until the transaction ends.

    Waits if another request holds it. That wait is short: the other
    request is writing one commit to one passport.

    On a database that is not Postgres this does nothing. The unit
    tests run on SQLite, which has no advisory locks and, there, one
    connection, so no second writer to wait for.

    Args:
        session: The core database session the request already has.
        passport_id: Which passport to lock.
    """
    if session.get_bind().dialect.name != "postgresql":
        return

    session.execute(
        text("SELECT pg_advisory_xact_lock(:namespace, :key)"),
        {"namespace": LOCK_NAMESPACE, "key": lock_key(passport_id)},
    )
