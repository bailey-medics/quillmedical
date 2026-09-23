"""Tests for app/features/passport/reconcile.py.

The repository is the record and ``head_commit`` is a cache of where it
is. These tests pin what happens when the two disagree, which is the
state a request leaves behind when it dies between the commit and the
database's own commit.

The distinction that matters most is between *behind* and *ahead*.
Behind is ordinary and is healed by moving the row forward. Ahead means
history the row was written against is gone, which is never healed here
— healing it would overwrite the only evidence of what went wrong.

Real repositories throughout, as in ``test_passport_store.py``: every
property being asserted is a property of what git actually does, and a
mock would let the module pass while disagreeing with the store.
"""

from __future__ import annotations

from pathlib import Path, PurePosixPath

import pytest
from sqlalchemy.orm import Session

from app.features.passport import reconcile, store
from app.features.passport.commits import Actor, CommitMessage
from app.features.passport.models import Passport
from app.features.passport.reconcile import Alignment
from app.features.passport.store import LocalPassportStore
from app.models import User
from app.security import hash_password

PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
OTHER_ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90"


@pytest.fixture
def actor() -> Actor:
    return Actor(
        name="Dr Amara Okonkwo",
        role="Consultant",
        email="amara@example.nhs.uk",
        registrations=("GMC 1234567",),
    )


@pytest.fixture
def passport_store(tmp_path: Path) -> LocalPassportStore:
    return LocalPassportStore(tmp_path)


@pytest.fixture
def holder(db_session: Session) -> User:
    user = User(
        username="reconcile.holder",
        email="reconcile.holder@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="patient",
        platform_role="standard",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _message(summary: str) -> CommitMessage:
    return CommitMessage(
        subject=f"passport:create: {summary}",
        trailers=(("Actor-Name", "Dr Amara Okonkwo"),),
    )


def _create_repository(
    passport_store: LocalPassportStore,
    actor: Actor,
    passport_id: str = PASSPORT_ID,
) -> str:
    return passport_store.create(
        passport_id,
        store.initial_files("passport_id: x\n", "user_id: y\n", "z: 1\n"),
        _message("new passport"),
        actor,
    )


def _commit_again(
    passport_store: LocalPassportStore,
    actor: Actor,
    filename: str = "later.yaml",
    passport_id: str = PASSPORT_ID,
) -> str:
    return passport_store.write(
        passport_id,
        {PurePosixPath(filename): "a: 1\n"},
        _message("a later change"),
        actor,
        passport_store.head(passport_id),
    )


def _row(db_session: Session, holder: User, commit: str | None) -> Passport:
    row = Passport(id=PASSPORT_ID, user_id=holder.id, head_commit=commit)
    db_session.add(row)
    db_session.flush()
    return row


class TestAligned:
    def test_matching_commits_are_aligned(
        self,
        db_session: Session,
        passport_store: LocalPassportStore,
        actor: Actor,
        holder: User,
    ) -> None:
        commit = _create_repository(passport_store, actor)
        row = _row(db_session, holder, commit)

        found = reconcile.inspect(passport_store, row)

        assert found.alignment is Alignment.ALIGNED
        assert found.is_aligned
        assert not found.is_healable

    def test_healing_an_aligned_passport_changes_nothing(
        self,
        db_session: Session,
        passport_store: LocalPassportStore,
        actor: Actor,
        holder: User,
    ) -> None:
        commit = _create_repository(passport_store, actor)
        row = _row(db_session, holder, commit)

        reconcile.heal(db_session, passport_store, row)

        assert row.head_commit == commit


class TestRowBehind:
    """The case this module exists for.

    A write committed and the request died before the row was updated,
    so the repository is ahead. The commit holds the record, so the row
    is simply moved to it.
    """

    def test_a_row_one_commit_behind_is_behind(
        self,
        db_session: Session,
        passport_store: LocalPassportStore,
        actor: Actor,
        holder: User,
    ) -> None:
        first = _create_repository(passport_store, actor)
        _commit_again(passport_store, actor)
        row = _row(db_session, holder, first)

        found = reconcile.inspect(passport_store, row)

        assert found.alignment is Alignment.ROW_BEHIND
        assert found.is_healable

    def test_healing_moves_the_row_to_the_repository(
        self,
        db_session: Session,
        passport_store: LocalPassportStore,
        actor: Actor,
        holder: User,
    ) -> None:
        first = _create_repository(passport_store, actor)
        second = _commit_again(passport_store, actor)
        row = _row(db_session, holder, first)

        reconcile.heal(db_session, passport_store, row)

        assert row.head_commit == second

    def test_healing_never_touches_the_repository(
        self,
        db_session: Session,
        passport_store: LocalPassportStore,
        actor: Actor,
        holder: User,
    ) -> None:
        """The record is the evidence; only the pointer moves."""
        first = _create_repository(passport_store, actor)
        second = _commit_again(passport_store, actor)
        row = _row(db_session, holder, first)

        reconcile.heal(db_session, passport_store, row)

        assert passport_store.head(PASSPORT_ID).commit == second
        assert passport_store.contains(PASSPORT_ID, first)

    def test_a_row_naming_no_commit_is_behind(
        self,
        db_session: Session,
        passport_store: LocalPassportStore,
        actor: Actor,
        holder: User,
    ) -> None:
        """A create that died before it recorded its own head."""
        commit = _create_repository(passport_store, actor)
        row = _row(db_session, holder, None)

        found = reconcile.heal(db_session, passport_store, row)

        assert found.alignment is Alignment.ROW_BEHIND
        assert row.head_commit == commit

    def test_a_row_many_commits_behind_is_still_behind(
        self,
        db_session: Session,
        passport_store: LocalPassportStore,
        actor: Actor,
        holder: User,
    ) -> None:
        first = _create_repository(passport_store, actor)
        _commit_again(passport_store, actor, "second.yaml")
        third = _commit_again(passport_store, actor, "third.yaml")
        row = _row(db_session, holder, first)

        reconcile.heal(db_session, passport_store, row)

        assert row.head_commit == third


class TestRowAhead:
    """History the row was written against is gone.

    The store refuses to rewrite history, so this should be unreachable
    through the application. Reaching it means something else touched
    the repository, and the row is left exactly as found so that
    evidence survives.
    """

    def test_a_commit_the_repository_does_not_have_is_ahead(
        self,
        db_session: Session,
        passport_store: LocalPassportStore,
        actor: Actor,
        holder: User,
    ) -> None:
        _create_repository(passport_store, actor)
        _create_repository(passport_store, actor, passport_id=OTHER_ID)
        elsewhere = _commit_again(
            passport_store, actor, "only-here.yaml", passport_id=OTHER_ID
        )
        row = _row(db_session, holder, elsewhere)

        found = reconcile.inspect(passport_store, row)

        assert found.alignment is Alignment.ROW_AHEAD
        assert not found.is_healable

    def test_healing_refuses_to_move_a_row_that_is_ahead(
        self,
        db_session: Session,
        passport_store: LocalPassportStore,
        actor: Actor,
        holder: User,
    ) -> None:
        _create_repository(passport_store, actor)
        _create_repository(passport_store, actor, passport_id=OTHER_ID)
        elsewhere = _commit_again(
            passport_store, actor, "only-here.yaml", passport_id=OTHER_ID
        )
        row = _row(db_session, holder, elsewhere)

        reconcile.heal(db_session, passport_store, row)

        assert row.head_commit == elsewhere


class TestUnreadable:
    def test_a_missing_repository_is_unreadable(
        self,
        db_session: Session,
        passport_store: LocalPassportStore,
        holder: User,
    ) -> None:
        row = _row(db_session, holder, "a" * 40)

        found = reconcile.inspect(passport_store, row)

        assert found.alignment is Alignment.UNREADABLE
        assert not found.is_healable

    def test_a_missing_repository_leaves_the_row_alone(
        self,
        db_session: Session,
        passport_store: LocalPassportStore,
        holder: User,
    ) -> None:
        row = _row(db_session, holder, "a" * 40)

        reconcile.heal(db_session, passport_store, row)

        assert row.head_commit == "a" * 40


class TestDetail:
    """The sentence recorded in the log.

    It has to be safe to log, which means commit ids and a passport id
    and nothing about the person — a passport's contents are clinical.
    """

    def test_names_both_commits_when_they_disagree(
        self,
        db_session: Session,
        passport_store: LocalPassportStore,
        actor: Actor,
        holder: User,
    ) -> None:
        first = _create_repository(passport_store, actor)
        second = _commit_again(passport_store, actor)
        row = _row(db_session, holder, first)

        found = reconcile.inspect(passport_store, row)

        assert first in found.detail
        assert second in found.detail

    def test_carries_no_holder_identity(
        self,
        db_session: Session,
        passport_store: LocalPassportStore,
        actor: Actor,
        holder: User,
    ) -> None:
        first = _create_repository(passport_store, actor)
        _commit_again(passport_store, actor)
        row = _row(db_session, holder, first)

        found = reconcile.inspect(passport_store, row)

        assert holder.username not in found.detail
        assert holder.email not in found.detail
