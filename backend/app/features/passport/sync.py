"""Reading framework files into the database, keeping every version.

Shaped like :mod:`app.features.teaching.sync`: the sync is the only writer
of the framework tables, it is safe to run twice, and it records each run.
Each framework file is validated by the catalogue loader's own rules, the
prefix rule among them, and a version is written only when it is new.

**It refuses what CI refuses.** A framework repository will not have this
repository's CI, so the sync checks again at the door: a competency id
that is a permission's or another framework's, a competency deleted
rather than retired, a version that skips or goes down, and a framework
changed with no new version. One refusal stops the run and writes
nothing, so the tables never hold half a sync.

Until the frameworks move out it reads ``shared/competency-definitions/``,
from the pre-deploy migrations job, the CI seed and the dev migrate
recipe. The passport reads them through :mod:`.catalogue`. See Phase 5 of
docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md.

Usage::

    python -m app.features.passport.sync [<definitions-directory>]
    python -m app.features.passport.sync --versions <folder>

The second form reads a folder of versions written by hand, one folder
per framework and one file per version, and catches up on every version
the tables lack. The framework sync job uses a third,
:func:`sync_from_repositories`, which reads each framework repository's
history from GitHub itself.
"""

from __future__ import annotations

import logging
import os
import re
import subprocess  # noqa: S404 - git plumbing, fixed argv, never shell
import sys
import tempfile
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.competencies import (
    COMPETENCIES,
    COMPETENCY_DEFINITIONS_DIR,
    MAX_FRAMEWORK_FILE_BYTES,
    CompetencyEntry,
    Framework,
    _load_catalogue,
    load_framework_text,
)

from .models import (
    PassportFramework,
    PassportFrameworkCompetency,
    PassportFrameworkLevel,
    PassportFrameworkScope,
    PassportFrameworkSpecialty,
    PassportFrameworkSync,
    PassportFrameworkVersion,
)

logger = logging.getLogger(__name__)


class FrameworkSyncError(ValueError):
    """A framework file the sync refuses, named in the message."""


@dataclass(frozen=True)
class FrameworkSyncResult:
    """How one run ended."""

    succeeded: bool
    versions_written: int
    error: str | None


#: One level or scope: its id, its words, and when and in which version
#: it was retired, if it was.
_Part = tuple[str, str, date | None, int | None]

#: What a framework holds, in a form both a file and the stored rows can
#: be turned into, so the two can be compared. ``description`` is left
#: out: it is internal, and changing it needs no new version.
_Snapshot = tuple[
    str,
    str,
    tuple[str, ...],
    tuple[
        tuple[
            str,
            str,
            date | None,
            int | None,
            int | None,
            tuple[_Part, ...],
            tuple[_Part, ...],
        ],
        ...,
    ],
]


#: The competency rows of a snapshot, as ``_Snapshot`` holds them.
_CompetencyRows = tuple[
    tuple[
        str,
        str,
        date | None,
        int | None,
        int | None,
        tuple[_Part, ...],
        tuple[_Part, ...],
    ],
    ...,
]


def _snapshot_of_file(
    framework: Framework, items: list[CompetencyEntry]
) -> _Snapshot:
    """A framework file's content, ready to compare."""
    return (
        framework.name,
        framework.publisher,
        tuple(framework.specialties),
        tuple(
            (
                item.id,
                item.display_name,
                item.retired_on,
                item.retired_in_version,
                item.expires_after_months,
                tuple(
                    (lvl.id, lvl.name, lvl.retired_on, lvl.retired_in_version)
                    for lvl in item.levels or []
                ),
                tuple(
                    (sc.id, sc.name, sc.retired_on, sc.retired_in_version)
                    for sc in item.scopes or []
                ),
            )
            for item in items
        ),
    )


def _snapshot_of_rows(db: Session, row: PassportFrameworkVersion) -> _Snapshot:
    """A stored version's content, ready to compare."""
    specialties = db.scalars(
        select(PassportFrameworkSpecialty.specialty_id)
        .where(PassportFrameworkSpecialty.version_row_id == row.id)
        .order_by(PassportFrameworkSpecialty.position)
    ).all()

    competencies = db.scalars(
        select(PassportFrameworkCompetency)
        .where(PassportFrameworkCompetency.version_row_id == row.id)
        .order_by(PassportFrameworkCompetency.position)
    ).all()

    found = []

    for competency in competencies:
        levels = db.scalars(
            select(PassportFrameworkLevel)
            .where(PassportFrameworkLevel.competency_row_id == competency.id)
            .order_by(PassportFrameworkLevel.position)
        ).all()
        scopes = db.scalars(
            select(PassportFrameworkScope)
            .where(PassportFrameworkScope.competency_row_id == competency.id)
            .order_by(PassportFrameworkScope.position)
        ).all()
        found.append(
            (
                competency.competency_id,
                competency.display_name,
                competency.retired_on,
                competency.retired_in_version,
                competency.expires_after_months,
                tuple(
                    (
                        lvl.level_id,
                        lvl.name,
                        lvl.retired_on,
                        lvl.retired_in_version,
                    )
                    for lvl in levels
                ),
                tuple(
                    (
                        sc.scope_id,
                        sc.name,
                        sc.retired_on,
                        sc.retired_in_version,
                    )
                    for sc in scopes
                ),
            )
        )

    return (row.name, row.publisher, tuple(specialties), tuple(found))


def _newest(db: Session, framework_id: str) -> PassportFrameworkVersion | None:
    """The highest stored version of a framework, or None."""
    return db.scalars(
        select(PassportFrameworkVersion)
        .where(PassportFrameworkVersion.framework_id == framework_id)
        .order_by(PassportFrameworkVersion.version.desc())
        .limit(1)
    ).first()


def _held_elsewhere(
    db: Session, framework_id: str, competency_ids: list[str]
) -> list[str]:
    """Ids another stored framework already uses."""
    rows = db.scalars(
        select(PassportFrameworkCompetency.competency_id)
        .join(
            PassportFrameworkVersion,
            PassportFrameworkVersion.id
            == PassportFrameworkCompetency.version_row_id,
        )
        .where(PassportFrameworkVersion.framework_id != framework_id)
        .where(PassportFrameworkCompetency.competency_id.in_(competency_ids))
    ).all()

    return sorted(set(rows))


def _missing_versions(name: str, stored: int, found: int) -> str:
    """Say which versions a jump skipped, and how to put them back.

    A version the sync never saw is in no file any more, so every later
    sync refuses the same way until somebody stores it. Git still has it.
    """
    missing = list(range(stored + 1, found))
    listed = ", ".join(str(number) for number in missing)
    noun = "version" if len(missing) == 1 else "versions"
    verb = "is" if len(missing) == 1 else "are"

    return (
        f"Framework {name!r}: the tables hold version {stored}, the files "
        f"version {found}: {noun} {listed} {verb} missing. Rebuild each "
        "from git history, oldest first: copy the framework's file from "
        "the commit that set that version into a folder of its own, run "
        "'python -m app.features.passport.sync <folder>', then sync again."
    )


def _starts_above_one(name: str, first: int) -> str:
    """Say that a framework's first version is not 1.

    Every framework counts from 1, so a missing version 1 cannot pass for
    a framework that simply began later.
    """
    missing = list(range(1, first))
    listed = ", ".join(str(number) for number in missing)
    noun = "version" if len(missing) == 1 else "versions"
    verb = "is" if len(missing) == 1 else "are"

    return (
        f"Framework {name!r} starts at version {first}, but every "
        f"framework starts at version 1: {noun} {listed} {verb} missing."
    )


def _check(
    db: Session,
    framework: Framework,
    items: list[CompetencyEntry],
    permission_ids: set[str],
) -> bool:
    """Whether this file is a version to write, refusing a bad one.

    Returns:
        True for a new version, False for one already stored as it is.

    Raises:
        FrameworkSyncError: For anything the sync refuses.
    """
    ids = [item.id for item in items]
    name = framework.id

    clash = sorted(set(ids) & permission_ids)
    if clash:
        raise FrameworkSyncError(
            f"Framework {name!r} uses permission ids: {', '.join(clash)}."
        )

    elsewhere = _held_elsewhere(db, name, ids)
    if elsewhere:
        raise FrameworkSyncError(
            f"Framework {name!r} uses ids another framework holds: "
            f"{', '.join(elsewhere)}."
        )

    newest = _newest(db, name)

    if newest is None:
        if framework.version != 1:
            raise FrameworkSyncError(
                _starts_above_one(name, framework.version)
            )

        return True

    if framework.version == newest.version:
        if _snapshot_of_file(framework, items) != _snapshot_of_rows(
            db, newest
        ):
            raise FrameworkSyncError(
                f"Framework {name!r} changed but is still version "
                f"{newest.version}."
            )
        return False

    if framework.version < newest.version:
        raise FrameworkSyncError(
            f"Framework {name!r} is version {framework.version}, but the "
            f"tables already hold version {newest.version}: a version "
            "never goes down."
        )

    if framework.version > newest.version + 1:
        raise FrameworkSyncError(
            _missing_versions(name, newest.version, framework.version)
        )

    stored = _snapshot_of_rows(db, newest)[3]
    stored_ids = {row[0] for row in stored}
    deleted = sorted(stored_ids - set(ids))
    if deleted:
        raise FrameworkSyncError(
            f"Framework {name!r} deleted competencies rather than retiring "
            f"them: {', '.join(deleted)}."
        )

    dropped = _dropped_levels_and_scopes(stored, items)
    if dropped:
        raise FrameworkSyncError(
            f"Framework {name!r} removed levels or scopes a sign-off may "
            f"name: {', '.join(dropped)}. A level or scope is never "
            "removed from a competency."
        )

    return True


def _dropped_levels_and_scopes(
    stored: _CompetencyRows,
    items: list[CompetencyEntry],
) -> list[str]:
    """Each level or scope id the stored version had that a file drops.

    A sign-off names a level and a scope by id, and asking again compares
    the new level with the last one, so an id gone from the framework
    leaves a holder unable to ask again. See Phase 11 of
    docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md.

    Returns:
        ``competency_id: level_or_scope_id`` for each one dropped, sorted.
    """
    now = {item.id: item for item in items}
    dropped: list[str] = []

    for competency_id, _, _, _, _, levels, scopes in stored:
        item = now.get(competency_id)
        if item is None:
            continue

        kept_levels = {lvl.id for lvl in item.levels or []}
        kept_scopes = {sc.id for sc in item.scopes or []}

        for gone in sorted({part[0] for part in levels} - kept_levels):
            dropped.append(f"{competency_id}: level {gone}")
        for gone in sorted({part[0] for part in scopes} - kept_scopes):
            dropped.append(f"{competency_id}: scope {gone}")

    return dropped


def _write(
    db: Session, framework: Framework, items: list[CompetencyEntry]
) -> None:
    """Store one version whole. The rows are flushed, not committed."""
    if db.get(PassportFramework, framework.id) is None:
        db.add(PassportFramework(id=framework.id))
        db.flush()

    version = PassportFrameworkVersion(
        framework_id=framework.id,
        version=framework.version,
        name=framework.name,
        publisher=framework.publisher,
        description=framework.description,
    )
    db.add(version)
    db.flush()

    for position, specialty in enumerate(framework.specialties, start=1):
        db.add(
            PassportFrameworkSpecialty(
                version_row_id=version.id,
                specialty_id=specialty,
                position=position,
            )
        )

    for position, item in enumerate(items, start=1):
        competency = PassportFrameworkCompetency(
            version_row_id=version.id,
            competency_id=item.id,
            position=position,
            display_name=item.display_name,
            retired_on=item.retired_on,
            retired_in_version=item.retired_in_version,
            expires_after_months=item.expires_after_months,
        )
        db.add(competency)
        db.flush()

        for step, level in enumerate(item.levels or [], start=1):
            db.add(
                PassportFrameworkLevel(
                    competency_row_id=competency.id,
                    level_id=level.id,
                    name=level.name,
                    position=step,
                    retired_on=level.retired_on,
                    retired_in_version=level.retired_in_version,
                )
            )

        for step, scope in enumerate(item.scopes or [], start=1):
            db.add(
                PassportFrameworkScope(
                    competency_row_id=competency.id,
                    scope_id=scope.id,
                    name=scope.name,
                    position=step,
                    retired_on=scope.retired_on,
                    retired_in_version=scope.retired_in_version,
                )
            )

    db.flush()


def _recorded_run(
    db: Session, work: Callable[[set[str]], int]
) -> FrameworkSyncResult:
    """Run *work* inside one savepoint, and record how it ended.

    Either everything *work* writes lands or none of it does, and the run
    is recorded either way. The caller commits.

    Args:
        db: The core database session.
        work: Writes the new versions and says how many, given the ids of
            the permissions, which no framework may use.

    Returns:
        How the run ended.
    """
    run = PassportFrameworkSync(status="running")
    db.add(run)
    db.flush()

    permission_ids = {c.id for c in COMPETENCIES if c.framework_id is None}

    try:
        with db.begin_nested():
            written = work(permission_ids)
    except (FrameworkSyncError, ValueError, ValidationError) as error:
        run.status = "failed"
        run.error = str(error)
        run.finished_at = datetime.now(UTC)
        db.flush()
        logger.error("Framework sync failed: %s", error)

        return FrameworkSyncResult(False, 0, str(error))

    run.status = "succeeded"
    run.versions_written = written
    run.finished_at = datetime.now(UTC)
    db.flush()

    return FrameworkSyncResult(True, written, None)


def sync_frameworks(
    db: Session, directory: Path = COMPETENCY_DEFINITIONS_DIR
) -> FrameworkSyncResult:
    """Read every framework in *directory* into the database.

    *directory* holds each framework as it stands now, one file each, as
    ``shared/competency-definitions/`` does. Either every new version is
    written or none is. The caller commits.

    Args:
        db: The core database session.
        directory: A folder of definition files.

    Returns:
        How the run ended.
    """

    def work(permission_ids: set[str]) -> int:
        written = 0
        entries, frameworks = _load_catalogue(directory)

        for framework in frameworks:
            items = [e for e in entries if e.framework_id == framework.id]

            if _check(db, framework, items, permission_ids):
                _write(db, framework, items)
                written += 1

        return written

    return _recorded_run(db, work)


def _stored_version(db: Session, framework_id: str) -> int:
    """The newest version stored for a framework, or 0 for none."""
    newest = _newest(db, framework_id)

    return 0 if newest is None else newest.version


def _version_files(folder: Path) -> dict[int, Path]:
    """Each ``<version>.yaml`` in one framework's folder, by version.

    Raises:
        FrameworkSyncError: For a file whose name is not a version number,
            which would otherwise be skipped without a word.
    """
    found: dict[int, Path] = {}

    for path in sorted(folder.glob("*.yaml")):
        if not path.stem.isdigit() or path.stem.startswith("0"):
            raise FrameworkSyncError(
                f"{folder.name}/{path.name} is not named for a version. "
                "Each file is named for its version, such as 3.yaml."
            )
        found[int(path.stem)] = path

    return found


def _load_version(
    framework_id: str, number: int, text: str
) -> tuple[Framework, list[CompetencyEntry]]:
    """Read one version's file from its text, with the catalogue's rules.

    Raises:
        FrameworkSyncError: If the file declares another version than the
            one it was given as.
        ValueError: For anything the loader refuses, another framework
            among it.
    """
    framework, entries = load_framework_text(text, framework_id)

    if framework.version != number:
        raise FrameworkSyncError(
            f"{framework_id}/{number}.yaml declares version "
            f"{framework.version}. A version's file is named for it."
        )

    return framework, entries


def _stored_row(
    db: Session, framework_id: str, number: int
) -> PassportFrameworkVersion | None:
    """One stored version of a framework, or None."""
    return db.scalars(
        select(PassportFrameworkVersion).where(
            PassportFrameworkVersion.framework_id == framework_id,
            PassportFrameworkVersion.version == number,
        )
    ).first()


def sync_version_texts(
    db: Session, versions: Mapping[str, Mapping[int, str]]
) -> FrameworkSyncResult:
    """Store every version given that the tables do not hold yet.

    *versions* holds each framework's files as text, by version number:
    every version of it, from 1, not only the new ones. Each framework's
    missing versions are checked and written in order, so a run that
    finds several catches up on all of them. A version already stored is
    compared with its file, and refused if the two differ: a stored
    version never changes, so a difference means its history was
    rewritten. Either everything new is written or nothing is. The caller
    commits.

    Args:
        db: The core database session.
        versions: Each framework's version files, by framework id, then
            by version number.

    Returns:
        How the run ended. A version missing from *versions*, between 1
        and the newest given, fails the run and is named.
    """
    return _recorded_run(
        db, lambda permission_ids: _catch_up(db, versions, permission_ids)
    )


def _catch_up(
    db: Session,
    versions: Mapping[str, Mapping[int, str]],
    permission_ids: set[str],
) -> int:
    """Check and write what :func:`sync_version_texts` describes.

    Returns:
        How many versions were written.

    Raises:
        FrameworkSyncError: For a gap, a stored version that differs, or
            a file that declares another version.
        ValueError: For anything the loader refuses.
    """
    written = 0

    if not versions:
        raise FrameworkSyncError("No framework versions were given.")

    for name in sorted(versions):
        texts = versions[name]
        stored = _stored_version(db, name)
        numbers = sorted(texts)

        if not numbers:
            raise FrameworkSyncError(f"Framework {name!r}: no versions given.")

        gaps = sorted(set(range(1, numbers[-1] + 1)) - set(numbers))

        if gaps:
            raise FrameworkSyncError(
                f"Framework {name!r}: "
                + ("versions " if len(gaps) > 1 else "version ")
                + ", ".join(str(n) for n in gaps)
                + " not found. Every version from 1 to the newest "
                "must be given."
            )

        for number in numbers:
            framework, items = _load_version(name, number, texts[number])

            if number <= stored:
                row = _stored_row(db, name, number)
                if row is None or _snapshot_of_file(
                    framework, items
                ) != _snapshot_of_rows(db, row):
                    raise FrameworkSyncError(
                        f"Framework {name!r}: version {number} differs "
                        "from the version stored. A stored version "
                        "never changes, so its history may have been "
                        "rewritten."
                    )
                continue

            if _check(db, framework, items, permission_ids):
                _write(db, framework, items)
                written += 1

    return written


def read_version_folder(root: Path) -> dict[str, dict[int, str]]:
    """Every version file under *root*, as text, for the catch-up.

    *root* holds one folder per framework, each holding one file per
    version: ``<framework>/<version>.yaml``. For rebuilding by hand.

    Raises:
        FrameworkSyncError: For a file not named for a version.
    """
    versions: dict[str, dict[int, str]] = {}
    folders = sorted(p for p in root.iterdir() if p.is_dir())

    if not folders:
        raise FrameworkSyncError(f"No framework folders found in {root}.")

    for folder in folders:
        files = _version_files(folder)
        versions[folder.name] = {
            number: path.read_text(encoding="utf-8")
            for number, path in files.items()
        }

    return versions


def sync_framework_versions(db: Session, root: Path) -> FrameworkSyncResult:
    """Store every version in the folder *root* that the tables lack.

    The by-hand form of :func:`sync_version_texts`. *root* is laid out as
    :func:`read_version_folder` reads it. The caller commits.

    Args:
        db: The core database session.
        root: The folder of framework folders.

    Returns:
        How the run ended. A file not named for a version fails the run.
    """
    return _recorded_run(
        db,
        lambda permission_ids: _catch_up(
            db, read_version_folder(root), permission_ids
        ),
    )


#: Where a framework file sits in its repository: one file per framework,
#: named for its id, under frameworks/. Any other file is not read.
_FRAMEWORK_PATH = re.compile(
    r"^frameworks/(?P<framework>[a-z][a-z0-9_]*)\.yaml$"
)

#: An ``owner/name`` repository on GitHub, and nothing else, so a setting
#: cannot point the clone at a path or another host.
_REPOSITORY_NAME = re.compile(r"^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$")

#: The one protocol a clone may use. Tests read local repositories, and
#: change this to ``file`` to do it.
_CLONE_PROTOCOL = "https"

#: How long one git command may take before the run is refused, so a huge
#: or hostile repository stops one run and nothing else.
GIT_TIMEOUT_SECONDS = 120


def _repository_url(repository: str) -> str:
    """Where *repository* is cloned from."""
    return f"https://github.com/{repository}.git"


def _git(
    command: str,
    *args: str,
    git_dir: Path | None = None,
    config: Sequence[str] = (),
) -> str:
    """Run one git command, refusing the run if it fails or overruns.

    Args:
        command: The git command, such as ``clone``.
        args: Its arguments.
        git_dir: The repository to run it in, for anything but a clone.
        config: ``name=value`` settings for this command alone.

    Raises:
        FrameworkSyncError: If git fails, is missing, or takes longer
            than ``GIT_TIMEOUT_SECONDS``.
    """
    argv = ["git"]

    if git_dir is not None:
        argv.append(f"--git-dir={git_dir}")
    for setting in config:
        argv += ["-c", setting]
    argv += [command, *args]

    try:
        result = subprocess.run(  # noqa: S603 - fixed argv, no shell  # nosec B607 B603
            argv,
            capture_output=True,
            text=True,
            check=True,
            timeout=GIT_TIMEOUT_SECONDS,
            env={"GIT_TERMINAL_PROMPT": "0", "PATH": os.environ["PATH"]},
        )
    except subprocess.CalledProcessError as error:
        raise FrameworkSyncError(
            f"git {command} failed: {error.stderr.strip()}"
        ) from error
    except subprocess.TimeoutExpired as error:
        raise FrameworkSyncError(
            f"git {command} took longer than {GIT_TIMEOUT_SECONDS} " "seconds."
        ) from error
    except OSError as error:
        raise FrameworkSyncError(f"git could not run: {error}") from error

    return result.stdout


def _clone(repository: str, destination: Path) -> None:
    """Make a bare clone of *repository* at *destination*.

    Bare, so no file is ever written out of the repository: a hostile one
    can then never place a file or a symlink, which is how past git
    security bugs were reached. Submodules are never fetched, and only
    ``_CLONE_PROTOCOL`` is allowed, so the clone reads GitHub and nowhere
    else.
    """
    _git(
        "clone",
        "--bare",
        "--no-recurse-submodules",
        "--quiet",
        _repository_url(repository),
        str(destination),
        config=(
            "protocol.allow=never",
            f"protocol.{_CLONE_PROTOCOL}.allow=always",
        ),
    )


def read_repository_versions(
    repository: str, may_publish: set[str], clone: Path
) -> dict[str, dict[int, str]]:
    """Every version of every framework in one repository's history.

    Walks ``main``'s first-parent history, oldest first, and keeps the
    first text at which each version appears: the merge that set it. A
    later commit that changed only comments or the description keeps its
    version, so its text is not read again.

    Args:
        repository: ``owner/name`` on GitHub.
        may_publish: The framework ids this repository may publish.
        clone: An empty folder to clone into.

    Returns:
        Each framework's version files, by framework id, then by version.
        Empty for a repository with no ``main`` yet.

    Raises:
        FrameworkSyncError: For a framework this repository may not
            publish, a file too large, or a git failure.
        ValueError: For a file the loader refuses.
    """
    if not _REPOSITORY_NAME.match(repository):
        raise FrameworkSyncError(
            f"{repository!r} is not a repository named owner/name."
        )

    _clone(repository, clone)

    heads = _git("branch", "--list", "main", git_dir=clone)
    if not heads.strip():
        # An empty repository: its first commit is not on main yet.
        return {}

    found: dict[str, dict[int, str]] = {}
    seen_blobs: set[str] = set()
    commits = _git(
        "rev-list", "--first-parent", "--reverse", "main", git_dir=clone
    ).split()

    for commit in commits:
        listing = _git(
            "ls-tree", "-r", commit, "--", "frameworks/", git_dir=clone
        )

        for line in listing.splitlines():
            meta, path = line.split("\t", 1)
            blob = meta.split()[2]
            match = _FRAMEWORK_PATH.match(path)

            if match is None or blob in seen_blobs:
                continue

            framework_id = match["framework"]
            if framework_id not in may_publish:
                raise FrameworkSyncError(
                    f"{repository} holds {path}, but may publish only "
                    + ", ".join(sorted(may_publish))
                    + "."
                )

            size = int(_git("cat-file", "-s", blob, git_dir=clone))
            if size > MAX_FRAMEWORK_FILE_BYTES:
                raise FrameworkSyncError(
                    f"{repository}: {path} at {commit[:9]} is larger than "
                    f"{MAX_FRAMEWORK_FILE_BYTES} bytes."
                )

            text = _git("cat-file", "blob", blob, git_dir=clone)
            framework, _ = load_framework_text(text, framework_id)
            seen_blobs.add(blob)
            found.setdefault(framework_id, {}).setdefault(
                framework.version, text
            )

    return found


def read_repositories(
    repositories: Mapping[str, Sequence[str]], scratch: Path
) -> dict[str, dict[int, str]]:
    """Every framework version in every repository, for the catch-up.

    Args:
        repositories: Each ``owner/name``, with the framework ids it may
            publish.
        scratch: An empty folder for the clones.

    Raises:
        FrameworkSyncError: For a framework id paired with two
            repositories, or anything :func:`read_repository_versions`
            refuses.
    """
    owners: dict[str, str] = {}

    for repository, ids in repositories.items():
        for framework_id in ids:
            if framework_id in owners:
                raise FrameworkSyncError(
                    f"Framework {framework_id!r} is paired with both "
                    f"{owners[framework_id]} and {repository}."
                )
            owners[framework_id] = repository

    versions: dict[str, dict[int, str]] = {}

    for position, repository in enumerate(sorted(repositories)):
        versions.update(
            read_repository_versions(
                repository,
                set(repositories[repository]),
                scratch / str(position),
            )
        )

    return versions


def sync_from_repositories(
    db: Session, repositories: Mapping[str, Sequence[str]]
) -> FrameworkSyncResult:
    """Read every framework repository, then catch up on what it holds.

    The clones go in a scratch folder deleted as the run ends. On Cloud
    Run a container's disk is held in memory, so nothing outlasts the
    job. The caller commits.

    Args:
        db: The core database session.
        repositories: Each ``owner/name``, with the framework ids it may
            publish.

    Returns:
        How the run ended.
    """
    with tempfile.TemporaryDirectory(
        prefix="framework_repositories_"
    ) as scratch:
        return _recorded_run(
            db,
            lambda permission_ids: _catch_up(
                db,
                read_repositories(repositories, Path(scratch)),
                permission_ids,
            ),
        )


def main(argv: list[str] | None = None) -> int:
    """CLI entry point: sync, commit, and say what happened."""
    from app.db.core_db import CoreSessionLocal

    args = argv if argv is not None else sys.argv[1:]

    if args[:1] == ["--versions"]:
        if len(args) != 2:
            print(
                "Usage: python -m app.features.passport.sync --versions <folder>"
            )
            return 2

        versions = Path(args[1])

        with CoreSessionLocal() as db:
            result = sync_framework_versions(db, versions)
            # Its own session, so nothing else commits for it.
            db.commit()

        return _report(result)

    directory = Path(args[0]) if args else COMPETENCY_DEFINITIONS_DIR

    with CoreSessionLocal() as db:
        result = sync_frameworks(db, directory)
        # Its own session, so nothing else commits for it.
        db.commit()

    return _report(result)


def _report(result: FrameworkSyncResult) -> int:
    """Say how a run ended, as an exit status."""
    if not result.succeeded:
        print(f"Framework sync failed: {result.error}")
        return 1

    print(f"Framework sync: {result.versions_written} version(s) written.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
