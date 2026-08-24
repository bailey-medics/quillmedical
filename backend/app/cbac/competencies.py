# backend/app/cbac/competencies.py
"""Competency definitions loaded from YAML.

This module loads and validates competency definitions from the shared/competencies.yaml
file, providing type-safe access to competency IDs and metadata.
"""

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
