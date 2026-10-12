"""Starting an attempt and reading its questions, through the three routes.

``POST /assessments``, ``GET /assessments/{id}/current`` and
``GET /assessments/{id}/item/{position}``. The rules are tested on their
own in ``app/features/teaching/attempts_test.py`` and
``access_test.py``; this says what a caller is told, in which words,
exactly what of a question is sent before it is answered, and pins two
things the routes do not ask, each as it stands:

- **Media.** A bank missing some of its media has its detail hidden,
  and an attempt on it can still be started.
- **Whose copy of the bank.** Starting takes any organisation's synced
  copy; reading asks for the learner's organisation's own.

A learner has one attempt in progress on a bank at an organisation.
Starting while one is in progress hands that one back, exactly as a new
attempt is answered, and writes nothing.

Time is asked when reading. An attempt whose time has run out is
finished before a question of it is read:
``teaching_attempts_out_of_time_test.py`` has the whole rule.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.features.teaching.access import MODULES_COMPETENCY
from app.features.teaching.enrolment import withdraw
from app.features.teaching.models import (
    Assessment,
    AssessmentAnswer,
    QuestionBankConfig,
    QuestionBankItem,
    QuestionBankOrgStatus,
)
from app.models import OrgUnit, OrgUnitFeature, PractisingCompetency, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.competencies import join_for_teaching

ASSESSMENTS = "/api/teaching/assessments"
BANK = "polyps"
OTHER_BANK = "bleeding"
DETAIL = f"/api/teaching/question-banks/{BANK}"
START = {"question_bank_id": BANK}

PASSWORD = "Password123!"  # noqa: S105

NOT_OPEN = {"detail": "This assessment is not currently open"}
ATTEMPT_NOT_FOUND = {"detail": "Assessment not found"}
COMPLETED = {"detail": "Assessment already completed"}
NO_CONFIG = {"detail": "Config not found for assessment"}

#: Every field of an item a learner is sent, before or after answering.
ITEM_FIELDS = {
    "answer_id",
    "display_order",
    "question_type",
    "images",
    "text",
    "options",
    "selected_option",
}

#: Every field of the attempt itself that starting one sends.
ATTEMPT_FIELDS = {
    "id",
    "question_bank_id",
    "bank_version",
    "started_at",
    "completed_at",
    "time_limit_minutes",
    "total_items",
    "is_passed",
    "exam_ref",
    "score_breakdown",
    "bank_title",
    "certificate_available",
}

#: A bank whose items each carry their own options and right answer.
#: Everything a learner must not be sent is spelt in capitals.
VARIABLE_OPTIONS = [
    {"id": "opt-1", "label": "Adenoma", "tags": ["TAG-RIGHT"]},
    {"id": "opt-2", "label": "Serrated", "tags": ["TAG-WRONG"]},
]
SAFE_VARIABLE_OPTIONS = [
    {"id": "opt-1", "label": "Adenoma"},
    {"id": "opt-2", "label": "Serrated"},
]

#: A bank whose options are the bank's, and whose right answer is each
#: item's metadata.
UNIFORM_OPTIONS = [
    {"id": "adenoma", "label": "Adenoma", "tags": ["TAG-RIGHT"]},
    {"id": "serrated", "label": "Serrated", "tags": ["TAG-WRONG"]},
]
SAFE_UNIFORM_OPTIONS = [
    {"id": "adenoma", "label": "Adenoma"},
    {"id": "serrated", "label": "Serrated"},
]


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    """An organisation with teaching on, serving nothing yet."""
    org = OrgUnit(name="Attempt Test Trust", type="organisation")
    db_session.add(org)
    db_session.flush()
    db_session.add(
        OrgUnitFeature(
            org_unit_id=org.id, feature_key="teaching", enabled_by=1
        )
    )
    db_session.flush()

    return org


def _config(
    db: Session,
    org: OrgUnit,
    *,
    bank_type: str = "variable",
    assessment: dict[str, Any] | None = None,
) -> None:
    """Version 1 of the bank, synced into *org*."""
    config_yaml: dict[str, Any] = {
        "id": BANK,
        "assessment": (
            {"items_per_attempt": 3, "time_limit_minutes": 30}
            if assessment is None
            else assessment
        ),
    }

    if bank_type == "uniform":
        config_yaml["options"] = UNIFORM_OPTIONS
        config_yaml["images"] = [{"key": "wli.png", "label": "White light"}]

    db.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id=BANK,
            version=1,
            title="Polyps",
            description="A question bank.",
            type=bank_type,
            config_yaml=config_yaml,
        )
    )
    db.flush()


def _items(
    db: Session, org: OrgUnit, count: int, *, bank_type: str = "variable"
) -> list[QuestionBankItem]:
    """Published items of version 1, alike but for their directory."""
    items: list[QuestionBankItem] = []

    for number in range(1, count + 1):
        if bank_type == "uniform":
            item = QuestionBankItem(
                org_unit_id=org.id,
                question_bank_id=BANK,
                bank_version=1,
                status="published",
                images=[{"key": "wli.png"}],
                metadata_json={
                    "diagnosis": "ADENOMA-IS-RIGHT",
                    "_source_dir": f"question_{number}",
                },
            )
        else:
            item = QuestionBankItem(
                org_unit_id=org.id,
                question_bank_id=BANK,
                bank_version=1,
                status="published",
                images=[{"key": "wli.png", "label": "White light"}],
                text="Which is it?",
                options=VARIABLE_OPTIONS,
                correct_option_id="opt-1",
                metadata_json={
                    "question_type": "single",
                    "explanation": "EXPLANATION-OF-THE-ANSWER",
                    "_source_dir": f"question_{number}",
                },
            )
        items.append(item)

    db.add_all(items)
    db.flush()

    return items


def _serve(
    db: Session,
    org: OrgUnit,
    *,
    active_version: int | None = 1,
    is_live: bool = True,
    synced: bool = True,
    pool: int = 3,
    bank_type: str = "variable",
    assessment: dict[str, Any] | None = None,
) -> list[QuestionBankItem]:
    """Have *org* serve the bank, with one version synced and a pool."""
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=BANK,
            is_live=is_live,
            active_version=active_version,
        )
    )
    db.flush()

    if synced:
        _config(db, org, bank_type=bank_type, assessment=assessment)

    return _items(db, org, pool, bank_type=bank_type)


def _delegate(db: Session, name: str = "learner") -> User:
    """A delegate, who holds both learner competencies, belonging nowhere."""
    user = User(
        username=name,
        email=f"{name}@test.local",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession="teaching_delegate",
    )
    db.add(user)
    db.flush()

    return user


def _learner(db: Session, org: OrgUnit, name: str = "learner") -> User:
    """A delegate with a place at *org*, enrolled on what it serves now."""
    user = _delegate(db, name)
    join_for_teaching(db, org.id, user.id, "trainee")
    db.commit()

    return user


def _signed_in(
    client: TestClient, name: str = "learner"
) -> tuple[TestClient, dict[str, str]]:
    """The client signed in as *name*, and the header a write needs."""
    resp = client.post(
        "/api/auth/login", json={"username": name, "password": PASSWORD}
    )
    assert resp.status_code == 200, resp.text

    return client, {"X-CSRF-Token": resp.cookies.get("XSRF-TOKEN", "")}


def _attempt(
    db: Session,
    org: OrgUnit,
    user: User,
    items: list[QuestionBankItem],
) -> Assessment:
    """An attempt of *user*'s under way, one question for each item."""
    assessment = Assessment(
        user_id=user.id,
        org_unit_id=org.id,
        question_bank_id=BANK,
        bank_version=1,
        time_limit_minutes=30,
        total_items=len(items),
    )
    db.add(assessment)
    db.flush()

    for position, item in enumerate(items, start=1):
        db.add(
            AssessmentAnswer(
                assessment_id=assessment.id,
                item_id=item.id,
                display_order=position,
            )
        )
    db.commit()

    return assessment


def _reads(assessment_id: int) -> list[str]:
    """The two routes that hand out a question of one attempt."""
    return [
        f"{ASSESSMENTS}/{assessment_id}/current",
        f"{ASSESSMENTS}/{assessment_id}/item/1",
    ]


def _attempts_of(db: Session, user: User) -> list[Assessment]:
    return list(
        db.scalars(
            select(Assessment)
            .where(Assessment.user_id == user.id)
            .order_by(Assessment.id)
        ).all()
    )


# --- POST /assessments: who may start ---------------------------------------


def test_somebody_with_nowhere_to_take_modules_cannot_start(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust)
    member = _delegate(db_session)
    add_org_unit_member(db_session, trust.id, member.id, "trainee")
    db_session.commit()
    client, headers = _signed_in(test_client)

    resp = client.post(ASSESSMENTS, headers=headers, json=START)

    assert resp.status_code == 403
    assert resp.json() == {"detail": "User has no organisation"}
    assert _attempts_of(db_session, member) == []


def test_a_bank_no_organisation_of_theirs_serves_is_not_open(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """The same words for a bank nobody serves and one served elsewhere."""
    elsewhere = OrgUnit(name="Elsewhere", type="organisation")
    db_session.add(elsewhere)
    db_session.flush()
    _serve(db_session, elsewhere)
    _learner(db_session, trust)
    client, headers = _signed_in(test_client)

    served_elsewhere = client.post(ASSESSMENTS, headers=headers, json=START)
    served_nowhere = client.post(
        ASSESSMENTS, headers=headers, json={"question_bank_id": "nothing"}
    )

    assert (served_elsewhere.status_code, served_elsewhere.json()) == (
        403,
        NOT_OPEN,
    )
    assert (served_nowhere.status_code, served_nowhere.json()) == (
        403,
        NOT_OPEN,
    )


def test_a_bank_they_are_no_longer_enrolled_on_is_not_open(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust)
    learner = _learner(db_session, trust)
    withdraw(
        db_session, learner.id, org_unit_id=trust.id, question_bank_id=BANK
    )
    db_session.commit()
    client, headers = _signed_in(test_client)

    resp = client.post(ASSESSMENTS, headers=headers, json=START)

    assert resp.status_code == 403
    assert resp.json() == NOT_OPEN


def test_a_bank_closed_to_new_attempts_is_not_open(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust, is_live=False)
    learner = _learner(db_session, trust)
    client, headers = _signed_in(test_client)

    resp = client.post(ASSESSMENTS, headers=headers, json=START)

    assert resp.status_code == 403
    assert resp.json() == NOT_OPEN
    assert _attempts_of(db_session, learner) == []


def test_a_bank_with_no_version_promoted_is_not_open(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust, active_version=None)
    _learner(db_session, trust)
    client, headers = _signed_in(test_client)

    resp = client.post(ASSESSMENTS, headers=headers, json=START)

    assert resp.status_code == 403
    assert resp.json() == NOT_OPEN


def test_a_promoted_version_that_was_never_synced_is_not_found(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust, synced=False)
    _learner(db_session, trust)
    client, headers = _signed_in(test_client)

    resp = client.post(ASSESSMENTS, headers=headers, json=START)

    assert resp.status_code == 404
    assert resp.json() == {"detail": "Question bank not found"}


def test_a_pool_smaller_than_the_bank_asks_for_is_refused_with_both_counts(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(
        db_session,
        trust,
        pool=2,
        assessment={"items_per_attempt": 2, "min_pool_size": 5},
    )
    learner = _learner(db_session, trust)
    client, headers = _signed_in(test_client)

    resp = client.post(ASSESSMENTS, headers=headers, json=START)

    assert resp.status_code == 409
    assert resp.json() == {"detail": "Insufficient items: 2 published, need 5"}
    assert _attempts_of(db_session, learner) == []


def test_a_pool_exactly_as_large_as_the_bank_asks_for_is_enough(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(
        db_session,
        trust,
        pool=2,
        assessment={"items_per_attempt": 2, "min_pool_size": 2},
    )
    _learner(db_session, trust)
    client, headers = _signed_in(test_client)

    resp = client.post(ASSESSMENTS, headers=headers, json=START)

    assert resp.status_code == 200
    assert resp.json()["assessment"]["total_items"] == 2


# --- POST /assessments: what is written and what is sent --------------------


def test_starting_writes_the_attempt_and_numbers_its_questions_from_one(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    pool = _serve(db_session, trust, pool=5)
    learner = _learner(db_session, trust)
    client, headers = _signed_in(test_client)

    resp = client.post(ASSESSMENTS, headers=headers, json=START)

    assert resp.status_code == 200
    (attempt,) = _attempts_of(db_session, learner)
    rows = db_session.scalars(
        select(AssessmentAnswer)
        .where(AssessmentAnswer.assessment_id == attempt.id)
        .order_by(AssessmentAnswer.display_order)
    ).all()

    assert (attempt.org_unit_id, attempt.question_bank_id) == (trust.id, BANK)
    assert (attempt.bank_version, attempt.time_limit_minutes) == (1, 30)
    assert attempt.total_items == 3
    assert [row.display_order for row in rows] == [1, 2, 3]
    assert len({row.item_id for row in rows}) == 3
    assert {row.item_id for row in rows} <= {item.id for item in pool}
    assert resp.json()["assessment"]["id"] == attempt.id
    assert resp.json()["first_item"]["answer_id"] == rows[0].id
    assert resp.json()["first_item"]["display_order"] == 1


def test_starting_sends_the_first_question_without_its_answer(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """Each option is sent as its id and its label, and nothing else."""
    _serve(db_session, trust, pool=1)
    _learner(db_session, trust)
    client, headers = _signed_in(test_client)

    resp = client.post(ASSESSMENTS, headers=headers, json=START)

    assert resp.status_code == 200
    body = resp.json()
    first = body["first_item"]

    assert set(body) == {"assessment", "first_item"}
    assert set(body["assessment"]) == ATTEMPT_FIELDS
    assert body["assessment"]["is_passed"] is None
    assert body["assessment"]["score_breakdown"] is None
    assert set(first) == ITEM_FIELDS
    assert first["options"] == SAFE_VARIABLE_OPTIONS
    assert first["text"] == "Which is it?"
    assert first["question_type"] == "single"
    assert first["selected_option"] is None
    assert [set(image) for image in first["images"]] == [
        {"key", "label", "url"}
    ]
    assert first["images"][0]["key"] == "wli.png"
    assert first["images"][0]["label"] == "White light"
    assert first["images"][0]["url"].endswith("/question_1/wli.png")
    assert "TAG-" not in resp.text
    assert "EXPLANATION" not in resp.text
    assert "correct" not in resp.text


def test_a_bank_with_shared_options_sends_them_without_their_tags(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """The right answer of such a bank is the item's metadata: never sent."""
    _serve(db_session, trust, pool=1, bank_type="uniform")
    _learner(db_session, trust)
    client, headers = _signed_in(test_client)

    resp = client.post(ASSESSMENTS, headers=headers, json=START)

    assert resp.status_code == 200
    first = resp.json()["first_item"]

    assert set(first) == ITEM_FIELDS
    assert first["options"] == SAFE_UNIFORM_OPTIONS
    assert first["images"][0]["label"] == "White light"
    assert "TAG-" not in resp.text
    assert "ADENOMA-IS-RIGHT" not in resp.text
    assert "diagnosis" not in resp.text


def test_a_bank_that_draws_no_questions_starts_with_no_first_question(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """As the route stands: a bank naming no number of items still starts."""
    _serve(db_session, trust, assessment={})
    _learner(db_session, trust)
    client, headers = _signed_in(test_client)

    resp = client.post(ASSESSMENTS, headers=headers, json=START)

    assert resp.status_code == 200
    assert resp.json()["first_item"] is None
    assert resp.json()["assessment"]["total_items"] == 0


# --- POST /assessments: one attempt in progress -----------------------------


def _answer_rows(db: Session, assessment_id: int) -> list[tuple[int, int]]:
    """Each question of an attempt as (position, item), by position."""
    db.expire_all()
    rows = db.scalars(
        select(AssessmentAnswer)
        .where(AssessmentAnswer.assessment_id == assessment_id)
        .order_by(AssessmentAnswer.display_order)
    ).all()

    return [(row.display_order, row.item_id) for row in rows]


def _serve_another_bank(db: Session, org: OrgUnit) -> None:
    """Have *org* serve a second bank, with one version and a pool."""
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=OTHER_BANK,
            is_live=True,
            active_version=1,
        )
    )
    db.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id=OTHER_BANK,
            version=1,
            title="Bleeding",
            description="Another question bank.",
            type="variable",
            config_yaml={
                "id": OTHER_BANK,
                "assessment": {"items_per_attempt": 1},
            },
        )
    )
    db.add(
        QuestionBankItem(
            org_unit_id=org.id,
            question_bank_id=OTHER_BANK,
            bank_version=1,
            status="published",
            images=[],
            text="Which is it?",
            options=VARIABLE_OPTIONS,
            correct_option_id="opt-1",
            metadata_json={"question_type": "single"},
        )
    )
    db.flush()


def test_starting_while_an_attempt_is_in_progress_hands_back_that_attempt(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """A learner has one attempt in progress on a bank, and no more.

    Somebody who shut the tab starts again and is put back where they
    were: the same attempt, the same questions in the same order, and
    its time running from when it was first started. It is answered
    exactly as a new attempt is, and nothing is written.

    It was the other way round before: starting again wrote a second
    attempt beside the first, and both stayed open.
    """
    _serve(db_session, trust, pool=5)
    learner = _learner(db_session, trust)
    client, headers = _signed_in(test_client)

    first = client.post(ASSESSMENTS, headers=headers, json=START)
    drawn = _answer_rows(db_session, first.json()["assessment"]["id"])
    second = client.post(ASSESSMENTS, headers=headers, json=START)

    assert (first.status_code, second.status_code) == (200, 200)
    assert second.json() == first.json()
    assert set(second.json()) == {"assessment", "first_item"}
    assert set(second.json()["assessment"]) == ATTEMPT_FIELDS
    assert set(second.json()["first_item"]) == ITEM_FIELDS
    (attempt,) = _attempts_of(db_session, learner)
    assert attempt.id == first.json()["assessment"]["id"]
    assert attempt.completed_at is None
    assert len(drawn) == 3
    assert _answer_rows(db_session, attempt.id) == drawn
    assert db_session.scalar(select(func.count(AssessmentAnswer.id))) == 3


def test_an_attempt_is_sat_at_the_organisation_it_was_started_at(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """A learner who can sit the bank through two organisations holds
    one attempt on it, at the one they started it at.

    So when the bank closes there, starting again is refused, though
    the other organisation still has it open: they are not given a
    second attempt at the other beside the first. The attempt is still
    theirs to read and answer by its id.
    """
    elsewhere = OrgUnit(name="Elsewhere", type="organisation")
    db_session.add(elsewhere)
    db_session.flush()
    db_session.add(
        OrgUnitFeature(
            org_unit_id=elsewhere.id, feature_key="teaching", enabled_by=1
        )
    )
    _serve(db_session, trust)
    _serve(db_session, elsewhere, synced=False, pool=0)
    learner = _learner(db_session, trust)
    join_for_teaching(db_session, elsewhere.id, learner.id, "trainee")
    db_session.commit()
    client, headers = _signed_in(test_client)

    first = client.post(ASSESSMENTS, headers=headers, json=START)
    again = client.post(ASSESSMENTS, headers=headers, json=START)
    (attempt,) = _attempts_of(db_session, learner)
    started_at = attempt.org_unit_id
    db_session.execute(
        update(QuestionBankOrgStatus)
        .where(QuestionBankOrgStatus.org_unit_id == started_at)
        .values(is_live=False)
    )
    db_session.commit()

    closed = client.post(ASSESSMENTS, headers=headers, json=START)
    current = client.get(f"{ASSESSMENTS}/{attempt.id}/current")

    assert (first.status_code, again.status_code) == (200, 200)
    assert again.json()["assessment"]["id"] == attempt.id
    assert (closed.status_code, closed.json()) == (403, NOT_OPEN)
    assert current.status_code == 200
    assert [a.id for a in _attempts_of(db_session, learner)] == [attempt.id]


def test_an_attempt_handed_back_is_at_its_next_unanswered_question(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """With the answers already given kept, and none of them sent."""
    _serve(db_session, trust)
    _learner(db_session, trust)
    client, headers = _signed_in(test_client)
    first = client.post(ASSESSMENTS, headers=headers, json=START)
    attempt_id = first.json()["assessment"]["id"]
    client.post(
        f"{ASSESSMENTS}/{attempt_id}/answer",
        headers=headers,
        json={"selected_option": "opt-1"},
    )

    again = client.post(ASSESSMENTS, headers=headers, json=START)

    assert again.status_code == 200
    assert again.json()["assessment"]["id"] == attempt_id
    assert (
        again.json()["assessment"]["started_at"]
        == first.json()["assessment"]["started_at"]
    )
    assert again.json()["first_item"]["display_order"] == 2
    assert again.json()["first_item"]["selected_option"] is None
    assert "TAG-" not in again.text


def test_an_attempt_handed_back_with_every_question_answered_has_none_to_send(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """Answered in full and not handed in: it is still the one in
    progress, so it is handed back, with no question, to be finished."""
    _serve(db_session, trust, pool=1, assessment={"items_per_attempt": 1})
    learner = _learner(db_session, trust)
    client, headers = _signed_in(test_client)
    first = client.post(ASSESSMENTS, headers=headers, json=START)
    attempt_id = first.json()["assessment"]["id"]
    client.post(
        f"{ASSESSMENTS}/{attempt_id}/answer",
        headers=headers,
        json={"selected_option": "opt-1"},
    )

    again = client.post(ASSESSMENTS, headers=headers, json=START)

    assert again.status_code == 200
    assert again.json()["assessment"]["id"] == attempt_id
    assert again.json()["first_item"] is None
    assert len(_attempts_of(db_session, learner)) == 1


def test_a_finished_attempt_does_not_stop_a_new_one(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust)
    learner = _learner(db_session, trust)
    client, headers = _signed_in(test_client)
    first = client.post(ASSESSMENTS, headers=headers, json=START)
    first_id = first.json()["assessment"]["id"]
    handed_in = client.post(
        f"{ASSESSMENTS}/{first_id}/complete", headers=headers
    )

    second = client.post(ASSESSMENTS, headers=headers, json=START)

    assert handed_in.status_code == 200
    assert second.status_code == 200
    assert second.json()["assessment"]["id"] != first_id
    assert second.json()["assessment"]["completed_at"] is None
    assert second.json()["first_item"]["display_order"] == 1
    db_session.expire_all()
    assert [
        attempt.completed_at is None
        for attempt in _attempts_of(db_session, learner)
    ] == [False, True]


def test_an_attempt_past_its_time_is_finished_and_a_new_one_started(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """In progress means not finished and still in time."""
    _serve(db_session, trust)
    learner = _learner(db_session, trust)
    client, headers = _signed_in(test_client)
    first = client.post(ASSESSMENTS, headers=headers, json=START)
    first_id = first.json()["assessment"]["id"]
    late = db_session.get(Assessment, first_id)
    assert late is not None
    late.started_at = datetime.now(UTC) - timedelta(days=2)
    db_session.commit()

    second = client.post(ASSESSMENTS, headers=headers, json=START)

    assert second.status_code == 200
    assert second.json()["assessment"]["id"] != first_id
    db_session.expire_all()
    old, new = _attempts_of(db_session, learner)
    assert old.id == first_id
    assert old.completed_at is not None
    assert new.completed_at is None


def test_another_learners_attempt_in_progress_is_not_handed_to_this_one(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    pool = _serve(db_session, trust)
    learner = _learner(db_session, trust)
    other = _learner(db_session, trust, "other")
    theirs = _attempt(db_session, trust, other, pool)
    client, headers = _signed_in(test_client)

    resp = client.post(ASSESSMENTS, headers=headers, json=START)

    assert resp.status_code == 200
    assert resp.json()["assessment"]["id"] != theirs.id
    (mine,) = _attempts_of(db_session, learner)
    assert mine.id == resp.json()["assessment"]["id"]
    assert [attempt.id for attempt in _attempts_of(db_session, other)] == [
        theirs.id
    ]


def test_an_attempt_in_progress_on_one_bank_does_not_stop_one_on_another(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    _serve(db_session, trust)
    _serve_another_bank(db_session, trust)
    learner = _learner(db_session, trust)
    client, headers = _signed_in(test_client)

    polyps = client.post(ASSESSMENTS, headers=headers, json=START)
    bleeding = client.post(
        ASSESSMENTS, headers=headers, json={"question_bank_id": OTHER_BANK}
    )
    polyps_again = client.post(ASSESSMENTS, headers=headers, json=START)

    assert (polyps.status_code, bleeding.status_code) == (200, 200)
    assert (
        bleeding.json()["assessment"]["id"]
        != polyps.json()["assessment"]["id"]
    )
    assert bleeding.json()["assessment"]["question_bank_id"] == OTHER_BANK
    assert polyps_again.json() == polyps.json()
    assert [
        (attempt.question_bank_id, attempt.completed_at)
        for attempt in _attempts_of(db_session, learner)
    ] == [(BANK, None), (OTHER_BANK, None)]


def test_an_attempt_is_handed_back_on_the_version_it_was_started_on(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """A new version promoted meanwhile does not move the attempt.

    The learner is handed back what they started, laid out from the
    version they started it on, and it is read and answered as before.
    """
    _serve(db_session, trust)
    learner = _learner(db_session, trust)
    client, headers = _signed_in(test_client)
    first = client.post(ASSESSMENTS, headers=headers, json=START)
    attempt_id = first.json()["assessment"]["id"]
    drawn = _answer_rows(db_session, attempt_id)
    db_session.add(
        QuestionBankConfig(
            org_unit_id=trust.id,
            question_bank_id=BANK,
            version=2,
            title="Polyps, revised",
            description="A question bank.",
            type="variable",
            config_yaml={"id": BANK, "assessment": {"items_per_attempt": 1}},
        )
    )
    db_session.add(
        QuestionBankItem(
            org_unit_id=trust.id,
            question_bank_id=BANK,
            bank_version=2,
            status="published",
            images=[],
            text="A NEW QUESTION",
            options=VARIABLE_OPTIONS,
            correct_option_id="opt-1",
            metadata_json={"question_type": "single"},
        )
    )
    status = db_session.scalars(select(QuestionBankOrgStatus)).one()
    status.active_version = 2
    db_session.commit()

    again = client.post(ASSESSMENTS, headers=headers, json=START)
    current = client.get(f"{ASSESSMENTS}/{attempt_id}/current")
    answered = client.post(
        f"{ASSESSMENTS}/{attempt_id}/answer",
        headers=headers,
        json={"selected_option": "opt-1"},
    )

    assert again.status_code == 200
    assert again.json() == first.json()
    assert again.json()["assessment"]["bank_version"] == 1
    assert again.json()["assessment"]["total_items"] == 3
    assert "A NEW QUESTION" not in again.text
    assert current.status_code == 200
    assert current.json() == first.json()["first_item"]
    assert answered.status_code == 200
    assert _answer_rows(db_session, attempt_id) == drawn
    assert len(_attempts_of(db_session, learner)) == 1


def test_a_bank_since_closed_is_refused_even_with_an_attempt_in_progress(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """The more cautious of two readings, chosen on 12 October 2026.

    Whether the bank is open is asked before whether an attempt is in
    progress, since it is the open bank that names the organisation
    the attempt is looked for at. So starting is refused as it always
    was for a closed bank, and nothing is written. The attempt itself
    is untouched: it is still read, answered and handed in by its id.
    """
    _serve(db_session, trust)
    learner = _learner(db_session, trust)
    client, headers = _signed_in(test_client)
    first = client.post(ASSESSMENTS, headers=headers, json=START)
    attempt_id = first.json()["assessment"]["id"]
    status = db_session.scalars(select(QuestionBankOrgStatus)).one()
    status.is_live = False
    db_session.commit()

    again = client.post(ASSESSMENTS, headers=headers, json=START)
    current = client.get(f"{ASSESSMENTS}/{attempt_id}/current")
    answered = client.post(
        f"{ASSESSMENTS}/{attempt_id}/answer",
        headers=headers,
        json={"selected_option": "opt-1"},
    )

    assert again.status_code == 403
    assert again.json() == NOT_OPEN
    assert current.status_code == 200
    assert current.json() == first.json()["first_item"]
    assert answered.status_code == 200
    db_session.expire_all()
    (attempt,) = _attempts_of(db_session, learner)
    assert (attempt.id, attempt.completed_at) == (attempt_id, None)


def test_an_attempt_in_progress_is_handed_back_whatever_the_pool_is_now(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """The size of the pool is asked of a new draw, not of one made."""
    pool = _serve(
        db_session,
        trust,
        pool=3,
        assessment={"items_per_attempt": 2, "min_pool_size": 3},
    )
    learner = _learner(db_session, trust)
    client, headers = _signed_in(test_client)
    first = client.post(ASSESSMENTS, headers=headers, json=START)
    drawn = {
        item_id
        for _, item_id in _answer_rows(
            db_session, first.json()["assessment"]["id"]
        )
    }
    spare = next(item for item in pool if item.id not in drawn)
    db_session.delete(db_session.get(QuestionBankItem, spare.id))
    db_session.commit()

    again = client.post(ASSESSMENTS, headers=headers, json=START)

    assert again.status_code == 200
    assert again.json() == first.json()
    assert len(_attempts_of(db_session, learner)) == 1


def test_two_starts_at_the_same_instant_are_answered_with_one_attempt(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Both requests looked before either wrote, and both found none.

    The second is made here to miss the first's attempt when it looks.
    It goes on to write its own, the database refuses that for the
    unique index over unfinished attempts, and it hands back the
    attempt the first wrote. It is answered 200 like the first, and
    the learner holds one attempt with one set of questions.
    """
    _serve(db_session, trust)
    learner = _learner(db_session, trust)
    client, headers = _signed_in(test_client)
    first = client.post(ASSESSMENTS, headers=headers, json=START)
    looked: list[str] = []

    def found_none(db: Session, user_id: int, *, bank_id: str) -> None:
        looked.append(bank_id)

    monkeypatch.setattr(
        "app.features.teaching.router.attempt_in_progress", found_none
    )

    second = client.post(ASSESSMENTS, headers=headers, json=START)

    assert looked == [BANK]
    assert (first.status_code, second.status_code) == (200, 200)
    assert second.json() == first.json()
    (attempt,) = _attempts_of(db_session, learner)
    assert attempt.id == first.json()["assessment"]["id"]
    assert db_session.scalar(select(func.count(AssessmentAnswer.id))) == 3


# --- POST /assessments: what is not asked -----------------------------------


def test_a_bank_missing_some_of_its_media_can_still_be_started(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """As the routes stand: the detail is hidden and the attempt starts.

    A module missing any of its media is meant not to be served at all,
    assessment included, and the bank's detail and learning pages are
    refused. Starting an attempt does not ask the question, so somebody
    who sends the bank's id may sit it. Pinned here and not changed.
    """
    _serve(db_session, trust)
    _learner(db_session, trust)
    monkeypatch.setattr(
        "app.features.teaching.media.module_media_is_complete",
        lambda db, organisation_id, module_id: False,
    )
    client, headers = _signed_in(test_client)

    detail = client.get(DETAIL)
    started = client.post(ASSESSMENTS, headers=headers, json=START)

    assert detail.status_code == 404
    assert started.status_code == 200
    assert started.json()["first_item"] is not None


# --- The two routes that hand out a question: whose attempt -----------------


def test_another_persons_attempt_is_answered_as_one_that_does_not_exist_is(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """Both routes, and the same status and words for the two cases."""
    pool = _serve(db_session, trust)
    _learner(db_session, trust)
    other = _learner(db_session, trust, "other")
    theirs = _attempt(db_session, trust, other, pool)
    client, _ = _signed_in(test_client)

    for url in _reads(theirs.id) + _reads(theirs.id + 1000):
        resp = client.get(url)

        assert resp.status_code == 404, url
        assert resp.json() == ATTEMPT_NOT_FOUND, url


def test_the_owner_of_that_attempt_is_handed_its_questions(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """The other half of the test above: the attempt is there to be read."""
    pool = _serve(db_session, trust)
    other = _learner(db_session, trust, "other")
    theirs = _attempt(db_session, trust, other, pool)
    rows = db_session.scalars(
        select(AssessmentAnswer)
        .where(AssessmentAnswer.assessment_id == theirs.id)
        .order_by(AssessmentAnswer.display_order)
    ).all()
    client, _ = _signed_in(test_client, "other")

    current = client.get(f"{ASSESSMENTS}/{theirs.id}/current")
    second = client.get(f"{ASSESSMENTS}/{theirs.id}/item/2")

    assert current.status_code == 200
    assert current.json()["answer_id"] == rows[0].id
    assert second.status_code == 200
    assert second.json()["answer_id"] == rows[1].id


def test_a_position_is_only_ever_looked_for_in_their_own_attempt(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """A position their attempt lacks is not found, though another has it."""
    pool = _serve(db_session, trust)
    learner = _learner(db_session, trust)
    other = _learner(db_session, trust, "other")
    mine = _attempt(db_session, trust, learner, pool[:1])
    _attempt(db_session, trust, other, pool)
    client, _ = _signed_in(test_client)

    resp = client.get(f"{ASSESSMENTS}/{mine.id}/item/3")

    assert resp.status_code == 404
    assert resp.json() == {"detail": "Item not found"}


@pytest.mark.parametrize("lost", ["place", "enrolment"])
def test_an_attempt_at_a_module_they_may_no_longer_enter_is_not_found(
    test_client: TestClient, db_session: Session, trust: OrgUnit, lost: str
) -> None:
    """The same words as an attempt that is not theirs."""
    pool = _serve(db_session, trust)
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, pool)

    if lost == "place":
        db_session.execute(
            delete(PractisingCompetency).where(
                PractisingCompetency.user_id == learner.id,
                PractisingCompetency.competency == MODULES_COMPETENCY,
            )
        )
    else:
        withdraw(
            db_session,
            learner.id,
            org_unit_id=trust.id,
            question_bank_id=BANK,
        )
    db_session.commit()
    client, _ = _signed_in(test_client)

    for url in _reads(mine.id):
        resp = client.get(url)

        assert resp.status_code == 404, url
        assert resp.json() == ATTEMPT_NOT_FOUND, url


# --- The two routes that hand out a question: the state of the attempt ------


def test_a_finished_attempt_hands_out_no_more_questions(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    pool = _serve(db_session, trust)
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, pool)
    mine.completed_at = datetime.now(UTC)
    db_session.commit()
    client, _ = _signed_in(test_client)

    for url in [*_reads(mine.id), f"{ASSESSMENTS}/{mine.id}/item/99"]:
        resp = client.get(url)

        assert resp.status_code == 409, url
        assert resp.json() == COMPLETED, url


def test_an_attempt_out_of_time_hands_out_no_more_questions(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """Reading a question finishes an attempt whose time has run out.

    An attempt two days past a thirty minute limit, and never finished,
    used to have each question read by its owner. It is now finished
    as it stood when its time ended, and refused as a finished one.
    """
    pool = _serve(db_session, trust)
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, pool)
    started = datetime.now(UTC) - timedelta(days=2)
    mine.started_at = started
    db_session.commit()
    client, _ = _signed_in(test_client)

    for url in _reads(mine.id):
        resp = client.get(url)

        assert resp.status_code == 409, url
        assert resp.json() == COMPLETED, url

    db_session.expire_all()
    stored = db_session.get(Assessment, mine.id)

    assert stored is not None
    assert stored.completed_at is not None
    assert stored.completed_at.replace(tzinfo=UTC) == started + timedelta(
        minutes=30
    )


def test_an_attempt_answered_in_full_has_no_current_question(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    pool = _serve(db_session, trust)
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, pool)

    for row in db_session.scalars(
        select(AssessmentAnswer).where(
            AssessmentAnswer.assessment_id == mine.id
        )
    ).all():
        row.selected_option = "opt-2"
    db_session.commit()
    client, _ = _signed_in(test_client)

    resp = client.get(f"{ASSESSMENTS}/{mine.id}/current")

    assert resp.status_code == 200
    assert resp.json() is None


def test_an_attempt_whose_bank_version_has_gone_cannot_be_laid_out(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    pool = _serve(db_session, trust)
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, pool)
    db_session.execute(delete(QuestionBankConfig))
    db_session.commit()
    client, _ = _signed_in(test_client)

    for url in _reads(mine.id):
        resp = client.get(url)

        assert resp.status_code == 500, url
        assert resp.json() == NO_CONFIG, url


def test_an_attempt_started_on_another_organisations_copy_cannot_be_read(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """As the routes stand: starting and reading ask for different copies.

    Starting takes whichever organisation's synced copy of the promoted
    version there is, and sends the first question from it. Reading
    asks for the copy held by the organisation the attempt is recorded
    against, which here has none. Pinned here and not changed.
    """
    owner = OrgUnit(name="Educators", type="organisation")
    db_session.add(owner)
    db_session.flush()
    _config(db_session, owner)
    _items(db_session, owner, 3)
    db_session.add(
        QuestionBankOrgStatus(
            org_unit_id=trust.id,
            question_bank_id=BANK,
            is_live=True,
            active_version=1,
        )
    )
    db_session.flush()
    _learner(db_session, trust)
    client, headers = _signed_in(test_client)

    started = client.post(ASSESSMENTS, headers=headers, json=START)

    assert started.status_code == 200
    assert started.json()["first_item"] is not None

    for url in _reads(started.json()["assessment"]["id"]):
        resp = client.get(url)

        assert resp.status_code == 500, url
        assert resp.json() == NO_CONFIG, url


# --- The two routes that hand out a question: what is sent ------------------


def test_a_question_is_read_without_its_answer_before_and_after_answering(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """What they chose is sent back to them; whether it was right is not."""
    pool = _serve(db_session, trust)
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, pool)
    client, headers = _signed_in(test_client)

    before = client.get(f"{ASSESSMENTS}/{mine.id}/current")
    answered = client.post(
        f"{ASSESSMENTS}/{mine.id}/answer",
        headers=headers,
        json={"selected_option": "opt-2"},
    )
    after = client.get(f"{ASSESSMENTS}/{mine.id}/item/1")

    assert before.status_code == 200
    assert answered.status_code == 200
    assert after.status_code == 200

    for resp in (before, after):
        item = resp.json()

        assert set(item) == ITEM_FIELDS
        assert item["display_order"] == 1
        assert item["options"] == SAFE_VARIABLE_OPTIONS
        assert [set(image) for image in item["images"]] == [
            {"key", "label", "url"}
        ]
        assert "TAG-" not in resp.text
        assert "EXPLANATION" not in resp.text
        assert "correct" not in resp.text

    assert before.json()["selected_option"] is None
    assert after.json()["selected_option"] == "opt-2"
