# backend/app/cbac/competencies.py
"""Competency definitions loaded from YAML.

This module loads and validates competency definitions from the
shared/competency-definitions/ directory, merging every file in it into
one catalogue and providing type-safe access to competency IDs and
metadata.
"""

from collections.abc import Iterable
from datetime import date
from enum import Enum
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict

from app.paths import SHARED_DIR


class CompetencyLevel(BaseModel):
    """One step on a competency's scale.

    Levels are words rather than numbers, and their order is the order
    they are listed in. ``level-3`` needs a lookup table to mean
    anything, and every stored record becomes wrong the moment a scale
    gains or loses a step; "Entrusted to act unsupervised" explains
    itself and survives the scale changing around it.

    The names come from whichever national framework defines the
    competency — the RCR entrustment scale, the UK SACT Board's four
    levels — and are quoted rather than harmonised, so a sign-off means
    what the framework says it means.

    Attributes:
        id: Stable identifier for this level, referenced by a sign-off.
        name: The framework's own wording, shown to a reader.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str


class CompetencyEntry(BaseModel):
    """A single competency definition, validated from YAML.

    Attributes:
        id: The competency id, used everywhere a competency is referenced.
        display_name: Human-readable name.
        retired_on: The date this competency stopped being available for new
            use, or None while it is current. Entries are retired rather
            than deleted — see ``retired_on`` handling below and
            ``docs/docs/plans/2026-09-06-org-scoped-access-findings.md``.
        levels: The scale this competency is signed off against, in
            order, or None where the honest answer is simply signed off
            or not. Declared per competency because the number of levels
            genuinely differs: cannulation is signed off or it is not,
            while prescribing SACT has real intermediate states. Used by
            the clinician passport; CBAC ignores it entirely, since
            holding a competency is a yes or no question.
        expires_after_months: How long a sign-off stands before it wants
            revisiting, or None where nothing expires. Recorded and
            shown; nothing acts on it, because what a lapsed sign-off
            implies is a clinical decision rather than a technical one.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    display_name: str
    retired_on: date | None = None
    levels: list[CompetencyLevel] | None = None
    expires_after_months: int | None = None


# Load competencies from every YAML file in the definitions directory.
#
# A directory rather than one file, so the catalogue can be split by kind
# — clinical.yaml describes what may be done to a patient, and
# feature-admin.yaml what may be done to Quill — and split further later
# without touching this loader. Which file an entry lives in carries no
# meaning here: the files are merged into one flat catalogue and the id
# is what everything references.
COMPETENCY_DEFINITIONS_DIR: Path = SHARED_DIR / "competency-definitions"


def _load_competencies(directory: Path) -> list[CompetencyEntry]:
    """Read and merge every competency definition file in *directory*.

    Args:
        directory: The directory holding the definition files.

    Returns:
        Every competency defined across the directory, in filename order.

    Raises:
        FileNotFoundError: If the directory holds no definition files at
            all, which means a missing mount or a bad path rather than an
            empty catalogue.
        ValueError: If an id is defined in more than one place. Ids are
            referenced from stored records, so a duplicate makes which
            definition applies depend on filename order.
    """
    # Sorted so the merged order is the same on every machine, whatever
    # order the filesystem hands the entries back in.
    paths = sorted(directory.glob("*.yaml"))
    if not paths:
        raise FileNotFoundError(
            f"No competency definitions found in {directory}. Expected at "
            "least one *.yaml file."
        )

    entries: list[CompetencyEntry] = []
    seen: dict[str, Path] = {}
    for path in paths:
        with open(path) as f:
            data: Any = yaml.safe_load(f)

        for raw in data["competencies"]:
            entry = CompetencyEntry(**raw)

            # A sign-off stores the level id, so two levels sharing one
            # would make a stored record ambiguous about which step of
            # the scale was reached.
            if entry.levels is not None:
                level_ids = [lvl.id for lvl in entry.levels]
                if len(set(level_ids)) != len(level_ids):
                    raise ValueError(
                        f"Competency {entry.id!r} in {path.name} has "
                        "duplicate level ids: "
                        + ", ".join(sorted(level_ids))
                        + "."
                    )
                if not level_ids:
                    raise ValueError(
                        f"Competency {entry.id!r} in {path.name} declares "
                        "an empty level list. Omit levels entirely where a "
                        "competency is simply signed off or not."
                    )

            if entry.id in seen:
                raise ValueError(
                    f"Duplicate competency id {entry.id!r}: defined in "
                    f"{seen[entry.id].name} and {path.name}. Ids must be "
                    "unique across the whole directory."
                )
            seen[entry.id] = path
            entries.append(entry)

    return entries


COMPETENCIES: list[CompetencyEntry] = _load_competencies(
    COMPETENCY_DEFINITIONS_DIR
)

# Every competency id the catalogue has ever defined, retired ones
# included. Reads and audits use this, so nothing already stored becomes
# unreadable when a competency is retired.
COMPETENCY_IDS: tuple[str, ...] = tuple(c.id for c in COMPETENCIES)

# The ids still available for new use. Write boundaries use this, so a
# retired competency cannot be newly granted.
ACTIVE_COMPETENCY_IDS: tuple[str, ...] = tuple(
    c.id for c in COMPETENCIES if c.retired_on is None
)

RETIRED_COMPETENCY_IDS: tuple[str, ...] = tuple(
    c.id for c in COMPETENCIES if c.retired_on is not None
)

# Create Literal type for type hints
CompetencyId = Literal[COMPETENCY_IDS]  # type: ignore[valid-type]

# Create Enum for runtime validation (dynamically loaded from YAML)
ClinicalCompetency = Enum(  # type: ignore[misc]
    "ClinicalCompetency",
    {c.id.upper(): c.id for c in COMPETENCIES},
)


def get_competency_details(competency_id: str) -> CompetencyEntry | None:
    """Get full details of a competency by ID."""
    for competency in COMPETENCIES:
        if competency.id == competency_id:
            return competency
    return None


def is_valid_competency(competency_id: str) -> bool:
    """Check if a competency ID is valid."""
    return competency_id in COMPETENCY_IDS


def unknown_competency_ids(ids: Iterable[str]) -> list[str]:
    """Return the ids the catalogue has never defined.

    A competency id is a bare string in three unconnected places — this
    catalogue, the JSON columns on ``users``, and ``practising_competency``
    — with no foreign key between them. Nothing reports a misspelt one, so
    it silently becomes a competency nobody holds.

    Retired ids count as known. They were valid when stored, and the record
    of what someone was authorised to do has to stay readable.

    Args:
        ids: Competency ids to check.

    Returns:
        The unrecognised ids, sorted and deduplicated. Empty when all are
        known.
    """
    known = set(COMPETENCY_IDS)
    return sorted({i for i in ids if i not in known})


def retired_competency_ids(ids: Iterable[str]) -> list[str]:
    """Return the ids that exist but are no longer available for new use.

    Args:
        ids: Competency ids to check.

    Returns:
        The retired ids, sorted and deduplicated.
    """
    retired = set(RETIRED_COMPETENCY_IDS)
    return sorted({i for i in ids if i in retired})


def validate_competency_ids(ids: Iterable[str]) -> list[str]:
    """Validate ids at a write boundary, where retired means refused.

    Args:
        ids: Competency ids to validate.

    Returns:
        The same ids, as a list.

    Raises:
        ValueError: If any id is unrecognised, or recognised but retired.
            The two are reported differently: one is a typo, the other is a
            competency that exists and may no longer be newly granted.
    """
    checked = list(ids)

    unknown = unknown_competency_ids(checked)
    if unknown:
        raise ValueError(
            "Unknown competency "
            + ("ids" if len(unknown) > 1 else "id")
            + ": "
            + ", ".join(unknown)
            + ". Competencies are defined in shared/competency-definitions/."
        )

    retired = retired_competency_ids(checked)
    if retired:
        raise ValueError(
            "Retired competency "
            + ("ids" if len(retired) > 1 else "id")
            + ": "
            + ", ".join(retired)
            + ". Retired competencies cannot be newly granted; existing "
            "records keep them."
        )

    return checked
