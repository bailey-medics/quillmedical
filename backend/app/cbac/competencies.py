# backend/app/cbac/competencies.py
"""Competency definitions loaded from YAML.

This module loads and validates competency definitions from the shared/competencies.yaml
file, providing type-safe access to competency IDs and metadata.
"""

from collections.abc import Iterable
from datetime import date
from enum import Enum
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict

from app.paths import SHARED_DIR


class CompetencyEntry(BaseModel):
    """A single competency definition, validated from YAML.

    Attributes:
        id: The competency id, used everywhere a competency is referenced.
        display_name: Human-readable name.
        retired_on: The date this competency stopped being available for new
            use, or None while it is current. Entries are retired rather
            than deleted — see ``retired_on`` handling below and
            ``docs/docs/plans/2026-09-06-org-scoped-access-findings.md``.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    display_name: str
    retired_on: date | None = None


# Load competencies from YAML
COMPETENCIES_YAML_PATH: Path = SHARED_DIR / "competencies.yaml"

with open(COMPETENCIES_YAML_PATH) as f:
    COMPETENCIES_DATA: Any = yaml.safe_load(f)

COMPETENCIES: list[CompetencyEntry] = [
    CompetencyEntry(**c) for c in COMPETENCIES_DATA["competencies"]
]

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
            + ". Competencies are defined in shared/competencies.yaml."
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
