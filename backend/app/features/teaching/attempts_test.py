"""Starting an attempt and reading its questions, asked of attempts.py itself."""

from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.teaching import attempts, media
from app.features.teaching.attempts import (
    BankToSit,
    attempt_of,
    bank_to_sit,
    begin_attempt,
    item_at_position,
    next_unanswered_item,
)
from app.features.teaching.enrolment import enrol
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


def test_the_next_question_is_given_after_the_time_has_run_out(
    db_session: Session,
) -> None:
    """As the route stood: reading a question does not ask about time.

    Only answering does. An attempt long past its limit and never
    finished can still have its questions read. Pinned and not changed.
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


def test_a_question_is_given_by_position_after_the_time_has_run_out(
    db_session: Session,
) -> None:
    """As the route stood: reading a question does not ask about time."""
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _attempt(db_session, org, learner)
    assessment.started_at = datetime.now(UTC) - timedelta(days=2)
    db_session.flush()

    assert item_at_position(db_session, assessment, 1).answer.item_id
