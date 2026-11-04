"""What the exports call a framework and a sign-off, as the page does.

A sign-off keeps the words it was signed under. The page shows the
framework's words today, then what the sign-off recorded where the two
differ, and the exports say the same, so a passport reads alike on screen
and on paper. See Phase 12 of
docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md.

Takes the stored frameworks as an argument, and imports nothing that
reads the database, so the exports stay free of it. Without them, an
export prints what the record stored, as it always did.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from .schemas import FrameworkRef, SignOff, name_with_scope

if TYPE_CHECKING:
    # A type only. The catalogue module reads the database.
    from .catalogue import StoredCatalogue


def framework_name(
    catalogue: StoredCatalogue | None, framework: FrameworkRef
) -> str:
    """A framework's name today, or the one stored where Quill has none."""
    if catalogue is None:
        return framework.name

    held = catalogue.frameworks.get(framework.id)

    return held.name if held is not None else framework.name


def sign_off_heading(
    catalogue: StoredCatalogue | None, record: SignOff
) -> tuple[str, str | None]:
    """A sign-off's heading, and what it was signed as where that differs.

    Returns:
        The competency's name today, with its scope, then the name the
        sign-off recorded, with its scope, or None where the two match.
    """
    stored = name_with_scope(record.competency.name, record.scope)
    entry = (
        catalogue.entries.get(record.competency.id)
        if catalogue is not None
        else None
    )

    if entry is None or entry.display_name == record.competency.name:
        return stored, None

    return name_with_scope(entry.display_name, record.scope), stored


def version_note(record: SignOff) -> str:
    """Which version of its framework a sign-off was given under."""
    return f"Framework version: {record.framework_version}"
