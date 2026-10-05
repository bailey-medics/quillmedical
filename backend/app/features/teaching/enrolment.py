# backend/app/features/teaching/enrolment.py
"""Who is enrolled on which module.

The third of teaching's layers: a competency says somebody may take
modules, a place says where, and a ``module_enrolment`` row says which
module. Every read and write of that table goes through here.

A row means enrolled. Withdrawing sets ``ends_on`` and never deletes, so
the table keeps who was enrolled, when, and by whom.

See
``docs/docs/plans/2026-10-04-teaching-access-results-modules-and-enrolment-plan.md``.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import ColumnElement, and_, exists, or_, select
from sqlalchemy.orm import Session

from app.features.teaching.models import (
    ENROLMENT_SOURCES,
    ModuleEnrolment,
    QuestionBankOrgStatus,
)


def _current(now: datetime) -> ColumnElement[bool]:
    """The clause for an enrolment that counts at *now*."""
    return and_(
        ModuleEnrolment.starts_on <= now,
        or_(ModuleEnrolment.ends_on.is_(None), ModuleEnrolment.ends_on > now),
    )


def enrolled_on_offer(user_id: int) -> ColumnElement[bool]:
    """A clause on ``QuestionBankOrgStatus``: this person is enrolled.

    For the queries that find which of an organisation's modules to
    serve somebody. Added to one of them, it leaves only the modules
    they hold a current enrolment for at that organisation.

    Args:
        user_id: The person.

    Returns:
        A correlated ``EXISTS`` over ``module_enrolment``.
    """
    return exists().where(
        ModuleEnrolment.user_id == user_id,
        ModuleEnrolment.org_unit_id == QuestionBankOrgStatus.org_unit_id,
        ModuleEnrolment.question_bank_id
        == QuestionBankOrgStatus.question_bank_id,
        _current(datetime.now(UTC)),
    )


def is_enrolled(
    db: Session, user_id: int, *, org_unit_id: int, question_bank_id: str
) -> bool:
    """Whether somebody holds a current enrolment on one module.

    Args:
        db: Core database session.
        user_id: The person.
        org_unit_id: The organisation serving the module.
        question_bank_id: The module.

    Returns:
        True when a current row exists.
    """
    return (
        db.scalar(
            select(ModuleEnrolment.id)
            .where(
                ModuleEnrolment.user_id == user_id,
                ModuleEnrolment.org_unit_id == org_unit_id,
                ModuleEnrolment.question_bank_id == question_bank_id,
                _current(datetime.now(UTC)),
            )
            .limit(1)
        )
        is not None
    )


def enrol(
    db: Session,
    user_id: int,
    *,
    org_unit_id: int,
    question_bank_id: str,
    source: str,
    granted_by: int | None = None,
    ends_on: datetime | None = None,
) -> bool:
    """Enrol somebody on a module, unless they already are.

    Enrolling twice writes nothing: the row already there keeps who
    enrolled them and when. A different end date for somebody already
    enrolled is a withdrawal and a fresh enrolment, which says what
    happened.

    Args:
        db: Core database session. The row is flushed, not committed.
        user_id: The person.
        org_unit_id: The organisation serving the module.
        question_bank_id: The module.
        source: How it came about, one of ``ENROLMENT_SOURCES``.
        granted_by: Who enrolled them, where a person did.
        ends_on: When it stops counting, or None for no end.

    Returns:
        True if a row was written, False if they were already enrolled.

    Raises:
        ValueError: If *source* is not one of ``ENROLMENT_SOURCES``.
    """
    if source not in ENROLMENT_SOURCES:
        raise ValueError(f"Unknown enrolment source: {source!r}")

    if is_enrolled(
        db,
        user_id,
        org_unit_id=org_unit_id,
        question_bank_id=question_bank_id,
    ):
        return False

    db.add(
        ModuleEnrolment(
            user_id=user_id,
            org_unit_id=org_unit_id,
            question_bank_id=question_bank_id,
            starts_on=datetime.now(UTC),
            ends_on=ends_on,
            source=source,
            granted_by=granted_by,
        )
    )
    db.flush()
    return True


def withdraw(
    db: Session, user_id: int, *, org_unit_id: int, question_bank_id: str
) -> int:
    """End somebody's current enrolment on a module.

    Args:
        db: Core database session. Flushed, not committed.
        user_id: The person.
        org_unit_id: The organisation serving the module.
        question_bank_id: The module.

    Returns:
        How many rows were ended; 0 when they were not enrolled.
    """
    now = datetime.now(UTC)
    rows = list(
        db.scalars(
            select(ModuleEnrolment).where(
                ModuleEnrolment.user_id == user_id,
                ModuleEnrolment.org_unit_id == org_unit_id,
                ModuleEnrolment.question_bank_id == question_bank_id,
                _current(now),
            )
        ).all()
    )
    for row in rows:
        row.ends_on = now
    db.flush()
    return len(rows)
