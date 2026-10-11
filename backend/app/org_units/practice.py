"""Who may say where somebody practises.

One rule: may this caller authorise, or withdraw, this competency for
this person at this org unit? The writing itself is
``authorise_practice`` and ``withdraw_practice`` in
:mod:`app.cbac.practising`, which decide nothing about who is asking.

And one act built on it: giving a member a competency and authorising it
at their org unit together, with the rule for who may add to somebody's
competencies from an org unit's page.
"""

from typing import Literal

from sqlalchemy.orm import Session

from app.cbac.base_professions import get_profession_base_competencies
from app.cbac.competencies import SCOPED_MANAGER_IDS
from app.cbac.grants import sync_competency_rows
from app.cbac.practising import authorise_practice
from app.models import User
from app.org_units.access import (
    require_in_scope,
    require_member,
    require_visible,
    through_a_scope,
)
from app.org_units.errors import (
    CompetencyNotHeld,
    GrantingNotAllowed,
    GrantingToYourself,
    MemberNotFound,
    NobodyPractisesHere,
    OperatorAccountNotAllowed,
    OrgUnitError,
    UserNotFound,
)
from app.org_units.types import type_can_hold_competencies
from app.organisations import (
    is_member_within,
    org_units_whose_people_reached_by,
)


def practice_refusal(
    db: Session,
    caller: User,
    *,
    unit_id: int,
    user_id: int,
    competency: str,
    authorising: bool,
) -> OrgUnitError | None:
    """Why *caller* may not set somebody's practice at an org_unit, or None.

    The one answer to "may this caller write this practice row?", asked
    by the two practice routes of the org_unit router and by the user
    routes in ``main``, which write the same rows when a user is created
    or edited. Returned and not raised, so a caller settling several
    rows at once can gather every refusal and name them together.

    Both directions need the org_unit to be one the caller reaches for
    ``manage_practising_competencies``, and a caller who reaches it only
    through a scoped manager, such as ``manage_teaching``, to stay inside
    its whitelist. Authorising asks for more than withdrawing does: the
    org_unit's type must be one somebody can practise at, the person must
    exist and already hold the competency, and a scoped manager may
    authorise only a member of the org_unit. Withdrawing asks for none of
    those, so that a row can always
    be taken away, whatever has happened to the person or the place since
    it was written.

    Args:
        db: Core database session.
        caller: Who is asking.
        unit_id: The org_unit.
        user_id: The person whose practice it is.
        competency: A competency id.
        authorising: True to authorise, False to withdraw.

    Returns:
        The refusal to raise, or None when the row may be written. One
        of ``OrgUnitNotFound``, ``NobodyPractisesHere``,
        ``MemberNotFound``, ``CompetenciesOutOfScope``, ``UserNotFound``
        and ``CompetencyNotHeld``, checked in that order.
    """
    needs = "manage_practising_competencies"

    try:
        unit = require_visible(db, caller, unit_id, needs)
        if authorising and not type_can_hold_competencies(unit.type):
            raise NobodyPractisesHere(unit.type)
        if through_a_scope(caller, needs):
            if authorising:
                require_member(db, unit_id, user_id)
            require_in_scope(caller, {competency})
        if authorising:
            person = db.get(User, user_id)

            if person is None:
                raise UserNotFound()
            if competency not in person.get_final_competencies():
                raise CompetencyNotHeld(competency)
    except OrgUnitError as refusal:
        return refusal

    return None


def grant_refusal(
    db: Session, caller: User, person: User
) -> OrgUnitError | None:
    """Why *caller* may not add to *person*'s competencies, or None.

    The same three rules ``update_user`` applies, so the route that
    grants from an org_unit's page is not a way round them: nobody
    grants themselves a competency, only an operator changes an
    operator, and an administrator acts only on somebody at an org_unit
    they reach, as ``org_units_whose_people_reached_by`` answers it. An
    operator passes all three.

    Returned and not raised, so the page about one member can ask
    whether to offer the grant at all.

    Args:
        db: Core database session.
        caller: Who is asking.
        person: Whose competencies would be added to.

    Returns:
        The refusal to raise, or None when the caller may grant. One of
        ``GrantingNotAllowed``, ``OperatorAccountNotAllowed``,
        ``GrantingToYourself`` and ``MemberNotFound``, checked in that
        order.
    """
    held = set(caller.get_final_competencies())

    if "manage_users" not in held and held.isdisjoint(SCOPED_MANAGER_IDS):
        return GrantingNotAllowed()
    if caller.platform_role == "superadmin":
        return None
    if person.platform_role == "superadmin":
        return OperatorAccountNotAllowed()
    if person.id == caller.id:
        return GrantingToYourself()

    reached = org_units_whose_people_reached_by(db, caller)

    if reached is not None and not is_member_within(db, person.id, reached):
        return MemberNotFound()

    return None


def grant_then_authorise(
    db: Session,
    caller: User,
    *,
    unit_id: int,
    user_id: int,
    competency: str,
) -> Literal["granted_and_authorised", "authorised", "unchanged"]:
    """Give a member a competency, and authorise them to practise it here.

    Two facts in one transaction: the competency joins their ceiling,
    which applies everywhere, and a ``practising_competency`` row is
    written at this org_unit only. Either both are written or neither
    is, so nobody is left qualified and not authorised, or authorised
    for something that does nothing.

    Additive. Only this one competency changes on their ceiling, so two
    administrators granting different things at once cannot undo each
    other, as two saves of the whole list can. Asking again once both
    are in place changes nothing.

    The caller needs ``manage_users`` and
    ``manage_practising_competencies`` together, or a scoped manager for
    a competency it may grant, at an org_unit they belong to.

    The rows are flushed, not committed.

    Args:
        db: Core database session.
        caller: Who is asking, recorded as who granted and authorised.
        unit_id: The org_unit.
        user_id: The member.
        competency: A competency id the catalogue knows.

    Returns:
        ``"granted_and_authorised"`` when the competency was new to
        them, ``"authorised"`` when they held it and only the row here
        was written, and ``"unchanged"`` when both were in place.

    Raises:
        GrantingNotAllowed: If the caller holds neither both
            competencies nor a scoped manager.
        OrgUnitNotFound: If no org_unit has that id, or one does that
            the caller may not see.
        NobodyPractisesHere: If the org_unit's type holds no
            competencies.
        MemberNotFound: If nobody has that id, they are not a member of
            the org_unit, or they are at no org_unit the caller reaches.
        OperatorAccountNotAllowed: If they are an operator and the
            caller is not.
        GrantingToYourself: If the caller is the member.
        CompetenciesOutOfScope: If a scoped manager may not grant the
            competency.
    """
    needs = ("manage_users", "manage_practising_competencies")
    through_scope = through_a_scope(caller, *needs)

    if not through_scope and not set(needs) <= set(
        caller.get_final_competencies()
    ):
        raise GrantingNotAllowed()

    unit = require_visible(db, caller, unit_id, *needs)

    if not type_can_hold_competencies(unit.type):
        raise NobodyPractisesHere(unit.type)

    person = require_member(db, unit_id, user_id)

    refusal = grant_refusal(db, caller, person)

    if refusal is not None:
        raise refusal

    if through_scope:
        require_in_scope(caller, {competency})

    granted = competency not in person.get_final_competencies()

    if granted:
        template = set(
            get_profession_base_competencies(person.base_profession)
        )
        additional = set(person.additional_competency_ids)
        removed = set(person.removed_competency_ids)
        # A competency their profession gives is restored by taking it
        # off the removed list; anything else is added beyond it.
        removed.discard(competency)
        if competency not in template:
            additional.add(competency)
        sync_competency_rows(
            person,
            additional=sorted(additional),
            removed=sorted(removed),
            source="admin",
            granted_by=caller.id,
            org_unit_id=unit_id,
        )

    authorised = authorise_practice(
        db,
        user_id=user_id,
        org_unit_id=unit_id,
        competency=competency,
        authorised_by=caller.id,
    )

    db.flush()

    if granted:
        return "granted_and_authorised"
    if authorised:
        return "authorised"

    return "unchanged"
