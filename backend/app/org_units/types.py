# backend/app/org_units/types.py
"""What kinds of org_unit there are, and what each kind may hold.

Read from ``shared/org-unit-types.yaml`` at import, the same way base
professions and competencies are read, so the vocabulary is one file rather
than a list repeated at every place that validates it.

Nothing here enforces anything yet. The flags are read by the tree rules as
they are written; until then this module answers questions and validates a
type name, and changes no behaviour.
"""

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict

from app.paths import SHARED_DIR

#: The type of a node at the top of a tree. Named here rather than spelled
#: as a literal at each use: root resolution, the organisations list and the
#: migration that creates the roots all have to agree, and a typo in any of
#: them would produce an org_unit nothing ever finds.
ORGANISATION_TYPE: str = "organisation"


class OrgUnitTypeEntry(BaseModel):
    """One kind of org_unit, and what a node of that kind may hold.

    ``extra="forbid"`` so a misspelt flag in the YAML fails at import
    rather than silently reading as its default. A capability that
    defaults quietly to False locks people out; one that defaults quietly
    to True hands out authority nobody granted.

    Attributes:
        id: The value stored in the ``type`` column.
        display_name: What a person is shown.
        description: What this kind of place is, in a sentence.
        requires_parent: Whether a node of this type must sit under
            another. False only for the top of a tree.
        can_hold_features: Whether features may be enabled here.
        can_hold_positions: Whether a post — clinical lead among them —
            may be held here.
        can_hold_competencies: Whether practice may be authorised here.
        can_have_members: Whether a person may belong here.
    """

    model_config = ConfigDict(extra="forbid")

    id: str
    display_name: str
    description: str
    requires_parent: bool
    can_hold_features: bool
    can_hold_positions: bool
    can_hold_competencies: bool
    can_have_members: bool


ORG_UNIT_TYPES_YAML_PATH: Path = SHARED_DIR / "org-unit-types.yaml"


def _load_org_unit_types(path: Path) -> list[OrgUnitTypeEntry]:
    """Read every org_unit type definition from *path*.

    Args:
        path: The YAML file holding the definitions.

    Returns:
        Every type defined in the file, in the order it declares them.

    Raises:
        ValueError: If the file declares no types, or declares one id
            twice. A duplicate id makes which definition applies depend on
            file order, and the definitions carry capability flags, so the
            wrong one silently changes what a place may hold.
    """
    with open(path) as f:
        data: Any = yaml.safe_load(f)

    raw_entries = (data or {}).get("org_unit_types")
    if not raw_entries:
        raise ValueError(
            f"No org_unit types defined in {path}. Expected at least one "
            "entry under 'org_unit_types'."
        )

    entries: list[OrgUnitTypeEntry] = []
    seen: set[str] = set()
    for raw in raw_entries:
        entry = OrgUnitTypeEntry(**raw)
        if entry.id in seen:
            raise ValueError(
                f"Duplicate org_unit type id {entry.id!r} in {path.name}. "
                "Ids must be unique."
            )
        seen.add(entry.id)
        entries.append(entry)

    return entries


ORG_UNIT_TYPES: list[OrgUnitTypeEntry] = _load_org_unit_types(
    ORG_UNIT_TYPES_YAML_PATH
)

#: Every known type id, in declaration order.
ORG_UNIT_TYPE_IDS: tuple[str, ...] = tuple(t.id for t in ORG_UNIT_TYPES)

#: The kinds that stand at the top of a tree — the organisations.
#:
#: Read from the flag rather than compared against one name, because
#: there is more than one kind of organisation: a GP practice and a
#: teaching establishment are both tops of trees. A query asking for the
#: places *inside* organisations excludes all of these, and asking it any
#: other way quietly loses a kind the day another is added.
ROOT_TYPE_IDS: frozenset[str] = frozenset(
    t.id for t in ORG_UNIT_TYPES if not t.requires_parent
)

_BY_ID: dict[str, OrgUnitTypeEntry] = {t.id: t for t in ORG_UNIT_TYPES}


def get_org_unit_type(type_id: str) -> OrgUnitTypeEntry | None:
    """Return the definition of *type_id*, or None if it is not known.

    Args:
        type_id: The value from an org_unit's ``type`` column.

    Returns:
        The matching definition, or None.
    """
    return _BY_ID.get(type_id)


def validate_org_unit_type(value: str) -> str:
    """Return the type unchanged, or raise naming the known ones.

    Validated in code rather than as a database enum, so adding a type
    needs no migration — the same choice ``MEMBER_CAPACITIES`` made.

    Args:
        value: The type to check.

    Returns:
        The same value.

    Raises:
        ValueError: If it is not a known org_unit type.
    """
    if value not in _BY_ID:
        raise ValueError(
            f"Unknown org_unit type: {value}. Known types are "
            + ", ".join(ORG_UNIT_TYPE_IDS)
            + "."
        )
    return value


def _capability(type_id: str, flag: str) -> bool:
    """Return one capability flag of *type_id*.

    Raises rather than returning False for an unknown type. False would
    read as a settled answer — "this place may not hold positions" —
    when in truth nothing is known about the place at all, and a caller
    acting on it would refuse legitimate work without saying why.

    Args:
        type_id: The value from an org_unit's ``type`` column.
        flag: The attribute name on ``OrgUnitTypeEntry``.

    Returns:
        The flag's value.

    Raises:
        ValueError: If *type_id* is not a known org_unit type.
    """
    validate_org_unit_type(type_id)
    return bool(getattr(_BY_ID[type_id], flag))


def type_requires_parent(type_id: str) -> bool:
    """Whether a node of this type must sit under another org_unit."""
    return _capability(type_id, "requires_parent")


def type_can_hold_features(type_id: str) -> bool:
    """Whether features may be enabled on a node of this type."""
    return _capability(type_id, "can_hold_features")


def type_can_hold_positions(type_id: str) -> bool:
    """Whether a post may be held at a node of this type."""
    return _capability(type_id, "can_hold_positions")


def type_can_hold_competencies(type_id: str) -> bool:
    """Whether practice may be authorised at a node of this type."""
    return _capability(type_id, "can_hold_competencies")


def type_can_have_members(type_id: str) -> bool:
    """Whether a person may belong to a node of this type."""
    return _capability(type_id, "can_have_members")
