"""Which org units a caller may act at, and on whom.

The checks every org unit route leans on, as plain functions: they take
the caller, a session and ordinary values, and either answer or raise an
:class:`app.org_units.errors.OrgUnitError`. They know nothing of
requests, responses or status codes.

Not called ``reach`` on purpose. Reach is why somebody sees teaching
content at an org unit they visit; it is not authority to administer
that org unit, and these are the administration checks.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.competencies import SCOPED_MANAGER_IDS
from app.cbac.grant_scope import out_of_scope_competencies
from app.models import OrgUnit, User, org_unit_member
from app.org_units.errors import (
    CompetenciesOutOfScope,
    MemberNotFound,
    OrganisationNeedsManageUsers,
    OrgUnitNotFound,
)
from app.org_units.types import type_requires_parent
from app.organisations import (
    org_units_administered_by,
    org_units_run_by_scoped_manager,
)


def visible_ids(db: Session, user: User) -> set[int] | None:
    """Return the org_units *user* may administer, or None for all of them.

    Answered from ``practising_competency`` rows rather than from
    membership, in ``org_units_administered_by`` itself: the same
    question is asked by the user routes in ``main``, and two surfaces
    disagreeing about who administers an org_unit is worse than either
    answer. A row reaches the org_units beneath it.

    Reach is deliberately not used here. Reach is why somebody sees
    teaching content at an org_unit they visit; it is not authority to
    administer that org_unit, and these are the administration routes.
    """
    return org_units_administered_by(db, user)


def through_a_scope(user: User, *competencies: str) -> bool:
    """Whether *user* reaches a route only through a scoped manager.

    True when they lack any of the competencies the route has always
    needed and hold a scoped manager, such as ``manage_teaching``. Such a
    caller acts where they are a member, which is how teaching's own
    admin routes scope them, and within their whitelist.

    Args:
        user: The caller.
        *competencies: What the route needed before scoped managers.

    Returns:
        True for the narrower path.
    """
    held = set(user.get_final_competencies())

    return not held.isdisjoint(SCOPED_MANAGER_IDS) and not (
        set(competencies) <= held
    )


def scoped_manager_ids(db: Session, user: User) -> set[int]:
    """Return the org_units a scoped manager may act at.

    Answered by ``org_units_run_by_scoped_manager``, which the user
    routes in ``main`` ask too: two surfaces disagreeing about where a
    scoped manager acts is worse than either answer.

    Args:
        db: Core database session.
        user: The caller, who reached the route through a scoped
            manager such as ``manage_teaching``.
    """
    return org_units_run_by_scoped_manager(db, user.id)


def require_visible(
    db: Session, user: User, unit_id: int, *needs: str
) -> OrgUnit:
    """Return the org_unit, or refuse as not found.

    Not found rather than not allowed throughout, so a refusal does not
    confirm that a org_unit exists to somebody who may not see it.

    Args:
        db: Core database session.
        user: The caller.
        unit_id: The org_unit.
        *needs: The competencies the route needed before
            scoped managers. When the caller lacks them and reaches
            the route through a scoped manager, what they may see is
            the org_units they belong to rather than those they
            administer.

    Raises:
        OrgUnitNotFound: If no org_unit has that id, or one does that
            the caller may not see.
    """
    unit = db.get(OrgUnit, unit_id)

    if unit is None:
        raise OrgUnitNotFound()

    if needs and through_a_scope(user, *needs):
        visible: set[int] | None = scoped_manager_ids(db, user)
    else:
        visible = visible_ids(db, user)
    if visible is not None and unit_id not in visible:
        raise OrgUnitNotFound()

    return unit


def require_editable(db: Session, user: User, unit_id: int) -> OrgUnit:
    """Return the org_unit the caller may edit, or refuse.

    ``manage_users`` edits what it administers, as it always has. A
    scoped manager such as ``manage_teaching`` edits a site they act at:
    whoever runs teaching there keeps its name, kind, address and whether
    it is in use right. An organisation is not theirs to edit, since
    that reshapes more than teaching, and it stays with ``manage_users``.

    Args:
        db: Core database session.
        user: The caller.
        unit_id: The org_unit.

    Raises:
        OrgUnitNotFound: If no org_unit has that id, or one does that
            the caller may not see.
        OrganisationNeedsManageUsers: If it is an organisation and the
            caller reaches it only through a scoped manager.
    """
    unit = require_visible(db, user, unit_id, "manage_users")

    if through_a_scope(user, "manage_users") and not type_requires_parent(
        unit.type
    ):
        raise OrganisationNeedsManageUsers()

    return unit


def require_in_scope(user: User, competencies: set[str]) -> None:
    """Refuse a change to competencies outside the caller's whitelist.

    Raises:
        CompetenciesOutOfScope: Naming every competency out of scope.
    """
    refused = out_of_scope_competencies(user, competencies)

    if refused:
        raise CompetenciesOutOfScope(refused)


def require_member(db: Session, unit_id: int, user_id: int) -> User:
    """Return the user, or refuse unless they are a member of the org_unit.

    Keeps the member routes to the people at this org_unit, so they
    cannot be pointed at anybody in the system by id.

    Raises:
        MemberNotFound: If nobody has that id, or they are not a member
            of the org_unit.
    """
    person = db.get(User, user_id)
    is_member = db.scalar(
        select(org_unit_member.c.user_id).where(
            org_unit_member.c.org_unit_id == unit_id,
            org_unit_member.c.user_id == user_id,
        )
    )

    if person is None or is_member is None:
        raise MemberNotFound()

    return person
