"""A certificate and the marked answers, asked of attempt_results.py itself."""

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.features.teaching import certificate, storage
from app.features.teaching.attempt_results import (
    CertificateBackground,
    CertificateDue,
    certificate_background,
    certificate_due,
    certificate_pdf,
    give_exam_reference,
    question_results,
)
from app.features.teaching.errors import (
    AssessmentConfigNotFound,
    AssessmentNotComplete,
    CertificateNotEarned,
    CertificatesNotEnabled,
    NoCertificateBackground,
)
from app.features.teaching.models import (
    Assessment,
    AssessmentAnswer,
    QuestionBankConfig,
    QuestionBankItem,
)
from app.models import OrgUnit, User

BANK = "polyps"

FINISHED = datetime(2026, 3, 5, 14, 30, tzinfo=UTC)

#: A bank that issues certificates and names its attempts.
ISSUING: dict[str, Any] = {
    "id": BANK,
    "results": {"certificate_download": True, "exam_ref_prefix": "POLYP-"},
}

#: What ``finish_attempt`` stores on an attempt that passed.
BREAKDOWN: dict[str, Any] = {
    "criteria": [
        {"name": "Sure of it", "value": 0.9, "threshold": 0.5, "passed": True}
    ],
    "overall_passed": True,
}

#: Everything the results must not carry is spelt in capitals.
ITEM_OPTIONS = [
    {"id": "a", "label": "Adenoma", "tags": ["TAG-RIGHT"]},
    {"id": "b", "label": "Serrated", "tags": ["TAG-WRONG"]},
]
BANK_OPTIONS = [
    {"id": "a", "label": "Sure, adenoma", "tags": ["TAG-RIGHT"]},
    {"id": "b", "label": "Unsure, serrated", "tags": ["TAG-WRONG"]},
]


def _organisation(db: Session, name: str = "Trust") -> OrgUnit:
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
    db.flush()

    return org


def _person(
    db: Session, username: str = "learner", full_name: str | None = None
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        password_hash="x",
        full_name=full_name,
        is_active=True,
        email_verified=True,
        base_profession="teaching_delegate",
    )
    db.add(user)
    db.flush()

    return user


def _sync(
    db: Session,
    org: OrgUnit,
    config: dict[str, Any] | None = None,
    *,
    version: int = 1,
    bank_type: str = "variable",
) -> QuestionBankConfig:
    """One version of the bank, synced into the organisation."""
    row = QuestionBankConfig(
        org_unit_id=org.id,
        question_bank_id=BANK,
        version=version,
        title="Polyps",
        description="A question bank.",
        type=bank_type,
        config_yaml=dict(ISSUING) if config is None else config,
    )
    db.add(row)
    db.flush()

    return row


def _attempt(
    db: Session,
    org: OrgUnit,
    user: User,
    *,
    finished: bool = True,
    passed: bool | None = True,
) -> Assessment:
    """An attempt with no questions, finished and passed unless said."""
    assessment = Assessment(
        user_id=user.id,
        org_unit_id=org.id,
        question_bank_id=BANK,
        bank_version=1,
        time_limit_minutes=30,
        total_items=0,
        completed_at=FINISHED if finished else None,
        is_passed=passed,
        score_breakdown=BREAKDOWN if passed else None,
    )
    db.add(assessment)
    db.flush()

    return assessment


def _question(
    db: Session,
    assessment: Assessment,
    *,
    source_dir: str | None,
    position: int,
    chosen: str | None = None,
    correct: bool | None = None,
    options: list[dict[str, Any]] | None = None,
) -> AssessmentAnswer:
    """One question of an attempt, answered where *chosen* is given."""
    metadata: dict[str, Any] = {"explanation": "EXPLANATION-OF-THE-ANSWER"}

    if source_dir is not None:
        metadata["_source_dir"] = source_dir

    item = QuestionBankItem(
        org_unit_id=assessment.org_unit_id,
        question_bank_id=BANK,
        bank_version=1,
        status="published",
        images=[],
        options=ITEM_OPTIONS if options is None else options,
        correct_option_id="a",
        metadata_json=metadata,
    )
    db.add(item)
    db.flush()
    answer = AssessmentAnswer(
        assessment_id=assessment.id,
        item_id=item.id,
        display_order=position,
        selected_option=chosen,
        is_correct=correct,
        answered_at=FINISHED if chosen is not None else None,
    )
    db.add(answer)
    db.flush()

    return answer


def _blank_certificate(directory: Path) -> Path:
    """A real image named as a bank's blank certificate is."""
    path = directory / "certificate-blank.png"
    Image.new("RGB", (40, 30), "white").save(path)

    return path


def _bank_on_disk(base: Path, *, with_blank: bool = True) -> Path:
    """The bank's directory under a content path, as sync reads it."""
    bank_dir = base / BANK
    bank_dir.mkdir()
    (bank_dir / "config.yaml").write_text("id: polyps\n")

    if with_blank:
        _blank_certificate(bank_dir)

    return bank_dir


def _content_store(
    monkeypatch: pytest.MonkeyPatch,
    *,
    path: Path | None = None,
    bucket: str | None = None,
    in_bucket: Path | None = None,
) -> list[tuple[str, str]]:
    """Set where content is read from, and fake the bucket.

    Returns each (bucket, bank) the bucket was asked for.
    """
    asked: list[tuple[str, str]] = []

    def download(bucket_name: str, bank_id: str) -> Path | None:
        asked.append((bucket_name, bank_id))

        return in_bucket

    monkeypatch.setattr(
        settings,
        "TEACHING_QUESTION_BANK_PATH",
        str(path) if path is not None else None,
    )
    monkeypatch.setattr(settings, "TEACHING_GCS_BUCKET", bucket)
    monkeypatch.setattr(
        certificate, "download_certificate_background_from_gcs", download
    )

    return asked


def _note_the_drawing(
    monkeypatch: pytest.MonkeyPatch,
) -> list[dict[str, Any]]:
    """Replace the drawing of a certificate, noting what it was handed."""
    drawn: list[dict[str, Any]] = []

    def generate(**words: Any) -> bytes:
        drawn.append(words)

        return b"%PDF-drawn"

    monkeypatch.setattr(certificate, "generate_certificate_pdf", generate)

    return drawn


# --- certificate_due --------------------------------------------------------


def test_a_passed_attempt_on_a_bank_that_issues_them_has_a_certificate(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    config = _sync(db_session, org)
    assessment = _attempt(db_session, org, learner)

    due = certificate_due(db_session, assessment)

    assert due.config is config
    assert due.completed_at == assessment.completed_at


def test_a_failed_attempt_has_no_certificate(db_session: Session) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _sync(db_session, org)
    assessment = _attempt(db_session, org, learner, passed=False)

    with pytest.raises(CertificateNotEarned) as refused:
        certificate_due(db_session, assessment)

    assert refused.value.status_code == 400
    assert (
        refused.value.message
        == "Certificate only available for passed assessments"
    )


def test_an_attempt_still_under_way_has_no_certificate(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _sync(db_session, org)
    assessment = _attempt(
        db_session, org, learner, finished=False, passed=None
    )

    with pytest.raises(CertificateNotEarned):
        certificate_due(db_session, assessment)


def test_an_attempt_marked_as_passed_and_never_finished_has_no_certificate(
    db_session: Session,
) -> None:
    """Both are asked: a pass with no finish is not one."""
    org = _organisation(db_session)
    learner = _person(db_session)
    _sync(db_session, org)
    assessment = _attempt(
        db_session, org, learner, finished=False, passed=True
    )

    with pytest.raises(CertificateNotEarned):
        certificate_due(db_session, assessment)


def test_an_attempt_finished_with_no_verdict_has_no_certificate(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _sync(db_session, org)
    assessment = _attempt(db_session, org, learner, passed=None)

    with pytest.raises(CertificateNotEarned):
        certificate_due(db_session, assessment)


def test_a_passed_attempt_whose_bank_has_gone_is_refused(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _attempt(db_session, org, learner)

    with pytest.raises(AssessmentConfigNotFound) as refused:
        certificate_due(db_session, assessment)

    assert refused.value.status_code == 500
    assert refused.value.message == "Config not found for assessment"


def test_a_copy_another_organisation_holds_is_not_the_bank_sat(
    db_session: Session,
) -> None:
    """Asked of the organisation the attempt is recorded against only."""
    org = _organisation(db_session)
    owner = _organisation(db_session, "Educators")
    learner = _person(db_session)
    _sync(db_session, owner)
    assessment = _attempt(db_session, org, learner)

    with pytest.raises(AssessmentConfigNotFound):
        certificate_due(db_session, assessment)


@pytest.mark.parametrize(
    "config",
    [
        {"id": BANK},
        {"id": BANK, "results": {}},
        {"id": BANK, "results": {"certificate_download": False}},
    ],
)
def test_a_bank_that_does_not_issue_certificates_gives_none(
    db_session: Session, config: dict[str, Any]
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _sync(db_session, org, config)
    assessment = _attempt(db_session, org, learner)

    with pytest.raises(CertificatesNotEnabled) as refused:
        certificate_due(db_session, assessment)

    assert refused.value.status_code == 404
    assert refused.value.message == "Certificates not enabled for this bank"


def test_the_setting_is_read_from_the_version_sat_not_the_newest(
    db_session: Session,
) -> None:
    """As the route stood: a later version turning them off changes nothing.

    An attempt passed on a version that issued certificates keeps its
    certificate. Pinned and not changed.
    """
    org = _organisation(db_session)
    learner = _person(db_session)
    sat = _sync(db_session, org)
    _sync(
        db_session,
        org,
        {"id": BANK, "results": {"certificate_download": False}},
        version=2,
    )
    assessment = _attempt(db_session, org, learner)

    assert certificate_due(db_session, assessment).config is sat


def test_what_stops_a_certificate_is_said_in_a_fixed_order(
    db_session: Session,
) -> None:
    """Not passed, then the bank gone, then the bank issuing none."""
    org = _organisation(db_session)
    learner = _person(db_session)
    failed = _attempt(db_session, org, learner, passed=False)
    passed = _attempt(db_session, org, learner)

    with pytest.raises(CertificateNotEarned):
        certificate_due(db_session, failed)
    with pytest.raises(AssessmentConfigNotFound):
        certificate_due(db_session, passed)

    _sync(db_session, org, {"id": BANK})

    with pytest.raises(CertificateNotEarned):
        certificate_due(db_session, failed)
    with pytest.raises(CertificatesNotEnabled):
        certificate_due(db_session, passed)


def test_asking_whether_a_certificate_is_due_writes_nothing(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _sync(db_session, org)
    assessment = _attempt(db_session, org, learner)

    certificate_due(db_session, assessment)

    assert assessment.exam_ref is None
    assert not db_session.dirty


# --- certificate_background -------------------------------------------------


def test_the_blank_certificate_on_disk_is_found_and_the_bucket_not_asked(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    bank_dir = _bank_on_disk(tmp_path)
    asked = _content_store(monkeypatch, path=tmp_path, bucket="a-bucket")

    background = certificate_background(BANK)

    assert background == CertificateBackground(
        path=bank_dir / "certificate-blank.png", temporary=False
    )
    assert asked == []


def test_a_bank_on_disk_with_no_blank_certificate_falls_back_to_the_bucket(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bank_on_disk(tmp_path, with_blank=False)
    fetched = _blank_certificate(tmp_path)
    asked = _content_store(
        monkeypatch, path=tmp_path, bucket="a-bucket", in_bucket=fetched
    )

    background = certificate_background(BANK)

    assert background == CertificateBackground(path=fetched, temporary=True)
    assert asked == [("a-bucket", BANK)]


def test_a_bank_that_is_not_on_disk_falls_back_to_the_bucket(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    fetched = _blank_certificate(tmp_path)
    asked = _content_store(
        monkeypatch, path=tmp_path, bucket="a-bucket", in_bucket=fetched
    )

    assert certificate_background(BANK).temporary is True
    assert asked == [("a-bucket", BANK)]


def test_with_no_content_path_the_disk_is_not_looked_at(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    looked: list[str] = []
    fetched = _blank_certificate(tmp_path)
    _content_store(monkeypatch, bucket="a-bucket", in_bucket=fetched)
    monkeypatch.setattr(
        storage,
        "resolve_local_bank",
        lambda base, bank_id: looked.append(bank_id),
    )

    assert certificate_background(BANK).path == fetched
    assert looked == []


def test_a_bank_with_no_blank_certificate_anywhere_is_refused(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bank_on_disk(tmp_path, with_blank=False)
    asked = _content_store(monkeypatch, path=tmp_path, bucket="a-bucket")

    with pytest.raises(NoCertificateBackground) as refused:
        certificate_background(BANK)

    assert refused.value.status_code == 404
    assert (
        refused.value.message
        == "No certificate background found for this bank"
    )
    assert asked == [("a-bucket", BANK)]


def test_with_no_bucket_set_the_bucket_is_not_asked(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bank_on_disk(tmp_path, with_blank=False)
    asked = _content_store(monkeypatch, path=tmp_path)

    with pytest.raises(NoCertificateBackground):
        certificate_background(BANK)

    assert asked == []


def test_with_neither_a_path_nor_a_bucket_there_is_no_blank_certificate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    asked = _content_store(monkeypatch)

    with pytest.raises(NoCertificateBackground):
        certificate_background(BANK)

    assert asked == []


def test_the_bank_on_disk_is_found_through_the_storage_module(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """So a test that replaces ``storage.resolve_local_bank`` is obeyed."""
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    blank = _blank_certificate(elsewhere)
    _content_store(monkeypatch, path=tmp_path)
    asked: list[tuple[str, str]] = []

    def resolve(base_path: str, bank_id: str) -> Path:
        asked.append((base_path, bank_id))

        return elsewhere

    monkeypatch.setattr(storage, "resolve_local_bank", resolve)

    assert certificate_background(BANK).path == blank
    assert asked == [(str(tmp_path), BANK)]


# --- give_exam_reference ----------------------------------------------------


def test_an_attempt_with_no_reference_is_given_the_prefix_and_its_id(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    config = _sync(db_session, org)
    assessment = _attempt(db_session, org, learner)

    assert give_exam_reference(assessment, config) is True
    assert assessment.exam_ref == f"POLYP-{assessment.id}"


def test_an_attempt_that_has_a_reference_keeps_it(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    config = _sync(db_session, org)
    assessment = _attempt(db_session, org, learner)
    assessment.exam_ref = "OLD-7"
    db_session.flush()

    assert give_exam_reference(assessment, config) is False
    assert assessment.exam_ref == "OLD-7"
    assert not db_session.dirty


@pytest.mark.parametrize(
    "config",
    [
        {"id": BANK},
        {"id": BANK, "results": {"certificate_download": True}},
        {"id": BANK, "results": {"exam_ref_prefix": ""}},
    ],
)
def test_a_bank_that_gives_no_prefix_leaves_the_attempt_without(
    db_session: Session, config: dict[str, Any]
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    synced = _sync(db_session, org, config)
    assessment = _attempt(db_session, org, learner)

    assert give_exam_reference(assessment, synced) is False
    assert assessment.exam_ref is None
    assert not db_session.dirty


# --- certificate_pdf --------------------------------------------------------


def test_the_certificate_is_handed_the_words_of_the_attempt(
    db_session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session, full_name="Ada Lovelace")
    config = _sync(
        db_session,
        org,
        {**ISSUING, "certificate": {"orientation": "portrait"}},
    )
    assessment = _attempt(db_session, org, learner)
    assessment.exam_ref = "POLYP-9"
    blank = _blank_certificate(tmp_path)
    drawn = _note_the_drawing(monkeypatch)

    pdf = certificate_pdf(
        assessment,
        CertificateDue(config=config, completed_at=FINISHED),
        CertificateBackground(path=blank, temporary=False),
        candidate=learner,
    )

    assert pdf == b"%PDF-drawn"
    assert len(drawn) == 1
    words = drawn[0]
    assert words.pop("style").orientation == "portrait"
    assert words == {
        "background_path": blank,
        "exam_title": "Polyps",
        "candidate_name": "Ada Lovelace",
        "pass_summary": "Passed\nSure of it: 90%",
        "completion_date": "5 March 2026",
        "exam_ref": "POLYP-9",
    }


def test_somebody_with_no_full_name_is_named_by_their_username(
    db_session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session, "ada")
    config = _sync(db_session, org)
    assessment = _attempt(db_session, org, learner)
    drawn = _note_the_drawing(monkeypatch)

    certificate_pdf(
        assessment,
        CertificateDue(config=config, completed_at=FINISHED),
        CertificateBackground(
            path=_blank_certificate(tmp_path), temporary=False
        ),
        candidate=learner,
    )

    assert drawn[0]["candidate_name"] == "ada"


def test_an_attempt_with_no_stored_scores_and_no_reference_says_passed_only(
    db_session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    config = _sync(db_session, org)
    assessment = _attempt(db_session, org, learner)
    assessment.score_breakdown = None
    drawn = _note_the_drawing(monkeypatch)

    certificate_pdf(
        assessment,
        CertificateDue(config=config, completed_at=FINISHED),
        CertificateBackground(
            path=_blank_certificate(tmp_path), temporary=False
        ),
        candidate=learner,
    )

    assert drawn[0]["pass_summary"] == "Passed"
    assert drawn[0]["exam_ref"] is None


def test_a_background_fetched_from_the_bucket_is_removed_once_drawn(
    db_session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    config = _sync(db_session, org)
    assessment = _attempt(db_session, org, learner)
    fetched = _blank_certificate(tmp_path)
    _note_the_drawing(monkeypatch)

    certificate_pdf(
        assessment,
        CertificateDue(config=config, completed_at=FINISHED),
        CertificateBackground(path=fetched, temporary=True),
        candidate=learner,
    )

    assert not fetched.exists()


def test_a_background_on_disk_is_left_where_it_is(
    db_session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    config = _sync(db_session, org)
    assessment = _attempt(db_session, org, learner)
    blank = _blank_certificate(tmp_path)
    _note_the_drawing(monkeypatch)

    certificate_pdf(
        assessment,
        CertificateDue(config=config, completed_at=FINISHED),
        CertificateBackground(path=blank, temporary=False),
        candidate=learner,
    )

    assert blank.exists()


def test_a_fetched_background_is_left_behind_when_drawing_fails(
    db_session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """As the route stood: the file is removed only after a drawing.

    Pinned and not changed.
    """
    org = _organisation(db_session)
    learner = _person(db_session)
    config = _sync(db_session, org)
    assessment = _attempt(db_session, org, learner)
    fetched = _blank_certificate(tmp_path)

    def fail(**_: Any) -> bytes:
        raise OSError("cannot draw")

    monkeypatch.setattr(certificate, "generate_certificate_pdf", fail)

    with pytest.raises(OSError, match="cannot draw"):
        certificate_pdf(
            assessment,
            CertificateDue(config=config, completed_at=FINISHED),
            CertificateBackground(path=fetched, temporary=True),
            candidate=learner,
        )

    assert fetched.exists()


def test_the_real_drawing_gives_a_pdf(
    db_session: Session, tmp_path: Path
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session, full_name="Ada Lovelace")
    config = _sync(db_session, org)
    assessment = _attempt(db_session, org, learner)

    pdf = certificate_pdf(
        assessment,
        CertificateDue(config=config, completed_at=FINISHED),
        CertificateBackground(
            path=_blank_certificate(tmp_path), temporary=False
        ),
        candidate=learner,
    )

    assert pdf.startswith(b"%PDF")


# --- question_results -------------------------------------------------------


def test_an_attempt_still_under_way_gives_no_marked_answers(
    db_session: Session,
) -> None:
    """Even with every question answered: it is the finish that is asked."""
    org = _organisation(db_session)
    learner = _person(db_session)
    _sync(db_session, org)
    assessment = _attempt(
        db_session, org, learner, finished=False, passed=None
    )
    _question(
        db_session,
        assessment,
        source_dir="question_1",
        position=1,
        chosen="a",
        correct=True,
    )

    with pytest.raises(AssessmentNotComplete) as refused:
        question_results(db_session, assessment)

    assert refused.value.status_code == 409
    assert refused.value.message == "Assessment is not complete"


def test_a_finished_attempt_gives_its_answers_by_question_number(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _sync(db_session, org)
    assessment = _attempt(db_session, org, learner)
    assessment.exam_ref = "POLYP-3"
    _question(
        db_session,
        assessment,
        source_dir="question_10",
        position=1,
        chosen="a",
        correct=True,
    )
    _question(
        db_session,
        assessment,
        source_dir="question_9",
        position=2,
        chosen="b",
        correct=False,
    )
    _question(db_session, assessment, source_dir="question_2", position=3)

    results = question_results(db_session, assessment)

    assert results.assessment_id == assessment.id
    assert (results.question_bank_id, results.bank_version) == (BANK, 1)
    assert results.bank_title == "Polyps"
    assert results.exam_ref == "POLYP-3"
    assert results.completed_at == assessment.completed_at
    assert results.is_passed is True
    assert [c.model_dump() for c in results.criteria] == BREAKDOWN["criteria"]
    assert [q.question_number for q in results.questions] == [2, 9, 10]
    assert [q.question_ref for q in results.questions] == [
        "question_2",
        "question_9",
        "question_10",
    ]
    assert [q.display_order for q in results.questions] == [3, 2, 1]
    assert [q.answered for q in results.questions] == [False, True, True]
    assert [q.selected_answer for q in results.questions] == [
        None,
        "Serrated",
        "Adenoma",
    ]
    assert [q.is_correct for q in results.questions] == [None, False, True]
    assert results.questions[0].answered_at is None
    assert results.questions[1].answered_at is not None


def test_a_question_with_no_number_comes_last_by_name(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _sync(db_session, org)
    assessment = _attempt(db_session, org, learner)
    _question(db_session, assessment, source_dir="warm_up", position=1)
    _question(db_session, assessment, source_dir=None, position=2)
    _question(db_session, assessment, source_dir="question_4", position=3)

    results = question_results(db_session, assessment)

    assert [
        (q.question_number, q.question_ref) for q in results.questions
    ] == [(4, "question_4"), (None, ""), (None, "warm_up")]


def test_a_bank_with_shared_options_names_the_answer_from_the_bank(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _sync(
        db_session,
        org,
        {"id": BANK, "options": BANK_OPTIONS},
        bank_type="uniform",
    )
    assessment = _attempt(db_session, org, learner)
    _question(
        db_session,
        assessment,
        source_dir="question_1",
        position=1,
        chosen="b",
        correct=False,
    )

    results = question_results(db_session, assessment)

    assert results.questions[0].selected_answer == "Unsure, serrated"


def test_something_chosen_that_is_no_option_is_given_as_it_was_sent(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _sync(db_session, org)
    assessment = _attempt(db_session, org, learner)
    _question(
        db_session,
        assessment,
        source_dir="question_1",
        position=1,
        chosen="no-such-option",
        correct=False,
    )

    results = question_results(db_session, assessment)

    assert results.questions[0].selected_answer == "no-such-option"
    assert results.questions[0].answered is True


def test_an_attempt_whose_bank_has_gone_still_gives_its_answers(
    db_session: Session,
) -> None:
    """Not refused, as the certificate is: the title is left empty.

    The options are then read from each item, whatever type the bank
    was.
    """
    org = _organisation(db_session)
    learner = _person(db_session)
    assessment = _attempt(db_session, org, learner)
    _question(
        db_session,
        assessment,
        source_dir="question_1",
        position=1,
        chosen="a",
        correct=True,
    )

    results = question_results(db_session, assessment)

    assert results.bank_title is None
    assert results.questions[0].selected_answer == "Adenoma"
    assert results.questions[0].is_correct is True


def test_a_failed_attempt_gives_its_answers_as_a_passed_one_does(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _sync(db_session, org)
    assessment = _attempt(db_session, org, learner, passed=False)
    _question(
        db_session,
        assessment,
        source_dir="question_1",
        position=1,
        chosen="b",
        correct=False,
    )

    results = question_results(db_session, assessment)

    assert results.is_passed is False
    assert results.criteria == []
    assert len(results.questions) == 1


def test_the_results_name_the_answer_given_and_never_the_right_one(
    db_session: Session,
) -> None:
    """No tag, no explanation and no right option id, in any field."""
    org = _organisation(db_session)
    learner = _person(db_session)
    _sync(db_session, org)
    assessment = _attempt(db_session, org, learner)
    _question(
        db_session,
        assessment,
        source_dir="question_1",
        position=1,
        chosen="b",
        correct=False,
    )

    results = question_results(db_session, assessment)
    sent = results.model_dump_json()

    assert set(results.questions[0].model_dump()) == {
        "question_number",
        "question_ref",
        "display_order",
        "answered",
        "selected_answer",
        "is_correct",
        "answered_at",
    }
    assert "TAG-" not in sent
    assert "EXPLANATION" not in sent
    assert "Adenoma" not in sent


def test_reading_the_results_writes_nothing(db_session: Session) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _sync(db_session, org)
    assessment = _attempt(db_session, org, learner)
    _question(db_session, assessment, source_dir="question_1", position=1)

    question_results(db_session, assessment)

    assert not db_session.dirty
    assert len(db_session.scalars(select(AssessmentAnswer)).all()) == 1
