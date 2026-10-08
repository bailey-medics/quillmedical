"""Base profession definitions loaded from YAML.

Provides templates for common healthcare professions with their standard
competency sets, which can be customised per-user.
"""

from collections.abc import Iterable
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict

from app.paths import SHARED_DIR


class BaseProfessionEntry(BaseModel):
    """A single base profession definition, validated from YAML."""

    model_config = ConfigDict(extra="forbid")

    id: str
    display_name: str
    description: str
    requires_clinical_services: bool
    base_competencies: list[str]


# Load base professions from YAML
BASE_PROFESSIONS_YAML_PATH: Path = SHARED_DIR / "base-professions.yaml"

with open(BASE_PROFESSIONS_YAML_PATH) as f:
    BASE_PROFESSIONS_DATA: Any = yaml.safe_load(f)

BASE_PROFESSIONS: list[BaseProfessionEntry] = [
    BaseProfessionEntry(**p) for p in BASE_PROFESSIONS_DATA["base_professions"]
]

# Extract profession IDs
PROFESSION_IDS: tuple[str, ...] = tuple(p.id for p in BASE_PROFESSIONS)

#: The profession a superadmin is provisioned with. Named here rather
#: than spelled as a literal at each use, because promoting a user to
#: superadmin has to reach for its competencies and a typo would fail
#: silently - an unknown profession resolves to no competencies at all.
SUPERADMIN_PROFESSION: str = "superadmin_profession"


def get_profession_details(profession_id: str) -> BaseProfessionEntry | None:
    """Get full details of a base profession by ID."""
    for profession in BASE_PROFESSIONS:
        if profession.id == profession_id:
            return profession

    return None


def get_profession_base_competencies(profession_id: str) -> list[str]:
    """Get the base competencies for a profession."""
    details = get_profession_details(profession_id)

    return details.base_competencies if details else []


def competencies_kept_across_profession_change(
    additional_competencies: Iterable[str],
    *,
    old_profession: str,
    new_profession: str,
) -> list[str]:
    """What somebody keeps outside their profession when it changes.

    What somebody holds is their ``user_competency`` rows. This list is a
    comparison against the new profession's template, in the form
    ``sync_competency_rows`` takes as ``additional``.

    **A profession change is additive, not replacing.** Whatever the old
    profession gave is carried into the list, minus anything the new
    profession gives anyway, so nothing is lost and nothing is recorded
    twice. A patient becoming a healthcare assistant keeps
    ``access_own_patient_records`` for their own record, which a replacing
    change would take away on their first day at work.

    **Removed competencies are not looked at here.** The whole of the old
    profession is carried, including anything this person had removed, so
    the list is not safe to use on its own: it would hand a removed
    competency back. The caller has to read
    ``User.removed_competency_ids`` before changing the profession, and
    pass it with this list to ``sync_competency_rows``, which takes the
    removals out last.

    Both places a profession changes use this, so the rule is written
    once: adding somebody to an org_unit, and ``update_user``.

    Args:
        additional_competencies: What they hold outside the old
            profession.
        old_profession: The profession they have now.
        new_profession: The profession they are moving to.

    Returns:
        What they should hold outside the new profession, before any
        removals are taken out, sorted so the same input always gives the
        same list.
    """
    kept = set(additional_competencies)
    kept.update(get_profession_base_competencies(old_profession))
    kept.difference_update(get_profession_base_competencies(new_profession))

    return sorted(kept)


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
