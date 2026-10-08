"""Routes for letting people into teaching at an org_unit, and out again.

Teaching has three layers: a competency, a place and an enrolment. Three
layers are three things to forget, so nobody is asked to do them one at
a time. ``admit`` does all three in one request. There is no route
that takes a place away, for one person or for a whole centre: both were
built and taken out again. An admin stops somebody by ending their
enrolment on a module, which leaves a record and shows on the forms.
And one route says, for one person, which layer is missing for each
module, so a half set up account is not a mystery.

Every route is for somebody who runs teaching: a holder of
``manage_teaching`` at an organisation with teaching on, or an operator,
who runs Quill itself and belongs to no organisation. Each is then
scoped in its body to the org_units whose people the caller may act on.
The competency says what; the scope says where.

See
``docs/docs/plans/2026-10-04-teaching-access-results-modules-and-enrolment-plan.md``.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.gating import user_has_feature
from app.features.teaching import access
from app.features.teaching import enrolment as enrolments
from app.features.teaching.models import (
    ModuleEnrolment,
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.features.teaching.router import (
    _DEP_REQUIRE_CSRF,
    _DEP_SESSION,
    _DEP_USER,
    _get_current_user,
)
from app.features.teaching.schemas import (
    AdmitIn,
    AdmitOut,
    MemberAccessOut,
    ModuleAccessOut,
    ServedModuleOut,
    ServedModulesOut,
    UnenrolIn,
    WithdrawOut,
)
from app.models import OrgUnit, User, org_unit_member
from app.organisations import org_units_whose_people_reached_by


def require_runs_teaching(
    request: Request, db: Session = _DEP_SESSION
) -> User:
    """Admit somebody who runs teaching, and refuse everybody else.

    An operator passes outright. They hold no ``manage_teaching`` and
    belong to no organisation, so the two checks everybody else meets
    would both refuse the one person who operates the whole deployment.
    Anybody else needs the teaching feature at one of their
    organisations and the competency. 403 for the rest.
    """
    user = _get_current_user(request, db)

    if user.platform_role == "superadmin":
        return user
    if not user_has_feature(db, user.id, "teaching"):
        raise HTTPException(status_code=403, detail="Not allowed")
    if "manage_teaching" not in user.get_final_competencies():
        raise HTTPException(status_code=403, detail="Not allowed")

    return user


door_router = APIRouter(
    prefix="/teaching/admin/org-units",
    tags=["teaching"],
    dependencies=[Depends(require_runs_teaching)],
)


def _require_reached(db: Session, caller: User, unit_id: int) -> None:
    """404 unless the caller may act on the people of this org_unit.

    404 and not 403, as every org_unit check answers: a refusal must not
    confirm that an org_unit exists to somebody who may not see it.
    """
    reached = org_units_whose_people_reached_by(db, caller)

    if reached is not None and unit_id not in reached:
        raise HTTPException(status_code=404, detail="Org unit not found")


def _require_member(db: Session, unit_id: int, user_id: int) -> User:
    """Return the user, or 404 unless they are a member of the org_unit.

    Keeps these routes to the people at this org_unit, so they cannot be
    pointed at anybody in the system by id.
    """
    person = db.get(User, user_id)
    is_member = db.scalar(
        select(org_unit_member.c.user_id).where(
            org_unit_member.c.org_unit_id == unit_id,
            org_unit_member.c.user_id == user_id,
        )
    )

    if person is None or is_member is None:
        raise HTTPException(status_code=404, detail="Member not found")

    return person


def _require_may_change(caller: User, person: User) -> None:
    """Refuse a change the people routes would refuse.

    Admitting gives competencies, so it keeps their rules: only an
    operator changes an operator, and nobody admits themselves. An
    operator passes both.
    """
    if caller.platform_role == "superadmin":
        return
    if person.platform_role == "superadmin":
        raise HTTPException(
            status_code=403, detail="Cannot modify superadmin users"
        )
    if person.id == caller.id:
        raise HTTPException(
            status_code=403,
            detail="Somebody else must admit you to teaching",
        )


@door_router.post(
    "/{unit_id}/members/{user_id}/admit",
    response_model=AdmitOut,
    dependencies=[_DEP_REQUIRE_CSRF],
)
def admit_member(
    unit_id: int,
    user_id: int,
    body: AdmitIn,
    current_user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> AdmitOut:
    """Give a member everything needed to take modules at this org_unit.

    The two learner competencies if they lack them, the place here, and
    an enrolment on each module named: all of it or none. Asking again
    writes nothing new, and the answer says what was written this time.

    Raises:
        HTTPException: 404 if the org_unit is outside the caller's reach
            or the person is not a member of it. 403 if the person is an
            operator, or is the caller. 422 if a module is named that
            the organisation does not serve, or an end date has passed.
    """
    _require_reached(db, current_user, unit_id)
    person = _require_member(db, unit_id, user_id)
    _require_may_change(current_user, person)
    if body.ends_on is not None:
        ends_on = body.ends_on
        if ends_on.tzinfo is None:
            ends_on = ends_on.replace(tzinfo=UTC)
        if ends_on <= datetime.now(UTC):
            raise HTTPException(
                status_code=422, detail="The end date has already passed."
            )

    try:
        admitted = access.admit(
            db,
            person,
            org_unit_id=unit_id,
            module_ids=list(body.module_ids),
            admitted_by=current_user.id,
            source="admin",
            ends_on=body.ends_on,
        )
    except access.NotServed:
        raise HTTPException(
            status_code=422,
            detail="A module was named that this organisation does not serve.",
        ) from None
    db.commit()

    return AdmitOut(
        competencies=admitted.competencies,
        place=admitted.place,
        enrolled=admitted.enrolled,
    )


@door_router.get(
    "/{unit_id}/members/{user_id}/access",
    response_model=MemberAccessOut,
)
def member_access(
    unit_id: int,
    user_id: int,
    current_user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> MemberAccessOut:
    """Say, for each module served here, whether a member may enter it.

    And if not, which of the three layers is missing, so somebody half
    set up can be put right without reading the database.

    Raises:
        HTTPException: 404 if the org_unit is outside the caller's reach
            or the person is not a member of it.
    """
    _require_reached(db, current_user, unit_id)
    person = _require_member(db, unit_id, user_id)
    organisation_id = access.organisation_serving(db, unit_id)

    if organisation_id is None:
        return MemberAccessOut(modules=[])

    now = datetime.now(UTC)
    modules: list[ModuleAccessOut] = []

    for status in db.scalars(
        select(QuestionBankOrgStatus)
        .where(
            QuestionBankOrgStatus.org_unit_id == organisation_id,
            QuestionBankOrgStatus.active_version.is_not(None),
        )
        .order_by(QuestionBankOrgStatus.question_bank_id)
    ).all():
        title = db.scalar(
            select(QuestionBankConfig.title).where(
                QuestionBankConfig.question_bank_id == status.question_bank_id,
                QuestionBankConfig.version == status.active_version,
            )
        )
        missing = access.why_not(
            db,
            person,
            org_unit_id=organisation_id,
            question_bank_id=status.question_bank_id,
        )
        current = [
            row
            for row in db.scalars(
                select(ModuleEnrolment).where(
                    ModuleEnrolment.user_id == person.id,
                    ModuleEnrolment.org_unit_id == organisation_id,
                    ModuleEnrolment.question_bank_id
                    == status.question_bank_id,
                )
            ).all()
            if row.is_current(now)
        ]
        modules.append(
            ModuleAccessOut(
                question_bank_id=status.question_bank_id,
                title=title or status.question_bank_id,
                may_enter=not missing,
                missing=missing,  # type: ignore[arg-type]
                enrolment_ends_on=current[0].ends_on if current else None,
            )
        )

    return MemberAccessOut(modules=modules)


@door_router.post(
    "/{unit_id}/members/{user_id}/unenrol",
    response_model=WithdrawOut,
    dependencies=[_DEP_REQUIRE_CSRF],
)
def unenrol_member(
    unit_id: int,
    user_id: int,
    body: UnenrolIn,
    current_user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> WithdrawOut:
    """End a member's enrolment on one module.

    That enrolment and nothing else: their place here, their
    competencies and their results are untouched, and so is every other
    module they are on. Asked of a module they are not on, it changes
    nothing and says so.

    Raises:
        HTTPException: 404 if the org_unit is outside the caller's reach
            or the person is not a member of it.
    """
    _require_reached(db, current_user, unit_id)
    person = _require_member(db, unit_id, user_id)
    organisation_id = access.organisation_serving(db, unit_id)

    if organisation_id is None:
        return WithdrawOut(withdrawn=0)

    ended = enrolments.withdraw(
        db,
        person.id,
        org_unit_id=organisation_id,
        question_bank_id=body.module_id,
    )
    db.commit()

    return WithdrawOut(withdrawn=ended)


@door_router.get(
    "/{unit_id}/modules",
    response_model=ServedModulesOut,
)
def modules_served_at(
    unit_id: int,
    current_user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> ServedModulesOut:
    """List the modules the organisation above an org_unit serves.

    For the user form's Enrolment step, which has to be drawn for
    somebody who does not exist yet, and so cannot be asked for by
    their id. Names the organisation too, so a form holding several
    org_units of one organisation can show its modules once.

    Raises:
        HTTPException: 404 if the org_unit is outside the caller's reach.
    """
    _require_reached(db, current_user, unit_id)
    organisation_id = access.organisation_serving(db, unit_id)

    if organisation_id is None:
        return ServedModulesOut(
            organisation_id=None, organisation_name=None, modules=[]
        )

    organisation = db.get(OrgUnit, organisation_id)
    modules: list[ServedModuleOut] = []

    for status in db.scalars(
        select(QuestionBankOrgStatus)
        .where(
            QuestionBankOrgStatus.org_unit_id == organisation_id,
            QuestionBankOrgStatus.active_version.is_not(None),
        )
        .order_by(QuestionBankOrgStatus.question_bank_id)
    ).all():
        title = db.scalar(
            select(QuestionBankConfig.title).where(
                QuestionBankConfig.question_bank_id == status.question_bank_id,
                QuestionBankConfig.version == status.active_version,
            )
        )
        modules.append(
            ServedModuleOut(
                question_bank_id=status.question_bank_id,
                title=title or status.question_bank_id,
            )
        )

    return ServedModulesOut(
        organisation_id=organisation_id,
        organisation_name=organisation.name if organisation else None,
        modules=modules,
    )
