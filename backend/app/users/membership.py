"""Where somebody belongs, as the caller's reach allows it to be settled.

The user form sends one list of org unit ids. Organisations and the org
units inside them are rows in the same table, so there is nothing to
split. This module says which org units a caller may place people in,
loads the ones a request names, and brings a person's memberships into
line with the list, keeping passport cover in step.

This is the *where* that the competency checks in :mod:`app.users.scope`
never answer.
"""

from sqlalchemy.orm import Session

from app.cbac.competencies import SCOPED_MANAGER_IDS
from app.features.passport import cover as passport_cover
from app.models import OrgUnit, User, org_unit_member
from app.org_units import ROOT_TYPE_IDS
from app.organisations import (
    org_units_administered_by,
    org_units_run_by_scoped_manager,
)
from app.users.errors import PlaceDeactivated, PlaceNotFound


def capacity_at(place: OrgUnit) -> str:
    """What a person added through the user form is at an org_unit.

    Staff at an organisation and a trainee at an org_unit inside one, which
    is what the two older lists each did. Keeping the difference means
    this step widens the request without changing who counts as staff
    anywhere; settling on one answer is a separate decision from
    replacing two lists with one.
    """
    return "staff" if place.type in ROOT_TYPE_IDS else "trainee"


def org_units_the_caller_places_people_in(
    db: Session, actor: User
) -> set[int] | None:
    """The org_units whose membership the caller may settle, or None for all.

    Where they administer through a ``manage_users`` practising row, as
    ever. And, for a scoped manager such as ``manage_teaching``, the
    org_units they belong to and everything beneath those, which is
    where the org_unit routes let them act: somebody running teaching at
    a trust signs delegates up to it and to its sites, and somebody
    running the passport at one site signs people up to that site.

    Args:
        db: Core database session.
        actor: The caller.

    Returns:
        The org_unit ids, or None for an operator.
    """
    allowed = org_units_administered_by(db, actor)

    if allowed is None:
        return None
    if not set(actor.get_final_competencies()).isdisjoint(SCOPED_MANAGER_IDS):
        allowed = allowed | org_units_run_by_scoped_manager(db, actor.id)

    return allowed


def org_units_the_caller_administers(
    db: Session, actor: User, org_unit_ids: list[int]
) -> list[OrgUnit]:
    """Load the org_units named, refusing any the caller may not administer.

    Args:
        db: Core database session.
        actor: The caller.
        org_unit_ids: The ids as the request gave them.

    Returns:
        The org_units, in the order they were named.

    Raises:
        PlaceNotFound: Naming the first id that no org_unit has, or that
            is outside the caller's reach.
    """
    return _load_within(
        db, org_unit_ids, org_units_the_caller_places_people_in(db, actor)
    )


def settle_membership(
    db: Session, actor: User, user: User, org_unit_ids: list[int]
) -> None:
    """Make *org_unit_ids* the person's membership within the caller's reach.

    It settles membership of every org_unit the caller may administer:
    the org_units named are kept, the rest of theirs are cleared.
    org_units outside their organisations are left alone, because
    somebody else's tree is not theirs to empty.

    Nothing is written when an id is refused. The rows are not flushed
    here: the statements run at once, inside the caller's transaction,
    which decides whether they are kept.

    Args:
        db: Core database session.
        actor: The caller, recorded as who changed passport cover.
        user: The person whose memberships are settled.
        org_unit_ids: Every org_unit, of those the caller may place
            people in, that the person is to belong to. An empty list
            clears them all.

    Raises:
        PlaceNotFound: Naming the first id that no org_unit has, or that
            is outside the caller's reach.
        PlaceDeactivated: If they are to join an org_unit that has been
            deactivated.
    """
    theirs = org_units_the_caller_places_people_in(db, actor)
    places = _load_within(db, org_unit_ids, theirs)
    memberships_before = passport_cover.capacities_of(db, user.id)

    # Nobody joins a deactivated site. Somebody already there stays, so
    # saving their page does not take them off it.
    if any(
        not place.is_active and place.id not in memberships_before
        for place in places
    ):
        raise PlaceDeactivated()

    clearing = org_unit_member.delete().where(
        org_unit_member.c.user_id == user.id
    )

    if theirs is not None:
        clearing = clearing.where(org_unit_member.c.org_unit_id.in_(theirs))

    db.execute(clearing)

    for place in places:
        db.execute(
            org_unit_member.insert().values(
                user_id=user.id,
                org_unit_id=place.id,
                # A membership they already had keeps its capacity.
                # Writing the default back would turn a member of
                # staff at a site into a trainee each time their
                # page was saved, and passport cover treats the two
                # differently when somebody leaves.
                capacity=memberships_before.get(place.id, capacity_at(place)),
            )
        )

    # Keep passport cover in step with what changed. Clearing and
    # writing back the same membership is no change at all.
    passport_cover.memberships_changed(
        db,
        user.id,
        before=memberships_before,
        after=passport_cover.capacities_of(db, user.id),
        changed_by=actor,
    )


def _load_within(
    db: Session, org_unit_ids: list[int], allowed: set[int] | None
) -> list[OrgUnit]:
    """Load each org_unit named, refusing one outside *allowed*.

    404 rather than 403 for an org_unit outside their organisations, matching
    the org_unit surface: the answer must not confirm that an org_unit exists to
    somebody who cannot see it.

    *allowed* of None means every org_unit, which is an operator's reach.
    """
    places: list[OrgUnit] = []

    for org_unit_id in org_unit_ids:
        place = db.get(OrgUnit, org_unit_id)
        if place is None or (
            allowed is not None and org_unit_id not in allowed
        ):
            raise PlaceNotFound(org_unit_id)
        places.append(place)

    return places
