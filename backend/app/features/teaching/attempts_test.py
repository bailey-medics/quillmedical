"""Starting an attempt and reading its questions, asked of attempts.py itself."""

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.features.teaching import attempts, media
from app.features.teaching.attempts import (
    BankToSit,
    attempt_of,
    bank_to_sit,
    begin_attempt,
    change_answer,
    deadline_of,
    finish_attempt,
    finish_if_out_of_time,
    item_at_position,
    next_unanswered_item,
    record_answer,
    unfinished_attempts,
)
from app.features.teaching.enrolment import enrol
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
    QuestionBankOrgStatus,
)
from app.models import OrgUnit, User

BANK = "polyps"
OTHER_BANK = "bleeding"


def _organisation(db: Session, name: str = "Trust") -> OrgUnit:
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
    db.flush()

    return org


def _person(db: Session, username: str = "learner") -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        password_hash="x",
        is_active=True,
        email_verified=True,
        base_profession="teaching_delegate",
    )
    db.add(user)
    db.flush()

    return user


def _serve(
    db: Session,
    org: OrgUnit,
    user: User,
    *,
    active_version: int | None = 1,
    is_live: bool = True,
    enrolled: bool = True,
) -> None:
    """A status row for the bank at *org*, with *user* enrolled on it."""
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=BANK,
            is_live=is_live,
            active_version=active_version,
        )
    )
    db.flush()

    if enrolled:
        enrol(
            db,
            user.id,
            org_unit_id=org.id,
            question_bank_id=BANK,
            source="admin",
        )


def _sync(
    db: Session,
    org: OrgUnit,
    *,
    version: int = 1,
    assessment: dict[str, Any] | None = None,
) -> QuestionBankConfig:
    """One version of the bank, synced into the organisation."""
    config_yaml: dict[str, Any] = {"id": BANK}

    if assessment is not None:
        config_yaml["assessment"] = assessment

    config = QuestionBankConfig(
        org_unit_id=org.id,
        question_bank_id=BANK,
        version=version,
        title="Polyps",
        description="A question bank.",
        type="uniform",
        config_yaml=config_yaml,
    )
    db.add(config)
    db.flush()

    return config


def _items(
    db: Session,
    org: OrgUnit,
    count: int,
    *,
    version: int = 1,
    status: str = "published",
    bank_id: str = BANK,
) -> list[QuestionBankItem]:
    items = [
        QuestionBankItem(
            org_unit_id=org.id,
            question_bank_id=bank_id,
            bank_version=version,
            status=status,
            images=[],
            metadata_json={},
        )
        for _ in range(count)
    ]
    db.add_all(items)
    db.flush()

    return items


def _bank(
    db: Session,
    org: OrgUnit,
    pool: int,
    assessment: dict[str, Any] | None = None,
) -> BankToSit:
    """A bank with *pool* published items, as ``bank_to_sit`` hands it on."""
    config = _sync(db, org, assessment=assessment)

    return BankToSit(
        organisation_id=org.id,
        config=config,
        published_items=_items(db, org, pool),
        min_pool_size=0,
    )


def _fix_the_draw(
    monkeypatch: pytest.MonkeyPatch,
) -> dict[str, list[Any]]:
    """Make the draw the first items of the pool, and the shuffle a reversal.

    Each call is noted, so a test can say what was asked of ``random``.
    """
    asked: dict[str, list[Any]] = {"sample": [], "shuffle": []}

    def sample(pool: Sequence[Any], k: int) -> list[Any]:
        asked["sample"].append(([item.id for item in pool], k))

        return list(pool)[:k]

    def shuffle(drawn: list[Any]) -> None:
        asked["shuffle"].append([item.id for item in drawn])
        drawn.reverse()

    monkeypatch.setattr(attempts.random, "sample", sample)
    monkeypatch.setattr(attempts.random, "shuffle", shuffle)

    return asked


def _stored(db: Session, assessment: Assessment) -> list[tuple[int, int]]:
    """Each answer row of an attempt as (position, item), by position."""
    rows = db.scalars(
        select(AssessmentAnswer)
        .where(AssessmentAnswer.assessment_id == assessment.id)
        .order_by(AssessmentAnswer.display_order)
    ).all()

    return [(row.display_order, row.item_id) for row in rows]


def _attempt(
    db: Session,
    org: OrgUnit,
    user: User,
    *,
    questions: int = 3,
    synced: bool = True,
) -> Assessment:
    """An attempt under way with *questions* questions, none answered."""
    if synced:
        _sync(db, org)

    assessment = Assessment(
        user_id=user.id,
        org_unit_id=org.id,
        question_bank_id=BANK,
        bank_version=1,
        time_limit_minutes=30,
        total_items=questions,
    )
    db.add(assessment)
    db.flush()

    for position, item in enumerate(_items(db, org, questions), start=1):
        db.add(
            AssessmentAnswer(
                assessment_id=assessment.id,
                item_id=item.id,
                display_order=position,
            )
        )
    db.flush()

    return assessment


def _answer(db: Session, assessment: Assessment, position: int) -> None:
    row = db.scalars(
        select(AssessmentAnswer).where(
            AssessmentAnswer.assessment_id == assessment.id,
            AssessmentAnswer.display_order == position,
        )
    ).one()
    row.selected_option = "a"
    db.flush()


# --- bank_to_sit ------------------------------------------------------------


def test_a_bank_open_to_them_is_found_with_its_copy_and_its_pool(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _serve(db_session, org, learner)
    config = _sync(db_session, org, assessment={"min_pool_size": 2})
    items = _items(db_session, org, 3)

    bank = bank_to_sit(
        db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
    )

    assert bank.organisation_id == org.id
    assert bank.config is config
    assert sorted(item.id for item in bank.published_items) == sorted(
        item.id for item in items
    )
    assert bank.min_pool_size == 2


def test_a_bank_that_names_no_smallest_pool_asks_for_none(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _serve(db_session, org, learner)
    _sync(db_session, org)

    bank = bank_to_sit(
        db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
    )

    assert bank.min_pool_size == 0
    assert bank.published_items == []


def test_a_bank_no_organisation_of_theirs_serves_is_not_open(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Elsewhere")
    learner = _person(db_session)
    _serve(db_session, elsewhere, learner)
    _sync(db_session, elsewhere)

    with pytest.raises(AssessmentNotOpen) as refused:
        bank_to_sit(
            db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
        )

    assert refused.value.status_code == 403
    assert refused.value.message == "This assessment is not currently open"


def test_a_bank_they_are_not_enrolled_on_is_not_open(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _serve(db_session, org, learner, enrolled=False)
    _sync(db_session, org)

    with pytest.raises(AssessmentNotOpen):
        bank_to_sit(
            db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
        )


def test_a_bank_closed_to_new_attempts_is_not_open(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _serve(db_session, org, learner, is_live=False)
    _sync(db_session, org)

    with pytest.raises(AssessmentNotOpen):
        bank_to_sit(
            db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
        )


def test_a_bank_with_no_version_promoted_is_not_open(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _serve(db_session, org, learner, active_version=None)
    _sync(db_session, org)

    with pytest.raises(AssessmentNotOpen) as refused:
        bank_to_sit(
            db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
        )

    assert refused.value.status_code == 403
    assert refused.value.message == "This assessment is not currently open"


def test_a_promoted_version_that_was_never_synced_is_not_found(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _serve(db_session, org, learner, active_version=2)
    _sync(db_session, org, version=1)

    with pytest.raises(QuestionBankNotFound) as refused:
        bank_to_sit(
            db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
        )

    assert refused.value.status_code == 404
    assert refused.value.message == "Question bank not found"


def test_the_pool_is_the_published_items_of_the_promoted_version_only(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _serve(db_session, org, learner, active_version=2)
    _sync(db_session, org, version=1)
    _sync(db_session, org, version=2)
    wanted = _items(db_session, org, 2, version=2)
    _items(db_session, org, 1, version=1)
    _items(db_session, org, 1, version=2, status="draft")
    _items(db_session, org, 1, version=2, bank_id=OTHER_BANK)

    bank = bank_to_sit(
        db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
    )

    assert bank.config.version == 2
    assert sorted(item.id for item in bank.published_items) == sorted(
        item.id for item in wanted
    )


def test_a_copy_another_organisation_owns_is_taken_with_its_owners_items(
    db_session: Session,
) -> None:
    """The copy is not asked whose it is, and the pool is the owner's."""
    org = _organisation(db_session)
    owner = _organisation(db_session, "Educators")
    learner = _person(db_session)
    _serve(db_session, org, learner)
    config = _sync(db_session, owner)
    owned = _items(db_session, owner, 2)
    _items(db_session, org, 1)

    bank = bank_to_sit(
        db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
    )

    assert bank.organisation_id == org.id
    assert bank.config is config
    assert sorted(item.id for item in bank.published_items) == sorted(
        item.id for item in owned
    )


def test_whether_the_media_is_complete_is_not_asked_before_an_attempt(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """As the route stood: a bank missing its media may still be started.

    The bank's detail and its learning pages are hidden while any of
    its media is missing. Starting an attempt never asked. Pinned and
    not changed.
    """
    asked: list[str] = []

    def is_complete(db: Session, organisation_id: int, bank_id: str) -> bool:
        asked.append(bank_id)

        return False

    monkeypatch.setattr(media, "module_media_is_complete", is_complete)
    org = _organisation(db_session)
    learner = _person(db_session)
    _serve(db_session, org, learner)
    _sync(db_session, org)

    bank = bank_to_sit(
        db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
    )

    assert bank.organisation_id == org.id
    assert asked == []


def test_finding_a_bank_writes_nothing(db_session: Session) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _serve(db_session, org, learner)
    _sync(db_session, org)
    _items(db_session, org, 2)

    bank_to_sit(
        db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
    )

    assert db_session.scalars(select(Assessment)).all() == []


# --- begin_attempt ----------------------------------------------------------


def test_the_number_asked_for_is_drawn_from_the_whole_pool(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    bank = _bank(db_session, org, 5, {"items_per_attempt": 3})
    pool = [item.id for item in bank.published_items]
    asked = _fix_the_draw(monkeypatch)

    begin_attempt(db_session, learner.id, bank)

    assert asked["sample"] == [(pool, 3)]


def test_the_items_drawn_are_shuffled_and_stored_in_that_order_from_one(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    bank = _bank(db_session, org, 5, {"items_per_attempt": 3})
    pool = [item.id for item in bank.published_items]
    asked = _fix_the_draw(monkeypatch)

    begun = begin_attempt(db_session, learner.id, bank)

    assert asked["shuffle"] == [pool[:3]]
    assert _stored(db_session, begun.assessment) == [
        (1, pool[2]),
        (2, pool[1]),
        (3, pool[0]),
    ]


def test_a_bank_that_says_not_to_randomise_keeps_the_order_drawn(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The draw is still made at random: only the second shuffle is left out."""
    org = _organisation(db_session)
    learner = _person(db_session)
    bank = _bank(
        db_session,
        org,
        5,
        {"items_per_attempt": 3, "randomise_order": False},
    )
    pool = [item.id for item in bank.published_items]
    asked = _fix_the_draw(monkeypatch)

    begun = begin_attempt(db_session, learner.id, bank)

    assert asked["sample"] == [(pool, 3)]
    assert asked["shuffle"] == []
    assert _stored(db_session, begun.assessment) == [
        (1, pool[0]),
        (2, pool[1]),
        (3, pool[2]),
    ]


def test_a_pool_smaller_than_the_number_asked_for_is_drawn_whole(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    bank = _bank(db_session, org, 2, {"items_per_attempt": 10})
    pool = [item.id for item in bank.published_items]
    asked = _fix_the_draw(monkeypatch)

    begun = begin_attempt(db_session, learner.id, bank)

    assert asked["sample"] == [(pool, 2)]
    assert begun.assessment.total_items == 2


def test_a_bank_that_names_no_number_of_items_starts_an_empty_attempt(
    db_session: Session,
) -> None:
    """As the route stood: nothing is drawn, and the attempt is written."""
    org = _organisation(db_session)
    learner = _person(db_session)
    bank = _bank(db_session, org, 4)

    begun = begin_attempt(db_session, learner.id, bank)

    assert begun.assessment.total_items == 0
    assert begun.assessment.time_limit_minutes == 0
    assert begun.first_answer is None
    assert _stored(db_session, begun.assessment) == []


def test_the_real_draw_gives_distinct_items_of_the_pool(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    bank = _bank(db_session, org, 6, {"items_per_attempt": 4})
    pool = {item.id for item in bank.published_items}

    begun = begin_attempt(db_session, learner.id, bank)

    stored = _stored(db_session, begun.assessment)
    drawn = [item_id for _, item_id in stored]

    assert [position for position, _ in stored] == [1, 2, 3, 4]
    assert len(set(drawn)) == 4
    assert set(drawn) <= pool


def test_the_attempt_is_written_for_the_learner_at_the_organisation(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    bank = _bank(
        db_session,
        org,
        3,
        {"items_per_attempt": 2, "time_limit_minutes": 45},
    )
    _fix_the_draw(monkeypatch)

    begun = begin_attempt(db_session, learner.id, bank)
    written = db_session.scalars(select(Assessment)).one()

    assert written is begun.assessment
    assert (written.user_id, written.org_unit_id) == (learner.id, org.id)
    assert (written.question_bank_id, written.bank_version) == (BANK, 1)
    assert (written.time_limit_minutes, written.total_items) == (45, 2)
    assert written.completed_at is None
    assert written.started_at is not None


def test_the_first_question_handed_back_is_the_one_at_position_one(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    bank = _bank(db_session, org, 4, {"items_per_attempt": 3})
    pool = [item.id for item in bank.published_items]
    _fix_the_draw(monkeypatch)

    begun = begin_attempt(db_session, learner.id, bank)

    assert begun.first_answer is not None
    assert begun.first_answer.display_order == 1
    assert begun.first_answer.item_id == pool[2]
    assert begun.first_answer.selected_option is None


def test_starting_again_writes_a_second_attempt_beside_the_first(
    db_session: Session,
) -> None:
    """As the route stood: an attempt under way does not stop another.

    Nothing looks for an unfinished attempt on the same bank, nor
    counts how many there have been. Both stay open. Pinned and not
    changed.
    """
    org = _organisation(db_session)
    learner = _person(db_session)
    bank = _bank(db_session, org, 4, {"items_per_attempt": 2})

    first = begin_attempt(db_session, learner.id, bank)
    second = begin_attempt(db_session, learner.id, bank)

    assert first.assessment.id != second.assessment.id
    assert first.assessment.completed_at is None
    assert second.assessment.completed_at is None
    assert len(_stored(db_session, first.assessment)) == 2
    assert len(_stored(db_session, second.assessment)) == 2


# --- attempt_of -------------------------------------------------------------


def test_their_own_attempt_is_given(db_session: Session) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _attempt(db_session, org, learner)

    assert attempt_of(db_session, learner.id, assessment.id) is assessment


def test_another_persons_attempt_is_refused_as_one_that_does_not_exist_is(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    other = _person(db_session, "other")
    theirs = _attempt(db_session, org, other)

    with pytest.raises(AssessmentNotFound) as not_theirs:
        attempt_of(db_session, learner.id, theirs.id)
    with pytest.raises(AssessmentNotFound) as not_there:
        attempt_of(db_session, learner.id, theirs.id + 1000)

    assert not_theirs.value.status_code == not_there.value.status_code == 404
    assert not_theirs.value.message == "Assessment not found"
    assert not_there.value.message == "Assessment not found"


# --- next_unanswered_item ---------------------------------------------------


def test_the_first_question_with_no_answer_is_the_next(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _attempt(db_session, org, learner)
    _answer(db_session, assessment, 1)
    _answer(db_session, assessment, 3)

    item = next_unanswered_item(db_session, assessment)

    assert item is not None
    assert item.answer.display_order == 2
    assert item.answer.assessment_id == assessment.id
    assert item.config.question_bank_id == BANK
    assert item.config.org_unit_id == org.id


def test_an_attempt_answered_in_full_has_no_next_question(
    db_session: Session,
) -> None:
    """Said before the bank is looked for, so no synced copy is needed."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _attempt(db_session, org, learner, questions=2, synced=False)
    _answer(db_session, assessment, 1)
    _answer(db_session, assessment, 2)

    assert next_unanswered_item(db_session, assessment) is None


def test_a_finished_attempt_has_no_next_question_to_give(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _attempt(db_session, org, learner)
    assessment.completed_at = datetime.now(UTC)
    db_session.flush()

    with pytest.raises(AssessmentAlreadyCompleted) as refused:
        next_unanswered_item(db_session, assessment)

    assert refused.value.status_code == 409
    assert refused.value.message == "Assessment already completed"


def test_the_next_question_of_an_attempt_whose_bank_has_gone_is_refused(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _attempt(db_session, org, learner, synced=False)

    with pytest.raises(AssessmentConfigNotFound) as refused:
        next_unanswered_item(db_session, assessment)

    assert refused.value.status_code == 500
    assert refused.value.message == "Config not found for assessment"


def test_the_next_question_does_not_itself_ask_about_time(
    db_session: Session,
) -> None:
    """Reading a question leaves time to the route.

    The route finishes an attempt whose time has run out before it
    reads it, with ``finish_if_out_of_time``, and this then refuses it
    as finished. Handed a late attempt nobody has finished, it gives
    the question.
    """
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _attempt(db_session, org, learner)
    assessment.started_at = datetime.now(UTC) - timedelta(days=2)
    db_session.flush()

    item = next_unanswered_item(db_session, assessment)

    assert item is not None
    assert item.answer.display_order == 1


def test_an_attempt_started_on_another_organisations_copy_cannot_be_read(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """As the routes stood: starting and reading look for different copies.

    Starting takes any organisation's synced copy of the promoted
    version and records the attempt against the learner's organisation.
    Reading asks for the copy held by the organisation the attempt is
    recorded against. Where that organisation was only ever pointed at
    another's content, the attempt starts and its questions are then
    refused. Pinned and not changed.
    """
    org = _organisation(db_session)
    owner = _organisation(db_session, "Educators")
    learner = _person(db_session)
    _serve(db_session, org, learner)
    _sync(db_session, owner, assessment={"items_per_attempt": 2})
    _items(db_session, owner, 2)
    _fix_the_draw(monkeypatch)
    bank = bank_to_sit(
        db_session, learner.id, organisation_ids=[org.id], bank_id=BANK
    )

    begun = begin_attempt(db_session, learner.id, bank)

    assert begun.first_answer is not None
    with pytest.raises(AssessmentConfigNotFound):
        next_unanswered_item(db_session, begun.assessment)


# --- item_at_position -------------------------------------------------------


def test_the_question_at_a_position_is_given_answered_or_not(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _attempt(db_session, org, learner)
    _answer(db_session, assessment, 2)

    answered = item_at_position(db_session, assessment, 2)
    unanswered = item_at_position(db_session, assessment, 3)

    assert answered.answer.display_order == 2
    assert answered.answer.selected_option == "a"
    assert unanswered.answer.display_order == 3
    assert unanswered.answer.selected_option is None
    assert answered.config.org_unit_id == org.id


def test_a_position_the_attempt_does_not_have_is_not_found(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _attempt(db_session, org, learner, questions=2)

    with pytest.raises(ItemNotFound) as refused:
        item_at_position(db_session, assessment, 3)

    assert refused.value.status_code == 404
    assert refused.value.message == "Item not found"


def test_a_position_only_another_attempt_has_is_not_found(
    db_session: Session,
) -> None:
    """Only the rows of the attempt asked about are searched."""
    org = _organisation(db_session)
    learner = _person(db_session)
    other = _person(db_session, "other")
    short = _attempt(db_session, org, learner, questions=1)
    _attempt(db_session, org, other, questions=3, synced=False)

    first = item_at_position(db_session, short, 1)

    assert first.answer.assessment_id == short.id
    with pytest.raises(ItemNotFound):
        item_at_position(db_session, short, 3)


def test_a_finished_attempt_gives_no_question_whatever_the_position(
    db_session: Session,
) -> None:
    """Said before the position is looked for."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _attempt(db_session, org, learner, questions=2)
    assessment.completed_at = datetime.now(UTC)
    db_session.flush()

    with pytest.raises(AssessmentAlreadyCompleted) as refused:
        item_at_position(db_session, assessment, 1)
    with pytest.raises(AssessmentAlreadyCompleted):
        item_at_position(db_session, assessment, 9)

    assert refused.value.status_code == 409
    assert refused.value.message == "Assessment already completed"


def test_a_missing_position_is_said_before_a_missing_bank(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _attempt(db_session, org, learner, questions=2, synced=False)

    with pytest.raises(ItemNotFound):
        item_at_position(db_session, assessment, 3)
    with pytest.raises(AssessmentConfigNotFound) as refused:
        item_at_position(db_session, assessment, 1)

    assert refused.value.status_code == 500
    assert refused.value.message == "Config not found for assessment"


def test_a_question_by_position_does_not_itself_ask_about_time(
    db_session: Session,
) -> None:
    """Reading a question leaves time to the route, which finishes an
    attempt whose time has run out before it reads it."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _attempt(db_session, org, learner)
    assessment.started_at = datetime.now(UTC) - timedelta(days=2)
    db_session.flush()

    assert item_at_position(db_session, assessment, 1).answer.item_id


# --- Answering and finishing: what the tests below share --------------------

RIGHT = "opt-right"
WRONG = "opt-wrong"

#: The options every item of a variable bank below carries.
ITEM_OPTIONS = [
    {"id": RIGHT, "label": "Adenoma", "tags": ["sure", "adenoma"]},
    {"id": WRONG, "label": "Serrated", "tags": ["unsure"]},
]

#: A bank whose options are its own, and whose right answer is each
#: item's ``diagnosis``.
UNIFORM_CONFIG: dict[str, Any] = {
    "id": BANK,
    "options": [
        {"id": "high_a", "tags": ["high_confidence", "adenoma"]},
        {"id": "low_s", "tags": ["low_confidence", "serrated"]},
    ],
    "correct_answer_field": "diagnosis",
}

#: Passed by choosing the option tagged ``sure`` for at least half.
HALF_SURE = [
    {
        "name": "Sure of it",
        "rule": "tag_percentage",
        "tag": "sure",
        "threshold": 0.5,
    }
]


def _sitting(
    db: Session,
    org: OrgUnit,
    user: User,
    *,
    questions: int = 3,
    bank_type: str = "variable",
    config: dict[str, Any] | None = None,
    minutes: int = 30,
) -> Assessment:
    """An attempt under way on a bank whose answers can be scored."""
    if config is None:
        config = dict(UNIFORM_CONFIG) if bank_type == "uniform" else {}

    db.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id=BANK,
            version=1,
            title="Polyps",
            description="A question bank.",
            type=bank_type,
            config_yaml=config,
        )
    )
    assessment = Assessment(
        user_id=user.id,
        org_unit_id=org.id,
        question_bank_id=BANK,
        bank_version=1,
        time_limit_minutes=minutes,
        total_items=questions,
    )
    db.add(assessment)
    db.flush()

    for position in range(1, questions + 1):
        if bank_type == "uniform":
            item = QuestionBankItem(
                org_unit_id=org.id,
                question_bank_id=BANK,
                bank_version=1,
                status="published",
                images=[],
                metadata_json={"diagnosis": "adenoma"},
            )
        else:
            item = QuestionBankItem(
                org_unit_id=org.id,
                question_bank_id=BANK,
                bank_version=1,
                status="published",
                images=[],
                options=ITEM_OPTIONS,
                correct_option_id=RIGHT,
                metadata_json={},
            )
        db.add(item)
        db.flush()
        db.add(
            AssessmentAnswer(
                assessment_id=assessment.id,
                item_id=item.id,
                display_order=position,
            )
        )
    db.flush()

    return assessment


def _rows(db: Session, assessment: Assessment) -> list[AssessmentAnswer]:
    """The answer rows of an attempt, by position."""
    return list(
        db.scalars(
            select(AssessmentAnswer)
            .where(AssessmentAnswer.assessment_id == assessment.id)
            .order_by(AssessmentAnswer.display_order)
        ).all()
    )


def _tags(row: AssessmentAnswer) -> list[str]:
    return sorted(tag.tag for tag in row.tags)


def _out_of_time(db: Session, assessment: Assessment) -> None:
    assessment.started_at = datetime.now(UTC) - timedelta(days=2)
    db.flush()


def _started_long_ago(db: Session, assessment: Assessment) -> datetime:
    """Start an attempt two days ago, at a moment the test can name."""
    started = datetime.now(UTC) - timedelta(days=2)
    assessment.started_at = started
    db.flush()

    return started


def _finished(db: Session, assessment: Assessment) -> None:
    assessment.completed_at = datetime.now(UTC)
    db.flush()


def _lose_the_bank(db: Session) -> None:
    for config in db.scalars(select(QuestionBankConfig)).all():
        db.delete(config)
    db.flush()


def _stop_the_clock(monkeypatch: pytest.MonkeyPatch, at: datetime) -> None:
    """Make the time ``attempts`` reads be *at*, and nothing else's."""

    class Stopped(datetime):
        @classmethod
        def now(cls, tz: Any = None) -> "Stopped":
            return cls.fromtimestamp(at.timestamp(), tz)

    monkeypatch.setattr(attempts, "datetime", Stopped)


# --- record_answer ----------------------------------------------------------


def test_an_answer_goes_to_the_first_question_without_one(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)

    record_answer(db_session, assessment, RIGHT)
    record_answer(db_session, assessment, WRONG)

    first, second, third = _rows(db_session, assessment)

    assert (first.selected_option, second.selected_option) == (RIGHT, WRONG)
    assert third.selected_option is None


def test_the_right_option_is_stored_as_right_with_its_tags(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)

    record_answer(db_session, assessment, RIGHT)

    first = _rows(db_session, assessment)[0]

    assert first.is_correct is True
    assert _tags(first) == ["adenoma", "sure"]
    assert first.answered_at is not None


def test_another_option_is_stored_as_wrong_with_its_own_tags(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)

    record_answer(db_session, assessment, WRONG)

    first = _rows(db_session, assessment)[0]

    assert first.is_correct is False
    assert _tags(first) == ["unsure"]


def test_a_bank_with_shared_options_is_scored_from_them_and_the_item(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner, bank_type="uniform")

    record_answer(db_session, assessment, "high_a")
    record_answer(db_session, assessment, "low_s")

    first, second, _ = _rows(db_session, assessment)

    assert first.is_correct is True
    assert _tags(first) == ["adenoma", "high_confidence"]
    assert second.is_correct is False
    assert _tags(second) == ["low_confidence", "serrated"]


def test_something_that_is_no_option_is_stored_and_scored_as_wrong(
    db_session: Session,
) -> None:
    """As the route stood: what is chosen is not checked against the options.

    Anything sent is stored as it came, wrong and with no tags, and the
    question counts as answered. Pinned and not changed.
    """
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)

    recorded = record_answer(db_session, assessment, "no-such-option")

    first = _rows(db_session, assessment)[0]

    assert first.selected_option == "no-such-option"
    assert first.is_correct is False
    assert _tags(first) == []
    assert recorded.next_answer is not None
    assert recorded.next_answer.display_order == 2


def test_the_question_after_is_handed_back_with_the_bank(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)

    recorded = record_answer(db_session, assessment, RIGHT)

    assert recorded.next_answer is not None
    assert recorded.next_answer.display_order == 2
    assert recorded.next_answer.assessment_id == assessment.id
    assert recorded.config.question_bank_id == BANK
    assert recorded.config.org_unit_id == org.id


def test_the_last_answer_leaves_no_question_after_it(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner, questions=1)

    recorded = record_answer(db_session, assessment, RIGHT)

    assert recorded.next_answer is None
    assert assessment.completed_at is None


def test_answering_when_every_question_has_an_answer_is_refused(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner, questions=1)
    record_answer(db_session, assessment, WRONG)

    with pytest.raises(AllItemsAlreadyAnswered) as refused:
        record_answer(db_session, assessment, RIGHT)

    assert refused.value.status_code == 409
    assert refused.value.message == "All items already answered"
    assert _rows(db_session, assessment)[0].selected_option == WRONG


def test_an_answer_to_a_finished_attempt_is_refused(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    _finished(db_session, assessment)

    with pytest.raises(AssessmentAlreadyCompleted) as refused:
        record_answer(db_session, assessment, RIGHT)

    assert refused.value.status_code == 409
    assert refused.value.message == "Assessment already completed"
    assert _rows(db_session, assessment)[0].selected_option is None


def test_an_answer_after_the_time_has_run_out_is_refused(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    _out_of_time(db_session, assessment)

    with pytest.raises(TimeLimitExceeded) as refused:
        record_answer(db_session, assessment, RIGHT)

    assert refused.value.status_code == 409
    assert refused.value.message == "Time limit exceeded"
    assert _rows(db_session, assessment)[0].selected_option is None


def test_an_answer_at_the_last_moment_is_in_time_and_one_after_is_not(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The time runs for exactly the minutes allowed from the start."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner, minutes=30)
    started = datetime(2026, 3, 1, 9, 0, tzinfo=UTC)
    assessment.started_at = started
    db_session.flush()

    _stop_the_clock(monkeypatch, started + timedelta(minutes=30))
    record_answer(db_session, assessment, RIGHT)

    _stop_the_clock(
        monkeypatch, started + timedelta(minutes=30, microseconds=1)
    )
    with pytest.raises(TimeLimitExceeded):
        record_answer(db_session, assessment, RIGHT)

    first, second, _ = _rows(db_session, assessment)

    assert first.selected_option == RIGHT
    assert first.answered_at is not None
    assert first.answered_at.replace(tzinfo=UTC) == started + timedelta(
        minutes=30
    )
    assert second.selected_option is None


def test_an_attempt_with_no_time_limit_takes_an_answer_however_late(
    db_session: Session,
) -> None:
    """A limit of 0 is no limit, not no time.

    A bank that gives no ``time_limit_minutes`` starts attempts with a
    limit of 0. Such an attempt is not timed, so an answer to it is in
    time two days on, and so is a change to one.
    """
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner, minutes=0)
    _out_of_time(db_session, assessment)

    record_answer(db_session, assessment, WRONG)
    first = _rows(db_session, assessment)[0]
    change_answer(db_session, assessment, first.id, RIGHT)

    assert first.selected_option == RIGHT
    assert assessment.completed_at is None


def test_an_answer_to_an_attempt_whose_bank_has_gone_is_refused(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    _lose_the_bank(db_session)

    with pytest.raises(AssessmentConfigNotFound) as refused:
        record_answer(db_session, assessment, RIGHT)

    assert refused.value.status_code == 500
    assert refused.value.message == "Config not found for assessment"
    assert _rows(db_session, assessment)[0].selected_option is None


def test_what_stops_an_answer_is_said_in_a_fixed_order(
    db_session: Session,
) -> None:
    """Finished, then out of time, then nothing left, then the bank gone."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner, questions=1)
    record_answer(db_session, assessment, RIGHT)
    _lose_the_bank(db_session)

    with pytest.raises(AllItemsAlreadyAnswered):
        record_answer(db_session, assessment, RIGHT)

    _out_of_time(db_session, assessment)

    with pytest.raises(TimeLimitExceeded):
        record_answer(db_session, assessment, RIGHT)

    _finished(db_session, assessment)

    with pytest.raises(AssessmentAlreadyCompleted):
        record_answer(db_session, assessment, RIGHT)


# --- record_answer, with the question named ---------------------------------


def test_an_answer_that_names_the_next_question_is_stored_on_it(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    first, second, _ = _rows(db_session, assessment)

    recorded = record_answer(db_session, assessment, RIGHT, first.id)

    assert first.selected_option == RIGHT
    assert recorded.next_answer is not None
    assert recorded.next_answer.id == second.id


def test_the_same_answer_sent_twice_is_stored_once(
    db_session: Session,
) -> None:
    """The first was stored and its reply lost, so it is sent again.

    Without the name the second would be stored on the question after,
    which the learner has not seen.
    """
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    first, second, third = _rows(db_session, assessment)

    once = record_answer(db_session, assessment, RIGHT, first.id)
    twice = record_answer(db_session, assessment, RIGHT, first.id)

    assert first.selected_option == RIGHT
    assert second.selected_option is None
    assert third.selected_option is None
    assert once.next_answer is not None and twice.next_answer is not None
    assert twice.next_answer.id == once.next_answer.id == second.id


def test_a_repeat_does_not_change_the_answer_already_stored(
    db_session: Session,
) -> None:
    """Changing an answer is ``change_answer``. A repeat stores nothing,
    whatever it says was chosen."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    first = _rows(db_session, assessment)[0]
    record_answer(db_session, assessment, RIGHT, first.id)
    answered_at = first.answered_at

    record_answer(db_session, assessment, WRONG, first.id)

    assert first.selected_option == RIGHT
    assert first.is_correct is True
    assert first.answered_at == answered_at


def test_a_repeat_of_the_last_answer_says_there_is_nothing_left(
    db_session: Session,
) -> None:
    """Not refused as "all items already answered": the page is owed the
    reply it never got."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner, questions=1)
    only = _rows(db_session, assessment)[0]
    record_answer(db_session, assessment, RIGHT, only.id)

    again = record_answer(db_session, assessment, RIGHT, only.id)

    assert again.next_answer is None
    assert only.selected_option == RIGHT


def test_an_answer_naming_a_question_further_on_is_refused(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    first, second, _ = _rows(db_session, assessment)

    with pytest.raises(AnswerNotFound):
        record_answer(db_session, assessment, RIGHT, second.id)

    assert first.selected_option is None
    assert second.selected_option is None


def test_an_answer_naming_another_attempts_question_is_refused(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    mine = _sitting(db_session, org, learner)
    theirs = _attempt(
        db_session, org, _person(db_session, "other"), synced=False
    )
    their_first = _rows(db_session, theirs)[0]
    # Answered already, so only whose attempt it is can refuse it.
    their_first.selected_option = WRONG
    db_session.flush()

    with pytest.raises(AnswerNotFound):
        record_answer(db_session, mine, RIGHT, their_first.id)

    assert _rows(db_session, mine)[0].selected_option is None
    assert their_first.selected_option == WRONG


def test_an_answer_naming_no_question_at_all_is_refused(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)

    with pytest.raises(AnswerNotFound):
        record_answer(db_session, assessment, RIGHT, 999_999)

    assert _rows(db_session, assessment)[0].selected_option is None


def test_a_repeat_is_refused_once_the_attempt_is_out_of_time(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The order of the checks is unchanged: out of time comes before
    which question is meant."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    first = _rows(db_session, assessment)[0]
    record_answer(db_session, assessment, RIGHT, first.id)
    _stop_the_clock(
        monkeypatch,
        assessment.started_at.replace(tzinfo=UTC)
        + timedelta(minutes=assessment.time_limit_minutes, seconds=1),
    )

    with pytest.raises(TimeLimitExceeded):
        record_answer(db_session, assessment, RIGHT, first.id)


# --- change_answer ----------------------------------------------------------


def test_a_changed_answer_replaces_the_choice_the_mark_and_the_tags(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    record_answer(db_session, assessment, WRONG)
    first = _rows(db_session, assessment)[0]

    changed = change_answer(db_session, assessment, first.id, RIGHT)
    db_session.flush()

    assert changed.answer is first
    assert changed.config.question_bank_id == BANK
    assert first.selected_option == RIGHT
    assert first.is_correct is True
    assert _tags(first) == ["adenoma", "sure"]


def test_a_change_to_something_that_is_no_option_clears_the_tags(
    db_session: Session,
) -> None:
    """As the route stood: the new choice is not checked either."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    record_answer(db_session, assessment, RIGHT)
    first = _rows(db_session, assessment)[0]

    change_answer(db_session, assessment, first.id, "no-such-option")
    db_session.flush()

    assert first.selected_option == "no-such-option"
    assert first.is_correct is False
    assert _tags(first) == []


def test_a_question_never_answered_can_be_answered_by_changing_it(
    db_session: Session,
) -> None:
    """As the route stood: the row is not asked to hold an answer already.

    So a question can be answered ahead of its turn, and the next one
    handed out is then the first still without an answer. Pinned and
    not changed.
    """
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    third = _rows(db_session, assessment)[2]

    change_answer(db_session, assessment, third.id, RIGHT)
    db_session.flush()

    recorded = record_answer(db_session, assessment, WRONG)

    assert third.selected_option == RIGHT
    assert third.is_correct is True
    assert recorded.next_answer is not None
    assert recorded.next_answer.display_order == 2


def test_an_answer_of_another_attempt_is_not_found_nor_is_one_not_there(
    db_session: Session,
) -> None:
    """Only the rows of the attempt named are searched, whoever owns it."""
    org = _organisation(db_session)
    learner = _person(db_session)
    other = _person(db_session, "other")
    mine = _sitting(db_session, org, learner)
    theirs = _attempt(db_session, org, other, synced=False)
    their_row = _rows(db_session, theirs)[0]

    with pytest.raises(AnswerNotFound) as not_mine:
        change_answer(db_session, mine, their_row.id, RIGHT)
    with pytest.raises(AnswerNotFound) as not_there:
        change_answer(db_session, mine, their_row.id + 1000, RIGHT)

    assert not_mine.value.status_code == not_there.value.status_code == 404
    assert not_mine.value.message == "Answer not found"
    assert not_there.value.message == "Answer not found"
    assert their_row.selected_option is None


def test_an_answer_of_a_finished_attempt_cannot_be_changed(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    record_answer(db_session, assessment, WRONG)
    first = _rows(db_session, assessment)[0]
    _finished(db_session, assessment)

    with pytest.raises(AssessmentAlreadyCompleted) as refused:
        change_answer(db_session, assessment, first.id, RIGHT)

    assert refused.value.status_code == 409
    assert refused.value.message == "Assessment already completed"
    assert first.selected_option == WRONG
    assert first.is_correct is False


def test_an_answer_cannot_be_changed_after_the_time_has_run_out(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    record_answer(db_session, assessment, WRONG)
    first = _rows(db_session, assessment)[0]
    _out_of_time(db_session, assessment)

    with pytest.raises(TimeLimitExceeded) as refused:
        change_answer(db_session, assessment, first.id, RIGHT)

    assert refused.value.status_code == 409
    assert refused.value.message == "Time limit exceeded"
    assert first.selected_option == WRONG


def test_a_change_to_an_attempt_whose_bank_has_gone_is_refused(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    first = _rows(db_session, assessment)[0]
    _lose_the_bank(db_session)

    with pytest.raises(AssessmentConfigNotFound) as refused:
        change_answer(db_session, assessment, first.id, RIGHT)

    assert refused.value.status_code == 500
    assert refused.value.message == "Config not found for assessment"
    assert first.selected_option is None


def test_what_stops_a_change_is_said_in_a_fixed_order(
    db_session: Session,
) -> None:
    """Finished, then out of time, then no such answer, then the bank gone."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    nowhere = _rows(db_session, assessment)[0].id + 1000
    _lose_the_bank(db_session)

    with pytest.raises(AnswerNotFound):
        change_answer(db_session, assessment, nowhere, RIGHT)

    _out_of_time(db_session, assessment)

    with pytest.raises(TimeLimitExceeded):
        change_answer(db_session, assessment, nowhere, RIGHT)

    _finished(db_session, assessment)

    with pytest.raises(AssessmentAlreadyCompleted):
        change_answer(db_session, assessment, nowhere, RIGHT)


# --- finish_attempt ---------------------------------------------------------


def test_an_attempt_that_meets_every_criterion_is_marked_as_passed(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(
        db_session,
        org,
        learner,
        questions=2,
        config={
            "pass_criteria": HALF_SURE,
            "results": {"exam_ref_prefix": "POLYP-"},
        },
    )
    record_answer(db_session, assessment, RIGHT)
    record_answer(db_session, assessment, WRONG)

    finished = finish_attempt(db_session, assessment)

    criteria = [
        {"name": "Sure of it", "value": 0.5, "threshold": 0.5, "passed": True}
    ]

    assert finished.overall_passed is True
    assert finished.criteria_results == criteria
    assert finished.score_breakdown == {
        "criteria": criteria,
        "overall_passed": True,
    }
    assert finished.config.question_bank_id == BANK
    assert assessment.completed_at is not None
    assert assessment.is_passed is True
    assert assessment.score_breakdown == finished.score_breakdown
    assert assessment.exam_ref == f"POLYP-{assessment.id}"


def test_an_attempt_that_misses_a_criterion_is_marked_as_failed(
    db_session: Session,
) -> None:
    """The reference is written all the same: it names the attempt."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(
        db_session,
        org,
        learner,
        questions=2,
        config={
            "pass_criteria": HALF_SURE,
            "results": {"exam_ref_prefix": "POLYP-"},
        },
    )
    record_answer(db_session, assessment, WRONG)
    record_answer(db_session, assessment, WRONG)

    finished = finish_attempt(db_session, assessment)

    assert finished.overall_passed is False
    assert finished.criteria_results[0]["value"] == 0.0
    assert assessment.completed_at is not None
    assert assessment.is_passed is False
    assert assessment.score_breakdown == finished.score_breakdown
    assert assessment.exam_ref == f"POLYP-{assessment.id}"


def test_a_bank_that_gives_no_prefix_leaves_the_reference_unset(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(
        db_session, org, learner, config={"pass_criteria": HALF_SURE}
    )

    finish_attempt(db_session, assessment)

    assert assessment.completed_at is not None
    assert assessment.exam_ref is None


def test_a_bank_that_names_no_criteria_passes_whatever_was_answered(
    db_session: Session,
) -> None:
    """As the route stood: with nothing to fail, the attempt passes.

    Every criterion passing is the test, and a bank with none has none
    that failed, so an attempt with no answer given at all is marked as
    passed. Pinned and not changed.
    """
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)

    finished = finish_attempt(db_session, assessment)

    assert finished.criteria_results == []
    assert finished.overall_passed is True
    assert assessment.is_passed is True
    assert assessment.score_breakdown == {
        "criteria": [],
        "overall_passed": True,
    }


def test_an_attempt_with_questions_left_is_marked_as_it_stands(
    db_session: Session,
) -> None:
    """As the route stood: finishing does not ask for every answer.

    A question left unanswered counts towards the total, so one right
    answer of four is a quarter. Pinned and not changed.
    """
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(
        db_session,
        org,
        learner,
        questions=4,
        config={"pass_criteria": HALF_SURE},
    )
    record_answer(db_session, assessment, RIGHT)

    finished = finish_attempt(db_session, assessment)

    assert finished.criteria_results[0]["value"] == 0.25
    assert finished.overall_passed is False
    assert assessment.completed_at is not None
    assert [row.selected_option for row in _rows(db_session, assessment)] == [
        RIGHT,
        None,
        None,
        None,
    ]


def test_an_attempt_finished_after_its_time_is_finished_as_at_that_time(
    db_session: Session,
) -> None:
    """Running out of time is not a failure in itself.

    An attempt found two days past its limit is marked on the answers
    given while there was time, and passes if they are enough. It is
    recorded as finished when its time ended, not when it was found.
    """
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(
        db_session,
        org,
        learner,
        questions=2,
        config={
            "pass_criteria": HALF_SURE,
            "results": {"exam_ref_prefix": "POLYP-"},
        },
    )
    record_answer(db_session, assessment, RIGHT)
    started = _started_long_ago(db_session, assessment)

    finished = finish_attempt(db_session, assessment)

    assert finished.overall_passed is True
    assert assessment.is_passed is True
    assert assessment.completed_at == started + timedelta(minutes=30)
    assert assessment.exam_ref == f"POLYP-{assessment.id}"


def test_an_attempt_finished_in_time_is_finished_as_at_now(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The last moment is in time, as it is for an answer."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner, minutes=30)
    started = datetime(2026, 3, 1, 9, 0, tzinfo=UTC)
    assessment.started_at = started
    db_session.flush()
    _stop_the_clock(monkeypatch, started + timedelta(minutes=30))

    finish_attempt(db_session, assessment)
    db_session.flush()
    db_session.refresh(assessment)

    assert assessment.completed_at is not None
    assert assessment.completed_at.replace(tzinfo=UTC) == started + timedelta(
        minutes=30
    )


def test_an_attempt_with_no_time_limit_is_finished_as_at_now(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner, minutes=0)
    started = _started_long_ago(db_session, assessment)

    finish_attempt(db_session, assessment)

    assert assessment.completed_at is not None
    assert assessment.completed_at > started + timedelta(days=1)


def test_an_attempt_is_marked_once_and_its_mark_does_not_change(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(
        db_session,
        org,
        learner,
        questions=2,
        config={
            "pass_criteria": HALF_SURE,
            "results": {"exam_ref_prefix": "POLYP-"},
        },
    )
    record_answer(db_session, assessment, WRONG)
    record_answer(db_session, assessment, WRONG)
    finish_attempt(db_session, assessment)
    db_session.flush()
    marked_at = assessment.completed_at
    breakdown = assessment.score_breakdown

    # Even were the answers to become right ones afterwards.
    for row in _rows(db_session, assessment):
        row.set_tags(["sure"])
    db_session.flush()

    with pytest.raises(AssessmentAlreadyCompleted) as refused:
        finish_attempt(db_session, assessment)

    assert refused.value.status_code == 409
    assert refused.value.message == "Assessment already completed"
    assert assessment.completed_at == marked_at
    assert assessment.score_breakdown == breakdown
    assert assessment.is_passed is False
    assert assessment.exam_ref == f"POLYP-{assessment.id}"


def test_an_attempt_whose_bank_has_gone_is_not_marked(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    _lose_the_bank(db_session)

    with pytest.raises(AssessmentConfigNotFound) as refused:
        finish_attempt(db_session, assessment)

    assert refused.value.status_code == 500
    assert refused.value.message == "Config not found for assessment"
    assert assessment.completed_at is None
    assert assessment.is_passed is None
    assert assessment.score_breakdown is None


def test_a_finished_attempt_is_said_before_a_missing_bank(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    _finished(db_session, assessment)
    _lose_the_bank(db_session)

    with pytest.raises(AssessmentAlreadyCompleted):
        finish_attempt(db_session, assessment)


# --- deadline_of ------------------------------------------------------------


def test_an_attempts_time_ends_its_limit_after_its_start(
    db_session: Session,
) -> None:
    """Read as UTC whatever zone the start came back with."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner, minutes=45)
    assessment.started_at = datetime(2026, 3, 1, 9, 0)
    db_session.flush()

    assert deadline_of(assessment) == datetime(2026, 3, 1, 9, 45, tzinfo=UTC)


def test_an_attempt_with_a_limit_of_nought_has_no_deadline(
    db_session: Session,
) -> None:
    """What a bank that gives no time limit stores is 0: untimed."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner, minutes=0)

    assert deadline_of(assessment) is None


def test_starting_on_a_bank_that_gives_no_limit_starts_an_untimed_attempt(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    bank = _bank(db_session, org, pool=2, assessment={"items_per_attempt": 2})

    assessment = begin_attempt(db_session, learner.id, bank).assessment

    assert assessment.time_limit_minutes == 0
    assert deadline_of(assessment) is None


# --- unfinished_attempts ----------------------------------------------------


def test_a_learners_unfinished_attempts_are_found_oldest_first(
    db_session: Session,
) -> None:
    """Their own only, and not one that is finished."""
    org = _organisation(db_session)
    learner = _person(db_session)
    other = _person(db_session, "other")
    first = _attempt(db_session, org, learner)
    done = _attempt(db_session, org, learner, synced=False)
    _finished(db_session, done)
    second = _attempt(db_session, org, learner, synced=False)
    _attempt(db_session, org, other, synced=False)

    found = unfinished_attempts(db_session, learner.id)

    assert [attempt.id for attempt in found] == [first.id, second.id]


def test_unfinished_attempts_can_be_asked_for_on_one_bank(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    mine = _attempt(db_session, org, learner)
    elsewhere = _attempt(db_session, org, learner, synced=False)
    elsewhere.question_bank_id = OTHER_BANK
    db_session.flush()

    found = unfinished_attempts(db_session, learner.id, bank_id=BANK)

    assert [attempt.id for attempt in found] == [mine.id]
    assert unfinished_attempts(db_session, learner.id, bank_id="none") == []


# --- finish_if_out_of_time --------------------------------------------------

POLYP_CONFIG: dict[str, Any] = {
    "pass_criteria": HALF_SURE,
    "results": {"exam_ref_prefix": "POLYP-"},
}


def test_an_attempt_past_its_time_is_finished_as_it_stood_at_the_deadline(
    db_session: Session,
) -> None:
    """Marked as a submitted one is, so enough answers given in time
    pass it, with its reference."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(
        db_session, org, learner, questions=2, config=POLYP_CONFIG
    )
    record_answer(db_session, assessment, RIGHT)
    started = _started_long_ago(db_session, assessment)

    finished = finish_if_out_of_time(db_session, assessment)
    db_session.flush()
    db_session.refresh(assessment)

    criteria = [
        {"name": "Sure of it", "value": 0.5, "threshold": 0.5, "passed": True}
    ]

    assert finished is not None
    assert finished.overall_passed is True
    assert finished.criteria_results == criteria
    assert assessment.completed_at is not None
    assert assessment.completed_at.replace(tzinfo=UTC) == started + timedelta(
        minutes=30
    )
    assert assessment.is_passed is True
    assert assessment.score_breakdown == {
        "criteria": criteria,
        "overall_passed": True,
    }
    assert assessment.exam_ref == f"POLYP-{assessment.id}"


def test_an_attempt_past_its_time_fails_when_its_answers_are_not_enough(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(
        db_session, org, learner, questions=4, config=POLYP_CONFIG
    )
    record_answer(db_session, assessment, RIGHT)
    _out_of_time(db_session, assessment)

    finished = finish_if_out_of_time(db_session, assessment)

    assert finished is not None
    assert finished.overall_passed is False
    assert finished.criteria_results[0]["value"] == 0.25
    assert assessment.is_passed is False
    assert assessment.completed_at is not None
    assert assessment.exam_ref == f"POLYP-{assessment.id}"


def test_an_attempt_with_time_left_is_left_alone(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The last moment is in time. One moment later is not."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner, minutes=30)
    started = datetime(2026, 3, 1, 9, 0, tzinfo=UTC)
    assessment.started_at = started
    db_session.flush()

    _stop_the_clock(monkeypatch, started + timedelta(minutes=30))

    assert finish_if_out_of_time(db_session, assessment) is None
    assert assessment.completed_at is None

    _stop_the_clock(
        monkeypatch, started + timedelta(minutes=30, microseconds=1)
    )

    assert finish_if_out_of_time(db_session, assessment) is not None


def test_an_attempt_with_no_time_limit_never_runs_out(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner, minutes=0)
    _out_of_time(db_session, assessment)

    assert finish_if_out_of_time(db_session, assessment) is None
    assert assessment.completed_at is None
    assert assessment.is_passed is None


def test_an_attempt_its_learner_finished_is_not_finished_again_by_the_clock(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner, config=POLYP_CONFIG)
    finish_attempt(db_session, assessment)
    db_session.flush()
    marked_at = assessment.completed_at
    _out_of_time(db_session, assessment)

    assert finish_if_out_of_time(db_session, assessment) is None
    assert assessment.completed_at == marked_at


def test_finishing_by_the_clock_twice_changes_nothing(
    db_session: Session,
) -> None:
    """The second call finds the attempt finished and does nothing."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(
        db_session, org, learner, questions=2, config=POLYP_CONFIG
    )
    record_answer(db_session, assessment, WRONG)
    _out_of_time(db_session, assessment)

    assert finish_if_out_of_time(db_session, assessment) is not None

    db_session.flush()
    marked_at = assessment.completed_at
    breakdown = assessment.score_breakdown

    # Even were the answers to become right ones afterwards.
    for row in _rows(db_session, assessment):
        row.set_tags(["sure"])
    db_session.flush()

    assert finish_if_out_of_time(db_session, assessment) is None
    assert assessment.completed_at == marked_at
    assert assessment.score_breakdown == breakdown
    assert assessment.is_passed is False


def test_an_attempt_another_request_finished_first_is_left_as_that_left_it(
    db_session: Session,
) -> None:
    """Two requests can find the same attempt out of time.

    This one read the attempt before the other marked it, so what it
    holds says unfinished. The row is read again before anything is
    marked, and says otherwise.
    """
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner, config=POLYP_CONFIG)
    started = _started_long_ago(db_session, assessment)
    marked_at = started + timedelta(minutes=30)
    db_session.refresh(assessment)

    # The other request, straight to the row and behind this one's back.
    db_session.connection().execute(
        update(Assessment)
        .where(Assessment.id == assessment.id)
        .values(
            completed_at=marked_at,
            is_passed=False,
            exam_ref="POLYP-FIRST",
        )
    )

    assert assessment.__dict__["completed_at"] is None
    assert finish_if_out_of_time(db_session, assessment) is None
    assert assessment.completed_at is not None
    assert assessment.completed_at.replace(tzinfo=UTC) == marked_at
    assert assessment.is_passed is False
    assert assessment.exam_ref == "POLYP-FIRST"
    assert assessment.score_breakdown is None


def test_an_attempt_past_its_time_whose_bank_has_gone_is_left_unfinished(
    db_session: Session,
) -> None:
    """It cannot be marked, and nothing is raised: each route goes on
    to answer as it did before for an attempt with no bank."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    _out_of_time(db_session, assessment)
    _lose_the_bank(db_session)

    assert finish_if_out_of_time(db_session, assessment) is None
    assert assessment.completed_at is None
    assert assessment.is_passed is None


# --- Answers to an attempt the clock finished -------------------------------


def test_an_answer_to_an_attempt_the_clock_finished_is_told_out_of_time(
    db_session: Session,
) -> None:
    """Not that it is finished: a late answer is told what it was told
    before such an attempt was finished for it."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    record_answer(db_session, assessment, WRONG)
    first = _rows(db_session, assessment)[0]
    _out_of_time(db_session, assessment)
    finish_if_out_of_time(db_session, assessment)
    db_session.flush()

    with pytest.raises(TimeLimitExceeded):
        record_answer(db_session, assessment, RIGHT)
    with pytest.raises(TimeLimitExceeded):
        change_answer(db_session, assessment, first.id, RIGHT)

    assert [row.selected_option for row in _rows(db_session, assessment)] == [
        WRONG,
        None,
        None,
    ]


def test_an_attempt_the_clock_finished_gives_no_question_and_is_marked_once(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _sitting(db_session, org, learner)
    _out_of_time(db_session, assessment)
    finish_if_out_of_time(db_session, assessment)
    db_session.flush()

    with pytest.raises(AssessmentAlreadyCompleted):
        next_unanswered_item(db_session, assessment)
    with pytest.raises(AssessmentAlreadyCompleted):
        item_at_position(db_session, assessment, 1)
    with pytest.raises(AssessmentAlreadyCompleted):
        finish_attempt(db_session, assessment)
