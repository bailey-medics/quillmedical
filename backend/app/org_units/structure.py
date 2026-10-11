"""Making an org unit, and changing what it is and where it sits.

What may be created or moved, and by whom: the type decides whether an
org unit has a parent, only an operator starts a tree, and a site sits
directly inside an organisation. Deleting one, and putting it in or out
of use, are not here.
"""

from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.org_units.access import require_editable, require_visible
from app.org_units.errors import (
    InsideItself,
    NeedsAParent,
    OperatorOnly,
    SiteInsideASite,
    TopOfATree,
    TypeWouldMoveIt,
    UnknownOrgUnitType,
)
from app.org_units.tree import would_make_a_cycle
from app.org_units.types import type_requires_parent, validate_org_unit_type


def known_type(value: str) -> str:
    """Return the type, or refuse with a message naming the known ones.

    Raises:
        UnknownOrgUnitType: If the vocabulary does not hold it.
    """
    try:
        return validate_org_unit_type(value)
    except ValueError:
        raise UnknownOrgUnitType() from None


def require_parent_is_an_organisation(parent: OrgUnit) -> None:
    """Refuse a parent that is not an organisation.

    **The tree is two levels for now**: an organisation, and the sites
    directly inside it. Nothing reads a site inside a site yet, on the
    organisation and site pages or in teaching, so one made here would be
    a place nobody could find their way to.

    This is a rule about what may be created or moved today, not about
    what the tree can hold. ``descendant_ids`` and the type vocabulary
    still describe any depth, and rows already deeper are left alone.
    When a third level is wanted, this is the one check to take out.

    Args:
        parent: The org_unit something is being put inside.

    Raises:
        SiteInsideASite: If the parent itself sits inside another.
    """
    if type_requires_parent(parent.type):
        raise SiteInsideASite()


def add_org_unit(
    db: Session,
    caller: User,
    *,
    name: str,
    unit_type: str,
    parent_id: int | None,
    location: str | None,
) -> OrgUnit:
    """Create an org_unit, at the top of a tree or inside another.

    Naming no parent creates the top of a tree, which only an operator may
    do: a new organisation is not something an admin of one other
    organisation should be able to conjure. Naming a parent creates a
    org_unit inside it, and the parent has to be one the caller may
    administer.

    The type decides which of the two is allowed, so neither can be
    produced by accident.

    The row is flushed, not committed.

    Args:
        db: Core database session.
        caller: Who is asking.
        name: What it is called. Stored without the space around it.
        unit_type: Its type, as the request gave it.
        parent_id: The org_unit it sits inside, or None for the top of a
            tree.
        location: Free text, or None. Empty is stored as none.

    Returns:
        The new org_unit, with its id.

    Raises:
        UnknownOrgUnitType: If the vocabulary does not hold the type.
        NeedsAParent: If the type sits inside another and no parent was
            named.
        OperatorOnly: If no parent was named and the caller is not an
            operator.
        TopOfATree: If a parent was named for a type that starts a tree.
        OrgUnitNotFound: If no org_unit has the parent's id, or one does
            that the caller may not see.
        SiteInsideASite: If the parent is not an organisation.
    """
    unit_type = known_type(unit_type)

    needs_parent = type_requires_parent(unit_type)

    if parent_id is None:
        if needs_parent:
            raise NeedsAParent(unit_type)
        if caller.platform_role != "superadmin":
            raise OperatorOnly()
    else:
        if not needs_parent:
            raise TopOfATree(unit_type)
        require_parent_is_an_organisation(
            require_visible(db, caller, parent_id, "manage_users")
        )

    unit = OrgUnit(
        name=name.strip(),
        type=unit_type,
        parent_id=parent_id,
        location=location.strip() if location else None,
    )
    db.add(unit)
    db.flush()
    db.refresh(unit)

    return unit


def change_org_unit(
    db: Session,
    caller: User,
    unit_id: int,
    *,
    name: str | None,
    unit_type: str | None,
    parent_id: int | None,
    location: str | None,
) -> OrgUnit:
    """Change an org_unit. Only what is given is changed.

    Moving an org_unit is refused if it would put the org_unit inside
    itself, at any depth, and if the new parent is one the caller may not
    administer.

    The row is flushed, not committed.

    Args:
        db: Core database session.
        caller: Who is asking.
        unit_id: The org_unit.
        name: A new name, or None to leave it.
        unit_type: A new type, or None to leave it.
        parent_id: Where it is to sit, or None to leave it where it is.
        location: A new location, or None to leave it. Empty clears it.

    Returns:
        The org_unit as it now is.

    Raises:
        OrgUnitNotFound: If no org_unit has that id or the parent's, or
            one does that the caller may not see.
        OrganisationNeedsManageUsers: If it is an organisation and the
            caller reaches it only through a scoped manager.
        UnknownOrgUnitType: If the vocabulary does not hold the type.
        TypeWouldMoveIt: If the new type would change whether it has a
            parent.
        TopOfATree: If a parent was named for a type that starts a tree.
        InsideItself: If the parent named is the org_unit, or beneath it.
        SiteInsideASite: If it is moved to a parent that is not an
            organisation.
    """
    unit = require_editable(db, caller, unit_id)

    if unit_type is not None:
        new_type = known_type(unit_type)
        if type_requires_parent(new_type) is not type_requires_parent(
            unit.type
        ):
            raise TypeWouldMoveIt()
        unit.type = new_type

    if name is not None:
        unit.name = name.strip()
    if location is not None:
        unit.location = location.strip() or None

    if parent_id is not None:
        # The type says whether an org_unit sits inside another. An
        # organisation given a parent would be a top of tree with
        # something above it: `is_root` would keep saying yes while
        # every walk up found somebody else's trust.
        if not type_requires_parent(unit.type):
            raise TopOfATree(unit.type)
        if would_make_a_cycle(db, unit_id, parent_id):
            raise InsideItself()
        new_parent = require_visible(db, caller, parent_id, "manage_users")
        if parent_id != unit.parent_id:
            require_parent_is_an_organisation(new_parent)
        unit.parent_id = parent_id

    db.flush()
    db.refresh(unit)

    return unit
