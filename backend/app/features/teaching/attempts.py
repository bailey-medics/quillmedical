"""A learner's attempt at a question bank, from starting it to finishing it.

Who is asking is the route's to find, and so is which organisations'
modules they may take. ``app.features.teaching.access`` answers which
bank they may start and whose an attempt is. These functions take those
answers, draw the questions, write the attempt, find the one question
of it a learner is to be handed, record what they answer, and mark the
attempt when they finish it.

What a learner is sent of a question is not built here. The router's
``_build_candidate_item`` does that, for these routes and for the ones
that take an answer, from the answer row and the synced copy of the
bank that the functions below hand back.

Whether an answer is right, and whether an attempt passes, is
``app.features.teaching.scoring``. These functions hand it the answer
and the bank and store what it says.

A learner has one attempt in progress on a bank at an organisation,
and no more. Starting while one is in progress hands that one back,
with the same questions and its time already running, and writes
nothing: ``attempt_in_progress`` finds it and ``pick_up_attempt`` lays
it out. The database holds the same rule, in a unique index over
unfinished attempts, so of two requests at the same instant one
writes and ``begin_or_pick_up_attempt`` hands the other what the first
wrote. "In progress" means not finished: the route finishes any
attempt whose time has run out before it asks.

These things are deliberately not asked, because the routes never asked
them, and each is pinned by a test as it stands:

- **How many attempts they have made.** Nothing counts them.
- **Whether what was chosen is one of the question's options.**
  Anything sent is stored, and scored as wrong with no tags.
- **Whether every question has an answer, when the attempt is
  finished.** One with questions left is marked as it stands.
- **Whether a question has been answered before, when its answer is
  changed by id.** A question never answered can be answered that way,
  out of turn.

An attempt's time is read in one place, ``deadline_of``. It runs from
the start for as many minutes as the bank allowed, and an attempt that
holds a limit of 0 has no limit and never runs out. When the time has
run out the attempt is finished: ``finish_if_out_of_time`` marks it as
it stood at that moment, and every route that touches an attempt calls
it first. The functions that read a question do not ask about time
themselves, and those that take an answer still refuse a late one.

The draw is made through the ``random`` module by name, so a test that
replaces ``random.sample`` or ``random.shuffle`` fixes it.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.features.teaching.access import (
    attempt_belonging_to,
    bank_status_open_for_attempts,
)
from app.features.teaching.errors import (
    AllItemsAlreadyAnswered,
    AnswerNotFound,
    AssessmentAlreadyCompleted,
    AssessmentConfigNotFound,
    AssessmentNotFound,
    AssessmentNotOpen,
    ItemNotFound,
    QuestionBankNotFound,
    TimeLimitExceeded,
)
from app.features.teaching.models import (
    Assessment,
    AssessmentAnswer,
    QuestionBankConfig,
    QuestionBankItem,
)
from app.features.teaching.scoring import (
    evaluate_pass_criteria,
    score_answer_uniform,
    score_answer_variable,
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


@dataclass(frozen=True)
class AttemptToSit:
    """The attempt a learner who asked to start is to sit, and where from."""

    assessment: Assessment
    #: The first question with no answer, and the bank it is laid out
    #: from. None when the attempt has no question left to answer.
    first: ItemOfAttempt | None
    #: True when the attempt was already in progress and is handed
    #: back. False when it was written by this call.
    resumed: bool


@dataclass(frozen=True)
class AnswerRecorded:
    """An answer just stored, and what is left of the attempt."""

    #: The first question still without an answer, or None when the one
    #: just answered was the last.
    next_answer: AssessmentAnswer | None
    #: The synced copy of the bank the attempt was started on, which
    #: the next question is laid out from.
    config: QuestionBankConfig


@dataclass(frozen=True)
class AttemptFinished:
    """An attempt just marked, and what it was marked against."""

    #: The synced copy of the bank the attempt was started on.
    config: QuestionBankConfig
    #: One result for each of the bank's pass criteria, in the bank's
    #: order, as ``evaluate_pass_criteria`` gives them.
    criteria_results: list[dict[str, Any]]
    #: True when every criterion passed. True also for a bank that
    #: names no criteria at all.
    overall_passed: bool
    #: What was stored on the attempt: the criteria and the verdict.
    score_breakdown: dict[str, Any]


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

    Nothing is asked here of the learner's earlier attempts. The
    database refuses a second unfinished attempt for the same learner,
    bank and organisation, so this raises ``IntegrityError`` when one
    is in progress. ``begin_or_pick_up_attempt`` is the caller that
    expects that.

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


def attempt_in_progress(
    db: Session, user_id: int, *, bank_id: str
) -> Assessment | None:
    """A learner's unfinished attempt on one bank, wherever it was started.

    Asked of exactly what the unique index
    ``uq_assessments_one_in_progress`` is over: the learner and the
    bank, among attempts with no completion time. So there is at most
    one, and wherever this finds none a new attempt can be written.

    The organisation is not asked. A learner who can sit one bank
    through two organisations has one attempt in progress on it, and
    sits it at the organisation they started it at: the attempt found
    says which that is.

    Time is not asked. An attempt whose time has run out is the
    caller's to have finished first, with ``finish_if_out_of_time``.
    Nothing is written.

    Args:
        db: Core database session.
        user_id: The learner.
        bank_id: The question bank.
    """
    return (
        db.execute(
            select(Assessment)
            .where(
                Assessment.user_id == user_id,
                Assessment.question_bank_id == bank_id,
                Assessment.completed_at.is_(None),
            )
            .order_by(Assessment.id.desc())
        )
        .scalars()
        .first()
    )


def pick_up_attempt(db: Session, assessment: Assessment) -> AttemptToSit:
    """Hand back an attempt in progress to a learner who asked to start.

    The attempt is as it was left: the same questions in the same
    order, the answers already given, and the time running from when it
    was first started. Its next question is found and laid out as
    ``next_unanswered_item`` does for a learner coming back to it by
    its id, from the version of the bank the attempt was started on,
    which need not be the version served now. Nothing is written.

    Args:
        db: Core database session.
        assessment: The learner's own unfinished attempt.

    Raises:
        AssessmentConfigNotFound: If the organisation the attempt was
            recorded against holds no synced copy of the version sat.
    """
    return AttemptToSit(
        assessment=assessment,
        first=next_unanswered_item(db, assessment),
        resumed=True,
    )


def begin_or_pick_up_attempt(
    db: Session, user_id: int, bank: BankToSit
) -> AttemptToSit:
    """Write a new attempt, or hand back the one another request wrote.

    For a learner the caller has found to have no attempt in progress.
    The draw and the writes are ``begin_attempt``.

    Two requests at the same instant can both have found none. The
    database lets one of them write, and refuses the other for the
    unique index over unfinished attempts. The one refused looks again
    and hands back the attempt the first wrote, so both are answered
    with the same attempt and the learner holds one.

    The write is made inside a savepoint, so a refusal undoes the
    attempt that could not be written and leaves the rest of the
    request's transaction as it was.

    Args:
        db: Core database session.
        user_id: The learner.
        bank: What ``bank_to_sit`` found for them.

    Raises:
        IntegrityError: If the database refused the attempt and none
            is in progress to hand back, so it was refused for some
            other reason.
        AssessmentConfigNotFound: If the attempt handed back is on a
            version its organisation holds no synced copy of.
    """
    try:
        with db.begin_nested():
            begun = begin_attempt(db, user_id, bank)
    except IntegrityError:
        under_way = attempt_in_progress(
            db, user_id, bank_id=bank.config.question_bank_id
        )

        if under_way is None:
            raise

        return pick_up_attempt(db, under_way)

    first = None

    if begun.first_answer is not None:
        first = ItemOfAttempt(answer=begun.first_answer, config=bank.config)

    return AttemptToSit(
        assessment=begun.assessment, first=first, resumed=False
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

    Whether the attempt's time has run out is not asked here. The route
    finishes such an attempt first, with ``finish_if_out_of_time``, so
    it is refused below as finished.

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

    Whether the attempt's time has run out is not asked here. The route
    finishes such an attempt first, with ``finish_if_out_of_time``, so
    it is refused below as finished.

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


def record_answer(
    db: Session,
    assessment: Assessment,
    selected_option: str,
    answer_id: int | None = None,
) -> AnswerRecorded:
    """Store a learner's answer to the next question of their attempt.

    The question answered is never chosen by the caller: it is the
    first of this attempt, in display order, that has no answer yet.
    So an answer cannot land on another attempt's question, and one
    already answered is not answered again this way.

    A caller may say which question it means, by ``answer_id``, and
    then the answer is only ever stored on that question. This is what
    makes sending an answer twice safe. Where the first was stored and
    only its reply was lost, the second names a question that now has
    an answer: nothing is stored, and the reply is what the first would
    have been, the next question without one. Without the name the
    second would be stored on the question after. A name that is not
    the next question, and not one already answered, is refused.

    The answer is scored as it is stored, by the scoring module, and
    the tags of the option chosen are copied onto it. What was chosen
    is not asked to be one of the question's options: anything else is
    stored as it came and scored as wrong, with no tags.

    The attempt is the caller's to have found as the learner's own, and
    to have checked they may still enter its module. The checks here
    run in this order, so the first that fails is the one reported:
    finished, out of time, nothing left to answer, bank gone. An
    attempt the clock finished is told it is out of time, not finished.

    The answer is flushed, not committed, so the question after it can
    be looked for.

    Args:
        db: Core database session.
        assessment: The learner's own attempt.
        selected_option: The id of the option they chose.
        answer_id: The answer row of the question they mean, or None
            to mean whichever is next.

    Returns:
        The next question without an answer, if any, and the bank.
        Whether the answer was right is stored and not handed back.

    Raises:
        AssessmentAlreadyCompleted: If the learner finished the attempt.
        TimeLimitExceeded: If the attempt's time has run out, whether
            or not it has been finished for that yet.
        AnswerNotFound: If ``answer_id`` is given and is no question of
            this attempt, or is one further on than the next.
        AllItemsAlreadyAnswered: If every question has an answer, and
            no question was named.
        AssessmentConfigNotFound: If the organisation the attempt was
            recorded against holds no synced copy of the version sat.
    """
    _refuse_an_answer_to_a_finished_attempt(assessment)

    now = _now_within_time(assessment)

    # Find current unanswered item
    current = _first_unanswered(db, assessment.id)

    if answer_id is not None and (current is None or current.id != answer_id):
        _require_answered_already(db, assessment, answer_id)

        # A repeat of an answer already stored: store nothing, and say
        # what the first reply said.
        return AnswerRecorded(
            next_answer=current, config=_bank_sat(db, assessment)
        )

    if not current:
        raise AllItemsAlreadyAnswered()

    config_row = _bank_sat(db, assessment)

    _store_answer(current, config_row, selected_option, now)
    db.flush()

    return AnswerRecorded(
        next_answer=_first_unanswered(db, assessment.id),
        config=config_row,
    )


def change_answer(
    db: Session,
    assessment: Assessment,
    answer_id: int,
    selected_option: str,
) -> ItemOfAttempt:
    """Store a learner's new answer to one question of their attempt.

    The answer row is looked for by its id among the rows of this
    attempt only, so an id that is another attempt's is not found. The
    row is not asked to hold an answer already: a question never
    answered can be answered this way, ahead of its turn.

    Scored and stored as ``record_answer`` does, replacing what was
    chosen, whether it was right, its tags and when it was answered.

    The attempt is the caller's to have found as the learner's own, and
    to have checked they may still enter its module. The checks here
    run in this order: finished, out of time, no such answer, bank
    gone. An attempt the clock finished is told it is out of time, not
    finished.

    Nothing is flushed. The route did not, and nothing is read back
    after the change: it is written when the request is committed.

    Args:
        db: Core database session.
        assessment: The learner's own attempt.
        answer_id: The answer row they asked to change.
        selected_option: The id of the option they now choose.

    Returns:
        The answer row as changed, and the bank it is laid out from.

    Raises:
        AssessmentAlreadyCompleted: If the learner finished the attempt.
        TimeLimitExceeded: If the attempt's time has run out, whether
            or not it has been finished for that yet.
        AnswerNotFound: If this attempt has no answer row by that id.
        AssessmentConfigNotFound: If the organisation the attempt was
            recorded against holds no synced copy of the version sat.
    """
    _refuse_an_answer_to_a_finished_attempt(assessment)

    now = _now_within_time(assessment)

    answer = (
        db.execute(
            select(AssessmentAnswer).where(
                AssessmentAnswer.id == answer_id,
                AssessmentAnswer.assessment_id == assessment.id,
            )
        )
        .scalars()
        .first()
    )

    if not answer:
        raise AnswerNotFound()

    config_row = _bank_sat(db, assessment)

    _store_answer(answer, config_row, selected_option, now)

    return ItemOfAttempt(answer=answer, config=config_row)


def finish_attempt(db: Session, assessment: Assessment) -> AttemptFinished:
    """Mark a learner's attempt against its bank's pass criteria.

    Every answer row of the attempt is read, answered or not, and
    handed to ``evaluate_pass_criteria`` with the criteria of the bank
    version the attempt was started on. The attempt passes when every
    criterion does.

    Written to the attempt, in this order: when it was finished, the
    breakdown, whether it passed, and its exam reference. The reference
    is the bank's ``results.exam_ref_prefix`` followed by the attempt's
    id, and is left unset where the bank gives no prefix. It is written
    whether or not the attempt passed.

    An attempt found after its time has run out is finished as it stood
    when the time ended: it is marked on the answers it holds, which
    were all given in time since a late answer is refused, and it is
    recorded as finished at that moment and not at this one. It is
    marked exactly as any other, so it passes if those answers are
    enough. Nothing records how an attempt came to be finished, only
    that it was and when.

    An attempt is marked once. A second call is refused before anything
    is read, so its score and its reference never change.

    Whether every question has an answer is not asked, as the route
    never asked it. A question left unanswered counts towards the total
    and towards no tag.

    The attempt is the caller's to have found as the learner's own, and
    to have checked they may still enter its module. Nothing is flushed
    or committed here: the caller commits, before anything is sent to
    anybody about the result.

    Args:
        db: Core database session.
        assessment: The learner's own attempt.

    Returns:
        The bank, each criterion's result, the verdict and the
        breakdown stored.

    Raises:
        AssessmentAlreadyCompleted: If the attempt is finished.
        AssessmentConfigNotFound: If the organisation the attempt was
            recorded against holds no synced copy of the version sat.
    """
    if assessment.completed_at:
        raise AssessmentAlreadyCompleted()

    config_row = _bank_sat(db, assessment)
    config = config_row.config_yaml
    pass_criteria = config.get("pass_criteria", [])

    # Gather scored answers
    answers = (
        db.execute(
            select(AssessmentAnswer).where(
                AssessmentAnswer.assessment_id == assessment.id
            )
        )
        .scalars()
        .all()
    )

    # Tags from the `assessment_answer_tag` rows, the copy taken when each
    # answer was given.
    answer_dicts = [
        {
            "selected_option": a.selected_option,
            "is_correct": a.is_correct,
            "resolved_tags": sorted(row.tag for row in a.tags),
        }
        for a in answers
    ]

    criteria_results = evaluate_pass_criteria(
        pass_criteria, answer_dicts, assessment.total_items
    )
    overall_passed = all(c["passed"] for c in criteria_results)

    score_breakdown = {
        "criteria": criteria_results,
        "overall_passed": overall_passed,
    }

    # An attempt found after its time is finished as at the moment the
    # time ended, not as at the moment somebody noticed.
    now = datetime.now(UTC)
    deadline = deadline_of(assessment)

    if deadline is not None and now > deadline:
        assessment.completed_at = deadline
    else:
        assessment.completed_at = now

    assessment.score_breakdown = score_breakdown
    assessment.is_passed = overall_passed

    # Generate exam reference from prefix in config
    exam_ref_prefix = config.get("results", {}).get("exam_ref_prefix", "")

    if exam_ref_prefix:
        assessment.exam_ref = f"{exam_ref_prefix}{assessment.id}"

    return AttemptFinished(
        config=config_row,
        criteria_results=criteria_results,
        overall_passed=overall_passed,
        score_breakdown=score_breakdown,
    )


def _require_answered_already(
    db: Session, assessment: Assessment, answer_id: int
) -> None:
    """Refuse a named question that is not one already answered.

    Asked only of a name that is not the next question. Looked for
    among the rows of this attempt, so another attempt's is not found.

    Raises:
        AnswerNotFound: If this attempt has no answer row by that id,
            or has one with nothing chosen yet, which is a question
            further on than the next.
    """
    named = (
        db.execute(
            select(AssessmentAnswer).where(
                AssessmentAnswer.id == answer_id,
                AssessmentAnswer.assessment_id == assessment.id,
            )
        )
        .scalars()
        .first()
    )

    if named is None or named.selected_option is None:
        raise AnswerNotFound()


def deadline_of(assessment: Assessment) -> datetime | None:
    """The moment an attempt's time ends, or None where it has no limit.

    The one place an attempt's time limit is read. The time runs from
    when the attempt was started for as many minutes as its bank
    allowed. The start is read as UTC whatever zone it came back from
    the database with.

    An attempt started on a bank that gave no time limit holds a limit
    of 0. That, like no limit at all, means the attempt is not timed:
    it has no deadline and never runs out.
    """
    if not assessment.time_limit_minutes:
        return None

    return assessment.started_at.replace(tzinfo=UTC) + timedelta(
        minutes=assessment.time_limit_minutes
    )


def unfinished_attempts(
    db: Session, user_id: int, *, bank_id: str | None = None
) -> list[Assessment]:
    """A learner's attempts that are not finished, oldest first.

    For finishing those whose time has run out before a new attempt is
    started or their results are listed. Nothing is written.

    Args:
        db: Core database session.
        user_id: The learner.
        bank_id: Only attempts on this question bank, or on every bank
            where none is given.
    """
    query = select(Assessment).where(
        Assessment.user_id == user_id,
        Assessment.completed_at.is_(None),
    )

    if bank_id is not None:
        query = query.where(Assessment.question_bank_id == bank_id)

    return list(db.execute(query.order_by(Assessment.id)).scalars().all())


def finish_if_out_of_time(
    db: Session, assessment: Assessment
) -> AttemptFinished | None:
    """Finish an attempt whose time has run out, and leave any other.

    Every route that touches an attempt calls this once it knows whose
    the attempt is and before anything else, so an attempt past its time
    is finished before it is read or written. The marking is
    ``finish_attempt``'s, which records the attempt as finished when
    its time ended.

    Safe to call twice, and by two requests at once. The attempt's row
    is read again and locked before it is marked, so the second caller
    waits for the first, then finds the attempt finished and does
    nothing. The lock is ``SELECT ... FOR UPDATE``, held until the
    caller commits. SQLite has no such lock and leaves it out: there
    the read again is what tells a second call the work is done.

    An attempt whose bank has gone cannot be marked. It is left as it
    is and nothing is raised, so each route goes on to answer as it did
    before for such an attempt.

    Anything pending on the attempt must be flushed first, since the
    row is read again. Nothing is flushed or committed here: the caller
    commits, before anything is sent to anybody about the result.

    Args:
        db: Core database session.
        assessment: The learner's own attempt.

    Returns:
        What ``finish_attempt`` gives when this call finished the
        attempt. None when it did not: the attempt was finished
        already, has time left, has no time limit, or has lost its
        bank.
    """
    if not _is_out_of_time(assessment):
        return None

    # Two requests can find the same attempt out of time. Only the one
    # holding the row marks it; the other reads what that one wrote.
    db.refresh(assessment, with_for_update=True)

    if not _is_out_of_time(assessment):
        return None

    try:
        return finish_attempt(db, assessment)
    except AssessmentConfigNotFound:
        return None


def _is_out_of_time(assessment: Assessment) -> bool:
    """Whether an unfinished attempt's time has run out by now."""
    if assessment.completed_at:
        return False

    deadline = deadline_of(assessment)

    return deadline is not None and datetime.now(UTC) > deadline


def _refuse_an_answer_to_a_finished_attempt(assessment: Assessment) -> None:
    """Refuse an answer to a finished attempt, in the words that fit.

    An attempt its learner finished takes nothing more. One recorded
    as finished at the very moment its time ended is refused as out of
    time, which is what a late answer was told before such an attempt
    was finished for them, and what it is told still. Nothing is stored
    to say how an attempt came to be finished: one found past its time
    is dated at its deadline exactly, and that date is what is read.

    Raises:
        TimeLimitExceeded: If the attempt is recorded as finished at
            the moment its time ended.
        AssessmentAlreadyCompleted: If it was finished at any other.
    """
    if not assessment.completed_at:
        return

    finished_at = assessment.completed_at.replace(tzinfo=UTC)

    if finished_at == deadline_of(assessment):
        raise TimeLimitExceeded()

    raise AssessmentAlreadyCompleted()


def _now_within_time(assessment: Assessment) -> datetime:
    """The time now, where an attempt still has time left.

    When the time ends is ``deadline_of``. An answer sent at the very
    last moment is in time: only one sent after it is refused. An
    attempt with no time limit always has time left.

    Returns:
        The moment the question was asked, which the caller stores as
        when the answer was given.

    Raises:
        TimeLimitExceeded: If that moment is after the attempt's time.
    """
    # Time limit check
    now = datetime.now(UTC)
    deadline = deadline_of(assessment)

    if deadline is not None and now > deadline:
        raise TimeLimitExceeded()

    return now


def _store_answer(
    answer: AssessmentAnswer,
    config_row: QuestionBankConfig,
    selected_option: str,
    now: datetime,
) -> None:
    """Score what was chosen and write it to an answer row.

    A bank of type ``uniform`` is scored from the bank's own options
    and the item's metadata. Any other type is scored from the item's
    options and its right answer. Nothing is flushed.
    """
    item = answer.item

    # Score the answer
    if config_row.type == "uniform":
        is_correct, resolved_tags = score_answer_uniform(
            selected_option, config_row.config_yaml, item.metadata_json
        )
    else:
        is_correct, resolved_tags = score_answer_variable(
            selected_option,
            item.options or [],
            item.correct_option_id or "",
        )

    # Persist
    answer.selected_option = selected_option
    answer.is_correct = is_correct
    answer.set_tags(resolved_tags)
    answer.answered_at = now


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
