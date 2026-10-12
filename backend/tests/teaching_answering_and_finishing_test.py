"""Answering an attempt and finishing it, through the three routes.

``POST /assessments/{id}/answer``, ``PUT /assessments/{id}/answer/{id}``
and ``POST /assessments/{id}/complete``. The rules are tested on their
own in ``app/features/teaching/attempts_test.py``; this says what a
caller is told, in which words, exactly what is sent back after an
answer, what finishing writes, and pins what the routes do not ask,
each as it stands:

- **Time, when finishing.** Only sending an answer asks whether the
  attempt's time has run out. An attempt long past its limit can still
  be finished, and passes if the answers given in time are enough.
- **Every answer, when finishing.** An attempt with questions left is
  marked as it stands.
- **Whether what was chosen is an option.** Anything sent is stored and
  scored as wrong.
- **Whether a question was answered before, when changing an answer.**
  A question never answered can be answered by its answer id, ahead of
  its turn.
- **A bank with no pass criteria.** It passes every attempt, answered
  or not.
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
from app.security import hash_password
from tests.competencies import join_for_teaching

ASSESSMENTS = "/api/teaching/assessments"
BANK = "polyps"

PASSWORD = "Password123!"  # noqa: S105

RIGHT = "opt-right"
WRONG = "opt-wrong"

ATTEMPT_NOT_FOUND = {"detail": "Assessment not found"}
COMPLETED = {"detail": "Assessment already completed"}
OUT_OF_TIME = {"detail": "Time limit exceeded"}
ALL_ANSWERED = {"detail": "All items already answered"}
ANSWER_NOT_FOUND = {"detail": "Answer not found"}
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

#: Everything a learner must not be sent is spelt in capitals.
OPTIONS = [
    {"id": RIGHT, "label": "Adenoma", "tags": ["sure", "TAG-RIGHT"]},
    {"id": WRONG, "label": "Serrated", "tags": ["TAG-WRONG"]},
]
SAFE_OPTIONS = [
    {"id": RIGHT, "label": "Adenoma"},
    {"id": WRONG, "label": "Serrated"},
]

#: Passed by choosing the option tagged ``sure`` for at least half.
HALF_SURE = [
    {
        "name": "Sure of it",
        "rule": "tag_percentage",
        "tag": "sure",
        "threshold": 0.5,
    }
]
HALF_SURE_MET = [
    {"name": "Sure of it", "value": 0.5, "threshold": 0.5, "passed": True}
]

#: A bank that marks against one criterion, names its attempts, and
#: writes to the learner when they pass.
CONFIG: dict[str, Any] = {
    "id": BANK,
    "pass_criteria": HALF_SURE,
    "results": {
        "exam_ref_prefix": "POLYP-",
        "email_student_on_pass": True,
    },
    "student_email": {
        "subject": "You passed",
        "body": "Well done {{recipient_name}}.",
        "attach_certificate": False,
    },
}


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    """An organisation with teaching on, serving the bank."""
    org = OrgUnit(name="Answering Test Trust", type="organisation")
    db_session.add(org)
    db_session.flush()
    db_session.add(
        OrgUnitFeature(
            org_unit_id=org.id, feature_key="teaching", enabled_by=1
        )
    )
    db_session.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=BANK,
            is_live=True,
            active_version=1,
        )
    )
    db_session.flush()

    return org


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Each address an email was sent to, with nothing really sent."""
    addresses: list[str] = []

    def send_email(*, to: str, **_: Any) -> None:
        addresses.append(to)

    monkeypatch.setattr("app.email_send.send_email", send_email)
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", None
    )
    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", None)

    return addresses


def _learner(db: Session, org: OrgUnit, name: str = "learner") -> User:
    """A delegate with a place at *org*, enrolled on what it serves."""
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
    *,
    questions: int = 2,
    config: dict[str, Any] | None = None,
) -> Assessment:
    """An attempt of *user*'s under way, with the bank synced if need be."""
    synced = db.scalars(select(QuestionBankConfig)).first()

    if synced is None:
        db.add(
            QuestionBankConfig(
                org_unit_id=org.id,
                question_bank_id=BANK,
                version=1,
                title="Polyps",
                description="A question bank.",
                type="variable",
                config_yaml=CONFIG if config is None else config,
            )
        )

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

    for position in range(1, questions + 1):
        item = QuestionBankItem(
            org_unit_id=org.id,
            question_bank_id=BANK,
            bank_version=1,
            status="published",
            images=[],
            text="Which is it?",
            options=OPTIONS,
            correct_option_id=RIGHT,
            metadata_json={
                "question_type": "single",
                "explanation": "EXPLANATION-OF-THE-ANSWER",
                "_source_dir": f"question_{position}",
            },
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
    db.commit()

    return assessment


def _rows(db: Session, assessment_id: int) -> list[AssessmentAnswer]:
    """The answer rows of an attempt as the database has them now."""
    db.expire_all()

    return list(
        db.scalars(
            select(AssessmentAnswer)
            .where(AssessmentAnswer.assessment_id == assessment_id)
            .order_by(AssessmentAnswer.display_order)
        ).all()
    )


def _stored(db: Session, assessment_id: int) -> Assessment:
    """The attempt as the database has it now."""
    db.expire_all()
    assessment = db.get(Assessment, assessment_id)
    assert assessment is not None

    return assessment


def _send(
    client: TestClient,
    headers: dict[str, str],
    route: str,
    assessment_id: int,
    answer_id: int = 1,
) -> Any:
    """Call one of the three routes, named ``answer``, ``change`` or
    ``complete``."""
    if route == "answer":
        return client.post(
            f"{ASSESSMENTS}/{assessment_id}/answer",
            headers=headers,
            json={"selected_option": RIGHT},
        )
    if route == "change":
        return client.put(
            f"{ASSESSMENTS}/{assessment_id}/answer/{answer_id}",
            headers=headers,
            json={"selected_option": RIGHT},
        )

    return client.post(
        f"{ASSESSMENTS}/{assessment_id}/complete", headers=headers
    )


ROUTES = ["answer", "change", "complete"]


# --- Whose attempt ----------------------------------------------------------


@pytest.mark.parametrize("route", ROUTES)
def test_another_persons_attempt_is_refused_as_one_that_does_not_exist_is(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    route: str,
) -> None:
    """The same status and words for both, and nothing of theirs changes."""
    _learner(db_session, trust)
    other = _learner(db_session, trust, "other")
    theirs = _attempt(db_session, trust, other)
    their_row = _rows(db_session, theirs.id)[0].id
    client, headers = _signed_in(test_client)

    not_mine = _send(client, headers, route, theirs.id, their_row)
    not_there = _send(client, headers, route, theirs.id + 1000, their_row)

    assert (not_mine.status_code, not_mine.json()) == (404, ATTEMPT_NOT_FOUND)
    assert (not_there.status_code, not_there.json()) == (
        404,
        ATTEMPT_NOT_FOUND,
    )
    assert [row.selected_option for row in _rows(db_session, theirs.id)] == [
        None,
        None,
    ]
    assert _stored(db_session, theirs.id).completed_at is None


@pytest.mark.parametrize("route", ROUTES)
@pytest.mark.parametrize("lost", ["place", "enrolment"])
def test_an_attempt_at_a_module_they_may_no_longer_enter_is_not_found(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    route: str,
    lost: str,
) -> None:
    """The same words as an attempt that is not theirs."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    first = _rows(db_session, mine.id)[0].id

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
    client, headers = _signed_in(test_client)

    resp = _send(client, headers, route, mine.id, first)

    assert resp.status_code == 404
    assert resp.json() == ATTEMPT_NOT_FOUND
    assert _stored(db_session, mine.id).completed_at is None


def test_an_answer_id_of_another_attempt_is_not_found_in_their_own(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """Naming their own attempt does not reach another's answer row.

    The same status and words as an answer id that does not exist.
    """
    learner = _learner(db_session, trust)
    other = _learner(db_session, trust, "other")
    mine = _attempt(db_session, trust, learner)
    theirs = _attempt(db_session, trust, other)
    their_row = _rows(db_session, theirs.id)[0].id
    client, headers = _signed_in(test_client)

    not_mine = _send(client, headers, "change", mine.id, their_row)
    not_there = _send(client, headers, "change", mine.id, their_row + 1000)

    assert (not_mine.status_code, not_mine.json()) == (404, ANSWER_NOT_FOUND)
    assert (not_there.status_code, not_there.json()) == (
        404,
        ANSWER_NOT_FOUND,
    )
    assert _rows(db_session, theirs.id)[0].selected_option is None


# --- The state of the attempt -----------------------------------------------


@pytest.mark.parametrize("route", ROUTES)
def test_a_finished_attempt_takes_nothing_more(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    route: str,
) -> None:
    """Said before the time is asked about, so a late one says finished."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    first = _rows(db_session, mine.id)[0].id
    mine.completed_at = datetime.now(UTC)
    mine.started_at = datetime.now(UTC) - timedelta(days=2)
    db_session.commit()
    client, headers = _signed_in(test_client)

    resp = _send(client, headers, route, mine.id, first)

    assert resp.status_code == 409
    assert resp.json() == COMPLETED
    assert _rows(db_session, mine.id)[0].selected_option is None


@pytest.mark.parametrize("route", ["answer", "change"])
def test_an_attempt_out_of_time_takes_no_answer_and_no_change(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    route: str,
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    first = _rows(db_session, mine.id)[0].id
    mine.started_at = datetime.now(UTC) - timedelta(minutes=31)
    db_session.commit()
    client, headers = _signed_in(test_client)

    resp = _send(client, headers, route, mine.id, first)

    assert resp.status_code == 409
    assert resp.json() == OUT_OF_TIME
    assert _rows(db_session, mine.id)[0].selected_option is None


def test_answering_when_every_question_has_an_answer_is_refused(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, questions=1)
    client, headers = _signed_in(test_client)
    client.post(
        f"{ASSESSMENTS}/{mine.id}/answer",
        headers=headers,
        json={"selected_option": WRONG},
    )

    resp = _send(client, headers, "answer", mine.id)

    assert resp.status_code == 409
    assert resp.json() == ALL_ANSWERED
    assert _rows(db_session, mine.id)[0].selected_option == WRONG


@pytest.mark.parametrize("route", ROUTES)
def test_an_attempt_whose_bank_version_has_gone_is_refused(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    route: str,
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    first = _rows(db_session, mine.id)[0].id
    db_session.execute(delete(QuestionBankConfig))
    db_session.commit()
    client, headers = _signed_in(test_client)

    resp = _send(client, headers, route, mine.id, first)

    assert resp.status_code == 500
    assert resp.json() == NO_CONFIG
    assert _rows(db_session, mine.id)[0].selected_option is None
    assert _stored(db_session, mine.id).completed_at is None


# --- What is sent back after an answer --------------------------------------


def test_answering_sends_the_next_question_and_not_whether_it_was_right(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """Whether the answer was right is stored, and never sent."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, questions=3)
    client, headers = _signed_in(test_client)

    right = client.post(
        f"{ASSESSMENTS}/{mine.id}/answer",
        headers=headers,
        json={"selected_option": RIGHT},
    )
    wrong = client.post(
        f"{ASSESSMENTS}/{mine.id}/answer",
        headers=headers,
        json={"selected_option": WRONG},
    )

    for position, resp in ((2, right), (3, wrong)):
        assert resp.status_code == 200
        body = resp.json()

        assert set(body) == {"answered", "next_item", "all_answered"}
        assert body["answered"] is True
        assert body["all_answered"] is False
        assert set(body["next_item"]) == ITEM_FIELDS
        assert body["next_item"]["display_order"] == position
        assert body["next_item"]["selected_option"] is None
        assert body["next_item"]["options"] == SAFE_OPTIONS
        assert "TAG-" not in resp.text
        assert "EXPLANATION" not in resp.text
        assert "correct" not in resp.text

    first, second, _ = _rows(db_session, mine.id)

    assert (first.is_correct, second.is_correct) == (True, False)


def test_an_answer_sent_twice_with_its_question_named_is_stored_once(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """The reply to the first was lost, so the page sends it again.

    Both are answered with question two, and question two is left with
    no answer. Sent twice without the name, the second would have been
    stored on question two.
    """
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, questions=3)
    client, headers = _signed_in(test_client)
    first_id = _rows(db_session, mine.id)[0].id
    body = {"selected_option": RIGHT, "answer_id": first_id}

    once = client.post(
        f"{ASSESSMENTS}/{mine.id}/answer", headers=headers, json=body
    )
    twice = client.post(
        f"{ASSESSMENTS}/{mine.id}/answer", headers=headers, json=body
    )

    assert once.status_code == 200
    assert twice.status_code == 200
    assert twice.json() == once.json()
    assert once.json()["next_item"]["display_order"] == 2

    db_session.expire_all()
    first, second, third = _rows(db_session, mine.id)

    assert first.selected_option == RIGHT
    assert second.selected_option is None
    assert third.selected_option is None


def test_an_answer_naming_a_question_further_on_is_not_found(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, questions=3)
    client, headers = _signed_in(test_client)
    second_id = _rows(db_session, mine.id)[1].id

    resp = client.post(
        f"{ASSESSMENTS}/{mine.id}/answer",
        headers=headers,
        json={"selected_option": RIGHT, "answer_id": second_id},
    )

    assert resp.status_code == 404
    db_session.expire_all()
    assert all(
        row.selected_option is None for row in _rows(db_session, mine.id)
    )


def test_the_last_answer_is_told_there_is_nothing_left(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """The attempt is not finished by it: that is asked for separately."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, questions=1)
    client, headers = _signed_in(test_client)

    resp = _send(client, headers, "answer", mine.id)

    assert resp.status_code == 200
    assert resp.json() == {
        "answered": True,
        "next_item": None,
        "all_answered": True,
    }
    assert _stored(db_session, mine.id).completed_at is None


def test_changing_an_answer_sends_the_same_whether_right_or_wrong(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """The question comes back with what they chose, and nothing more."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    first = _rows(db_session, mine.id)[0].id
    client, headers = _signed_in(test_client)
    client.post(
        f"{ASSESSMENTS}/{mine.id}/answer",
        headers=headers,
        json={"selected_option": WRONG},
    )
    url = f"{ASSESSMENTS}/{mine.id}/answer/{first}"

    to_right = client.put(
        url, headers=headers, json={"selected_option": RIGHT}
    )
    stored_right = _rows(db_session, mine.id)[0].is_correct
    to_wrong = client.put(
        url, headers=headers, json={"selected_option": WRONG}
    )
    stored_wrong = _rows(db_session, mine.id)[0].is_correct

    assert (to_right.status_code, to_wrong.status_code) == (200, 200)
    assert set(to_right.json()) == ITEM_FIELDS
    assert to_right.json()["answer_id"] == first
    assert to_right.json()["options"] == SAFE_OPTIONS
    assert to_right.json() == {**to_wrong.json(), "selected_option": RIGHT}
    assert to_wrong.json()["selected_option"] == WRONG
    assert (stored_right, stored_wrong) == (True, False)

    for resp in (to_right, to_wrong):
        assert "TAG-" not in resp.text
        assert "EXPLANATION" not in resp.text
        assert "correct" not in resp.text


# --- What answering does not ask --------------------------------------------


def test_something_that_is_no_option_is_taken_as_an_answer(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """As the routes stand: what is chosen is not checked against the options.

    Anything sent is stored as it came and scored as wrong, the
    question counts as answered, and the reply is the same as for any
    other answer. Pinned here and not changed.
    """
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    client, headers = _signed_in(test_client)

    resp = client.post(
        f"{ASSESSMENTS}/{mine.id}/answer",
        headers=headers,
        json={"selected_option": "no-such-option"},
    )

    assert resp.status_code == 200
    assert resp.json()["next_item"]["display_order"] == 2

    first = _rows(db_session, mine.id)[0]

    assert first.selected_option == "no-such-option"
    assert first.is_correct is False
    assert list(first.tags) == []


def test_a_question_never_answered_can_be_answered_by_its_answer_id(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """As the route stands: changing an answer does not ask for one first.

    The route is described as changing an answer already given. It
    takes the id of any answer row of the attempt, so a learner can
    answer a later question before an earlier one. Pinned here and not
    changed.
    """
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    second = _rows(db_session, mine.id)[1].id
    client, headers = _signed_in(test_client)

    resp = _send(client, headers, "change", mine.id, second)

    assert resp.status_code == 200
    assert resp.json()["display_order"] == 2
    assert resp.json()["selected_option"] == RIGHT
    assert [row.selected_option for row in _rows(db_session, mine.id)] == [
        None,
        RIGHT,
    ]


# --- Finishing --------------------------------------------------------------


def test_finishing_marks_the_attempt_and_writes_the_result(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    sent: list[str],
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    client, headers = _signed_in(test_client)
    _send(client, headers, "answer", mine.id)

    resp = _send(client, headers, "complete", mine.id)

    breakdown = {"criteria": HALF_SURE_MET, "overall_passed": True}

    assert resp.status_code == 200
    assert resp.json() == {
        "is_passed": True,
        "criteria": HALF_SURE_MET,
        "score_breakdown": breakdown,
    }

    stored = _stored(db_session, mine.id)

    assert stored.completed_at is not None
    assert stored.is_passed is True
    assert stored.score_breakdown == breakdown
    assert stored.exam_ref == f"POLYP-{mine.id}"
    assert sent == ["learner@test.local"]


def test_an_attempt_that_fails_is_marked_and_nobody_is_written_to(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    sent: list[str],
) -> None:
    """The reference is written all the same."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    client, headers = _signed_in(test_client)
    client.post(
        f"{ASSESSMENTS}/{mine.id}/answer",
        headers=headers,
        json={"selected_option": WRONG},
    )

    resp = _send(client, headers, "complete", mine.id)

    assert resp.status_code == 200
    assert resp.json()["is_passed"] is False
    assert resp.json()["criteria"][0]["value"] == 0.0

    stored = _stored(db_session, mine.id)

    assert stored.completed_at is not None
    assert stored.is_passed is False
    assert stored.exam_ref == f"POLYP-{mine.id}"
    assert sent == []


def test_finishing_twice_is_refused_and_changes_nothing(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    sent: list[str],
) -> None:
    """The mark, the time, the reference and the one email all stand."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    client, headers = _signed_in(test_client)
    _send(client, headers, "answer", mine.id)
    first = _send(client, headers, "complete", mine.id)
    marked = _stored(db_session, mine.id)
    marked_at, breakdown = marked.completed_at, marked.score_breakdown

    second = _send(client, headers, "complete", mine.id)

    assert first.status_code == 200
    assert second.status_code == 409
    assert second.json() == COMPLETED

    stored = _stored(db_session, mine.id)

    assert stored.completed_at == marked_at
    assert stored.score_breakdown == breakdown
    assert stored.is_passed is True
    assert stored.exam_ref == f"POLYP-{mine.id}"
    assert sent == ["learner@test.local"]


def test_an_attempt_long_out_of_time_can_still_be_finished_and_pass(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    sent: list[str],
) -> None:
    """As the route stands: finishing does not ask about time.

    Answering and changing an answer are refused once the time has run
    out. Finishing is not: an attempt two days past a thirty minute
    limit is marked on the answers given while there was time, passes
    if they are enough, and the learner is written to. Whether a late
    attempt should be marked as it is, failed, or closed for them when
    the time ends is a question for the owner. Pinned here and not
    changed.
    """
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    client, headers = _signed_in(test_client)
    _send(client, headers, "answer", mine.id)
    late = _stored(db_session, mine.id)
    late.started_at = datetime.now(UTC) - timedelta(days=2)
    db_session.commit()

    refused = _send(client, headers, "answer", mine.id)
    resp = _send(client, headers, "complete", mine.id)

    assert (refused.status_code, refused.json()) == (409, OUT_OF_TIME)
    assert resp.status_code == 200
    assert resp.json()["is_passed"] is True
    assert _stored(db_session, mine.id).is_passed is True
    assert sent == ["learner@test.local"]


def test_an_attempt_with_questions_left_can_be_finished(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    sent: list[str],
) -> None:
    """As the route stands: finishing does not ask for every answer.

    A question left unanswered counts towards the total and towards no
    tag, so nothing answered of two is nought. Pinned here and not
    changed.
    """
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    client, headers = _signed_in(test_client)

    resp = _send(client, headers, "complete", mine.id)

    assert resp.status_code == 200
    assert resp.json()["is_passed"] is False
    assert resp.json()["criteria"][0]["value"] == 0.0
    assert _stored(db_session, mine.id).completed_at is not None
    assert sent == []


def test_a_bank_with_no_pass_criteria_passes_an_attempt_nobody_answered(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    sent: list[str],
) -> None:
    """As the route stands: with no criterion to fail, the attempt passes.

    A bank whose config names no ``pass_criteria`` marks every attempt
    as passed, one with no answer given included. Pinned here and not
    changed.
    """
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, config={"id": BANK})
    client, headers = _signed_in(test_client)

    resp = _send(client, headers, "complete", mine.id)

    assert resp.status_code == 200
    assert resp.json() == {
        "is_passed": True,
        "criteria": [],
        "score_breakdown": {"criteria": [], "overall_passed": True},
    }

    stored = _stored(db_session, mine.id)

    assert stored.is_passed is True
    assert stored.exam_ref is None
    assert sent == []


# --- An attempt nobody came back to -----------------------------------------


def _abandon(db: Session, assessment_id: int) -> None:
    """Start an attempt two days ago and leave it unfinished."""
    late = _stored(db, assessment_id)
    late.started_at = datetime.now(UTC) - timedelta(days=2)
    db.commit()


def test_an_abandoned_attempt_is_finished_when_its_learner_next_looks(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    sent: list[str],
) -> None:
    """The tab was closed, so nothing finished it. Reading it does.

    Finished as the answers stood when the time ran out, and dated
    then. One of two answered right meets the bank's half, so it is a
    pass, and the learner is written to as for any other pass.
    """
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    client, headers = _signed_in(test_client)
    _send(client, headers, "answer", mine.id)
    _abandon(db_session, mine.id)

    resp = client.get(f"{ASSESSMENTS}/{mine.id}")

    assert resp.status_code == 200
    assert resp.json()["completed_at"] is not None
    stored = _stored(db_session, mine.id)
    assert stored.completed_at is not None
    assert stored.completed_at.replace(
        tzinfo=UTC
    ) == stored.started_at.replace(tzinfo=UTC) + timedelta(
        minutes=stored.time_limit_minutes
    )
    assert stored.is_passed is True
    assert stored.exam_ref == f"POLYP-{mine.id}"
    assert sent == ["learner@test.local"]


def test_a_pass_found_this_way_is_written_to_once_only(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    sent: list[str],
) -> None:
    """Reading it again finds nothing left to finish."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    client, headers = _signed_in(test_client)
    _send(client, headers, "answer", mine.id)
    _abandon(db_session, mine.id)

    client.get(f"{ASSESSMENTS}/{mine.id}")
    client.get(f"{ASSESSMENTS}/{mine.id}")
    client.get(f"{ASSESSMENTS}/history")

    assert sent == ["learner@test.local"]


def test_an_abandoned_attempt_that_fails_is_marked_and_nobody_is_written_to(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    sent: list[str],
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    client, _ = _signed_in(test_client)
    _abandon(db_session, mine.id)

    resp = client.get(f"{ASSESSMENTS}/{mine.id}")

    assert resp.status_code == 200
    assert _stored(db_session, mine.id).is_passed is False
    assert sent == []


def test_a_pass_email_that_cannot_be_built_does_not_fail_the_readers_page(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The result is kept, and whoever was reading still gets their page."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    client, headers = _signed_in(test_client)
    _send(client, headers, "answer", mine.id)
    _abandon(db_session, mine.id)

    def _broken(**_: Any) -> None:
        raise RuntimeError("no certificate today")

    monkeypatch.setattr(
        "app.features.teaching.router._maybe_enqueue_certificate_emails",
        _broken,
    )

    resp = client.get(f"{ASSESSMENTS}/{mine.id}")

    assert resp.status_code == 200
    assert _stored(db_session, mine.id).is_passed is True


def test_an_abandoned_attempt_shows_as_finished_in_their_history(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    client, _ = _signed_in(test_client)
    _abandon(db_session, mine.id)

    resp = client.get(f"{ASSESSMENTS}/history")

    assert resp.status_code == 200
    assert [row["completed_at"] is not None for row in resp.json()] == [True]


def test_an_attempt_under_way_is_not_finished_by_being_read(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    client, _ = _signed_in(test_client)

    resp = client.get(f"{ASSESSMENTS}/{mine.id}")

    assert resp.status_code == 200
    assert resp.json()["completed_at"] is None
    assert _stored(db_session, mine.id).completed_at is None


def test_an_abandoned_attempt_once_finished_takes_nothing_more(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """Whatever the page then sends is answered as for any finished
    attempt, which the page takes to mean the exam is over."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    client, headers = _signed_in(test_client)
    _abandon(db_session, mine.id)
    client.get(f"{ASSESSMENTS}/{mine.id}")

    answered = _send(client, headers, "answer", mine.id)
    finished = _send(client, headers, "complete", mine.id)

    assert answered.status_code == 409
    assert finished.status_code == 409
