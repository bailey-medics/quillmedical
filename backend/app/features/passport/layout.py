"""Finding a competency's folder in a passport, by looking.

:mod:`.paths` builds every path and does no I/O, so it is told which
framework folder a competency is in. This module finds out. A record is
read from wherever it was written: the store looks for
``frameworks/*/<competency>/``. Only a competency with no folder yet is
placed by the stored frameworks, under the framework it belongs to now,
and only by a write that is given them: the two that can file a first
record, a sign-off request and a logbook entry. A read is never given
them, because a competency with no folder has nothing to read, and says
so by raising :class:`~.paths.PassportPathError`, which every read
already treats as an empty list.

With every framework's ids carrying the framework's prefix, a competency
cannot change framework, so the looking is a safeguard rather than an
expected case: a record stays readable even if the catalogue were ever
to disagree with where it was filed.
"""

from __future__ import annotations

from pathlib import PurePosixPath
from typing import TYPE_CHECKING

import yaml

from . import paths
from .schemas import SCHEMA_VERSION
from .store import PassportNotFoundError, PassportStore

if TYPE_CHECKING:
    # A type only. The catalogue module reads the database, and this one
    # must import nothing that does: tests/features_import_boundary_test.py.
    from .catalogue import StoredCatalogue


class NothingFiledError(paths.PassportPathError, PassportNotFoundError):
    """A competency has no record in this passport, so nothing to find.

    Raised for a read, or a change to a record, of a competency filed
    nowhere: there is no folder to look in, and nothing has been given
    the stored frameworks to place one. Both kinds of error, so a read
    that lists a competency's records treats it as an empty list, as it
    treats a malformed id, and a lookup of one record treats it as not
    found, as it would a missing file.
    """


class OutdatedPassportError(PassportNotFoundError):
    """A passport written in a layout this code no longer reads.

    A not-found, so every route already answering 404 for a missing
    passport answers the same here, rather than listing an old passport's
    records as if it had none.
    """


def require_current(store: PassportStore, passport_id: str) -> None:
    """Refuse a passport whose manifest names an older schema version.

    Reads ``schema_version`` alone, so a passport whose manifest names
    none, or that has no manifest, is let through: only a test builds
    one. The full manifest is validated where it is written.

    Raises:
        OutdatedPassportError: If its ``schema_version`` is below
            :data:`SCHEMA_VERSION`.
    """
    try:
        raw = store.read(passport_id, paths.MANIFEST)
    except PassportNotFoundError:
        return

    data = yaml.safe_load(raw)
    version = data.get("schema_version") if isinstance(data, dict) else None

    if isinstance(version, int) and version < SCHEMA_VERSION:
        raise OutdatedPassportError(
            f"Passport {passport_id} is at schema version {version}; this "
            f"code reads {SCHEMA_VERSION}. No passport was moved between "
            "them."
        )


def _filed_under(
    store: PassportStore, passport_id: str, competency: str
) -> str | None:
    """The framework folder already holding *competency*, or None."""
    paths.competency_id(competency)

    for framework_dir in store.list_dir(passport_id, paths.FRAMEWORKS):
        for entry in store.list_dir(passport_id, framework_dir):
            if entry.name == competency:
                return framework_dir.name

    return None


def framework_for(
    store: PassportStore,
    passport_id: str,
    competency: str,
    catalogue: StoredCatalogue | None = None,
) -> str:
    """The framework folder a competency's records belong in.

    The folder it is already filed under, or, for its first record, the
    framework the stored frameworks put it in.

    Args:
        store: Where the passport lives.
        passport_id: Whose passport.
        competency: The competency id.
        catalogue: The stored frameworks, for a write that may file the
            competency's first record. A read passes none.

    Returns:
        The framework id to use as its folder.

    Raises:
        PassportPathError: If the id is malformed, or it is filed nowhere
            and either no catalogue was given or it belongs to no
            framework, so nothing could be recorded against it.
    """
    filed = _filed_under(store, passport_id, competency)

    if filed is not None:
        return filed

    if catalogue is None:
        raise NothingFiledError(
            f"Competency {competency!r} has no record in this passport."
        )

    entry = catalogue.entries.get(competency)

    if entry is None or entry.framework_id is None:
        raise paths.PassportPathError(
            f"Competency {competency!r} belongs to no framework, so a "
            "passport has nowhere to file a record against it."
        )

    return entry.framework_id


def sign_off_dir(
    store: PassportStore,
    passport_id: str,
    sign_off: str,
    catalogue: StoredCatalogue | None = None,
) -> PurePosixPath:
    """The directory holding one sign-off, found by its id.

    *catalogue* places a competency's first sign-off: see
    :func:`framework_for`.
    """
    competency, _ = paths.split_sign_off_id(sign_off)

    return paths.sign_off_dir(
        framework_for(store, passport_id, competency, catalogue), sign_off
    )


def sign_off_file(
    store: PassportStore,
    passport_id: str,
    sign_off: str,
    catalogue: StoredCatalogue | None = None,
) -> PurePosixPath:
    """A sign-off's record file, found by its id."""
    return (
        sign_off_dir(store, passport_id, sign_off, catalogue)
        / paths.SIGN_OFF_FILE
    )


def sign_off_reflection(
    store: PassportStore,
    passport_id: str,
    sign_off: str,
    catalogue: StoredCatalogue | None = None,
) -> PurePosixPath:
    """The holder's narrative beside a sign-off, found by its id."""
    return (
        sign_off_dir(store, passport_id, sign_off, catalogue)
        / paths.REFLECTION_FILE
    )


def sign_off_assessment(
    store: PassportStore, passport_id: str, sign_off: str
) -> PurePosixPath:
    """The assessor's narrative beside a sign-off, found by its id."""
    return sign_off_dir(store, passport_id, sign_off) / paths.ASSESSMENT_FILE


def sign_off_folders(
    store: PassportStore, passport_id: str, competency: str
) -> list[str]:
    """The folder names one competency's sign-offs already use."""
    filed = _filed_under(store, passport_id, competency)

    if filed is None:
        return []

    return [
        entry.name
        for entry in store.list_dir(
            passport_id, paths.sign_offs_dir(filed, competency)
        )
    ]


def sign_off_ids(store: PassportStore, passport_id: str) -> list[str]:
    """Every sign-off in the passport, by id, in path order.

    Raises:
        OutdatedPassportError: If the passport is in an older layout.
    """
    require_current(store, passport_id)

    found: list[str] = []

    for framework_dir in store.list_dir(passport_id, paths.FRAMEWORKS):
        for competency_dir in store.list_dir(passport_id, framework_dir):
            sign_offs = competency_dir / paths.SIGN_OFFS

            for folder in store.list_dir(passport_id, sign_offs):
                try:
                    found.append(
                        paths.sign_off_id(competency_dir.name, folder.name)
                    )
                except paths.PassportPathError:
                    # Not a folder this layout makes, so somebody made it
                    # by hand. Skipped, as the index has always skipped one.
                    continue

    return found


def logbook_dir(
    store: PassportStore,
    passport_id: str,
    competency: str,
    catalogue: StoredCatalogue | None = None,
) -> PurePosixPath:
    """The directory holding one competency's logbook entries.

    *catalogue* places a competency's first entry: see
    :func:`framework_for`.
    """
    return paths.logbook_dir(
        framework_for(store, passport_id, competency, catalogue), competency
    )


def logbook_entry(
    store: PassportStore,
    passport_id: str,
    competency: str,
    filename: str,
    catalogue: StoredCatalogue | None = None,
) -> PurePosixPath:
    """One logbook entry, found by its competency and filename."""
    return paths.logbook_entry(
        framework_for(store, passport_id, competency, catalogue),
        competency,
        filename,
    )


def logbook_dirs(
    store: PassportStore, passport_id: str
) -> list[tuple[str, PurePosixPath]]:
    """Every competency with a logbook folder, and the folder.

    Raises:
        OutdatedPassportError: If the passport is in an older layout.
    """
    require_current(store, passport_id)

    found: list[tuple[str, PurePosixPath]] = []

    for framework_dir in store.list_dir(passport_id, paths.FRAMEWORKS):
        for competency_dir in store.list_dir(passport_id, framework_dir):
            logbook = competency_dir / paths.LOGBOOK

            if store.list_dir(passport_id, logbook):
                found.append((competency_dir.name, logbook))

    return found
