# backend/app/cbac/competencies.py
"""Competency definitions loaded from YAML.

This module loads and validates competency definitions from the shared/competencies.yaml
file, providing type-safe access to competency IDs and metadata.
"""

from collections.abc import Iterable
from enum import Enum
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict

from app.paths import SHARED_DIR


class CompetencyEntry(BaseModel):
    """A single competency definition, validated from YAML."""

    model_config = ConfigDict(extra="forbid")

    id: str
    display_name: str


# Load competencies from YAML
COMPETENCIES_YAML_PATH: Path = SHARED_DIR / "competencies.yaml"

with open(COMPETENCIES_YAML_PATH) as f:
    COMPETENCIES_DATA: Any = yaml.safe_load(f)

COMPETENCIES: list[CompetencyEntry] = [
    CompetencyEntry(**c) for c in COMPETENCIES_DATA["competencies"]
]

# Extract competency IDs
COMPETENCY_IDS: tuple[str, ...] = tuple(c.id for c in COMPETENCIES)

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
    """Return the ids that are not in the catalogue.

    A competency id is a bare string in three unconnected places — this
    catalogue, the JSON columns on ``users``, and ``practising_competency``
    — with no foreign key between them. Nothing reports a misspelt one, so
    it silently becomes a competency nobody holds. This is the check that
    every write boundary uses.

    Args:
        ids: Competency ids to check.

    Returns:
        The unrecognised ids, sorted and deduplicated. Empty when all are
        known.
    """
    known = set(COMPETENCY_IDS)
    return sorted({i for i in ids if i not in known})


def validate_competency_ids(ids: Iterable[str]) -> list[str]:
    """Return the ids unchanged, or raise naming the unrecognised ones.

    Args:
        ids: Competency ids to validate.

    Returns:
        The same ids, as a list.

    Raises:
        ValueError: If any id is not in the catalogue. The message names
            them, so a typo is reported where it was made rather than
            discovered later as a missing permission.
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
    return checked
