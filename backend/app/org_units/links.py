"""Relationships between org units that are not ownership.

Ownership is the parent of a site. A link is everything else: a school
teaching on a trust's wards, two trusts sharing a laboratory. The
vocabulary of relations is in :mod:`app.org_units.relations`.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OrgUnit, OrgUnitLink, User
from app.org_units.access import require_visible
from app.org_units.errors import (
    LinkedToItself,
    LinkTargetNotFound,
    UnknownRelation,
)
from app.org_units.relations import validate_org_unit_relation


def add_link(
    db: Session,
    caller: User,
    unit_id: int,
    *,
    target_id: int,
    relation: str,
) -> None:
    """Record a relationship from one org_unit to another.

    **The org_unit at the other end is not checked for ownership**, and
    that is the point: the relationships worth recording cross between
    organisations, and requiring both ends would make this useless for
    exactly those. The org_unit the link is *from* must be one the
    caller may administer.

    Recording the same relationship twice writes nothing the second
    time. The row is flushed, not committed.

    Args:
        db: Core database session.
        caller: Who is asking, recorded as who made the link.
        unit_id: The org_unit the relationship is from.
        target_id: The org_unit it is to.
        relation: The relation, as the request gave it.

    Raises:
        OrgUnitNotFound: If no org_unit has *unit_id*, or one does that
            the caller may not see.
        LinkedToItself: If both ends are the same org_unit.
        LinkTargetNotFound: If no org_unit has *target_id*.
        UnknownRelation: If the vocabulary does not hold the relation.
    """
    require_visible(db, caller, unit_id)

    if target_id == unit_id:
        raise LinkedToItself()

    if db.get(OrgUnit, target_id) is None:
        raise LinkTargetNotFound()

    try:
        known = validate_org_unit_relation(relation)
    except ValueError:
        raise UnknownRelation() from None

    existing = db.scalar(
        select(OrgUnitLink).where(
            OrgUnitLink.source_id == unit_id,
            OrgUnitLink.target_id == target_id,
            OrgUnitLink.relation == known,
        )
    )

    if existing is None:
        db.add(
            OrgUnitLink(
                source_id=unit_id,
                target_id=target_id,
                relation=known,
                created_by=caller.id,
            )
        )
        db.flush()
