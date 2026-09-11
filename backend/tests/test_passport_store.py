"""Tests for app/features/passport/store.py.

Real temporary directories and real git repositories throughout, after
VPR: a mocked filesystem would pass while the actual one behaved
differently, and every property worth having here is a property of what
git and the disk actually do.

Three groups matter more than the rest:

- **Rollback.** A failed write must leave the repository exactly as it
  was. Tested by injecting a failure part-way through a multi-file write
  and asserting nothing moved.
- **The rewrite refusal.** This is what makes history append-only
  through the application, so it is tested directly rather than assumed
  from the absence of a code path that would do it.
- **Concurrency.** A write built on a stale read is refused, which is
  what makes the read-decide-write cycle safe without a lock held across
  it.
"""

from __future__ import annotations

from pathlib import Path, PurePosixPath
from typing import Any

import pygit2
import pytest

from app.features.passport import paths, store
from app.features.passport.commits import Actor, CommitMessage
from app.features.passport.store import (
    ConcurrentWriteError,
    LocalPassportStore,
    NonFastForwardError,
    PassportExistsError,
    PassportHead,
    PassportNotFoundError,
    StoreError,
)

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


def _message(summary: str = "a change") -> CommitMessage:
    return CommitMessage(
        subject=f"passport:create: {summary}",
        trailers=(("Actor-Name", "Dr Amara Okonkwo"),),
    )


def _created(
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


class TestCreate:
    def test_creates_a_repository_with_a_first_commit(
        self, passport_store: LocalPassportStore, actor: Actor
    ) -> None:
        commit = _created(passport_store, actor)

        assert passport_store.exists(PASSPORT_ID)
        assert passport_store.head(PASSPORT_ID).commit == commit

    def test_head_follows_the_branch_the_store_commits_to(
        self, passport_store: LocalPassportStore, actor: Actor, tmp_path: Path
    ) -> None:
        """libgit2 points HEAD at master while this store commits to main.

        Without setting it, commits land on a branch HEAD does not
        follow, so the repository reads as empty while holding every
        record — a fault that looks like data loss and is not.
        """
        _created(passport_store, actor)

        repository = pygit2.Repository(
            str(tmp_path / paths.shard(PASSPORT_ID))
        )

        assert repository.lookup_reference("HEAD").target == store.BRANCH
        assert not repository.head_is_unborn

    def test_writes_the_starting_files(
        self, passport_store: LocalPassportStore, actor: Actor
    ) -> None:
        _created(passport_store, actor)

        assert passport_store.read(PASSPORT_ID, paths.MANIFEST)
        assert passport_store.read(PASSPORT_ID, paths.PROFILE)
        assert passport_store.read(PASSPORT_ID, paths.INDEX)

    def test_evidence_is_kept_out_of_git(
        self, passport_store: LocalPassportStore, actor: Actor
    ) -> None:
        _created(passport_store, actor)

        gitignore = passport_store.read(PASSPORT_ID, paths.GITIGNORE)

        assert gitignore.decode() == "files/\n"

    def test_the_readme_explains_the_passport_without_software(
        self, passport_store: LocalPassportStore, actor: Actor
    ) -> None:
        _created(passport_store, actor)

        readme = passport_store.read(PASSPORT_ID, paths.README).decode()

        assert "Clinician passport" in readme
        assert "sign-offs/" in readme

    def test_refuses_to_create_over_an_existing_passport(
        self, passport_store: LocalPassportStore, actor: Actor
    ) -> None:
        """An id collision means something upstream is wrong, and writing
        into the existing repository would mix two people's records."""
        _created(passport_store, actor)

        with pytest.raises(PassportExistsError):
            _created(passport_store, actor)

    def test_two_passports_are_independent(
        self, passport_store: LocalPassportStore, actor: Actor
    ) -> None:
        """Separate repositories, so a write to one cannot touch the other.

        Note the commit ids may be *identical* here, and that is git
        working correctly rather than a fault: a commit id is a hash of
        its content, and two passports created in the same second with
        the same starting files, author and message genuinely have the
        same first commit. What must differ is where they live and what
        happens next.
        """
        first = _created(passport_store, actor, PASSPORT_ID)
        _created(passport_store, actor, OTHER_ID)

        passport_store.write(
            PASSPORT_ID,
            {paths.INDEX: "only in the first\n"},
            _message("a change"),
            actor,
            PassportHead(commit=first),
        )

        assert passport_store.read(PASSPORT_ID, paths.INDEX) == (
            b"only in the first\n"
        )
        assert passport_store.read(OTHER_ID, paths.INDEX) == b"z: 1\n"
        assert (
            passport_store.head(OTHER_ID).commit
            != passport_store.head(PASSPORT_ID).commit
        )

    def test_a_failed_creation_leaves_nothing_behind(
        self,
        passport_store: LocalPassportStore,
        actor: Actor,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A passport that exists with no first commit would be invisible
        to every later operation while still occupying its id."""

        def explode(*_: object, **__: object) -> None:
            raise OSError("disk full")

        monkeypatch.setattr(Path, "write_bytes", explode)

        with pytest.raises(StoreError):
            _created(passport_store, actor)

        assert not (tmp_path / paths.shard(PASSPORT_ID)).exists()
        assert not passport_store.exists(PASSPORT_ID)


class TestRead:
    def test_reads_from_the_commit_not_the_checkout(
        self, passport_store: LocalPassportStore, actor: Actor, tmp_path: Path
    ) -> None:
        """A read returns what was committed even if something has
        touched the working directory."""
        _created(passport_store, actor)
        location = tmp_path / paths.shard(PASSPORT_ID)

        (location / str(paths.MANIFEST)).write_text("tampered: true\n")

        assert passport_store.read(PASSPORT_ID, paths.MANIFEST) == (
            b"passport_id: x\n"
        )

    def test_refuses_an_unknown_passport(
        self, passport_store: LocalPassportStore
    ) -> None:
        with pytest.raises(PassportNotFoundError):
            passport_store.read(PASSPORT_ID, paths.MANIFEST)

    def test_refuses_a_missing_file(
        self, passport_store: LocalPassportStore, actor: Actor
    ) -> None:
        _created(passport_store, actor)

        with pytest.raises(PassportNotFoundError):
            passport_store.read(
                PASSPORT_ID, PurePosixPath("does-not-exist.yaml")
            )


class TestListDir:
    def test_lists_what_is_there(
        self, passport_store: LocalPassportStore, actor: Actor
    ) -> None:
        _created(passport_store, actor)
        head = passport_store.head(PASSPORT_ID)
        passport_store.write(
            PASSPORT_ID,
            {
                paths.sign_off_file("2026-03-14-a-thing"): "id: 1\n",
                paths.sign_off_file("2026-03-15-another"): "id: 2\n",
            },
            _message("two sign-offs"),
            actor,
            head,
        )

        entries = passport_store.list_dir(PASSPORT_ID, paths.SIGN_OFFS)

        assert [entry.name for entry in entries] == [
            "2026-03-14-a-thing",
            "2026-03-15-another",
        ]

    def test_an_absent_directory_lists_empty(
        self, passport_store: LocalPassportStore, actor: Actor
    ) -> None:
        """Git cannot represent an empty directory anyway, so absent and
        empty mean the same thing to a caller counting records."""
        _created(passport_store, actor)

        assert passport_store.list_dir(PASSPORT_ID, paths.SIGN_OFFS) == []

    def test_listing_a_file_is_not_an_error(
        self, passport_store: LocalPassportStore, actor: Actor
    ) -> None:
        _created(passport_store, actor)

        assert passport_store.list_dir(PASSPORT_ID, paths.MANIFEST) == []


class TestWrite:
    def test_writes_files_and_advances_head(
        self, passport_store: LocalPassportStore, actor: Actor
    ) -> None:
        first = _created(passport_store, actor)

        second = passport_store.write(
            PASSPORT_ID,
            {paths.sign_off_file("2026-03-14-a-thing"): "id: 1\n"},
            _message("a sign-off"),
            actor,
            PassportHead(commit=first),
        )

        assert second != first
        assert passport_store.head(PASSPORT_ID).commit == second

    def test_one_write_is_one_commit(
        self, passport_store: LocalPassportStore, actor: Actor, tmp_path: Path
    ) -> None:
        """Several files, one commit: there is no way to change a
        passport without committing, and no way to half-commit."""
        first = _created(passport_store, actor)
        passport_store.write(
            PASSPORT_ID,
            {
                paths.sign_off_file("2026-03-14-a-thing"): "id: 1\n",
                paths.sign_off_reflection("2026-03-14-a-thing"): "words\n",
                paths.INDEX: "updated: true\n",
            },
            _message("three files"),
            actor,
            PassportHead(commit=first),
        )

        repository = pygit2.Repository(
            str(tmp_path / paths.shard(PASSPORT_ID))
        )
        commits = list(repository.walk(repository.head.target))

        assert len(commits) == 2

    def test_the_author_is_the_actor_and_the_committer_is_quill(
        self, passport_store: LocalPassportStore, actor: Actor, tmp_path: Path
    ) -> None:
        """The application is the only writer, and saying so is more
        honest than attributing the mechanism to a clinician."""
        _created(passport_store, actor)

        repository = pygit2.Repository(
            str(tmp_path / paths.shard(PASSPORT_ID))
        )
        commit = repository.get(repository.head.target)

        assert commit.author.name == "Dr Amara Okonkwo"
        assert commit.author.email == "amara@example.nhs.uk"
        assert commit.committer.name == store.COMMITTER_NAME

    def test_deletes_in_the_same_commit(
        self, passport_store: LocalPassportStore, actor: Actor
    ) -> None:
        first = _created(passport_store, actor)
        second = passport_store.write(
            PASSPORT_ID,
            {
                paths.logbook_entry(
                    "perform_cannulation", "2026-03-14-143207"
                ): "a: 1\n"
            },
            _message("an entry"),
            actor,
            PassportHead(commit=first),
        )

        passport_store.write(
            PASSPORT_ID,
            {paths.INDEX: "rebuilt: true\n"},
            _message("remove it"),
            actor,
            PassportHead(commit=second),
            delete=(
                paths.logbook_entry(
                    "perform_cannulation", "2026-03-14-143207"
                ),
            ),
        )

        with pytest.raises(PassportNotFoundError):
            passport_store.read(
                PASSPORT_ID,
                paths.logbook_entry(
                    "perform_cannulation", "2026-03-14-143207"
                ),
            )

    def test_refuses_an_unknown_passport(
        self, passport_store: LocalPassportStore, actor: Actor
    ) -> None:
        with pytest.raises(PassportNotFoundError):
            passport_store.write(
                PASSPORT_ID,
                {paths.INDEX: "x: 1\n"},
                _message("a change"),
                actor,
                PassportHead(commit=None),
            )


class TestConcurrency:
    def test_a_write_on_a_stale_read_is_refused(
        self, passport_store: LocalPassportStore, actor: Actor
    ) -> None:
        """What makes read-decide-write safe without holding a lock
        across the whole cycle."""
        first = _created(passport_store, actor)
        stale = PassportHead(commit=first)

        passport_store.write(
            PASSPORT_ID,
            {paths.INDEX: "second: true\n"},
            _message("someone else"),
            actor,
            stale,
        )

        with pytest.raises(ConcurrentWriteError):
            passport_store.write(
                PASSPORT_ID,
                {paths.INDEX: "third: true\n"},
                _message("built on a stale read"),
                actor,
                stale,
            )

    def test_the_refusal_names_both_commits(
        self, passport_store: LocalPassportStore, actor: Actor
    ) -> None:
        first = _created(passport_store, actor)
        stale = PassportHead(commit=first)
        passport_store.write(
            PASSPORT_ID, {paths.INDEX: "x: 1\n"}, _message("a"), actor, stale
        )

        with pytest.raises(ConcurrentWriteError, match=first[:8]):
            passport_store.write(
                PASSPORT_ID,
                {paths.INDEX: "y: 1\n"},
                _message("b"),
                actor,
                stale,
            )

    def test_a_refused_write_changes_nothing(
        self, passport_store: LocalPassportStore, actor: Actor
    ) -> None:
        first = _created(passport_store, actor)
        stale = PassportHead(commit=first)
        second = passport_store.write(
            PASSPORT_ID, {paths.INDEX: "x: 1\n"}, _message("a"), actor, stale
        )

        with pytest.raises(ConcurrentWriteError):
            passport_store.write(
                PASSPORT_ID,
                {paths.INDEX: "y: 1\n"},
                _message("b"),
                actor,
                stale,
            )

        assert passport_store.head(PASSPORT_ID).commit == second
        assert passport_store.read(PASSPORT_ID, paths.INDEX) == b"x: 1\n"


class TestRewriteRefusal:
    """History is append-only through the application."""

    def test_a_commit_with_no_parent_onto_a_history_is_refused(
        self, passport_store: LocalPassportStore, actor: Actor, tmp_path: Path
    ) -> None:
        """That would discard every earlier commit."""
        _created(passport_store, actor)
        repository = pygit2.Repository(
            str(tmp_path / paths.shard(PASSPORT_ID))
        )

        with pytest.raises(NonFastForwardError, match="discard"):
            passport_store._commit(  # noqa: SLF001 - the rule under test
                repository=repository,
                location=tmp_path / paths.shard(PASSPORT_ID),
                files={paths.INDEX: "rewritten: true\n"},
                delete=(),
                message=_message("a rewrite"),
                actor=actor,
                parents=[],
            )

    def test_a_commit_that_does_not_descend_from_head_is_refused(
        self, passport_store: LocalPassportStore, actor: Actor, tmp_path: Path
    ) -> None:
        first = _created(passport_store, actor)
        second = passport_store.write(
            PASSPORT_ID,
            {paths.INDEX: "x: 1\n"},
            _message("a"),
            actor,
            PassportHead(commit=first),
        )
        repository = pygit2.Repository(
            str(tmp_path / paths.shard(PASSPORT_ID))
        )

        with pytest.raises(NonFastForwardError, match="append-only"):
            passport_store._commit(  # noqa: SLF001 - the rule under test
                repository=repository,
                location=tmp_path / paths.shard(PASSPORT_ID),
                files={paths.INDEX: "forked: true\n"},
                delete=(),
                message=_message("a fork"),
                actor=actor,
                parents=[first],
            )

        assert passport_store.head(PASSPORT_ID).commit == second


class TestRollback:
    def test_a_failed_write_leaves_the_repository_unchanged(
        self,
        passport_store: LocalPassportStore,
        actor: Actor,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A half-written passport is worse than a refused write, because
        nothing announces it."""
        first = _created(passport_store, actor)
        before = passport_store.read(PASSPORT_ID, paths.INDEX)

        real_write = Path.write_bytes
        calls = {"n": 0}

        def fail_on_the_second(self: Path, data: Any) -> int:
            calls["n"] += 1
            if calls["n"] == 2:
                raise OSError("disk full")
            return real_write(self, data)

        monkeypatch.setattr(Path, "write_bytes", fail_on_the_second)

        with pytest.raises(StoreError, match="rolled back"):
            passport_store.write(
                PASSPORT_ID,
                {
                    paths.INDEX: "half: written\n",
                    paths.sign_off_file("2026-03-14-a-thing"): "id: 1\n",
                },
                _message("a doomed write"),
                actor,
                PassportHead(commit=first),
            )

        monkeypatch.undo()

        assert passport_store.head(PASSPORT_ID).commit == first
        assert passport_store.read(PASSPORT_ID, paths.INDEX) == before

    def test_a_failed_write_restores_a_file_it_had_overwritten(
        self,
        passport_store: LocalPassportStore,
        actor: Actor,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        first = _created(passport_store, actor)
        location = tmp_path / paths.shard(PASSPORT_ID)
        original = (location / str(paths.INDEX)).read_bytes()

        real_write = Path.write_bytes
        calls = {"n": 0}

        def fail_on_the_second(self: Path, data: Any) -> int:
            calls["n"] += 1
            if calls["n"] == 2:
                raise OSError("disk full")
            return real_write(self, data)

        monkeypatch.setattr(Path, "write_bytes", fail_on_the_second)

        with pytest.raises(StoreError):
            passport_store.write(
                PASSPORT_ID,
                {
                    paths.INDEX: "overwritten\n",
                    paths.PROFILE: "also overwritten\n",
                },
                _message("a doomed write"),
                actor,
                PassportHead(commit=first),
            )

        monkeypatch.undo()

        assert (location / str(paths.INDEX)).read_bytes() == original

    def test_a_failed_write_removes_directories_it_created(
        self,
        passport_store: LocalPassportStore,
        actor: Actor,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        first = _created(passport_store, actor)
        location = tmp_path / paths.shard(PASSPORT_ID)

        def explode(*_: object, **__: object) -> None:
            raise OSError("disk full")

        monkeypatch.setattr(Path, "write_bytes", explode)

        with pytest.raises(StoreError):
            passport_store.write(
                PASSPORT_ID,
                {paths.sign_off_file("2026-03-14-a-thing"): "id: 1\n"},
                _message("a doomed write"),
                actor,
                PassportHead(commit=first),
            )

        monkeypatch.undo()

        assert not (location / "sign-offs" / "2026-03-14-a-thing").exists()


class TestSharding:
    def test_repositories_are_sharded_by_id(
        self, passport_store: LocalPassportStore, actor: Actor, tmp_path: Path
    ) -> None:
        """Derivable from the id rather than recorded anywhere."""
        _created(passport_store, actor)

        assert (tmp_path / "3f" / "2a" / PASSPORT_ID / ".git").exists()

    def test_a_malformed_id_never_reaches_the_filesystem(
        self, passport_store: LocalPassportStore
    ) -> None:
        """An id decides a path, so it is validated rather than trusted."""
        with pytest.raises(paths.PassportPathError):
            passport_store.exists("../../etc/passwd")
