# backend/app/cbac/base_professions.py
"""Base profession definitions loaded from YAML.

Provides templates for common healthcare professions with their standard
competency sets, which can be customised per-user.
"""

from pathlib import Path
from typing import TYPE_CHECKING, Any

import yaml
from pydantic import BaseModel, ConfigDict

from app.paths import SHARED_DIR

# For the type checker only. `app.models` imports this module, so importing
# `User` when the program runs would make the two wait on each other.
if TYPE_CHECKING:
    from app.models import User


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


def grant_competencies_on_joining(
    user: "User",
    base_profession: str | None,
    additional_competencies: list[str] | None,
) -> list[str]:
    """Grant a profession and competencies to somebody joining an org_unit.

    Called when a person is added to an org_unit, in any capacity: staff,
    trainee, external or patient. Adding somebody and then separately
    remembering to give them competencies is two steps that can be
    half-done, and the half-done state is a new starter who can reach
    nothing. The route asks for the grant in the same request as the
    membership, and it lands here.

    **Additive, not replacing** - the same rule a profession change
    follows on ``update_user``. Whatever the person already held is
    carried into what they hold beyond their profession before the new
    profession is written, minus anything the new profession grants
    anyway, so nothing is lost and nothing is recorded twice. A patient
    becoming a healthcare assistant keeps ``access_own_patient_records``
    for their own record, which a replacing grant would take away on
    their first day at work.

    Both arguments are optional and either may be given alone. Somebody
    already staff elsewhere needs no grant, and passing neither leaves
    the user untouched.

    Args:
        user: The ``User`` being added. Their profession is
            changed in place; their competency rows are the caller's to
            write, from what this returns. The caller commits.
        base_profession: Profession to move them to, or None to leave
            their profession alone.
        additional_competencies: Competencies to grant on top, or None.

    Returns:
        The competencies they should hold beyond the template of the
        profession they now have. A comparison, not stored state: what
        somebody holds is their ``user_competency`` rows, and the caller
        passes this list to ``sync_competency_rows`` to write them.
    """
    # Started from the person's current rows. The caller brings the rows
    # into line with what this returns.
    granted = set(user.additional_competency_ids)

    if base_profession is not None:
        carried_over = set(
            get_profession_base_competencies(user.base_profession)
        )
        user.base_profession = base_profession
        if carried_over:
            granted.update(carried_over)
            granted.difference_update(
                get_profession_base_competencies(base_profession)
            )

    if additional_competencies:
        granted.update(additional_competencies)

    return sorted(granted)


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
