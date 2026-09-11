"""Reading and writing passport repositories.

The storage boundary. Core code sees a directory of files and a history
of commits; whether those live on a local disk or in a bucket is this
module's business and nobody else's.

Four properties hold whatever the backend:

**One write, one commit.** There is no way to change a passport without
committing. A write either lands entirely — every file, one commit — or
leaves the repository exactly as it was.

**Rollback on failure.** If any part of a write fails, the files it had
already written are put back as they were and created directories are
removed. A half-written passport is worse than a refused write, because
nothing announces it.

**Nothing is ever rewritten.** Only ``refs/heads/main``, and only
fast-forward. A force push cannot arrive through the application, which
is what stops git's one real weakness as an audit trail: history can be
rewritten, and git cannot tell you who did it.

**HEAD is asserted on write.** A caller reads a passport, decides what to
change, and writes; if anything else moved HEAD in between, the write is
refused rather than silently applied on top. That is optimistic
concurrency, and it is the same assertion the bucket backend will make
with a generation number.

pygit2 rather than shelling out to ``git``: in-process, typed errors, no
binary in the image and no subprocess per write.
"""

from __future__ import annotations

import shutil
from abc import ABC, abstractmethod
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath

import pygit2

from . import paths
from .commits import Actor, CommitMessage

#: The only branch a passport has. No branches, no merges, no rewrites:
#: backfills and repairs are new commits like everything else.
BRANCH = "refs/heads/main"

#: Who commits. The author is the person who acted; the committer is
#: always Quill, because the application is the only writer and saying so
#: is more honest than attributing the mechanism to a clinician.
COMMITTER_NAME = "Quill Medical"
COMMITTER_EMAIL = "noreply@quill-medical.com"

#: What a new passport's README says. Written once at creation and never
#: regenerated, so a passport exported years later still explains itself
#: in the words that were current when it was made.
README_TEXT = """\
# Clinician passport

This directory is a portable record of clinical competencies: what the
holder has been assessed as able to do, who signed each assessment off,
when, and on what evidence.

## How to read it

- `manifest.yaml` — what this passport is, and when it was created.
- `profile.yaml` — whose passport it is.
- `competencies.yaml` — every competency with evidence, and where it
  stands. This is a summary, regenerated from the directories below; if
  it ever disagrees with them, they are correct.
- `sign-offs/` — one directory per assessment, each holding the record
  that was signed. These never change once signed.
- `certificates/`, `logbook/`, `reflections/`, `cpd/` — evidence the
  holder recorded themselves. Nobody countersigns these, which is what
  distinguishes them from a sign-off.

Every file is YAML or Markdown, so it can be read with no software
beyond a text editor. The full history is in git: `git log` shows every
change, who made it, and when.

## What a sign-off proves, and what it does not

A sign-off records that a named person accepted accountability for a
judgement on a date. It does not prove that person's professional
registration: registrations are recorded as declared, and marked
verified only where somebody has checked a register by hand.
"""


class StoreError(Exception):
    """Something went wrong reading or writing a passport repository."""


class PassportNotFoundError(StoreError):
    """No repository exists for that passport id."""


class PassportExistsError(StoreError):
    """A repository already exists, and creating would overwrite it.

    Refused rather than reused: a passport id collision means something
    upstream is wrong, and writing into the existing repository would
    mix two people's records.
    """


class ConcurrentWriteError(StoreError):
    """HEAD moved between the read and the write.

    The caller should re-read and decide again. Surfaced as a 409 rather
    than retried automatically, because the decision that produced the
    write may no longer make sense against the new state.
    """


class NonFastForwardError(StoreError):
    """A write would not have been a fast-forward, so it was refused.

    This is the rule that stops history being rewritten through the
    application. It should be unreachable in ordinary use; reaching it
    means a bug, not a race.
    """


class CleanupFailedError(StoreError):
    """A write failed, and undoing it also failed.

    Distinct from every other error because it is the one case where the
    repository may be left in a state nobody intended. Operators need to
    know residue exists rather than seeing a generic failure — after
    VPR, which surfaces the same distinction.
    """


@dataclass(frozen=True)
class PassportHead:
    """Where a passport was when it was read.

    Passed back to :meth:`PassportStore.write` so the store can refuse a
    write built on a stale read. ``None`` means the repository had no
    commits yet.
    """

    commit: str | None


class PassportStore(ABC):
    """What core code may do to a passport repository."""

    @abstractmethod
    def exists(self, passport_id: str) -> bool:
        """Whether a repository exists for this passport."""

    @abstractmethod
    def create(
        self,
        passport_id: str,
        files: Mapping[PurePosixPath, str | bytes],
        message: CommitMessage,
        actor: Actor,
    ) -> str:
        """Initialise a repository and make its first commit."""

    @abstractmethod
    def read(self, passport_id: str, path: PurePosixPath) -> bytes:
        """Read one file at the current HEAD."""

    @abstractmethod
    def list_dir(
        self, passport_id: str, path: PurePosixPath
    ) -> list[PurePosixPath]:
        """List the entries directly under a directory."""

    @abstractmethod
    def head(self, passport_id: str) -> PassportHead:
        """Where the repository is now."""

    @abstractmethod
    def write(
        self,
        passport_id: str,
        files: Mapping[PurePosixPath, str | bytes],
        message: CommitMessage,
        actor: Actor,
        expected_head: PassportHead,
        *,
        delete: tuple[PurePosixPath, ...] = (),
    ) -> str:
        """Write files and commit, in one operation."""


class LocalPassportStore(PassportStore):
    """Passports as git repositories under one directory.

    The development and test backend, and the reference implementation:
    the bucket backend has to behave identically, so this is where the
    semantics are pinned.

    Repositories are sharded by the passport id — ``3f/2a/3f2a8c1e…`` —
    so no directory grows unmanageably wide, and the shard is derivable
    from the id rather than recorded anywhere.
    """

    def __init__(self, root: Path) -> None:
        """Start a store rooted at *root*.

        Args:
            root: The directory holding every passport. Created on first
                write rather than here, so constructing a store has no
                side effect.
        """
        self._root = root

    def _path(self, passport_id: str) -> Path:
        """Where one passport's repository sits.

        Raises:
            PassportPathError: If the id is not 32 lower-case hex
                characters. Validated here rather than trusted, because
                an id reaching this method decides a filesystem path.
        """
        return self._root / paths.shard(passport_id)

    def _open(self, passport_id: str) -> pygit2.Repository:
        """Open an existing repository.

        Raises:
            PassportNotFoundError: If there is none.
        """
        location = self._path(passport_id)

        if not (location / ".git").exists():
            raise PassportNotFoundError(
                f"No passport repository at {location}."
            )

        return pygit2.Repository(str(location))

    def exists(self, passport_id: str) -> bool:
        """Whether a repository exists for this passport."""
        return (self._path(passport_id) / ".git").exists()

    def head(self, passport_id: str) -> PassportHead:
        """Where the repository is now.

        Returns:
            The HEAD commit id, or ``None`` if it has no commits.

        Raises:
            PassportNotFoundError: If no repository exists.
        """
        repository = self._open(passport_id)

        if repository.head_is_unborn:
            return PassportHead(commit=None)

        return PassportHead(commit=str(repository.head.target))

    def create(
        self,
        passport_id: str,
        files: Mapping[PurePosixPath, str | bytes],
        message: CommitMessage,
        actor: Actor,
    ) -> str:
        """Initialise a repository and make its first commit.

        The whole directory is removed if anything fails, so a failed
        creation leaves nothing behind. A passport that exists but has no
        first commit would be invisible to every later operation while
        still occupying its id.

        Args:
            passport_id: The new passport's id.
            files: Paths relative to the repository root, and contents.
            message: The commit message.
            actor: Who is creating it.

        Returns:
            The commit id.

        Raises:
            PassportExistsError: If a repository is already there.
            CleanupFailedError: If the creation failed and removing the
                directory also failed, so residue remains.
            StoreError: If the creation failed and was cleaned up.
        """
        location = self._path(passport_id)

        if location.exists() and any(location.iterdir()):
            raise PassportExistsError(
                f"A passport repository already exists at {location}."
            )

        created_root = not location.exists()

        try:
            location.mkdir(parents=True, exist_ok=True)
            pygit2.init_repository(str(location), bare=False)
            repository = pygit2.Repository(str(location))

            # libgit2 points HEAD at refs/heads/master regardless of the
            # host's init.defaultBranch, and this store commits to
            # refs/heads/main. Without this the commits land on a branch
            # HEAD does not follow, so the repository reads as empty
            # while holding every record — the kind of fault that looks
            # like data loss and is not.
            repository.set_head(BRANCH)

            return self._commit(
                repository=repository,
                location=location,
                files=files,
                delete=(),
                message=message,
                actor=actor,
                parents=[],
            )
        except Exception as error:
            self._clean_up_creation(location, created_root, error)
            raise StoreError(
                f"Could not create passport {passport_id}: {error}"
            ) from error

    def _clean_up_creation(
        self, location: Path, created_root: bool, cause: Exception
    ) -> None:
        """Remove a half-created repository.

        Args:
            location: The directory to remove.
            created_root: Whether this call created it. A directory that
                already existed is left alone: it may hold something
                else, and removing it would destroy data this store
                never owned.
            cause: What went wrong, so the cleanup failure can name it.

        Raises:
            CleanupFailedError: If removal failed, so residue remains and
                an operator needs to know.
        """
        if not created_root:
            return

        try:
            shutil.rmtree(location, ignore_errors=False)
        except OSError as cleanup_error:
            raise CleanupFailedError(
                f"Creating {location} failed ({cause}), and removing the "
                f"partial directory also failed ({cleanup_error}). It is "
                "still on disk and needs clearing by hand."
            ) from cleanup_error

    def read(self, passport_id: str, path: PurePosixPath) -> bytes:
        """Read one file at the current HEAD.

        From the commit rather than the working directory, so a read
        returns what was committed even if something has touched the
        checkout.

        Args:
            passport_id: Whose passport.
            path: The file, relative to the repository root.

        Returns:
            Its bytes.

        Raises:
            PassportNotFoundError: If the passport or the file is absent.
        """
        repository = self._open(passport_id)

        if repository.head_is_unborn:
            raise PassportNotFoundError(
                f"Passport {passport_id} has no commits, so {path} cannot "
                "be read."
            )

        tree = repository.get(repository.head.target).tree

        try:
            entry = tree[str(path)]
        except KeyError as error:
            raise PassportNotFoundError(
                f"No file {path} in passport {passport_id}."
            ) from error

        blob = repository.get(entry.id)
        return bytes(blob.data)

    def list_dir(
        self, passport_id: str, path: PurePosixPath
    ) -> list[PurePosixPath]:
        """List the entries directly under a directory.

        Args:
            passport_id: Whose passport.
            path: The directory, relative to the repository root.

        Returns:
            Its entries, sorted, as paths relative to the root. Empty if
            the directory does not exist — an absent directory and an
            empty one mean the same thing to a caller counting records,
            and git cannot represent an empty directory anyway.

        Raises:
            PassportNotFoundError: If the passport does not exist.
        """
        repository = self._open(passport_id)

        if repository.head_is_unborn:
            return []

        tree = repository.get(repository.head.target).tree

        if str(path) not in ("", "."):
            try:
                entry = tree[str(path)]
            except KeyError:
                return []

            if entry.type_str != "tree":
                return []

            tree = repository.get(entry.id)

        return sorted(path / item.name for item in tree)

    def write(
        self,
        passport_id: str,
        files: Mapping[PurePosixPath, str | bytes],
        message: CommitMessage,
        actor: Actor,
        expected_head: PassportHead,
        *,
        delete: tuple[PurePosixPath, ...] = (),
    ) -> str:
        """Write files and commit, in one operation.

        Args:
            passport_id: Whose passport.
            files: Paths relative to the repository root, and contents.
            message: The commit message.
            actor: Who is making the change.
            expected_head: Where the caller believed HEAD was. The write
                is refused if it has moved.
            delete: Paths to remove in the same commit.

        Returns:
            The new commit id.

        Raises:
            PassportNotFoundError: If no repository exists.
            ConcurrentWriteError: If HEAD moved since the caller read it.
            NonFastForwardError: If the new commit would not descend from
                the current HEAD.
            StoreError: If the write failed. The repository is unchanged.
        """
        repository = self._open(passport_id)
        location = self._path(passport_id)

        current = self.head(passport_id)
        if current.commit != expected_head.commit:
            raise ConcurrentWriteError(
                f"Passport {passport_id} moved from {expected_head.commit} "
                f"to {current.commit} between the read and the write. "
                "Re-read and decide again."
            )

        parents = [] if current.commit is None else [current.commit]

        return self._commit(
            repository=repository,
            location=location,
            files=files,
            delete=delete,
            message=message,
            actor=actor,
            parents=parents,
        )

    def _commit(
        self,
        *,
        repository: pygit2.Repository,
        location: Path,
        files: Mapping[PurePosixPath, str | bytes],
        delete: tuple[PurePosixPath, ...],
        message: CommitMessage,
        actor: Actor,
        parents: list[str],
    ) -> str:
        """Write the files, stage them, and commit. Roll back on failure.

        Args:
            repository: The open repository.
            location: Its directory.
            files: What to write.
            delete: What to remove.
            message: The commit message.
            actor: Who is acting.
            parents: The parent commit ids, empty for the first commit.

        Returns:
            The new commit id.

        Raises:
            NonFastForwardError: If the commit would not descend from the
                current HEAD.
            StoreError: If anything failed. Files already written are put
                back and created directories removed first.
        """
        written: list[Path] = []
        created_dirs: list[Path] = []
        previous: dict[Path, bytes | None] = {}

        try:
            for relative, content in files.items():
                target = location / relative

                for parent in reversed(target.parents):
                    if parent.is_relative_to(location) and not parent.exists():
                        parent.mkdir(parents=True, exist_ok=True)
                        created_dirs.append(parent)

                previous[target] = (
                    target.read_bytes() if target.exists() else None
                )

                data = (
                    content.encode() if isinstance(content, str) else content
                )
                target.write_bytes(data)
                written.append(target)

            index = repository.index
            index.read()

            for relative in files:
                index.add(str(relative))

            for relative in delete:
                target = location / relative
                previous[target] = (
                    target.read_bytes() if target.exists() else None
                )
                if target.exists():
                    target.unlink()
                index.remove(str(relative))

            index.write()
            tree = index.write_tree()

            self._refuse_a_rewrite(repository, parents)

            signature_time = datetime.now(UTC)
            author = pygit2.Signature(
                actor.name,
                actor.email,
                int(signature_time.timestamp()),
            )
            committer = pygit2.Signature(
                COMMITTER_NAME,
                COMMITTER_EMAIL,
                int(signature_time.timestamp()),
            )

            commit = repository.create_commit(
                BRANCH,
                author,
                committer,
                message.render(),
                tree,
                parents,
            )

            return str(commit)
        except NonFastForwardError:
            self._roll_back(previous, created_dirs)
            raise
        except Exception as error:
            self._roll_back(previous, created_dirs)
            raise StoreError(
                f"Write failed and was rolled back: {error}"
            ) from error

    def _refuse_a_rewrite(
        self, repository: pygit2.Repository, parents: list[str]
    ) -> None:
        """Refuse a commit that would not be a fast-forward.

        The application must never rewrite history, so the check is here
        rather than in a hook: a hook can be bypassed, and this cannot.

        Args:
            repository: The open repository.
            parents: The parents the commit would have.

        Raises:
            NonFastForwardError: If the repository has commits and this
                commit does not descend from HEAD.
        """
        if repository.head_is_unborn:
            return

        head = str(repository.head.target)

        if not parents:
            raise NonFastForwardError(
                f"Refusing a commit with no parent onto a repository at "
                f"{head}: that would discard every earlier commit."
            )

        if head not in parents:
            raise NonFastForwardError(
                f"Refusing a commit whose parents {parents} do not include "
                f"the current HEAD {head}: a passport's history is "
                "append-only."
            )

    def _roll_back(
        self,
        previous: dict[Path, bytes | None],
        created_dirs: list[Path],
    ) -> None:
        """Put the working directory back as it was.

        Best-effort and deliberately quiet: it runs while an exception is
        already propagating, and raising here would replace the real
        cause with a secondary failure. The commit is what matters, and
        no commit was made — so even a partial rollback leaves a
        repository whose history is correct.

        Args:
            previous: Files that were touched, and their prior contents,
                or ``None`` where the file did not exist.
            created_dirs: Directories created during the write, removed
                deepest-first if still empty.
        """
        for target, content in previous.items():
            try:
                if content is None:
                    target.unlink(missing_ok=True)
                else:
                    target.write_bytes(content)
            except OSError:  # noqa: S110 - see the docstring
                pass

        for directory in sorted(created_dirs, reverse=True):
            try:
                directory.rmdir()
            except OSError:  # noqa: S110 - not empty, or already gone
                pass


def initial_files(
    manifest_yaml: str,
    profile_yaml: str,
    index_yaml: str,
) -> dict[PurePosixPath, str | bytes]:
    """The files every new passport starts with.

    Args:
        manifest_yaml: The rendered manifest.
        profile_yaml: The rendered profile.
        index_yaml: The rendered (empty) index.

    Returns:
        Paths to contents, ready to pass to
        :meth:`PassportStore.create`.
    """
    return {
        paths.GITIGNORE: paths.GITIGNORE_CONTENT,
        paths.README: README_TEXT,
        paths.MANIFEST: manifest_yaml,
        paths.PROFILE: profile_yaml,
        paths.INDEX: index_yaml,
    }
