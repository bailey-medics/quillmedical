"""Somebody's teaching enrolments, as the user form settles them.

The user form sends, for each organisation, the whole list of modules a
person is to be enrolled on. This module says who may send that and
where, and hands each organisation's list to
:func:`app.features.teaching.access.settle_enrolments`, which does the
writing.
"""

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.teaching.access import (
    MODULES_COMPETENCY,
    RESULTS_COMPETENCY,
    BelongsNowhere,
    NotServed,
    settle_enrolments,
)
from app.models import User, org_unit_member
from app.organisations import (
    org_units_whose_people_reached_by,
    organisation_org_units_of,
)
from app.users.errors import (
    EnrolledBelongingNowhere,
    EnrolmentEndPassed,
    EnrolmentNotAllowed,
    EnrolmentOutsideTheirOrganisations,
    ModuleNotServed,
    SelfEnrolment,
)


def settle_teaching_enrolments(
    db: Session,
    actor: User,
    person: User,
    wanted: dict[int, dict[str, datetime | None]],
) -> None:
    """Make a person's teaching enrolments match what the user form sent.

    Called once their membership and competencies are settled and
    flushed, in the same transaction, so somebody new is enrolled in the
    one save that creates them. Every entry is checked before any is
    written, and one refusal refuses the save.

    Naming a module does everything: ``settle_enrolments`` gives the two
    learner competencies and a place if they are missing, so an admin
    who skipped those steps does not leave somebody enrolled and unable
    to enter.

    *wanted* is a mapping, so it cannot name an organisation twice, nor
    a module twice at one organisation. The request models refuse both
    as the request is read, so a route turning its list into this
    mapping loses nothing.

    The rows are flushed, not committed.

    Args:
        db: Core database session.
        actor: The caller.
        person: Whose enrolments they are, with membership settled.
        wanted: For each organisation to settle, by its org unit id and
            in the order sent, each module they are to be enrolled on
            there and when that ends, or None for no end. An
            organisation with no modules has every enrolment there
            ended. An organisation left out is not touched.

    Raises:
        EnrolmentNotAllowed: Unless the caller runs teaching
            (``manage_teaching``, or an operator) and reaches each
            organisation named.
        EnrolmentOutsideTheirOrganisations: For an organisation the
            person does not belong to or beneath.
        EnrolmentEndPassed: For an end date already passed.
        SelfEnrolment: If the caller is the person, is not an operator,
            and naming a module would give them a competency.
        ModuleNotServed: For a module the organisation does not serve.
        EnrolledBelongingNowhere: If a module is named and the person
            belongs to no org unit under the organisation.
    """
    is_operator = actor.platform_role == "superadmin"

    if (
        not is_operator
        and "manage_teaching" not in actor.get_final_competencies()
    ):
        raise EnrolmentNotAllowed()

    member_of = [
        int(unit_id)
        for unit_id in cast(
            Sequence[int],
            db.execute(
                select(org_unit_member.c.org_unit_id).where(
                    org_unit_member.c.user_id == person.id
                )
            )
            .scalars()
            .all(),
        )
    ]
    theirs = organisation_org_units_of(db, member_of)
    reached = org_units_whose_people_reached_by(db, actor)
    now = datetime.now(UTC)
    held = set(person.get_final_competencies())
    gives_a_competency = not {RESULTS_COMPETENCY, MODULES_COMPETENCY} <= held

    for organisation_id, modules in wanted.items():
        if organisation_id not in theirs:
            raise EnrolmentOutsideTheirOrganisations()
        if reached is not None and organisation_id not in reached:
            raise EnrolmentNotAllowed()
        for ends_on in modules.values():
            if ends_on is None:
                continue
            if ends_on.tzinfo is None:
                ends_on = ends_on.replace(tzinfo=UTC)
            if ends_on <= now:
                raise EnrolmentEndPassed()
        # Nobody gives themselves a competency, here as on every other
        # route. Changing their own enrolments, holding both already,
        # gives nothing and is allowed.
        if (
            modules
            and gives_a_competency
            and person.id == actor.id
            and not is_operator
        ):
            raise SelfEnrolment()

    try:
        for organisation_id, modules in wanted.items():
            settle_enrolments(
                db,
                person,
                organisation_id=organisation_id,
                wanted=modules,
                settled_by=actor.id,
            )
    except NotServed:
        raise ModuleNotServed() from None
    except BelongsNowhere:
        raise EnrolledBelongingNowhere() from None

    db.flush()
