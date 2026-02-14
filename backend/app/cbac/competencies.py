# backend/app/cbac/competencies.py
"""Competency definitions loaded from YAML.

This module loads and validates competency definitions from the shared/competencies.yaml
file, providing type-safe access to competency IDs and metadata.
"""

from enum import Enum
from pathlib import Path
from typing import Literal

import yaml

# Load competencies from YAML
COMPETENCIES_YAML_PATH = (
    Path(__file__).parent.parent.parent.parent / "shared" / "competencies.yaml"
)

with open(COMPETENCIES_YAML_PATH) as f:
    COMPETENCIES_DATA = yaml.safe_load(f)

# Extract competency IDs
COMPETENCY_IDS = tuple(c["id"] for c in COMPETENCIES_DATA["competencies"])

# Create Literal type for type hints
CompetencyId = Literal[COMPETENCY_IDS]  # type: ignore[valid-type]

# Create Enum for runtime validation (dynamically loaded from YAML)
ClinicalCompetency = Enum(  # type: ignore[misc]
    "ClinicalCompetency",
    {c["id"].upper(): c["id"] for c in COMPETENCIES_DATA["competencies"]},
)


def get_competency_details(competency_id: str) -> dict | None:
    """Get full details of a competency by ID."""
    for competency in COMPETENCIES_DATA["competencies"]:
        if competency["id"] == competency_id:
            return competency
    return None


def is_valid_competency(competency_id: str) -> bool:
    """Check if a competency ID is valid."""
    return competency_id in COMPETENCY_IDS


def get_competency_risk_level(competency_id: str) -> str:
    """Get risk level of a competency (low, medium, high)."""
    details = get_competency_details(competency_id)
    return details.get("risk_level", "low") if details else "low"
