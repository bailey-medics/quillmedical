"""A learner's attempt at a question bank: starting one, and its questions.

Who is asking is the route's to find, and so is which organisations'
modules they may take. ``app.features.teaching.access`` answers which
bank they may start and whose an attempt is. These functions take those
answers, draw the questions, write the attempt, and find the one
question of it a learner is to be handed.

What a learner is sent of a question is not built here. The router's
``_build_candidate_item`` does that, for these routes and for the ones
that take an answer, from the answer row and the synced copy of the
bank that the functions below hand back.

Three things are deliberately not asked, because the routes never asked
them, and each is pinned by a test as it stands:

- **Whether the learner already has an attempt under way on the bank.**
  Starting again writes a second attempt beside the first, and both
  stay open.
- **How many attempts they have made.** Nothing counts them.
- **Whether an attempt's time has run out, when one of its questions is
  read.** Only answering asks that. A finished attempt is refused.

The draw is made through the ``random`` module by name, so a test that
replaces ``random.sample`` or ``random.shuffle`` fixes it.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.teaching.access import (
    attempt_belonging_to,
    bank_status_open_for_attempts,
)
from app.features.teaching.errors import (
    AssessmentAlreadyCompleted,
    AssessmentConfigNotFound,
    AssessmentNotFound,
    AssessmentNotOpen,
    ItemNotFound,
    QuestionBankNotFound,
)
from app.features.teaching.models import (
    Assessment,
    AssessmentAnswer,
    QuestionBankConfig,
    QuestionBankItem,
)


@dataclass(frozen=True)
class BankToSit:
    """One question bank a learner may start an attempt on, as found."""

    #: The organisation whose status row opens the bank to them. The
    #: attempt is recorded against it.
    organisation_id: int
    #: The synced copy of the version that organisation has promoted.
    #: It may be another organisation's copy.
    config: QuestionBankConfig
    #: Every published item of that version, from the organisation that
    #: owns the copy. The pool the attempt is drawn from.
    published_items: list[QuestionBankItem]
    #: The fewest published items the bank asks for before an attempt
    #: may start, as its config gives it, or 0 where it gives none.
    min_pool_size: int


@dataclass(frozen=True)
class AttemptBegun:
    """An attempt just written, and the first question of it."""

    assessment: Assessment
    #: None only when the attempt drew no questions at all.
    first_answer: AssessmentAnswer | None


@dataclass(frozen=True)
class ItemOfAttempt:
    """One question of an attempt, and the bank it is laid out from."""

    answer: AssessmentAnswer
    config: QuestionBankConfig


def bank_to_sit(
    db: Session,
    user_id: int,
    *,
    organisation_ids: list[int],
    bank_id: str,
) -> BankToSit:
    """Find the bank a learner asks to start an attempt on, and its pool.

    Three queries, in this order: the status row that opens the bank to
    them, the synced copy of the version promoted there, and that
    version's published items.

    The synced copy read is whichever the database gives first for that
    bank and version: it is not asked whose copy it is, since the
    content may be owned by another organisation. The items are the
    owner's.

    Whether the pool is large enough is left to the caller, who reads
    ``min_pool_size`` and ``published_items`` and refuses in its own
    words. Nothing is written.

    Args:
        db: Core database session.
        user_id: The learner.
        organisation_ids: The organisations whose modules they may
            take, as ``organisations_open_for_modules`` gives them.
        bank_id: The question bank they asked for.

    Returns:
        The organisation, the synced copy, the pool and the smallest
        pool the bank allows.

    Raises:
        AssessmentNotOpen: If no organisation of theirs has the bank
            open to new attempts with them enrolled on it, or the one
            found has no version promoted.
        QuestionBankNotFound: If the promoted version has no synced
            copy.
    """
    # Block assessment start when bank is not live for user's org
    status_row = bank_status_open_for_attempts(
        db, user_id, organisation_ids=organisation_ids, bank_id=bank_id
    )

    if not status_row:
        raise AssessmentNotOpen()

    # The version this organisation has promoted, not the newest imported.
    # Syncing a revision must not change what a candidate sits mid-cohort;
    # advancing the pointer is a deliberate act by a staff org admin.
    if status_row.active_version is None:
        raise AssessmentNotOpen()

    # May be owned by a different org - content is shared, the pointer is not.
    config_row = (
        db.execute(
            select(QuestionBankConfig).where(
                QuestionBankConfig.question_bank_id == bank_id,
                QuestionBankConfig.version == status_row.active_version,
            )
        )
        .scalars()
        .first()
    )

    if not config_row:
        raise QuestionBankNotFound()

    assessment_cfg = config_row.config_yaml.get("assessment", {})

    # Load published items for this bank + version (from config owner org)
    published_items = (
        db.execute(
            select(QuestionBankItem).where(
                QuestionBankItem.org_unit_id == config_row.org_unit_id,
                QuestionBankItem.question_bank_id == bank_id,
                QuestionBankItem.bank_version == config_row.version,
                QuestionBankItem.status == "published",
            )
        )
        .scalars()
        .all()
    )

    return BankToSit(
        organisation_id=status_row.org_unit_id,
        config=config_row,
        published_items=list(published_items),
        min_pool_size=assessment_cfg.get("min_pool_size", 0),
    )


def begin_attempt(db: Session, user_id: int, bank: BankToSit) -> AttemptBegun:
    """Draw an attempt's questions at random and write the attempt.

    ``items_per_attempt`` items are drawn from the pool without
    replacement, or the whole pool where it holds fewer. A bank whose
    config gives no ``items_per_attempt`` draws none, and the attempt
    is written with nothing in it. The items drawn are then shuffled,
    unless the config sets ``randomise_order`` to false, and stored in
    that order, numbered from 1.

    Nothing is asked of the learner's earlier attempts: one already
    under way on the same bank is left as it is, and this writes
    another beside it.

    The attempt and its answer rows are flushed, not committed.

    Args:
        db: Core database session.
        user_id: The learner.
        bank: What ``bank_to_sit`` found for them.

    Returns:
        The attempt, and its first unanswered question in display
        order.
    """
    config = bank.config.config_yaml
    assessment_cfg = config.get("assessment", {})
    items_per_attempt = assessment_cfg.get("items_per_attempt", 0)
    time_limit = assessment_cfg.get("time_limit_minutes", 0)

    # Randomly select and order items
    # Not a secret: which questions an attempt draws, and in what order.
    selected = random.sample(  # nosec B311
        list(bank.published_items),
        min(items_per_attempt, len(bank.published_items)),
    )

    if assessment_cfg.get("randomise_order", True):
        random.shuffle(selected)

    # Create assessment
    assessment = Assessment(
        user_id=user_id,
        org_unit_id=bank.organisation_id,
        question_bank_id=bank.config.question_bank_id,
        bank_version=bank.config.version,
        time_limit_minutes=time_limit,
        total_items=len(selected),
    )
    db.add(assessment)
    db.flush()

    # Create answer rows
    for idx, item in enumerate(selected, start=1):
        db.add(
            AssessmentAnswer(
                assessment_id=assessment.id,
                item_id=item.id,
                display_order=idx,
            )
        )
    db.flush()
    db.refresh(assessment)

    return AttemptBegun(
        assessment=assessment,
        first_answer=_first_unanswered(db, assessment.id),
    )


def attempt_of(db: Session, user_id: int, assessment_id: int) -> Assessment:
    """Return a learner's own attempt, or refuse.

    Args:
        db: Core database session.
        user_id: The learner asking.
        assessment_id: The attempt they asked for.

    Raises:
        AssessmentNotFound: If there is no attempt by that id, or it is
            somebody else's. The same refusal for both.
    """
    assessment = attempt_belonging_to(db, user_id, assessment_id)

    if assessment is None:
        raise AssessmentNotFound()

    return assessment


def next_unanswered_item(
    db: Session, assessment: Assessment
) -> ItemOfAttempt | None:
    """The first question of an attempt that has no answer yet.

    For picking an attempt up again after a lost connection. The
    attempt is the caller's to have found as the learner's own, and to
    have checked they may still enter its module.

    Whether the attempt's time has run out is not asked.

    Args:
        db: Core database session.
        assessment: The learner's own attempt.

    Returns:
        The question and the bank it is laid out from, or None when
        every question has an answer. None is given before the bank is
        looked for, so an attempt answered in full is not refused for
        a missing synced copy.

    Raises:
        AssessmentAlreadyCompleted: If the attempt is finished.
        AssessmentConfigNotFound: If the organisation the attempt was
            recorded against holds no synced copy of the version sat.
    """
    if assessment.completed_at:
        raise AssessmentAlreadyCompleted()

    next_answer = _first_unanswered(db, assessment.id)

    if not next_answer:
        return None

    return ItemOfAttempt(answer=next_answer, config=_bank_sat(db, assessment))


def item_at_position(
    db: Session, assessment: Assessment, display_order: int
) -> ItemOfAttempt:
    """The question at one position of an attempt, answered or not.

    For going back to a question. Only the rows of this attempt are
    searched, so a position is never another attempt's. The attempt is
    the caller's to have found as the learner's own, and to have
    checked they may still enter its module.

    Whether the attempt's time has run out is not asked.

    Args:
        db: Core database session.
        assessment: The learner's own attempt.
        display_order: The position, counted from 1.

    Returns:
        The question and the bank it is laid out from.

    Raises:
        AssessmentAlreadyCompleted: If the attempt is finished.
        ItemNotFound: If the attempt has no question at that position.
        AssessmentConfigNotFound: If the organisation the attempt was
            recorded against holds no synced copy of the version sat.
    """
    if assessment.completed_at:
        raise AssessmentAlreadyCompleted()

    answer = (
        db.execute(
            select(AssessmentAnswer).where(
                AssessmentAnswer.assessment_id == assessment.id,
                AssessmentAnswer.display_order == display_order,
            )
        )
        .scalars()
        .first()
    )

    if not answer:
        raise ItemNotFound()

    return ItemOfAttempt(answer=answer, config=_bank_sat(db, assessment))


def _first_unanswered(
    db: Session, assessment_id: int
) -> AssessmentAnswer | None:
    """The lowest-placed answer row of an attempt with nothing chosen."""
    return (
        db.execute(
            select(AssessmentAnswer)
            .where(
                AssessmentAnswer.assessment_id == assessment_id,
                AssessmentAnswer.selected_option.is_(None),
            )
            .order_by(AssessmentAnswer.display_order)
        )
        .scalars()
        .first()
    )


def _bank_sat(db: Session, assessment: Assessment) -> QuestionBankConfig:
    """The synced copy of the bank version an attempt was started on.

    Asked of the organisation the attempt is recorded against, which
    starting an attempt does not ask: ``bank_to_sit`` takes any
    organisation's copy. An attempt started on another organisation's
    copy is therefore refused here.

    Raises:
        AssessmentConfigNotFound: If that organisation holds no copy
            of that version.
    """
    config_row = (
        db.execute(
            select(QuestionBankConfig).where(
                QuestionBankConfig.org_unit_id == assessment.org_unit_id,
                QuestionBankConfig.question_bank_id
                == assessment.question_bank_id,
                QuestionBankConfig.version == assessment.bank_version,
            )
        )
        .scalars()
        .first()
    )

    if not config_row:
        raise AssessmentConfigNotFound()

    return config_row
