"""When an attempt's time runs out it is finished, through every route.

A tab can be shut, so the server does not wait for the browser to hand
an attempt in. Every route that touches one attempt finishes it first
if its time has run out, and the two that touch many do the same for
each: starting a new attempt, for the learner's unfinished attempts on
that bank, and listing their results, for all of them.

An attempt finished this way is marked on the answers given in time,
exactly as one handed in is, so it can pass. It is recorded as finished
when its time ended. The rule is tested on its own in
``app/features/teaching/attempts_test.py``; this says what a learner is
answered by each route, and that a pass is written to them once.

A learner who never comes back touches no route. The last part is the
job that finishes theirs: ``finish_attempts_out_of_time``, run on a
schedule as the ``finish-exams-out-of-time`` admin action.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.email_send import EmailSendError
from app.features.teaching.enrolment import withdraw
from app.features.teaching.models import (
    Assessment,
    AssessmentAnswer,
    QuestionBankConfig,
    QuestionBankItem,
    QuestionBankOrgStatus,
)
from app.features.teaching.out_of_time import (
    AttemptsSwept,
    finish_attempts_out_of_time,
    main,
)
from app.models import OrgUnit, OrgUnitFeature, User
from app.security import hash_password
from tests.competencies import join_for_teaching

ASSESSMENTS = "/api/teaching/assessments"
BANK = "polyps"
OTHER_BANK = "bleeding"

PASSWORD = "Password123!"  # noqa: S105

RIGHT = "opt-right"
WRONG = "opt-wrong"
LIMIT = timedelta(minutes=30)

ATTEMPT_NOT_FOUND = {"detail": "Assessment not found"}

#: The line a run ends on, as the "has not run" alert counts it in
#: infra/modules/monitoring/main.tf. The two must be the same text:
#: .github/scripts/terraform/scheduled-action-heartbeat.bats holds them to
#: it. Change the line the action prints and this, and that test says the
#: alert has to change too.
RUN_FINISHED = r"^Finished [0-9]+ exams whose time had run out$"
COMPLETED = {"detail": "Assessment already completed"}
OUT_OF_TIME = {"detail": "Time limit exceeded"}
NO_CONFIG = {"detail": "Config not found for assessment"}

OPTIONS = [
    {"id": RIGHT, "label": "Adenoma", "tags": ["sure"]},
    {"id": WRONG, "label": "Serrated", "tags": ["unsure"]},
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

#: A bank that marks against one criterion, names its attempts, issues
#: certificates, and writes to the learner when they pass.
CONFIG: dict[str, Any] = {
    "id": BANK,
    "assessment": {"items_per_attempt": 2, "time_limit_minutes": 30},
    "pass_criteria": HALF_SURE,
    "results": {
        "exam_ref_prefix": "POLYP-",
        "certificate_download": True,
        "email_student_on_pass": True,
    },
    "student_email": {
        "subject": "You passed",
        "body": "Well done {{recipient_name}}.",
        "attach_certificate": False,
    },
}

#: Every route that touches one attempt, and the two that touch many.
ROUTES = [
    "current",
    "item",
    "answer",
    "change",
    "complete",
    "detail",
    "question-results",
    "certificate",
    "history",
    "start",
]


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    """An organisation with teaching on, serving the bank."""
    org = OrgUnit(name="Out Of Time Test Trust", type="organisation")
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
    right: int = 0,
    minutes: int = 30,
    bank_id: str = BANK,
) -> Assessment:
    """An attempt of *user*'s under way with two questions.

    The first *right* of them are answered, rightly and in time. The
    bank is synced if it is not already.
    """
    synced = db.scalars(
        select(QuestionBankConfig).where(
            QuestionBankConfig.question_bank_id == bank_id
        )
    ).first()

    if synced is None:
        db.add(
            QuestionBankConfig(
                org_unit_id=org.id,
                question_bank_id=bank_id,
                version=1,
                title="Polyps",
                description="A question bank.",
                type="variable",
                config_yaml=CONFIG,
            )
        )

    assessment = Assessment(
        user_id=user.id,
        org_unit_id=org.id,
        question_bank_id=bank_id,
        bank_version=1,
        time_limit_minutes=minutes,
        total_items=2,
    )
    db.add(assessment)
    db.flush()

    for position in (1, 2):
        item = QuestionBankItem(
            org_unit_id=org.id,
            question_bank_id=bank_id,
            bank_version=1,
            status="published",
            images=[],
            text="Which is it?",
            options=OPTIONS,
            correct_option_id=RIGHT,
            metadata_json={
                "question_type": "single",
                "_source_dir": f"question_{position}",
            },
        )
        db.add(item)
        db.flush()
        answer = AssessmentAnswer(
            assessment_id=assessment.id,
            item_id=item.id,
            display_order=position,
        )
        db.add(answer)
        db.flush()

        if position <= right:
            answer.selected_option = RIGHT
            answer.is_correct = True
            answer.set_tags(["sure"])
            answer.answered_at = datetime.now(UTC)
    db.commit()

    return assessment


def _late(db: Session, assessment: Assessment) -> datetime:
    """Start an attempt two days ago, and say when its time ended."""
    started = datetime.now(UTC) - timedelta(days=2)
    assessment.started_at = started
    db.commit()

    return started + LIMIT


def _stored(db: Session, assessment_id: int) -> Assessment:
    """The attempt as the database has it now."""
    db.expire_all()
    assessment = db.get(Assessment, assessment_id)
    assert assessment is not None

    return assessment


def _finished_at(assessment: Assessment) -> datetime:
    assert assessment.completed_at is not None

    return assessment.completed_at.replace(tzinfo=UTC)


def _first_row(db: Session, assessment_id: int) -> AssessmentAnswer:
    """The first question of an attempt as the database has it now."""
    db.expire_all()
    row = db.scalars(
        select(AssessmentAnswer)
        .where(AssessmentAnswer.assessment_id == assessment_id)
        .order_by(AssessmentAnswer.display_order)
    ).first()
    assert row is not None

    return row


def _call(
    client: TestClient,
    headers: dict[str, str],
    route: str,
    assessment_id: int,
    answer_id: int = 1,
) -> Any:
    """Call one of ``ROUTES`` for an attempt."""
    one = f"{ASSESSMENTS}/{assessment_id}"

    if route == "current":
        return client.get(f"{one}/current")
    if route == "item":
        return client.get(f"{one}/item/1")
    if route == "answer":
        return client.post(
            f"{one}/answer", headers=headers, json={"selected_option": RIGHT}
        )
    if route == "change":
        return client.put(
            f"{one}/answer/{answer_id}",
            headers=headers,
            json={"selected_option": WRONG},
        )
    if route == "complete":
        return client.post(f"{one}/complete", headers=headers)
    if route == "detail":
        return client.get(one)
    if route == "question-results":
        return client.get(f"{one}/question-results")
    if route == "certificate":
        return client.get(f"{one}/certificate")
    if route == "history":
        return client.get(f"{ASSESSMENTS}/history")

    return client.post(
        ASSESSMENTS, headers=headers, json={"question_bank_id": BANK}
    )


# --- Every route finishes it ------------------------------------------------


@pytest.mark.parametrize("route", ROUTES)
def test_an_attempt_past_its_time_is_finished_by_whichever_route_meets_it(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    sent: list[str],
    route: str,
) -> None:
    """As it stood when its time ended, and it passes on what it held."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, right=1)
    first = _first_row(db_session, mine.id).id
    deadline = _late(db_session, mine)
    client, headers = _signed_in(test_client)

    _call(client, headers, route, mine.id, first)

    stored = _stored(db_session, mine.id)

    assert _finished_at(stored) == deadline
    assert stored.is_passed is True
    assert stored.score_breakdown == {
        "criteria": [
            {
                "name": "Sure of it",
                "value": 0.5,
                "threshold": 0.5,
                "passed": True,
            }
        ],
        "overall_passed": True,
    }
    assert stored.exam_ref == f"POLYP-{mine.id}"
    assert _first_row(db_session, mine.id).selected_option == RIGHT
    assert sent == ["learner@test.local"]


@pytest.mark.parametrize("route", ROUTES)
def test_an_attempt_past_its_time_fails_when_too_little_was_answered(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    sent: list[str],
    route: str,
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    first = _first_row(db_session, mine.id).id
    deadline = _late(db_session, mine)
    client, headers = _signed_in(test_client)

    _call(client, headers, route, mine.id, first)

    stored = _stored(db_session, mine.id)

    assert _finished_at(stored) == deadline
    assert stored.is_passed is False
    assert _first_row(db_session, mine.id).selected_option is None
    assert sent == []


# --- What the learner is answered -------------------------------------------


@pytest.mark.parametrize("route", ["current", "item"])
def test_reading_a_question_of_an_attempt_past_its_time_says_it_is_finished(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    route: str,
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    _late(db_session, mine)
    client, headers = _signed_in(test_client)

    for _ in range(2):
        resp = _call(client, headers, route, mine.id)

        assert (resp.status_code, resp.json()) == (409, COMPLETED)


@pytest.mark.parametrize("route", ["answer", "change"])
def test_an_answer_to_an_attempt_past_its_time_is_told_out_of_time_each_time(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    route: str,
) -> None:
    """The words a late answer was always given, now with the attempt
    finished behind them, and the same on the second try as the first."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, right=1)
    first = _first_row(db_session, mine.id).id
    _late(db_session, mine)
    client, headers = _signed_in(test_client)

    for _ in range(2):
        resp = _call(client, headers, route, mine.id, first)

        assert (resp.status_code, resp.json()) == (409, OUT_OF_TIME)

    assert _stored(db_session, mine.id).completed_at is not None
    assert _first_row(db_session, mine.id).selected_option == RIGHT


def test_finishing_an_attempt_past_its_time_sends_back_its_result_once(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """The learner asked for it to be finished, and it has been."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, right=1)
    _late(db_session, mine)
    client, headers = _signed_in(test_client)

    resp = _call(client, headers, "complete", mine.id)
    again = _call(client, headers, "complete", mine.id)

    criteria = [
        {"name": "Sure of it", "value": 0.5, "threshold": 0.5, "passed": True}
    ]

    assert resp.status_code == 200
    assert resp.json() == {
        "is_passed": True,
        "criteria": criteria,
        "score_breakdown": {"criteria": criteria, "overall_passed": True},
    }
    assert (again.status_code, again.json()) == (409, COMPLETED)


def test_the_result_of_an_attempt_past_its_time_is_dated_when_it_ended(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, right=1)
    deadline = _late(db_session, mine)
    client, headers = _signed_in(test_client)

    detail = _call(client, headers, "detail", mine.id)
    marked = _call(client, headers, "question-results", mine.id)
    listed = _call(client, headers, "history", mine.id)

    assert detail.status_code == 200
    assert detail.json()["is_passed"] is True
    assert detail.json()["certificate_available"] is True
    assert (
        datetime.fromisoformat(detail.json()["completed_at"]).replace(
            tzinfo=UTC
        )
        == deadline
    )
    assert marked.status_code == 200
    assert [q["answered"] for q in marked.json()["questions"]] == [True, False]
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [mine.id]


def test_an_attempt_that_passes_by_the_clock_has_its_certificate(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    bank_dir = tmp_path / BANK
    bank_dir.mkdir()
    (bank_dir / "config.yaml").write_text("id: polyps\n")
    Image.new("RGB", (40, 30), "white").save(
        bank_dir / "certificate-blank.png"
    )
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", str(tmp_path)
    )
    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", None)
    monkeypatch.setattr("app.email_send.send_email", lambda **_: None)
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, right=1)
    _late(db_session, mine)
    client, headers = _signed_in(test_client)

    resp = _call(client, headers, "certificate", mine.id)

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF")


def test_starting_again_finishes_the_one_past_its_time_and_starts_another(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """Only attempts on the bank asked for: one on another bank is left
    for the next request that meets it."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    elsewhere = _attempt(db_session, trust, learner, bank_id=OTHER_BANK)
    _late(db_session, mine)
    _late(db_session, elsewhere)
    client, headers = _signed_in(test_client)

    resp = _call(client, headers, "start", mine.id)

    assert resp.status_code == 200
    assert resp.json()["assessment"]["id"] not in (mine.id, elsewhere.id)
    assert resp.json()["assessment"]["completed_at"] is None
    assert _stored(db_session, mine.id).completed_at is not None
    assert _stored(db_session, elsewhere.id).completed_at is None


def test_listing_results_finishes_every_attempt_of_theirs_past_its_time(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """An attempt nobody came back to is finished when results are
    listed. One with time left, and another person's, are not."""
    learner = _learner(db_session, trust)
    other = _learner(db_session, trust, "other")
    mine = _attempt(db_session, trust, learner)
    elsewhere = _attempt(db_session, trust, learner, bank_id=OTHER_BANK)
    under_way = _attempt(db_session, trust, learner, bank_id="a-third-bank")
    theirs = _attempt(db_session, trust, other)
    _late(db_session, mine)
    _late(db_session, elsewhere)
    _late(db_session, theirs)
    client, headers = _signed_in(test_client)

    resp = _call(client, headers, "history", mine.id)

    listed = {row["id"]: row for row in resp.json()}

    assert resp.status_code == 200
    assert listed[mine.id]["completed_at"] is not None
    assert listed[under_way.id]["completed_at"] is None
    assert _stored(db_session, theirs.id).completed_at is None


# --- An attempt that is not finished by the clock ---------------------------


def test_an_attempt_handed_in_is_not_finished_again_when_its_time_passes(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, right=1)
    client, headers = _signed_in(test_client)
    _call(client, headers, "complete", mine.id)
    handed_in = _finished_at(_stored(db_session, mine.id))
    _late(db_session, mine)

    for route in ROUTES:
        _call(client, headers, route, mine.id)

    stored = _stored(db_session, mine.id)

    assert _finished_at(stored) == handed_in


def test_an_attempt_with_time_left_is_left_under_way_by_every_route(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    mine.started_at = datetime.now(UTC) - timedelta(minutes=29)
    db_session.commit()
    client, headers = _signed_in(test_client)

    for route in ["current", "item", "detail", "history", "start"]:
        _call(client, headers, route, mine.id)

    stored = _stored(db_session, mine.id)

    assert stored.completed_at is None


def test_an_attempt_with_no_time_limit_never_runs_out(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """A limit of 0 is what a bank that gives none stores: untimed.

    Two days on it is still under way, its questions are still read and
    its answers still taken.
    """
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, minutes=0)
    _late(db_session, mine)
    client, headers = _signed_in(test_client)

    for route in ["current", "item", "detail", "history", "start"]:
        resp = _call(client, headers, route, mine.id)

        assert resp.status_code == 200, route

    assert _stored(db_session, mine.id).completed_at is None

    answered = _call(client, headers, "answer", mine.id)
    first = _first_row(db_session, mine.id).id
    changed = _call(client, headers, "change", mine.id, first)

    assert answered.status_code == 200
    assert changed.status_code == 200
    assert _first_row(db_session, mine.id).selected_option == WRONG

    finished = _call(client, headers, "complete", mine.id)

    assert finished.status_code == 200


# --- Written to once --------------------------------------------------------


def test_a_pass_by_the_clock_is_written_to_the_learner_once_only(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    sent: list[str],
) -> None:
    """However many requests meet the attempt, and whatever they are
    answered. The first here is refused, and the email goes all the
    same."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, right=1)
    first = _first_row(db_session, mine.id).id
    _late(db_session, mine)
    client, headers = _signed_in(test_client)

    refused = _call(client, headers, "answer", mine.id)

    assert refused.status_code == 409
    assert sent == ["learner@test.local"]

    for route in [*ROUTES, *ROUTES]:
        _call(client, headers, route, mine.id, first)

    assert sent == ["learner@test.local"]


def test_an_email_that_cannot_be_sent_does_not_fail_the_request(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The result stands, as when an email queued behind a response
    fails."""

    def send_email(**_: Any) -> None:
        raise EmailSendError("the provider is down")

    monkeypatch.setattr("app.email_send.send_email", send_email)
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", None
    )
    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", None)
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, right=1)
    _late(db_session, mine)
    client, headers = _signed_in(test_client)

    resp = _call(client, headers, "detail", mine.id)

    assert resp.status_code == 200
    assert resp.json()["is_passed"] is True
    assert _stored(db_session, mine.id).completed_at is not None


# --- Whose attempt, and the refusals that follow ----------------------------


@pytest.mark.parametrize(
    "route", [r for r in ROUTES if r not in ("history", "start")]
)
def test_another_persons_attempt_past_its_time_is_not_finished_for_them(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    route: str,
) -> None:
    """Whose it is comes first: nothing of theirs is touched."""
    _learner(db_session, trust)
    other = _learner(db_session, trust, "other")
    theirs = _attempt(db_session, trust, other)
    _late(db_session, theirs)
    client, headers = _signed_in(test_client)

    resp = _call(client, headers, route, theirs.id)

    assert (resp.status_code, resp.json()) == (404, ATTEMPT_NOT_FOUND)
    assert _stored(db_session, theirs.id).completed_at is None


@pytest.mark.parametrize("route", ["current", "item", "answer", "change"])
def test_a_learner_with_no_way_in_is_refused_as_before_and_it_is_finished(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    route: str,
) -> None:
    """The attempt is finished as soon as it is known to be theirs. The
    refusal that follows is the one they were given before."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    deadline = _late(db_session, mine)
    withdraw(
        db_session,
        learner.id,
        org_unit_id=trust.id,
        question_bank_id=BANK,
    )
    db_session.commit()
    client, headers = _signed_in(test_client)

    resp = _call(client, headers, route, mine.id)

    assert (resp.status_code, resp.json()) == (404, ATTEMPT_NOT_FOUND)
    assert _finished_at(_stored(db_session, mine.id)) == deadline


def test_an_attempt_past_its_time_whose_bank_has_gone_is_answered_as_before(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """It cannot be marked, so it is left unfinished and nothing new is
    refused: its result is read as under way, an answer is out of time,
    and finishing says the bank is gone."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    _late(db_session, mine)
    db_session.execute(delete(QuestionBankConfig))
    db_session.commit()
    client, headers = _signed_in(test_client)

    detail = _call(client, headers, "detail", mine.id)
    listed = _call(client, headers, "history", mine.id)
    answered = _call(client, headers, "answer", mine.id)
    finished = _call(client, headers, "complete", mine.id)

    assert detail.status_code == 200
    assert detail.json()["completed_at"] is None
    assert listed.status_code == 200
    assert listed.json()[0]["completed_at"] is None
    assert (answered.status_code, answered.json()) == (409, OUT_OF_TIME)
    assert (finished.status_code, finished.json()) == (500, NO_CONFIG)
    assert _stored(db_session, mine.id).completed_at is None


# --- The seconds left, on each answer about an attempt ----------------------


def _seconds_left_from(route: str, resp: Any) -> Any:
    """Where each route's answer carries the seconds left."""
    assert resp.status_code == 200, resp.text

    if route == "start":
        return resp.json()["assessment"]["seconds_left"]

    return resp.json()["seconds_left"]


#: The answers the exam page sets its countdown by: an attempt started
#: or handed back, opened again, a question fetched, an answer given
#: and an answer changed.
COUNTED = ["start", "detail", "current", "item", "answer", "change"]


@pytest.mark.parametrize("route", COUNTED)
def test_each_answer_about_an_attempt_says_how_many_seconds_are_left(
    test_client: TestClient, db_session: Session, trust: OrgUnit, route: str
) -> None:
    """Counted to the deadline the server enforces: ten minutes into
    thirty leaves twenty, less the moment the test took."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, right=1)
    first = _first_row(db_session, mine.id).id
    mine.started_at = datetime.now(UTC) - timedelta(minutes=10)
    db_session.commit()
    client, headers = _signed_in(test_client)

    resp = _call(client, headers, route, mine.id, first)

    assert 1190 <= _seconds_left_from(route, resp) <= 1200


@pytest.mark.parametrize("route", COUNTED)
def test_an_untimed_attempt_is_sent_no_seconds_left(
    test_client: TestClient, db_session: Session, trust: OrgUnit, route: str
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, right=1, minutes=0)
    first = _first_row(db_session, mine.id).id
    client, headers = _signed_in(test_client)

    resp = _call(client, headers, route, mine.id, first)

    assert _seconds_left_from(route, resp) is None


def test_a_finished_attempt_is_sent_no_seconds_left(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, right=1)
    client, headers = _signed_in(test_client)
    _call(client, headers, "complete", mine.id)

    detail = _call(client, headers, "detail", mine.id)

    assert detail.status_code == 200
    assert detail.json()["seconds_left"] is None


# --- Attempts nobody came back to -------------------------------------------


def test_the_job_finishes_an_attempt_nobody_came_back_to_and_writes_once(
    db_session: Session, trust: OrgUnit, sent: list[str]
) -> None:
    """With no request from anybody. Dated when its time ended, marked
    on the answers given by then, and a pass is written to as any other
    is. A second run finds nothing to do."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, right=1)
    deadline = _late(db_session, mine)

    first = finish_attempts_out_of_time(db_session)
    second = finish_attempts_out_of_time(db_session)

    stored = _stored(db_session, mine.id)

    assert first == AttemptsSwept(finished=1, failed=0)
    assert second == AttemptsSwept(finished=0, failed=0)
    assert _finished_at(stored) == deadline
    assert stored.is_passed is True
    assert stored.exam_ref == f"POLYP-{mine.id}"
    assert sent == ["learner@test.local"]


def test_the_job_writes_to_nobody_about_an_attempt_that_failed(
    db_session: Session, trust: OrgUnit, sent: list[str]
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    deadline = _late(db_session, mine)

    swept = finish_attempts_out_of_time(db_session)

    stored = _stored(db_session, mine.id)

    assert swept == AttemptsSwept(finished=1, failed=0)
    assert _finished_at(stored) == deadline
    assert stored.is_passed is False
    assert sent == []


def test_the_job_leaves_attempts_in_time_untimed_and_finished_as_they_are(
    db_session: Session, trust: OrgUnit, sent: list[str]
) -> None:
    in_time = _attempt(db_session, trust, _learner(db_session, trust, "a"))
    untimed = _attempt(
        db_session, trust, _learner(db_session, trust, "b"), minutes=0
    )
    handed_in = _attempt(db_session, trust, _learner(db_session, trust, "c"))
    _late(db_session, untimed)
    _late(db_session, handed_in)
    marked_at = datetime.now(UTC) - timedelta(days=1)
    handed_in.completed_at = marked_at
    db_session.commit()

    swept = finish_attempts_out_of_time(db_session)

    assert swept == AttemptsSwept(finished=0, failed=0)
    assert _stored(db_session, in_time.id).completed_at is None
    assert _stored(db_session, untimed.id).completed_at is None
    assert _finished_at(_stored(db_session, handed_in.id)) == marked_at
    assert sent == []


def test_the_job_passes_over_an_attempt_whose_bank_has_gone(
    db_session: Session, trust: OrgUnit, sent: list[str]
) -> None:
    """It cannot be marked. The next attempt is finished all the same."""
    lost = _attempt(
        db_session,
        trust,
        _learner(db_session, trust, "a"),
        bank_id=OTHER_BANK,
    )
    mine = _attempt(db_session, trust, _learner(db_session, trust, "b"))
    _late(db_session, lost)
    _late(db_session, mine)
    db_session.execute(
        delete(QuestionBankConfig).where(
            QuestionBankConfig.question_bank_id == OTHER_BANK
        )
    )
    db_session.commit()

    swept = finish_attempts_out_of_time(db_session)

    assert swept == AttemptsSwept(finished=1, failed=0)
    assert _stored(db_session, lost.id).completed_at is None
    assert _stored(db_session, mine.id).completed_at is not None


def test_an_email_the_provider_refuses_does_not_count_against_the_job(
    db_session: Session, trust: OrgUnit, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Logged where it is sent, as on a route. The result stands."""

    def send_email(**_: Any) -> None:
        raise EmailSendError("the provider is down")

    monkeypatch.setattr("app.email_send.send_email", send_email)
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", None
    )
    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", None)
    mine = _attempt(db_session, trust, _learner(db_session, trust), right=1)
    _late(db_session, mine)

    swept = finish_attempts_out_of_time(db_session)

    assert swept == AttemptsSwept(finished=1, failed=0)
    assert _stored(db_session, mine.id).is_passed is True


def test_an_attempt_that_raises_is_counted_and_the_next_still_has_its_turn(
    db_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Whatever raises. Here it is the email, so the first attempt's
    result is kept too: it was committed before anything was sent. The
    log names the attempt by its id and the kind of error only."""
    sent: list[str] = []

    def send_email(*, to: str, **_: Any) -> None:
        if to == "a@test.local":
            raise RuntimeError("could not build it for a@test.local")

        sent.append(to)

    monkeypatch.setattr("app.email_send.send_email", send_email)
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", None
    )
    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", None)
    first = _attempt(
        db_session, trust, _learner(db_session, trust, "a"), right=1
    )
    second = _attempt(
        db_session, trust, _learner(db_session, trust, "b"), right=1
    )
    _late(db_session, first)
    _late(db_session, second)

    swept = finish_attempts_out_of_time(db_session)

    assert swept == AttemptsSwept(finished=1, failed=1)
    assert _stored(db_session, first.id).is_passed is True
    assert _stored(db_session, second.id).is_passed is True
    assert sent == ["b@test.local"]
    assert f"Attempt {first.id} out of time" in caplog.text
    assert "RuntimeError" in caplog.text
    assert "a@test.local" not in caplog.text


@pytest.fixture
def own_session(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> Session:
    """``main`` handed the test session, and kept from closing it."""
    import app.db.core_db as core_db

    monkeypatch.setattr(core_db, "CoreSessionLocal", lambda: db_session)
    monkeypatch.setattr(db_session, "close", lambda: None)

    return db_session


def test_the_action_says_how_many_it_finished(
    own_session: Session,
    trust: OrgUnit,
    sent: list[str],
    capsys: pytest.CaptureFixture[str],
) -> None:
    mine = _attempt(own_session, trust, _learner(own_session, trust))
    _late(own_session, mine)

    assert main() == 0
    assert "Finished 1 exams whose time had run out" in capsys.readouterr().out
    assert main() == 0
    assert "Finished 0 exams whose time had run out" in capsys.readouterr().out
    assert _stored(own_session, mine.id).completed_at is not None


def test_a_run_ends_on_the_line_the_alert_counts(
    own_session: Session,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Once, and with nothing to finish too: most runs find nothing."""
    assert main() == 0

    lines = capsys.readouterr().out.splitlines()
    assert len([ln for ln in lines if re.search(RUN_FINISHED, ln)]) == 1


def test_the_action_fails_when_an_attempt_raised(
    own_session: Session,
    trust: OrgUnit,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    def refuse(*_: Any, **__: Any) -> None:
        raise RuntimeError("no")

    monkeypatch.setattr(
        "app.features.teaching.router.finish_and_tell_if_out_of_time", refuse
    )
    mine = _attempt(own_session, trust, _learner(own_session, trust))
    _late(own_session, mine)

    assert main() == 1
    assert "✗ 1 could not be finished" in capsys.readouterr().err
    assert _stored(own_session, mine.id).completed_at is None


def test_the_action_fails_when_the_sweep_cannot_run(
    own_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    def refuse(_: Session) -> None:
        raise RuntimeError("the database is away")

    monkeypatch.setattr(
        "app.features.teaching.out_of_time.attempts_out_of_time", refuse
    )

    assert main() == 1

    err = capsys.readouterr().err

    assert "could not be finished: RuntimeError" in err
    assert "the database is away" not in err
