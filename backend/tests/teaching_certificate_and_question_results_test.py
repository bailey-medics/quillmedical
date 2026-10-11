"""A certificate and the marked answers of an attempt, through the routes.

``GET /assessments/{id}/certificate`` and
``GET /assessments/{id}/question-results``. The rules are tested on
their own in ``app/features/teaching/attempt_results_test.py``; this
says what a caller is told, in which words, and what they are sent.

Three things matter most, and each is pinned here:

- **Only the person who sat an attempt is given either.** Nobody else
  is, whatever they hold: somebody who manages teaching at the same
  organisation is answered as if the attempt did not exist.
- **The marked answers are given only once the attempt is finished.**
  Before that they would say which answers so far are right.
- **A certificate is given only for an attempt finished and passed.**

Neither route asks where the learner may take modules, nor whether they
are still enrolled: a result outlives both.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.features.teaching import certificate
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
from tests.competencies import hold, join_for_teaching

ASSESSMENTS = "/api/teaching/assessments"
BANK = "polyps"

PASSWORD = "Password123!"  # noqa: S105

FINISHED = datetime(2026, 3, 5, 14, 30, tzinfo=UTC)

ATTEMPT_NOT_FOUND = {"detail": "Assessment not found"}
NOT_COMPLETE = {"detail": "Assessment is not complete"}
NOT_EARNED = {"detail": "Certificate only available for passed assessments"}
NO_CONFIG = {"detail": "Config not found for assessment"}
NOT_ENABLED = {"detail": "Certificates not enabled for this bank"}
NO_BACKGROUND = {"detail": "No certificate background found for this bank"}

ROUTES = ["certificate", "question-results"]

#: Everything a learner must not be sent is spelt in capitals.
OPTIONS = [
    {"id": "a", "label": "Adenoma", "tags": ["TAG-RIGHT"]},
    {"id": "b", "label": "Serrated", "tags": ["TAG-WRONG"]},
]

#: A bank that issues certificates and names its attempts.
CONFIG: dict[str, Any] = {
    "id": BANK,
    "results": {"certificate_download": True, "exam_ref_prefix": "POLYP-"},
}

BREAKDOWN: dict[str, Any] = {
    "criteria": [
        {"name": "Sure of it", "value": 0.9, "threshold": 0.5, "passed": True}
    ],
    "overall_passed": True,
}


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    """An organisation with teaching on, serving the bank."""
    org = OrgUnit(name="Certificate Test Trust", type="organisation")
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
def content(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A content path holding the bank and its blank certificate."""
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

    return bank_dir


def _learner(
    db: Session,
    org: OrgUnit,
    name: str = "learner",
    full_name: str | None = None,
) -> User:
    """A delegate with a place at *org*, enrolled on what it serves."""
    user = User(
        username=name,
        email=f"{name}@test.local",
        password_hash=hash_password(PASSWORD),
        full_name=full_name,
        is_active=True,
        email_verified=True,
        base_profession="teaching_delegate",
    )
    db.add(user)
    db.flush()
    join_for_teaching(db, org.id, user.id, "trainee")
    db.commit()

    return user


def _signed_in(client: TestClient, name: str = "learner") -> TestClient:
    resp = client.post(
        "/api/auth/login", json={"username": name, "password": PASSWORD}
    )
    assert resp.status_code == 200, resp.text

    return client


def _sync(db: Session, org: OrgUnit, config: dict[str, Any]) -> None:
    db.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id=BANK,
            version=1,
            title="Polyps",
            description="A question bank.",
            type="variable",
            config_yaml=config,
        )
    )
    db.flush()


def _attempt(
    db: Session,
    org: OrgUnit,
    user: User,
    *,
    finished: bool = True,
    passed: bool | None = True,
    config: dict[str, Any] | None = CONFIG,
) -> Assessment:
    """An attempt of *user*'s with two questions, both answered.

    Finished and passed unless said. The first question is answered
    right and the second wrong. The bank is synced unless *config* is
    None or it already is.
    """
    if config is not None and db.scalars(select(QuestionBankConfig)).first():
        config = None
    if config is not None:
        _sync(db, org, config)

    assessment = Assessment(
        user_id=user.id,
        org_unit_id=org.id,
        question_bank_id=BANK,
        bank_version=1,
        time_limit_minutes=30,
        total_items=2,
        completed_at=FINISHED if finished else None,
        is_passed=passed,
        score_breakdown=BREAKDOWN if passed else None,
    )
    db.add(assessment)
    db.flush()

    for position, chosen in enumerate(["a", "b"], start=1):
        item = QuestionBankItem(
            org_unit_id=org.id,
            question_bank_id=BANK,
            bank_version=1,
            status="published",
            images=[],
            text="Which is it?",
            options=OPTIONS,
            correct_option_id="a",
            metadata_json={
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
                selected_option=chosen,
                is_correct=chosen == "a",
                answered_at=FINISHED,
            )
        )
    db.commit()

    return assessment


def _stored(db: Session, assessment_id: int) -> Assessment:
    """The attempt as the database has it now."""
    db.expire_all()
    assessment = db.get(Assessment, assessment_id)
    assert assessment is not None

    return assessment


# --- Whose attempt ----------------------------------------------------------


@pytest.mark.parametrize("route", ROUTES)
def test_another_persons_attempt_is_refused_as_one_that_does_not_exist_is(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    content: Path,
    route: str,
) -> None:
    """The same status and words for both, though theirs passed."""
    _learner(db_session, trust)
    other = _learner(db_session, trust, "other")
    theirs = _attempt(db_session, trust, other)
    client = _signed_in(test_client)

    not_mine = client.get(f"{ASSESSMENTS}/{theirs.id}/{route}")
    not_there = client.get(f"{ASSESSMENTS}/{theirs.id + 1000}/{route}")

    assert (not_mine.status_code, not_mine.json()) == (404, ATTEMPT_NOT_FOUND)
    assert (not_there.status_code, not_there.json()) == (
        404,
        ATTEMPT_NOT_FOUND,
    )
    assert _stored(db_session, theirs.id).exam_ref is None


@pytest.mark.parametrize("route", ROUTES)
def test_somebody_who_manages_teaching_there_is_refused_another_persons(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    content: Path,
    route: str,
) -> None:
    """Only the person who sat it: what the caller holds is not asked.

    A member of the same organisation holding ``manage_teaching`` and
    the results competency is answered as anybody else is.
    """
    learner = _learner(db_session, trust)
    theirs = _attempt(db_session, trust, learner)
    manager = _learner(db_session, trust, "manager")
    hold(manager, "manage_teaching", "view_teaching_results")
    db_session.commit()
    client = _signed_in(test_client, "manager")

    resp = client.get(f"{ASSESSMENTS}/{theirs.id}/{route}")

    assert (resp.status_code, resp.json()) == (404, ATTEMPT_NOT_FOUND)


@pytest.mark.parametrize("route", ROUTES)
@pytest.mark.parametrize("lost", ["place", "enrolment"])
def test_a_result_is_still_given_after_the_way_into_the_module_is_lost(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    content: Path,
    route: str,
    lost: str,
) -> None:
    """Neither route asks for a place or an enrolment."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)

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
    client = _signed_in(test_client)

    resp = client.get(f"{ASSESSMENTS}/{mine.id}/{route}")

    assert resp.status_code == 200


# --- The marked answers -----------------------------------------------------


def test_the_marked_answers_of_an_attempt_under_way_are_refused(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """With every question answered, and nothing of the marks sent."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, finished=False, passed=None)
    client = _signed_in(test_client)

    resp = client.get(f"{ASSESSMENTS}/{mine.id}/question-results")

    assert resp.status_code == 409
    assert resp.json() == NOT_COMPLETE


def test_the_marked_answers_of_a_finished_attempt_are_sent(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """The answer given and its mark, and never which option was right."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, passed=False)
    client = _signed_in(test_client)

    resp = client.get(f"{ASSESSMENTS}/{mine.id}/question-results")

    assert resp.status_code == 200
    body = resp.json()
    assert body["assessment_id"] == mine.id
    assert body["bank_title"] == "Polyps"
    assert body["is_passed"] is False
    assert [
        (
            q["question_number"],
            q["question_ref"],
            q["display_order"],
            q["answered"],
            q["selected_answer"],
            q["is_correct"],
        )
        for q in body["questions"]
    ] == [
        (1, "question_1", 1, True, "Adenoma", True),
        (2, "question_2", 2, True, "Serrated", False),
    ]
    assert "TAG-" not in resp.text
    assert "EXPLANATION" not in resp.text
    assert "correct_option" not in resp.text


def test_the_marked_answers_are_sent_for_an_attempt_whose_bank_has_gone(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """Not refused, as the certificate is: the title is left empty."""
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, config=None)
    client = _signed_in(test_client)

    resp = client.get(f"{ASSESSMENTS}/{mine.id}/question-results")

    assert resp.status_code == 200
    assert resp.json()["bank_title"] is None
    assert len(resp.json()["questions"]) == 2


# --- The certificate --------------------------------------------------------


@pytest.mark.parametrize(
    ("finished", "passed"),
    [(True, False), (True, None), (False, None), (False, True)],
)
def test_an_attempt_that_was_not_finished_and_passed_has_no_certificate(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    content: Path,
    finished: bool,
    passed: bool | None,
) -> None:
    """Failed, finished with no verdict, under way: the same words."""
    learner = _learner(db_session, trust)
    mine = _attempt(
        db_session, trust, learner, finished=finished, passed=passed
    )
    client = _signed_in(test_client)

    resp = client.get(f"{ASSESSMENTS}/{mine.id}/certificate")

    assert resp.status_code == 400
    assert resp.json() == NOT_EARNED
    assert _stored(db_session, mine.id).exam_ref is None


def test_a_certificate_for_an_attempt_whose_bank_has_gone_is_refused(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    content: Path,
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner, config=None)
    client = _signed_in(test_client)

    resp = client.get(f"{ASSESSMENTS}/{mine.id}/certificate")

    assert resp.status_code == 500
    assert resp.json() == NO_CONFIG


def test_a_bank_that_does_not_issue_certificates_gives_none(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    content: Path,
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(
        db_session,
        trust,
        learner,
        config={"id": BANK, "results": {"exam_ref_prefix": "POLYP-"}},
    )
    client = _signed_in(test_client)

    resp = client.get(f"{ASSESSMENTS}/{mine.id}/certificate")

    assert resp.status_code == 404
    assert resp.json() == NOT_ENABLED
    assert _stored(db_session, mine.id).exam_ref is None


def test_a_bank_with_no_blank_certificate_gives_none(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    content: Path,
) -> None:
    """Said before the attempt is given a reference, so none is written."""
    (content / "certificate-blank.png").unlink()
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    client = _signed_in(test_client)

    resp = client.get(f"{ASSESSMENTS}/{mine.id}/certificate")

    assert resp.status_code == 404
    assert resp.json() == NO_BACKGROUND
    assert _stored(db_session, mine.id).exam_ref is None


def test_what_stops_a_certificate_is_said_in_a_fixed_order(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    content: Path,
) -> None:
    """Not passed, then the bank issuing none, then no blank certificate."""
    (content / "certificate-blank.png").unlink()
    learner = _learner(db_session, trust)
    failed = _attempt(
        db_session, trust, learner, passed=False, config={"id": BANK}
    )
    passed = _attempt(db_session, trust, learner)
    client = _signed_in(test_client)

    assert client.get(f"{ASSESSMENTS}/{failed.id}/certificate").json() == (
        NOT_EARNED
    )
    assert client.get(f"{ASSESSMENTS}/{passed.id}/certificate").json() == (
        NOT_ENABLED
    )


def test_a_passed_attempt_is_sent_its_certificate_as_a_file(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    content: Path,
) -> None:
    """A PDF, named for the bank and the attempt and nothing else."""
    learner = _learner(db_session, trust, full_name="Ada Lovelace")
    mine = _attempt(db_session, trust, learner)
    client = _signed_in(test_client)

    resp = client.get(f"{ASSESSMENTS}/{mine.id}/certificate")

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.headers["content-disposition"] == (
        f'attachment; filename="certificate-{BANK}-{mine.id}.pdf"'
    )
    assert resp.content.startswith(b"%PDF")
    assert (content / "certificate-blank.png").exists()


def test_the_certificate_carries_the_words_of_the_attempt(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    content: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    learner = _learner(db_session, trust, full_name="Ada Lovelace")
    mine = _attempt(db_session, trust, learner)
    drawn: list[dict[str, Any]] = []

    def generate(**words: Any) -> bytes:
        drawn.append(words)

        return b"%PDF-drawn"

    monkeypatch.setattr(certificate, "generate_certificate_pdf", generate)
    client = _signed_in(test_client)

    resp = client.get(f"{ASSESSMENTS}/{mine.id}/certificate")

    assert resp.content == b"%PDF-drawn"
    assert len(drawn) == 1
    del drawn[0]["style"]
    assert drawn[0] == {
        "background_path": content / "certificate-blank.png",
        "exam_title": "Polyps",
        "candidate_name": "Ada Lovelace",
        "pass_summary": "Passed\nSure of it: 90%",
        "completion_date": "5 March 2026",
        "exam_ref": f"POLYP-{mine.id}",
    }


def test_an_attempt_with_no_reference_is_given_one_when_its_certificate_is(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    content: Path,
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    client = _signed_in(test_client)

    client.get(f"{ASSESSMENTS}/{mine.id}/certificate")

    assert _stored(db_session, mine.id).exam_ref == f"POLYP-{mine.id}"


def test_an_attempt_that_has_a_reference_keeps_it(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    content: Path,
) -> None:
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    mine.exam_ref = "OLD-7"
    db_session.commit()
    client = _signed_in(test_client)

    resp = client.get(f"{ASSESSMENTS}/{mine.id}/certificate")

    assert resp.status_code == 200
    assert _stored(db_session, mine.id).exam_ref == "OLD-7"


def test_a_reference_just_given_is_kept_when_the_certificate_cannot_be_drawn(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    content: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """As the route stood: the reference is committed before the drawing.

    Pinned and not changed.
    """
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)

    def fail(**_: Any) -> bytes:
        raise OSError("cannot draw")

    monkeypatch.setattr(certificate, "generate_certificate_pdf", fail)
    client = _signed_in(test_client)

    with pytest.raises(OSError, match="cannot draw"):
        client.get(f"{ASSESSMENTS}/{mine.id}/certificate")

    assert _stored(db_session, mine.id).exam_ref == f"POLYP-{mine.id}"


def test_a_blank_certificate_fetched_from_the_bucket_is_removed_afterwards(
    test_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """With no content path set, the bucket is asked by the bank's id."""
    fetched = tmp_path / "fetched.png"
    Image.new("RGB", (40, 30), "white").save(fetched)
    asked: list[tuple[str, str]] = []

    def download(bucket_name: str, bank_id: str) -> Path:
        asked.append((bucket_name, bank_id))

        return fetched

    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", None
    )
    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", "a-bucket")
    monkeypatch.setattr(
        certificate, "download_certificate_background_from_gcs", download
    )
    learner = _learner(db_session, trust)
    mine = _attempt(db_session, trust, learner)
    client = _signed_in(test_client)

    resp = client.get(f"{ASSESSMENTS}/{mine.id}/certificate")

    assert resp.status_code == 200
    assert resp.content.startswith(b"%PDF")
    assert asked == [("a-bucket", BANK)]
    assert not fetched.exists()
