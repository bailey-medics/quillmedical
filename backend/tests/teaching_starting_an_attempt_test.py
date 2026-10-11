"""Starting an attempt and reading its questions, through the three routes.

``POST /assessments``, ``GET /assessments/{id}/current`` and
``GET /assessments/{id}/item/{position}``. The rules are tested on their
own in ``app/features/teaching/attempts_test.py`` and
``access_test.py``; this says what a caller is told, in which words,
exactly what of a question is sent before it is answered, and pins four
things the routes do not ask, each as it stands:

- **An attempt already under way.** Starting again gives a second
  attempt on the same bank, and both stay open.
- **Media.** A bank missing some of its media has its detail hidden,
  and an attempt on it can still be started.
- **Time, when reading.** A question of an attempt long past its limit
  is still handed out. Only answering asks about time.
- **Whose copy of the bank.** Starting takes any organisation's synced
  copy; reading asks for the learner's organisation's own.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
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


# --- POST /assessments: what is not asked -----------------------------------


def test_a_second_attempt_can_be_started_while_the_first_is_under_way(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """As the route stands: a learner may hold two attempts on one bank.

    Nothing looks for an unfinished attempt before writing another, and
    nothing counts attempts. Both are left open, and each can be read
    and answered. Whether that is wanted is a question for the owner:
    pinned here and not changed.
    """
    _serve(db_session, trust)
    learner = _learner(db_session, trust)
    client, headers = _signed_in(test_client)

    first = client.post(ASSESSMENTS, headers=headers, json=START)
    second = client.post(ASSESSMENTS, headers=headers, json=START)

    assert (first.status_code, second.status_code) == (200, 200)
    assert (
        first.json()["assessment"]["id"] != second.json()["assessment"]["id"]
    )
    assert [
        attempt.completed_at for attempt in _attempts_of(db_session, learner)
    ] == [None, None]

    for started in (first, second):
        current = client.get(
            f"{ASSESSMENTS}/{started.json()['assessment']['id']}/current"
        )
        assert current.status_code == 200
        assert current.json()["display_order"] == 1


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


def test_an_attempt_out_of_time_still_hands_out_its_questions(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """As the routes stand: reading a question does not ask about time.

    The limit is asked when an answer is sent. An attempt two days past
    a thirty minute limit, and never finished, still has each question
    read by its owner. Pinned here and not changed.
    """
    pool = _serve(db_session, trust)
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, pool)
    mine.started_at = datetime.now(UTC) - timedelta(days=2)
    db_session.commit()
    client, _ = _signed_in(test_client)

    for url in _reads(mine.id):
        resp = client.get(url)

        assert resp.status_code == 200, url
        assert resp.json()["display_order"] == 1, url


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
