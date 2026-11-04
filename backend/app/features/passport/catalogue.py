"""The frameworks as the tables hold them, newest version of each.

The framework sync is the only writer of the framework tables. This is
how the rest of the backend will read them, in place of the catalogue
:mod:`app.cbac.competencies` loads from files at start-up, once the
frameworks no longer live in this repository. See Phase 7 of
docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md.

**It gives back the loader's own shapes.** Each framework is a
:class:`~app.cbac.competencies.Framework` and each competency a
:class:`~app.cbac.competencies.CompetencyEntry`, built from the newest
stored version, so code that reads them does not change shape when its
source does.

**It reads each table once.** Five queries for the whole catalogue, not
one for each competency, because every passport page reads it.

**It caches what it read, and checks the cache is current on every
read.** The key is the newest version row's id. A new version always
takes a higher id, so when the sync job stores one between deploys the
next read sees the change and loads again. Checking costs one query on
an indexed column.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.cbac.competencies import (
    CompetencyEntry,
    CompetencyLevel,
    CompetencyScope,
    Framework,
)

from .models import (
    PassportFrameworkCompetency,
    PassportFrameworkLevel,
    PassportFrameworkScope,
    PassportFrameworkSpecialty,
    PassportFrameworkVersion,
)


@dataclass(frozen=True)
class StoredCatalogue:
    """The newest version of every stored framework.

    Attributes:
        frameworks: Each framework, by id, in name order.
        competencies: Each framework's competencies, by framework id, in
            the order its file lists them.
        entries: Every competency, by its id, for a lookup by id alone.
    """

    frameworks: dict[str, Framework] = field(default_factory=dict)
    competencies: dict[str, list[CompetencyEntry]] = field(
        default_factory=dict
    )
    entries: dict[str, CompetencyEntry] = field(default_factory=dict)


#: What was read last, and the newest version row's id when it was read.
_cache: tuple[int, StoredCatalogue] | None = None


def clear_cache() -> None:
    """Forget what was read, so the next read loads the tables again.

    For tests, where each test has a database of its own and a new one
    can hold the same newest id as the last.
    """
    global _cache

    _cache = None


def stored_catalogue(db: Session) -> StoredCatalogue:
    """The newest version of every stored framework.

    Args:
        db: The core database session.

    Returns:
        The catalogue, empty where nothing has been synced yet.
    """
    global _cache

    newest = db.scalar(select(func.max(PassportFrameworkVersion.id)))

    if newest is None:
        return StoredCatalogue()

    if _cache is not None and _cache[0] == newest:
        return _cache[1]

    catalogue = _load(db)
    _cache = (newest, catalogue)

    return catalogue


def _load(db: Session) -> StoredCatalogue:
    """Read the newest version of every framework, one query a table."""
    newest_of_each = (
        select(
            PassportFrameworkVersion.framework_id,
            func.max(PassportFrameworkVersion.version).label("version"),
        )
        .group_by(PassportFrameworkVersion.framework_id)
        .subquery()
    )

    versions = db.scalars(
        select(PassportFrameworkVersion).join(
            newest_of_each,
            (
                PassportFrameworkVersion.framework_id
                == newest_of_each.c.framework_id
            )
            & (PassportFrameworkVersion.version == newest_of_each.c.version),
        )
    ).all()

    version_ids = [row.id for row in versions]

    specialties: dict[int, list[str]] = defaultdict(list)
    for specialty in db.scalars(
        select(PassportFrameworkSpecialty)
        .where(PassportFrameworkSpecialty.version_row_id.in_(version_ids))
        .order_by(PassportFrameworkSpecialty.position)
    ):
        specialties[specialty.version_row_id].append(specialty.specialty_id)

    competency_rows = db.scalars(
        select(PassportFrameworkCompetency)
        .where(PassportFrameworkCompetency.version_row_id.in_(version_ids))
        .order_by(PassportFrameworkCompetency.position)
    ).all()
    competency_ids = [row.id for row in competency_rows]

    levels: dict[int, list[CompetencyLevel]] = defaultdict(list)
    for level in db.scalars(
        select(PassportFrameworkLevel)
        .where(PassportFrameworkLevel.competency_row_id.in_(competency_ids))
        .order_by(PassportFrameworkLevel.position)
    ):
        levels[level.competency_row_id].append(
            CompetencyLevel(id=level.level_id, name=level.name)
        )

    scopes: dict[int, list[CompetencyScope]] = defaultdict(list)
    for scope in db.scalars(
        select(PassportFrameworkScope)
        .where(PassportFrameworkScope.competency_row_id.in_(competency_ids))
        .order_by(PassportFrameworkScope.position)
    ):
        scopes[scope.competency_row_id].append(
            CompetencyScope(id=scope.scope_id, name=scope.name)
        )

    framework_of = {row.id: row.framework_id for row in versions}
    competencies: dict[str, list[CompetencyEntry]] = defaultdict(list)

    for competency in competency_rows:
        framework_id = framework_of[competency.version_row_id]
        competencies[framework_id].append(
            CompetencyEntry(
                id=competency.competency_id,
                display_name=competency.display_name,
                retired_on=competency.retired_on,
                retired_in_version=competency.retired_in_version,
                levels=levels.get(competency.id),
                scopes=scopes.get(competency.id),
                expires_after_months=competency.expires_after_months,
                # Every framework competency is assessable: that is what
                # the loader refuses otherwise, and what a framework is.
                assessable=True,
                framework_id=framework_id,
            )
        )

    frameworks = {
        row.framework_id: Framework(
            id=row.framework_id,
            name=row.name,
            publisher=row.publisher,
            version=row.version,
            description=row.description,
            specialties=specialties.get(row.id, []),
        )
        for row in sorted(versions, key=lambda r: r.name.casefold())
    }

    return StoredCatalogue(
        frameworks=frameworks,
        competencies=dict(competencies),
        entries={
            entry.id: entry
            for entries in competencies.values()
            for entry in entries
        },
    )
