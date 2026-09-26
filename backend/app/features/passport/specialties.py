"""Passport specialties: which competencies to list first, and in what order.

A holder chooses a specialty, or none, and the competency picker lists that
specialty's common competencies above every other one. It orders a list and
does nothing else: it hides nothing, requires nothing and judges nothing, so
an oncologist can still log a chest drain.

One file per specialty in ``shared/passport-specialties/``. The specialty
names its competencies, rather than each competency naming its specialties,
so the shared catalogue stays the same thing for CBAC and the passport, and a
list can put ``prescribe_sact`` above ``assess_sact_toxicity``, which a tag on
each competency could not.

A bad list stops the application starting, rather than failing when somebody
opens the picker. See ``docs/docs/plans/2026-09-26-passport-specialties-plan.md``.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict

from app.cbac.competencies import (
    ASSESSABLE_COMPETENCY_IDS,
    COMPETENCY_IDS,
    RETIRED_COMPETENCY_IDS,
)
from app.paths import SHARED_DIR

SPECIALTIES_DIR: Path = SHARED_DIR / "passport-specialties"


class Specialty(BaseModel):
    """One specialty's file, validated.

    Attributes:
        id: Stable identifier, stored in a holder's ``profile.yaml``.
        display_name: What a holder sees when choosing.
        common_competencies: Competency ids to list first, in this order.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str
    display_name: str
    common_competencies: tuple[str, ...]


def _problems(specialty: Specialty, filename: str) -> list[str]:
    """Everything wrong with one specialty's list, worded to be fixed.

    Args:
        specialty: The parsed file.
        filename: Its name, for the messages.

    Returns:
        One message per problem, or an empty list.
    """
    problems: list[str] = []

    if filename != f"{specialty.id}.yaml":
        problems.append(
            f"{filename} holds id {specialty.id!r}; the filename must "
            f"be {specialty.id}.yaml."
        )

    seen: set[str] = set()
    for competency_id in specialty.common_competencies:
        if competency_id in seen:
            problems.append(f"{filename} lists {competency_id!r} twice.")
        seen.add(competency_id)

        if competency_id not in COMPETENCY_IDS:
            problems.append(
                f"{filename} lists {competency_id!r}, which is not in "
                "shared/competency-definitions/."
            )
        elif competency_id in RETIRED_COMPETENCY_IDS:
            problems.append(
                f"{filename} lists {competency_id!r}, which is retired."
            )
        elif competency_id not in ASSESSABLE_COMPETENCY_IDS:
            problems.append(
                f"{filename} lists {competency_id!r}, which is not marked "
                "assessable: true."
            )

    return problems


def load_specialties(directory: Path) -> tuple[Specialty, ...]:
    """Read and check every specialty file in *directory*.

    Args:
        directory: The directory holding one YAML file per specialty.

    Returns:
        Every specialty, in filename order.

    Raises:
        FileNotFoundError: If the directory holds no specialty files, which
            means a missing mount or a bad path rather than no specialties.
        ValueError: Naming every problem found, across every file, so one
            run shows all of them rather than the first.
    """
    # Sorted so the order is the same on every machine, and matches the
    # frontend's generated copy.
    paths = sorted(directory.glob("*.yaml"))
    if not paths:
        raise FileNotFoundError(
            f"No passport specialties found in {directory}. Expected at "
            "least one *.yaml file."
        )

    specialties: list[Specialty] = []
    problems: list[str] = []
    seen: dict[str, str] = {}

    for path in paths:
        with open(path) as f:
            data: Any = yaml.safe_load(f)

        specialty = Specialty(**data)

        if specialty.id in seen:
            problems.append(
                f"Specialty id {specialty.id!r} is in both "
                f"{seen[specialty.id]} and {path.name}."
            )
        seen[specialty.id] = path.name

        problems.extend(_problems(specialty, path.name))
        specialties.append(specialty)

    if problems:
        raise ValueError(
            "Passport specialties are invalid:\n- " + "\n- ".join(problems)
        )

    return tuple(specialties)


SPECIALTIES: tuple[Specialty, ...] = load_specialties(SPECIALTIES_DIR)

SPECIALTY_IDS: tuple[str, ...] = tuple(s.id for s in SPECIALTIES)


def get_specialty(specialty_id: str) -> Specialty | None:
    """The specialty with this id, or None if there is no such file.

    Args:
        specialty_id: The id, as stored in a holder's profile.

    Returns:
        Its definition, or None. A profile naming a specialty since
        removed stays readable; it simply orders nothing.
    """
    for specialty in SPECIALTIES:
        if specialty.id == specialty_id:
            return specialty
    return None
