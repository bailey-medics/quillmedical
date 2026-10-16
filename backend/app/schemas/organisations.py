"""Pydantic schemas for the links between org_units."""

from pydantic import BaseModel, ConfigDict


class CreateOrgUnitLinkIn(BaseModel):
    """Request to record a relationship between two org_units.

    Ownership is not a relationship you record here - that is the parent
    of a site, and it has its own routes. This is for everything else: a
    school teaching on a trust's wards, two trusts sharing a laboratory.

    Attributes:
        target_id: The org_unit the relationship is *to*.
        relation: One of the relations defined in
            ``app/org_units/relations.py``.
    """

    model_config = ConfigDict(extra="forbid")

    target_id: int
    relation: str


class OrgUnitLinkItem(BaseModel):
    """One recorded relationship between two org_units.

    Both ends are named as well as numbered, because a link is read from
    either side and an id alone tells the reader nothing about the org_unit
    at the other end.

    Attributes:
        id: Link ID.
        source_id: The org_unit the relationship is from.
        source_name: That org_unit's name.
        target_id: The org_unit the relationship is to.
        target_name: That org_unit's name.
        relation: The relation id.
        relation_display_name: What a person is shown for the relation.
        created_at: ISO timestamp when the link was recorded.
    """

    id: int
    source_id: int
    source_name: str
    target_id: int
    target_name: str
    relation: str
    relation_display_name: str
    created_at: str


class OrgUnitLinksOut(BaseModel):
    """Every relationship an org_unit is either end of.

    Attributes:
        links: The relationships, oldest first.
    """

    links: list[OrgUnitLinkItem]
