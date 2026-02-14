# backend/app/cbac/base_professions.py
"""Base profession definitions loaded from YAML.

Provides templates for common healthcare professions with their standard
competency sets, which can be customised per-user.
"""

from pathlib import Path
from typing import Literal

import yaml

# Load base professions from YAML
BASE_PROFESSIONS_YAML_PATH = (
    Path(__file__).parent.parent.parent.parent
    / "shared"
    / "base-professions.yaml"
)

with open(BASE_PROFESSIONS_YAML_PATH) as f:
    BASE_PROFESSIONS_DATA = yaml.safe_load(f)

# Extract profession IDs
PROFESSION_IDS = tuple(
    p["id"] for p in BASE_PROFESSIONS_DATA["base_professions"]
)

# Create Literal type
BaseProfessionId = Literal[PROFESSION_IDS]  # type: ignore[valid-type]


def get_profession_details(profession_id: str) -> dict | None:
    """Get full details of a base profession by ID."""
    for profession in BASE_PROFESSIONS_DATA["base_professions"]:
        if profession["id"] == profession_id:
            return profession
    return None


def get_profession_base_competencies(profession_id: str) -> list[str]:
    """Get the base competencies for a profession."""
    details = get_profession_details(profession_id)
    return details.get("base_competencies", []) if details else []


def resolve_user_competencies(
    base_profession: str,
    additional_competencies: list[str] | None = None,
    removed_competencies: list[str] | None = None,
) -> list[str]:
    """Resolve final competencies for a user.

    Args:
        base_profession: The user's base profession ID
        additional_competencies: Extra competencies added to this user
        removed_competencies: Competencies removed from this user

    Returns:
        List of final competency IDs for this user
    """
    base = set(get_profession_base_competencies(base_profession))
    additional = set(additional_competencies or [])
    removed = set(removed_competencies or [])

    final = (base | additional) - removed
    return list(final)
