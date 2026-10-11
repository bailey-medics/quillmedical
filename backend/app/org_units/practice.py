"""Who may say where somebody practises.

One rule: may this caller authorise, or withdraw, this competency for
this person at this org unit? The writing itself is
``authorise_practice`` and ``withdraw_practice`` in
:mod:`app.cbac.practising`, which decide nothing about who is asking.
"""

from sqlalchemy.orm import Session

from app.models import User
from app.org_units.access import (
    require_in_scope,
    require_member,
    require_visible,
    through_a_scope,
)
from app.org_units.errors import (
    CompetencyNotHeld,
    NobodyPractisesHere,
    OrgUnitError,
    UserNotFound,
)
from app.org_units.types import type_can_hold_competencies


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
