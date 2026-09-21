# backend/app/org_units/tree.py
"""Walking the governance tree, up and down.

Ownership is one parent per org_unit and no cycles, so every org_unit has one
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

from sqlalchemy import Select, literal, select
from sqlalchemy.orm import Session, aliased

from app.models import OrgUnit
from app.org_units.types import ROOT_TYPE_IDS

#: How far a walk goes before it gives up. Ten is far past anything the
#: application builds — trust, hospital, building, ward, room is five —
#: and low enough that a broken tree fails quickly.
MAX_TREE_DEPTH = 10


def root_ids_of(db: Session, unit_ids: list[int]) -> dict[int, int]:
    """Return the root above each of *unit_ids*, in one query.

    Walks the parent column up from every org_unit at once, carrying where
    it started, and keeps the rows that reached an org_unit with no parent.

    Args:
        db: Core database session.
        unit_ids: The org_units to resolve.

    Returns:
        A mapping of org_unit id to root id, leaving out any org_unit that does
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

    An org_unit with no parent is its own root, which is the answer for an
    organisation.

    Args:
        db: Core database session.
        unit_id: The org_unit to resolve.

    Returns:
        The root's id, or None if the org_unit does not exist or its chain
        does not reach one.
    """
    return root_ids_of(db, [unit_id]).get(unit_id)


def ancestor_ids(db: Session, unit_id: int) -> list[int]:
    """Return every org_unit above *unit_id*, nearest first.

    The same upward walk root resolution performs, exposed on its own so
    the cycle guard and the root lookup cannot disagree about what "above"
    means.

    A chain that does not end stops at the depth cap and returns what it
    found, so the caller gets a wrong answer rather than a request that
    never finishes.

    Args:
        db: Core database session.
        unit_id: The org_unit to walk up from. Not included in the result.

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
            # a cycle. Stop rather than report the org_unit as its own
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
        unit_id: The org_unit being moved.
        parent_id: Where it is being moved to.

    Returns:
        True if the move would put an org_unit inside itself.
    """
    if unit_id == parent_id:
        return True
    return unit_id in ancestor_ids(db, parent_id)


def descendant_ids(db: Session, root_ids: list[int]) -> set[int]:
    """Return every org_unit below *root_ids*, at any depth, in one query.

    A subtree query rather than a join on ``parent_id``, even though
    today's tree is two levels deep, so that a third level needs no
    rewrite here or at any call site.

    Args:
        db: Core database session.
        root_ids: The org_units to descend from. Not included in the result.

    Returns:
        The ids of every org_unit beneath them.
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


def organisation_org_unit_ids() -> Select[tuple[int]]:
    """A selectable of every org_unit that is an organisation.

    An organisation is an org_unit at the top of a tree, and what makes it
    one is its *type*: the kinds that need no parent are exactly the
    kinds a tree starts with. Not "has no parent", which a detached ward
    also satisfies — the test fixtures make one on purpose, and treating
    it as an organisation would give its members the run of somewhere
    nobody is accountable for.

    Returned as a selectable rather than a list of ids so it can go
    inside an ``IN`` without a second round trip.
    """
    return select(OrgUnit.id).where(OrgUnit.type.in_(ROOT_TYPE_IDS))


def organisation_org_units_of_sites(
    db: Session, site_ids: list[int]
) -> dict[int, int]:
    """Return the organisation's org_unit above each of *site_ids*.

    One walk up for the whole list, then one check that each root
    reached is a kind of org_unit a tree starts with.

    Args:
        db: Core database session.
        site_ids: The org_units to resolve.

    Returns:
        A mapping of org_unit id to the id of the organisation's own org_unit,
        leaving out any org_unit whose chain does not reach a root, and any
        root that is not an organisation.
    """
    if not site_ids:
        return {}

    roots = root_ids_of(db, site_ids)
    if not roots:
        return {}

    organisations = {
        int(org_unit_id)
        for org_unit_id in db.execute(
            organisation_org_unit_ids().where(
                OrgUnit.id.in_(set(roots.values()))
            )
        )
        .scalars()
        .all()
    }

    return {
        site_id: root_id
        for site_id, root_id in roots.items()
        if root_id in organisations
    }


def organisation_org_unit_of_site(db: Session, site_id: int) -> int | None:
    """Return the org_unit of the organisation accountable for *site_id*.

    Walks up to the root and checks it is a kind of org_unit a tree starts
    with. An org_unit whose chain does not reach one — one that has been
    detached, or whose parent is missing — has no accountable body, and
    the answer is None rather than a guess.

    Args:
        db: Core database session.
        site_id: The org_unit to resolve.

    Returns:
        The organisation's org_unit id, or None.
    """
    return organisation_org_units_of_sites(db, [site_id]).get(site_id)
