# backend/app/org_units/relations.py
"""What one org_unit can be to another, short of owning it.

Ownership is the parent column and nothing else: one parent each, no
cycles, and one answer to every governance question. Everything else — a
medical school teaching on a trust's wards, two trusts running a service
between them — is a typed link, so that a second relationship never turns
into a second owner.

The vocabulary is small and deliberately close to the NHS ODS relationship
codes, which draw the same distinction between being a sub-division of
something and merely being commissioned by it::

    hosts          ~ RE6  is operated by
    teaches_at     ~ RE2  is a sub-division of
    partners_with  ~ RE8  is partner to

**A link never confers membership, and never confers admin rights.** What
each relation may eventually confer is written here, beside the relation,
rather than scattered through the routes that read it.
"""

from typing import NamedTuple


class OrgUnitRelation(NamedTuple):
    """One kind of link between two org_units.

    Attributes:
        id: The value stored in the ``relation`` column.
        display_name: What a person is shown.
        description: What the link means, in a sentence.
        grants_reach: Whether the link is expected to make the target
            reachable from the source — visible, and not anomalous — once
            reach is wired up. Never admin rights, and never membership.
    """

    id: str
    display_name: str
    description: str
    grants_reach: bool


ORG_UNIT_RELATIONS: tuple[OrgUnitRelation, ...] = (
    OrgUnitRelation(
        id="hosts",
        display_name="Hosts",
        description=(
            "The source provides the premises or the service that the "
            "target runs on, without governing it."
        ),
        grants_reach=False,
    ),
    OrgUnitRelation(
        id="teaches_at",
        display_name="Teaches at",
        description=(
            "The source teaches on the target's wards. This is the "
            "relationship a medical school has with a trust, and the "
            "reason it is a link rather than a parent."
        ),
        grants_reach=True,
    ),
    OrgUnitRelation(
        id="partners_with",
        display_name="Partners with",
        description=(
            "The two work together as equals. Neither is above the other, "
            "which is exactly why this cannot be a parent."
        ),
        grants_reach=False,
    ),
    OrgUnitRelation(
        id="shares_service",
        display_name="Shares service",
        description=(
            "The two run one service between them — a shared pathology "
            "laboratory, an out-of-hours rota."
        ),
        grants_reach=False,
    ),
)

#: Every known relation id.
ORG_UNIT_RELATION_IDS: tuple[str, ...] = tuple(
    r.id for r in ORG_UNIT_RELATIONS
)

_BY_ID: dict[str, OrgUnitRelation] = {r.id: r for r in ORG_UNIT_RELATIONS}


def get_org_unit_relation(relation_id: str) -> OrgUnitRelation | None:
    """Return the definition of *relation_id*, or None if not known.

    Args:
        relation_id: The value from a link row's ``relation`` column.

    Returns:
        The matching definition, or None.
    """
    return _BY_ID.get(relation_id)


def validate_org_unit_relation(value: str) -> str:
    """Return the relation unchanged, or raise naming the known ones.

    Kept in code rather than as a database enum, so adding a relation
    needs no migration — the same choice ``MEMBER_CAPACITIES`` made.

    Args:
        value: The relation to check.

    Returns:
        The same value.

    Raises:
        ValueError: If it is not a known relation.
    """
    if value not in _BY_ID:
        raise ValueError(
            f"Unknown org_unit relation: {value}. Known relations are "
            + ", ".join(ORG_UNIT_RELATION_IDS)
            + "."
        )
    return value


def relation_grants_reach(relation_id: str) -> bool:
    """Whether this relation is expected to make the target reachable.

    Raises on an unknown relation rather than answering False: nothing is
    known about it, which is not the same as knowing it grants nothing.

    Args:
        relation_id: The value from a link row's ``relation`` column.

    Returns:
        Whether the relation grants reach.

    Raises:
        ValueError: If *relation_id* is not a known relation.
    """
    validate_org_unit_relation(relation_id)
    return _BY_ID[relation_id].grants_reach
