# backend/app/features/teaching/access.py
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

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.scoped import authorise_practice
from app.features.teaching.enrolment import enrol, is_enrolled
from app.models import PractisingCompetency, User, org_unit_member
from app.organisations import reach_of_org_units

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
