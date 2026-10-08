"""Who may take which organisation's teaching modules, and through where.

Teaching runs on the layers clinical work runs on. A competency says
*what* somebody may do: ``take_teaching_modules``. A
``practising_competency`` row says *where*: at this centre. A
``module_enrolment`` row says *which* module, and that table is read
and written by ``app.features.teaching.enrolment``. This module is the
whole of the second question for teaching, and puts the three together
in ``may_enter_module``, so every route that serves a module asks one
place, as every other read of a place goes through ``app.cbac.scoped``.

- **A row counts only while the person belongs there.** Leaving a
  centre closes its modules to them without anybody remembering to
  remove the row, and a row left behind has no effect, as a row beyond
  somebody's ceiling has none.
- **Reach is unchanged, it just starts somewhere narrower.** A place
  reaches the organisation accountable for it and whatever that place
  is linked to, exactly as membership did. What changed is which places
  it starts from: the ones holding a row, not every membership.
- **Results ask for no place.** ``view_teaching_results`` and ownership
  of the attempt are the whole check, so a result outlives leaving a
  centre and a centre's people having their access withdrawn.

See
``docs/docs/plans/2026-10-04-teaching-access-results-modules-and-enrolment-plan.md``.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.base_professions import get_profession_base_competencies
from app.cbac.grants import sync_competency_rows
from app.cbac.scoped import authorise_practice
from app.features.teaching.enrolment import (
    current_enrolments,
    enrol,
    is_enrolled,
    set_end,
    withdraw,
)
from app.features.teaching.models import QuestionBankOrgStatus
from app.models import PractisingCompetency, User, org_unit_member
from app.organisations import organisation_org_units_of, reach_of_org_units

#: The competency that opens teaching and somebody's own results.
RESULTS_COMPETENCY = "view_teaching_results"

#: The competency that opens modules, and the one a place authorises.
MODULES_COMPETENCY = "take_teaching_modules"


def places_for_modules(db: Session, user: User) -> list[int]:
    """Return the org_units where *user* may take modules.

    Their ceiling first: without ``take_teaching_modules`` no row has
    any effect. Then the org_units holding a row for it, narrowed to the
    ones they still belong to.

    Args:
        db: Core database session.
        user: The person asked about.

    Returns:
        org_unit ids, ascending. Empty when they may take modules
        nowhere.
    """
    if MODULES_COMPETENCY not in user.get_final_competencies():
        return []

    return _rows_where_they_belong(db, user)


def _rows_where_they_belong(db: Session, user: User) -> list[int]:
    """The org_units holding a row for *user*, whatever their ceiling.

    The second layer on its own, for ``why_not`` to tell a missing place
    from a missing competency. ``places_for_modules`` is the one to ask
    for what somebody may actually do.
    """
    rows = db.execute(
        select(PractisingCompetency.org_unit_id)
        .join(
            org_unit_member,
            (org_unit_member.c.org_unit_id == PractisingCompetency.org_unit_id)
            & (org_unit_member.c.user_id == PractisingCompetency.user_id),
        )
        .where(
            PractisingCompetency.user_id == user.id,
            PractisingCompetency.competency == MODULES_COMPETENCY,
        )
    ).scalars()

    # The column is nullable in the model and never null in the table,
    # which a check constraint holds; the test is for the type checker.
    return sorted(
        {int(org_unit_id) for org_unit_id in rows if org_unit_id is not None}
    )


def organisations_open_for_modules(db: Session, user: User) -> list[int]:
    """Return the organisations whose modules *user* may take.

    The organisations reached from the places where they may take
    modules, by the same reach content has always followed.

    Args:
        db: Core database session.
        user: The person asked about.

    Returns:
        org_unit ids of organisations, ascending. Empty when none.
    """
    return reach_of_org_units(db, places_for_modules(db, user))


def give_place(
    db: Session,
    user: User,
    org_unit_id: int,
    *,
    authorised_by: int | None = None,
) -> None:
    """Let *user* take modules through one org_unit.

    Writes the ``practising_competency`` row for
    ``take_teaching_modules`` there. Asking again changes nothing. The
    competency itself is the caller's to give: this says only where.

    Args:
        db: Core database session. The caller commits.
        user: The person.
        org_unit_id: The org_unit they are to take modules through.
        authorised_by: Who decided it, or None when nobody is signed in
            to be named, as when somebody registers themselves.
    """
    authorise_practice(
        db,
        user_id=user.id,
        org_unit_id=org_unit_id,
        competency=MODULES_COMPETENCY,
        authorised_by=authorised_by,
    )


def may_enter_module(
    db: Session, user: User, *, org_unit_id: int, question_bank_id: str
) -> bool:
    """Whether *user* may enter one module an organisation serves.

    All three layers: they hold ``take_teaching_modules``, they have a
    place whose reach includes the organisation, and they hold a current
    enrolment on the module there. Whether the organisation serves the
    module at all, and has it open, is the caller's question.

    Args:
        db: Core database session.
        user: The person asked about.
        org_unit_id: The organisation serving the module.
        question_bank_id: The module.

    Returns:
        True only when all three hold.
    """
    if org_unit_id not in organisations_open_for_modules(db, user):
        return False

    return is_enrolled(
        db,
        user.id,
        org_unit_id=org_unit_id,
        question_bank_id=question_bank_id,
    )


def enrol_everyone_with_a_place(
    db: Session,
    *,
    org_unit_id: int,
    question_bank_id: str,
    source: str,
    dry_run: bool = False,
) -> list[User]:
    """Enrol on one module everybody who may take the organisation's.

    For a module added after its people arrived: every module needs an
    enrolment, so a new one starts with nobody on it. Everybody holding
    a place whose reach includes the organisation is enrolled, unless
    they already are.

    Args:
        db: Core database session. The caller commits.
        org_unit_id: The organisation serving the module.
        question_bank_id: The module.
        source: How it came about, one of ``ENROLMENT_SOURCES``.
        dry_run: When True, nothing is written and the list is who
            would have been enrolled.

    Returns:
        The people enrolled, or who would be, in id order.
    """
    candidate_ids = sorted(
        set(
            db.scalars(
                select(PractisingCompetency.user_id).where(
                    PractisingCompetency.competency == MODULES_COMPETENCY
                )
            ).all()
        )
    )
    enrolled: list[User] = []

    for user_id in candidate_ids:
        user = db.get(User, user_id)
        if user is None:
            continue
        if org_unit_id not in organisations_open_for_modules(db, user):
            continue
        if is_enrolled(
            db,
            user.id,
            org_unit_id=org_unit_id,
            question_bank_id=question_bank_id,
        ):
            continue
        if not dry_run:
            enrol(
                db,
                user.id,
                org_unit_id=org_unit_id,
                question_bank_id=question_bank_id,
                source=source,
            )
        enrolled.append(user)

    return enrolled


#: The three layers, as ``why_not`` names a missing one.
MISSING_COMPETENCY = "competency"
MISSING_PLACE = "place"
MISSING_ENROLMENT = "enrolment"


def why_not(
    db: Session, user: User, *, org_unit_id: int, question_bank_id: str
) -> list[str]:
    """Return which of the three layers stop *user* entering a module.

    Empty when nothing does. Each layer is tested on its own, so
    somebody missing two is told of both, and an administrator can see
    what to put right without reading the database.

    Args:
        db: Core database session.
        user: The person asked about.
        org_unit_id: The organisation serving the module.
        question_bank_id: The module.

    Returns:
        Any of ``MISSING_COMPETENCY``, ``MISSING_PLACE`` and
        ``MISSING_ENROLMENT``, in that order.
    """
    missing: list[str] = []

    if MODULES_COMPETENCY not in user.get_final_competencies():
        missing.append(MISSING_COMPETENCY)
    if org_unit_id not in reach_of_org_units(
        db, _rows_where_they_belong(db, user)
    ):
        missing.append(MISSING_PLACE)
    if not is_enrolled(
        db,
        user.id,
        org_unit_id=org_unit_id,
        question_bank_id=question_bank_id,
    ):
        missing.append(MISSING_ENROLMENT)

    return missing


def modules_served_by(db: Session, org_unit_id: int) -> list[str]:
    """Return the modules an organisation serves, by id, in id order.

    Served means a version has been promoted there: an
    ``active_version`` that is not null. Open or closed to new attempts
    makes no difference; a closed module is still one its people hold.
    """
    return sorted(
        db.scalars(
            select(QuestionBankOrgStatus.question_bank_id).where(
                QuestionBankOrgStatus.org_unit_id == org_unit_id,
                QuestionBankOrgStatus.active_version.is_not(None),
            )
        ).all()
    )


def organisation_serving(db: Session, org_unit_id: int) -> int | None:
    """Return the organisation above an org_unit, or None if it has none."""
    organisations = organisation_org_units_of(db, [org_unit_id])

    return min(organisations) if organisations else None


@dataclass(frozen=True)
class Admitted:
    """What ``admit`` did, for the caller to report."""

    #: The competencies it gave, of the two. Empty if they held both.
    competencies: list[str]
    #: Whether the place row was written, or was already there.
    place: bool
    #: The modules they were newly enrolled on.
    enrolled: list[str]


class NotServed(ValueError):
    """A module was named that the organisation does not serve."""


def admit(
    db: Session,
    user: User,
    *,
    org_unit_id: int,
    module_ids: list[str],
    admitted_by: int | None,
    source: str,
    ends_on: datetime | None = None,
) -> Admitted:
    """Give *user* everything needed to take modules at one org_unit.

    All three layers in one act, so nobody is left holding two of them:
    the two learner competencies if they lack them, the place at the
    org_unit, and an enrolment on each module named. Either all of it is
    written or none, since the caller commits once. Asking again writes
    nothing new.

    The person must already be a member of the org_unit: a place counts
    only where somebody belongs, so admitting a non-member would write
    rows that do nothing. That check is the caller's, with the others
    that decide whether the caller may act on this person at all.

    Args:
        db: Core database session. The caller commits.
        user: The person being admitted.
        org_unit_id: The org_unit they are to take modules through.
        module_ids: Modules of the organisation above it to enrol on.
        admitted_by: Who decided it, or None where nobody is signed in.
        source: How it came about, one of ``ENROLMENT_SOURCES``.
        ends_on: When the enrolments stop counting, or None.

    Returns:
        What was newly written.

    Raises:
        NotServed: If a module is named that the organisation above the
            org_unit does not serve, or the org_unit has no organisation.
            Nothing is written.
    """
    organisation_id = organisation_serving(db, org_unit_id)
    served = (
        set(modules_served_by(db, organisation_id))
        if organisation_id is not None
        else set()
    )
    unknown = sorted(set(module_ids) - served)

    if organisation_id is None or unknown:
        raise NotServed(", ".join(unknown) or "no organisation")

    held = set(user.get_final_competencies())
    wanted = [
        c for c in (RESULTS_COMPETENCY, MODULES_COMPETENCY) if c not in held
    ]

    if wanted:
        # A competency their profession gives is restored by taking it
        # off the removed list; anything else is added beyond it. The
        # same rule ``grant_and_authorise`` follows for one competency.
        template = set(get_profession_base_competencies(user.base_profession))
        additional = set(user.additional_competency_ids)
        removed = set(user.removed_competency_ids)
        for competency in wanted:
            removed.discard(competency)
            if competency not in template:
                additional.add(competency)
        sync_competency_rows(
            user,
            additional=sorted(additional),
            removed=sorted(removed),
            source="admin",
            granted_by=admitted_by,
            org_unit_id=org_unit_id,
        )

    place = authorise_practice(
        db,
        user_id=user.id,
        org_unit_id=org_unit_id,
        competency=MODULES_COMPETENCY,
        authorised_by=admitted_by,
    )

    enrolled = [
        module_id
        for module_id in sorted(set(module_ids))
        if enrol(
            db,
            user.id,
            org_unit_id=organisation_id,
            question_bank_id=module_id,
            source=source,
            granted_by=admitted_by,
            ends_on=ends_on,
        )
    ]

    return Admitted(competencies=wanted, place=place, enrolled=enrolled)


def settle_enrolments(
    db: Session,
    user: User,
    *,
    organisation_id: int,
    wanted: dict[str, datetime | None],
    settled_by: int | None,
) -> None:
    """Make somebody's enrolments at one organisation match a list.

    The list is the whole answer for that organisation: a module named
    is enrolled on, with the end given, and a module they are on and
    not named has its enrolment ended. Naming a module does everything,
    through ``admit``: the two learner competencies if they lack them,
    and a place at every org_unit they belong to under the organisation,
    so nobody is left enrolled and unable to enter. Ending an enrolment
    ends that and nothing else.

    Args:
        db: Core database session. The caller commits.
        user: The person, with their memberships already settled.
        organisation_id: The organisation serving the modules.
        wanted: Each module to be enrolled on, and when it ends.
        settled_by: Who is making the change.

    Raises:
        NotServed: If a module is named that the organisation does not
            serve. Nothing is written.
    """
    unknown = sorted(set(wanted) - set(modules_served_by(db, organisation_id)))

    if unknown:
        raise NotServed(", ".join(unknown))

    for row in current_enrolments(db, user.id, org_unit_id=organisation_id):
        if row.question_bank_id not in wanted:
            withdraw(
                db,
                user.id,
                org_unit_id=organisation_id,
                question_bank_id=row.question_bank_id,
            )
    if not wanted:
        return

    member_of = db.scalars(
        select(org_unit_member.c.org_unit_id).where(
            org_unit_member.c.user_id == user.id
        )
    ).all()
    places = sorted(
        int(unit_id)
        for unit_id in member_of
        if organisation_serving(db, int(unit_id)) == organisation_id
    )

    for module_id, ends_on in sorted(wanted.items()):
        for unit_id in places:
            admit(
                db,
                user,
                org_unit_id=unit_id,
                module_ids=[module_id],
                admitted_by=settled_by,
                source="admin",
                ends_on=ends_on,
            )
        set_end(
            db,
            user.id,
            org_unit_id=organisation_id,
            question_bank_id=module_id,
            ends_on=ends_on,
            source="admin",
            granted_by=settled_by,
        )
