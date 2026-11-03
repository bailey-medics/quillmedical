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
recipe. Nothing reads the tables yet. See Phase 5 of
docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md.

Usage::

    python -m app.features.passport.sync [<definitions-directory>]
"""

from __future__ import annotations

import logging
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.competencies import (
    COMPETENCIES,
    COMPETENCY_DEFINITIONS_DIR,
    CompetencyEntry,
    Framework,
    _load_catalogue,
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
            tuple[tuple[str, str], ...],
            tuple[tuple[str, str], ...],
        ],
        ...,
    ],
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
                tuple((lvl.id, lvl.name) for lvl in item.levels or []),
                tuple((sc.id, sc.name) for sc in item.scopes or []),
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
                tuple((lvl.level_id, lvl.name) for lvl in levels),
                tuple((sc.scope_id, sc.name) for sc in scopes),
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

    if framework.version != newest.version + 1:
        raise FrameworkSyncError(
            f"Framework {name!r} is version {framework.version}, and the "
            f"newest stored is {newest.version}: it goes up by exactly one."
        )

    stored_ids = {row[0] for row in _snapshot_of_rows(db, newest)[3]}
    deleted = sorted(stored_ids - set(ids))
    if deleted:
        raise FrameworkSyncError(
            f"Framework {name!r} deleted competencies rather than retiring "
            f"them: {', '.join(deleted)}."
        )

    return True


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
                )
            )

        for step, scope in enumerate(item.scopes or [], start=1):
            db.add(
                PassportFrameworkScope(
                    competency_row_id=competency.id,
                    scope_id=scope.id,
                    name=scope.name,
                    position=step,
                )
            )

    db.flush()


def sync_frameworks(
    db: Session, directory: Path = COMPETENCY_DEFINITIONS_DIR
) -> FrameworkSyncResult:
    """Read every framework in *directory* into the database.

    Either every new version is written or none is, and the run is
    recorded either way. The caller commits.

    Args:
        db: The core database session.
        directory: A folder of definition files.

    Returns:
        How the run ended.
    """
    run = PassportFrameworkSync(status="running")
    db.add(run)
    db.flush()

    permission_ids = {c.id for c in COMPETENCIES if c.framework_id is None}
    written = 0

    try:
        with db.begin_nested():
            entries, frameworks = _load_catalogue(directory)

            for framework in frameworks:
                items = [e for e in entries if e.framework_id == framework.id]

                if _check(db, framework, items, permission_ids):
                    _write(db, framework, items)
                    written += 1
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


def main(argv: list[str] | None = None) -> int:
    """CLI entry point: sync, commit, and say what happened."""
    from app.db.core_db import CoreSessionLocal

    args = argv if argv is not None else sys.argv[1:]
    directory = Path(args[0]) if args else COMPETENCY_DEFINITIONS_DIR

    with CoreSessionLocal() as db:
        result = sync_frameworks(db, directory)
        # Its own session, so nothing else commits for it.
        db.commit()

    if not result.succeeded:
        print(f"Framework sync failed: {result.error}")
        return 1

    print(f"Framework sync: {result.versions_written} version(s) written.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
