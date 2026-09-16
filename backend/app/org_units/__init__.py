# backend/app/org_units/__init__.py
"""The governance tree: org_units, their types and what each type may hold.

One node of organisational structure, whatever its size. A trust is an
org_unit and so is a ward; what tells them apart is the ``type`` column,
never the node's position in the tree.

**Only the vocabulary is re-exported here.** The tree walks live in
``app.org_units.tree`` and are imported from there directly, because they
read the models and the models read this package — re-exporting them
would make importing either one depend on the other being finished.
"""

from app.org_units.relations import (
    ORG_UNIT_RELATION_IDS,
    ORG_UNIT_RELATIONS,
    OrgUnitRelation,
    get_org_unit_relation,
    relation_grants_reach,
    validate_org_unit_relation,
)
from app.org_units.types import (
    ORG_UNIT_TYPE_IDS,
    ORG_UNIT_TYPES,
    ORGANISATION_TYPE,
    OrgUnitTypeEntry,
    get_org_unit_type,
    type_can_have_members,
    type_can_hold_competencies,
    type_can_hold_features,
    type_can_hold_positions,
    type_requires_parent,
    validate_org_unit_type,
)

__all__ = [
    "ORGANISATION_TYPE",
    "ORG_UNIT_RELATIONS",
    "ORG_UNIT_RELATION_IDS",
    "ORG_UNIT_TYPES",
    "ORG_UNIT_TYPE_IDS",
    "OrgUnitRelation",
    "OrgUnitTypeEntry",
    "get_org_unit_relation",
    "get_org_unit_type",
    "relation_grants_reach",
    "type_can_have_members",
    "type_can_hold_competencies",
    "type_can_hold_features",
    "type_can_hold_positions",
    "type_requires_parent",
    "validate_org_unit_relation",
    "validate_org_unit_type",
]
