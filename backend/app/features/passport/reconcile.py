# backend/app/features/passport/reconcile.py
"""Noticing when the database and the repository disagree, and healing it.

``Passport.head_commit`` is a cache of where the repository is. The
model says what happens when the two disagree — "on any disagreement
the repository wins, exactly as the directories win over the index" —
and this module is where that is actually carried out.

**Why they can disagree at all.** A write commits to the repository
first and updates the row second, in that order because a commit that
no row points at is recoverable and a row pointing at a commit that was
never made is not. The two are not one transaction and cannot be: git
has no part in the database's. So anything that aborts the request
between the commit and the database's own commit — an unhandled
exception, a crash, a lost connection — leaves the repository one or
more commits ahead of the row.

**Ahead is ordinary; the repository is simply more current.** It means
a write landed and the row did not catch up, so the fix is to move the
row. Nothing is lost, because the commit holds the record.

**Behind is not ordinary.** A row naming a commit the repository does
not have means history was rewritten or the repository was replaced,
which the store refuses by design through ``NonFastForwardError``.
Reaching it means a bug or interference, so it is reported and never
healed: writing over it would destroy the evidence of whatever caused
it.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum

from sqlalchemy.orm import Session

from app.features.passport.models import Passport
from app.features.passport.store import (
    PassportNotFoundError,
    PassportStore,
)

logger = logging.getLogger(__name__)


class Alignment(Enum):
    """How the row and the repository stand relative to each other."""

    #: The row names the repository's HEAD. The ordinary case.
    ALIGNED = "aligned"

    #: The repository has commits the row has not caught up with. A
    #: write landed and the request died before the row was updated.
    #: Healed by moving the row.
    ROW_BEHIND = "row_behind"

    #: The row names a commit the repository does not contain. History
    #: was rewritten or the repository replaced. Never healed here.
    ROW_AHEAD = "row_ahead"

    #: The repository is gone, or has no commits while the row names
    #: one. Never healed here; there is nothing to reconcile against.
    UNREADABLE = "unreadable"


@dataclass(frozen=True)
class Divergence:
    """What was found, and what it means.

    Attributes:
        alignment: Which of the four states holds.
        passport_id: The passport inspected.
        row_commit: What the row said, or None if it said nothing.
        repository_commit: What the repository says, or None if it has
            no commits or could not be read.
        detail: A sentence for a log line or an error, safe to record —
            it carries commit ids and a passport id, never PHI.
    """

    alignment: Alignment
    passport_id: str
    row_commit: str | None
    repository_commit: str | None
    detail: str

    @property
    def is_aligned(self) -> bool:
        """Whether there is nothing to do."""
        return self.alignment is Alignment.ALIGNED

    @property
    def is_healable(self) -> bool:
        """Whether :func:`heal` would change anything."""
        return self.alignment is Alignment.ROW_BEHIND


def inspect(store: PassportStore, row: Passport) -> Divergence:
    """Compare a passport row against its repository.

    Read-only, and it never raises for a divergence: the caller decides
    what a disagreement means, because that differs between a read (log
    and carry on with the repository's answer) and a write (refuse,
    because building on a stale head would compound it).

    Args:
        store: The store holding the repository.
        row: The passport row to check.

    Returns:
        What was found. ``ALIGNED`` when they agree.
    """
    row_commit = row.head_commit

    try:
        head = store.head(row.id)
    except PassportNotFoundError:
        return Divergence(
            alignment=Alignment.UNREADABLE,
            passport_id=row.id,
            row_commit=row_commit,
            repository_commit=None,
            detail=(
                f"Passport {row.id} has a database row naming "
                f"{row_commit} but no repository."
            ),
        )

    repository_commit = head.commit

    if row_commit == repository_commit:
        return Divergence(
            alignment=Alignment.ALIGNED,
            passport_id=row.id,
            row_commit=row_commit,
            repository_commit=repository_commit,
            detail=f"Passport {row.id} is aligned at {repository_commit}.",
        )

    if repository_commit is None:
        # A row naming a commit against a repository with no commits at
        # all. Not "behind": there is nothing to move the row to.
        return Divergence(
            alignment=Alignment.UNREADABLE,
            passport_id=row.id,
            row_commit=row_commit,
            repository_commit=None,
            detail=(
                f"Passport {row.id} has a database row naming "
                f"{row_commit} but its repository has no commits."
            ),
        )

    if row_commit is None:
        # The row never recorded a head — the create that made it died
        # before the update. The repository has the record, so this is
        # the ordinary behind case.
        return Divergence(
            alignment=Alignment.ROW_BEHIND,
            passport_id=row.id,
            row_commit=None,
            repository_commit=repository_commit,
            detail=(
                f"Passport {row.id} has a database row naming no commit "
                f"while its repository is at {repository_commit}."
            ),
        )

    if store.contains(row.id, row_commit):
        return Divergence(
            alignment=Alignment.ROW_BEHIND,
            passport_id=row.id,
            row_commit=row_commit,
            repository_commit=repository_commit,
            detail=(
                f"Passport {row.id} has a database row at {row_commit} "
                f"while its repository is at {repository_commit}. A write "
                "committed and the row did not catch up."
            ),
        )

    return Divergence(
        alignment=Alignment.ROW_AHEAD,
        passport_id=row.id,
        row_commit=row_commit,
        repository_commit=repository_commit,
        detail=(
            f"Passport {row.id} has a database row at {row_commit}, which "
            f"its repository does not contain — the repository is at "
            f"{repository_commit}. History was rewritten or the repository "
            "was replaced."
        ),
    )


def heal(db: Session, store: PassportStore, row: Passport) -> Divergence:
    """Bring the row up to the repository where that is what is wrong.

    The repository is the record; the row is a pointer at it. So healing
    only ever moves the pointer, and only forward. Nothing is written to
    the repository here and nothing is deleted anywhere — a divergence
    is repaired by believing the evidence, not by editing it.

    **Flushed, not committed.** The caller owns the transaction, so this
    joins whatever one is open rather than ending it.

    Args:
        db: Core database session.
        store: The store holding the repository.
        row: The passport row to check and, where appropriate, move.

    Returns:
        What was found, before any healing. ``is_healable`` says whether
        the row was moved.
    """
    divergence = inspect(store, row)

    if divergence.is_aligned:
        return divergence

    if not divergence.is_healable:
        # Logged at error because neither case is reachable in ordinary
        # use: both mean something outside the application touched the
        # repository, and both need a person.
        logger.error("Passport divergence: %s", divergence.detail)
        return divergence

    logger.warning(
        "Healing passport divergence: %s Moving the row to the "
        "repository's head.",
        divergence.detail,
    )

    row.head_commit = divergence.repository_commit
    db.flush()

    return divergence
