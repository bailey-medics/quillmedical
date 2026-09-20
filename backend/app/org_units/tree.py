# backend/app/org_units/tree.py
"""Walking the governance tree, up and down.

Ownership is one parent per place and no cycles, so every place has one
root and one accountable body above it. Everything in this module is a
walk of that single parent column, and each walk is one recursive query
rather than one query per level — scoping runs on every admin request.

**Two levels only, for now.** The schema permits any depth and so does
every function here, but nothing in the application builds a deeper tree.
The walks are written for any depth anyway, so a third level needs no
rewrite here or at any call site.

**Every walk is capped and takes distinct ids.** A cycle in the parent
column would otherwise loop for as long as the database let it, and a
request that never answers is the harder failure to diagnose than a wrong
one. Nothing should ever reach the cap; reaching it means the tree is
broken, and the guard in the write path exists to stop that happening.
"""

from sqlalchemy import literal, select
from sqlalchemy.orm import Session, aliased

from app.models import Organisation, OrgUnit

#: How far a walk goes before it gives up. Ten is far past anything the
#: application builds — trust, hospital, building, ward, room is five —
#: and low enough that a broken tree fails quickly.
MAX_TREE_DEPTH = 10


def root_ids_of(db: Session, unit_ids: list[int]) -> dict[int, int]:
    """Return the root above each of *unit_ids*, in one query.

    Walks the parent column up from every place at once, carrying where
    it started, and keeps the rows that reached a place with no parent.

    Args:
        db: Core database session.
        unit_ids: The places to resolve.

    Returns:
        A mapping of place id to root id, leaving out any place that does
        not exist and any whose chain does not end — which is what a cycle
        looks like from below.
    """
    if not unit_ids:
        return {}

    base = select(
        OrgUnit.id.label("origin"),
        OrgUnit.id.label("id"),
        OrgUnit.parent_id.label("parent_id"),
        literal(0).label("depth"),
    ).where(OrgUnit.id.in_(unit_ids))

    walk = base.cte("upwards", recursive=True)
    above = aliased(OrgUnit)
    walk = walk.union(
        select(
            walk.c.origin,
            above.id,
            above.parent_id,
            walk.c.depth + 1,
        ).where(
            above.id == walk.c.parent_id,
            walk.c.depth < MAX_TREE_DEPTH,
        )
    )

    rows = db.execute(
        select(walk.c.origin, walk.c.id).where(walk.c.parent_id.is_(None))
    ).all()
    return {int(origin): int(root_id) for origin, root_id in rows}


def root_id_of(db: Session, unit_id: int) -> int | None:
    """Return the id of the root above *unit_id*, or None if there is none.

    A place with no parent is its own root, which is the answer for an
    organisation.

    Args:
        db: Core database session.
        unit_id: The place to resolve.

    Returns:
        The root's id, or None if the place does not exist or its chain
        does not reach one.
    """
    return root_ids_of(db, [unit_id]).get(unit_id)


def ancestor_ids(db: Session, unit_id: int) -> list[int]:
    """Return every place above *unit_id*, nearest first.

    The same upward walk root resolution performs, exposed on its own so
    the cycle guard and the root lookup cannot disagree about what "above"
    means.

    A chain that does not end stops at the depth cap and returns what it
    found, so the caller gets a wrong answer rather than a request that
    never finishes.

    Args:
        db: Core database session.
        unit_id: The place to walk up from. Not included in the result.

    Returns:
        The ids of its ancestors, closest first.
    """
    base = select(
        OrgUnit.parent_id.label("id"),
        literal(1).label("depth"),
    ).where(OrgUnit.id == unit_id, OrgUnit.parent_id.is_not(None))

    walk = base.cte("ancestors", recursive=True)
    above = aliased(OrgUnit)
    walk = walk.union(
        select(above.parent_id, walk.c.depth + 1).where(
            above.id == walk.c.id,
            above.parent_id.is_not(None),
            walk.c.depth < MAX_TREE_DEPTH,
        )
    )

    rows = db.execute(
        select(walk.c.id, walk.c.depth).order_by(walk.c.depth)
    ).all()

    found: list[int] = []
    for ancestor_id, _depth in rows:
        if ancestor_id is None or int(ancestor_id) in found:
            continue
        if int(ancestor_id) == unit_id:
            # The chain has come back round to where it started, which is
            # a cycle. Stop rather than report the place as its own
            # ancestor, which nothing above here would know what to do
            # with.
            break
        found.append(int(ancestor_id))
    return found


def would_make_a_cycle(db: Session, unit_id: int, parent_id: int) -> bool:
    """Whether making *parent_id* the parent of *unit_id* closes a loop.

    A tree is one parent each *and* no cycles. One column gives the first
    for nothing, because one column cannot hold two parents; the second
    has to be checked on every re-parent or the tree quietly stops being
    one. Until scoping walked the column nothing noticed, so A under B
    then B under A was accepted — harmless only because nothing ever
    followed the chain.

    The check is the same upward walk root resolution performs, which is
    why it lives beside it rather than being a query of its own.

    Args:
        db: Core database session.
        unit_id: The place being moved.
        parent_id: Where it is being moved to.

    Returns:
        True if the move would put a place inside itself.
    """
    if unit_id == parent_id:
        return True
    return unit_id in ancestor_ids(db, parent_id)


def descendant_ids(db: Session, root_ids: list[int]) -> set[int]:
    """Return every place below *root_ids*, at any depth, in one query.

    A subtree query rather than a join on ``parent_id``, even though
    today's tree is two levels deep, so that a third level needs no
    rewrite here or at any call site.

    Args:
        db: Core database session.
        root_ids: The places to descend from. Not included in the result.

    Returns:
        The ids of every place beneath them.
    """
    if not root_ids:
        return set()

    base = select(OrgUnit.id.label("id"), literal(0).label("depth")).where(
        OrgUnit.parent_id.in_(root_ids)
    )

    walk = base.cte("subtree", recursive=True)
    below = aliased(OrgUnit)
    walk = walk.union(
        select(below.id, walk.c.depth + 1).where(
            below.parent_id == walk.c.id,
            walk.c.depth < MAX_TREE_DEPTH,
        )
    )

    found = {
        int(row)
        for row in db.execute(select(walk.c.id).distinct()).scalars().all()
    }
    return found - set(root_ids)


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


def organisation_ids_of_sites(
    db: Session, site_ids: list[int]
) -> dict[int, int]:
    """Return the organisation accountable for each of *site_ids*.

    One walk up for the whole list, then one lookup of which organisation
    each root stands for.

    Args:
        db: Core database session.
        site_ids: The places to resolve.

    Returns:
        A mapping of site id to organisation id, leaving out any place
        whose chain does not reach a root, and any root that stands for no
        organisation.
    """
    if not site_ids:
        return {}

    roots = root_ids_of(db, site_ids)
    if not roots:
        return {}

    organisations = {
        int(root_id): int(org_id)
        for root_id, org_id in db.execute(
            select(Organisation.org_unit_id, Organisation.id).where(
                Organisation.org_unit_id.in_(set(roots.values()))
            )
        ).all()
    }

    return {
        site_id: organisations[root_id]
        for site_id, root_id in roots.items()
        if root_id in organisations
    }


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
    return organisation_ids_of_sites(db, [site_id]).get(site_id)
