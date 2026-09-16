# backend/app/org_units/tree.py
"""Walking the governance tree, up and down.

Ownership is one parent per place and no cycles, so every place has one
root and one accountable body above it. Everything in this module is a
walk of that single parent column.

**Two levels only, for now.** The schema permits any depth and so does
every function here, but nothing in the application builds a deeper tree.
The walks are written for any depth anyway, so a third level needs no
rewrite.

**The depth cap is a safety net, not a rule about shape.** A cycle in the
parent column would otherwise hang a request rather than answer it
wrongly, and a hung request is the harder failure to diagnose. Nothing
should ever reach the cap; reaching it means the tree is broken.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Organisation, Site

#: How far a walk goes before it gives up. Ten is far past anything the
#: application builds — trust, hospital, building, ward, room is five —
#: and low enough that a broken tree fails quickly.
MAX_TREE_DEPTH = 10


def root_id_of(db: Session, unit_id: int) -> int | None:
    """Return the id of the root above *unit_id*, or None if it is gone.

    Walks the parent column up. A place with no parent is its own root,
    which is the answer for an organisation.

    Args:
        db: Core database session.
        unit_id: The place to resolve.

    Returns:
        The root's id, or None if the place does not exist.
    """
    current: int | None = unit_id
    seen: set[int] = set()
    for _ in range(MAX_TREE_DEPTH):
        if current is None or current in seen:
            return None
        seen.add(current)
        parent_id = db.execute(
            select(Site.parent_id).where(Site.id == current)
        ).first()
        if parent_id is None:
            # No such row at all.
            return None
        if parent_id[0] is None:
            return current
        current = parent_id[0]
    return None


def descendant_ids(db: Session, root_ids: list[int]) -> set[int]:
    """Return every place below *root_ids*, at any depth.

    Written as a subtree walk rather than a single join on ``parent_id``,
    even though today's tree is two levels deep, so that a third level
    needs no rewrite here or at any call site.

    Ids are collected in a set and each level is asked for once, so a
    cycle cannot make the walk repeat work; the depth cap stops it
    outright.

    Args:
        db: Core database session.
        root_ids: The places to descend from. Not included in the result.

    Returns:
        The ids of every place beneath them.
    """
    if not root_ids:
        return set()

    found: set[int] = set()
    frontier: set[int] = set(root_ids)
    for _ in range(MAX_TREE_DEPTH):
        if not frontier:
            break
        children = set(
            db.execute(select(Site.id).where(Site.parent_id.in_(frontier)))
            .scalars()
            .all()
        )
        frontier = children - found - set(root_ids)
        found |= frontier
    return found


def root_ids_of_organisations(db: Session, org_ids: list[int]) -> list[int]:
    """Return the tree roots standing for *org_ids*.

    Args:
        db: Core database session.
        org_ids: Organisation ids.

    Returns:
        The org_unit ids of their roots, ascending. An organisation with
        no root yet contributes nothing.
    """
    if not org_ids:
        return []
    return sorted(
        org_unit_id
        for org_unit_id in db.execute(
            select(Organisation.org_unit_id).where(
                Organisation.id.in_(org_ids),
                Organisation.org_unit_id.is_not(None),
            )
        )
        .scalars()
        .all()
        if org_unit_id is not None
    )


def site_ids_of_organisations(db: Session, org_ids: list[int]) -> list[int]:
    """Return every place beneath *org_ids*, at any depth.

    The replacement for "the sites linked to this organisation". Roots
    themselves are excluded: an organisation is not one of its own sites.

    Args:
        db: Core database session.
        org_ids: Organisation ids.

    Returns:
        Site ids, ascending.
    """
    roots = root_ids_of_organisations(db, org_ids)
    return sorted(descendant_ids(db, roots))


def organisation_id_of_site(db: Session, site_id: int) -> int | None:
    """Return the organisation accountable for *site_id*.

    Walks up to the root and reads which organisation that root stands
    for. A place whose chain does not reach a root — one that has been
    detached, or whose parent is missing — has no accountable body, and
    the answer is None rather than a guess.

    Args:
        db: Core database session.
        site_id: The place to resolve.

    Returns:
        The organisation's id, or None.
    """
    root_id = root_id_of(db, site_id)
    if root_id is None:
        return None
    return db.execute(
        select(Organisation.id).where(Organisation.org_unit_id == root_id)
    ).scalar_one_or_none()


def organisation_ids_of_sites(
    db: Session, site_ids: list[int]
) -> dict[int, int]:
    """Return the organisation accountable for each of *site_ids*.

    Args:
        db: Core database session.
        site_ids: The places to resolve.

    Returns:
        A mapping of site id to organisation id, leaving out any place
        whose chain does not reach a root.
    """
    resolved: dict[int, int] = {}
    for site_id in site_ids:
        org_id = organisation_id_of_site(db, site_id)
        if org_id is not None:
            resolved[site_id] = org_id
    return resolved
