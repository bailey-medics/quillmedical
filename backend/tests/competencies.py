"""Test helpers for giving somebody competencies beyond their profession.

What somebody holds beyond their base profession is a current
``user_competency`` row. These write the rows a test needs, in the shapes
the routes write them.

Kept out of ``conftest.py`` for the reason ``tests/places.py`` is:
importing from there would give mypy the same file under two module names.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.teaching.enrolment import enrol
from app.features.teaching.models import QuestionBankOrgStatus
from app.models import PractisingCompetency, User, UserCompetency
from app.organisations import add_org_unit_member, organisation_org_units_of

#: How far back ``lapse`` moves a grant: a year, the length of a
#: subscription somebody buys for themselves.
PASSPORT_TERM = timedelta(days=365)


def hold(user: User, *competency_ids: str) -> None:
    """Give *user* each competency, as a current grant row.

    Undated, as an administrator's grant is. ``passport_write`` too:
    given through a site or organisation it does not lapse. A test that
    needs it to run out calls ``lapse``. The caller commits.
    """
    now = datetime.now(UTC)

    for competency_id in competency_ids:
        user.competency_grants.append(
            UserCompetency(
                competency_id=competency_id,
                starts_on=now,
                source="admin",
            )
        )


def withhold(user: User, *competency_ids: str) -> None:
    """Take each competency away from *user*, closing its grant rows.

    Somebody who does not hold a competency has no current grant row for
    it, whatever their profession grants, so this is how a test says
    "their profession gives it and they do not hold it". The caller
    commits.
    """
    now = datetime.now(UTC)

    for row in user.competency_grants:
        if row.competency_id in competency_ids and row.is_current(now):
            row.ends_on = now


def lapse(user: User, competency_id: str) -> None:
    """End every current grant of *competency_id*, as if it ran out.

    Both ends move back, a year and a day ago to a day ago, because a row
    must not end before it starts. The caller commits.
    """
    now = datetime.now(UTC)

    for row in user.competency_grants:
        if row.competency_id == competency_id and row.is_current(now):
            row.starts_on = now - PASSPORT_TERM - timedelta(days=1)
            row.ends_on = now - timedelta(days=1)


def clear(user: User) -> None:
    """End every grant *user* holds beyond what their profession seeded.

    For a test that used to empty ``additional_competencies``: afterwards
    they hold only what came with their profession. The caller commits.
    """
    now = datetime.now(UTC)

    for row in user.competency_grants:
        if row.source != "profession" and row.is_current(now):
            row.ends_on = now


def join_for_teaching(
    db: Session, org_unit_id: int, user_id: int, capacity: str
) -> None:
    """Join an org_unit, with a place there and its modules to take.

    What arriving through a centre's door does: the membership, the
    ``practising_competency`` row for ``take_teaching_modules`` that
    teaching asks for before it serves a module, and an enrolment on
    every module the organisation above serves at that moment. None of
    it gives anything to somebody without the competency. A module
    seeded afterwards needs ``enrol_members_on``. The caller commits.
    """
    add_org_unit_member(db, org_unit_id, user_id, capacity)
    already = db.scalar(
        select(PractisingCompetency.id).where(
            PractisingCompetency.user_id == user_id,
            PractisingCompetency.org_unit_id == org_unit_id,
            PractisingCompetency.competency == "take_teaching_modules",
        )
    )

    if already is None:
        db.add(
            PractisingCompetency(
                user_id=user_id,
                org_unit_id=org_unit_id,
                competency="take_teaching_modules",
            )
        )
        db.flush()
    for org_id in organisation_org_units_of(db, [org_unit_id]):
        for bank_id in db.scalars(
            select(QuestionBankOrgStatus.question_bank_id).where(
                QuestionBankOrgStatus.org_unit_id == org_id
            )
        ).all():
            enrol(
                db,
                user_id,
                org_unit_id=org_id,
                question_bank_id=bank_id,
                source="admin",
            )


def enrol_members_on(db: Session, org_unit_id: int, bank_id: str) -> None:
    """Enrol everybody with a place at *org_unit_id* on one module.

    For a module seeded after its learners arrived, which is the order
    most tests use. The caller commits.
    """
    for user_id in db.scalars(
        select(PractisingCompetency.user_id).where(
            PractisingCompetency.org_unit_id == org_unit_id,
            PractisingCompetency.competency == "take_teaching_modules",
        )
    ).all():
        enrol(
            db,
            user_id,
            org_unit_id=org_unit_id,
            question_bank_id=bank_id,
            source="admin",
        )
