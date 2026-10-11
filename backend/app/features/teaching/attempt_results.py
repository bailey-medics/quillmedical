"""What a learner may have of an attempt once it is over.

Two things: its certificate, and how it was answered question by
question. Who is asking is the route's to find, and whose the attempt is
has been asked before anything here is called, by ``attempt_of`` in
``app.features.teaching.attempts``: only the person who sat an attempt
is given either. These functions take that attempt and say whether it
has a certificate, find the blank one it is printed on, and lay out its
answers.

Drawing the certificate is not done here. The ``certificate`` module
beside this one does that, and ``certificate_pdf`` below hands it the
words.

Nothing here asks where the learner may take modules, nor whether they
are still enrolled on this one, nor whether the bank is still open. A
result outlives all three, which is why these routes ask for the
results competency and not the modules one.

These things are deliberately not asked, because the routes never asked
them, and each is pinned by a test as it stands:

- **Whether the bank still issues certificates today.** The setting is
  read from the version the attempt was sat on, so turning certificates
  off in a later version leaves an earlier pass with its certificate.
- **Whether the blank certificate is the one the attempt's version
  had.** The image is looked for by the bank's id alone, so it is
  whichever is in the content store now.
- **Whether the certificate can be drawn, before the attempt is given
  its reference.** A reference written here is kept even where drawing
  then fails.

The content store is reached through the ``storage`` and ``certificate``
modules by name, never by importing a function out of them, so a test
that replaces one of their functions replaces it here.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.features.teaching import certificate, storage
from app.features.teaching.errors import (
    AssessmentConfigNotFound,
    AssessmentNotComplete,
    CertificateNotEarned,
    CertificatesNotEnabled,
    NoCertificateBackground,
)
from app.features.teaching.models import Assessment, QuestionBankConfig
from app.features.teaching.schemas import (
    AssessmentQuestionResultOut,
    AssessmentQuestionResultsOut,
    CriterionResult,
)
from app.models import User

logger = logging.getLogger(__name__)


# --- The certificate --------------------------------------------------------


@dataclass(frozen=True)
class CertificateDue:
    """A passed attempt whose bank issues certificates."""

    #: The synced copy of the bank version the attempt was sat on.
    config: QuestionBankConfig
    #: When the attempt was finished, which the certificate is dated by.
    completed_at: datetime


@dataclass(frozen=True)
class CertificateBackground:
    """The blank certificate a bank's certificates are printed on."""

    path: Path
    #: True when the image was fetched from the bucket into a file of
    #: its own, which is to be removed once the certificate is drawn.
    temporary: bool


def certificate_due(db: Session, assessment: Assessment) -> CertificateDue:
    """Say whether an attempt has a certificate, or refuse.

    The attempt is the caller's to have found as the learner's own. The
    checks run in this order, so the first that fails is the one
    reported: not passed, bank gone, bank issues none.

    Passed means finished and marked as a pass, both. An attempt still
    under way has none, nor has one that failed.

    One query: the synced copy of the version sat, asked of the
    organisation the attempt is recorded against. Nothing is written.

    Args:
        db: Core database session.
        assessment: The learner's own attempt.

    Returns:
        The bank, and when the attempt was finished.

    Raises:
        CertificateNotEarned: If the attempt is not finished, or was
            not passed.
        AssessmentConfigNotFound: If the organisation the attempt was
            recorded against holds no synced copy of the version sat.
        CertificatesNotEnabled: If that version of the bank does not
            set ``results.certificate_download``.
    """
    if not assessment.completed_at or not assessment.is_passed:
        raise CertificateNotEarned()

    # Load config to check certificate_download is enabled
    config_row = _bank_sat_if_any(db, assessment)

    if not config_row:
        raise AssessmentConfigNotFound()

    config = config_row.config_yaml

    if not config.get("results", {}).get("certificate_download"):
        raise CertificatesNotEnabled()

    return CertificateDue(
        config=config_row, completed_at=assessment.completed_at
    )


def certificate_background(bank_id: str) -> CertificateBackground:
    """Find the blank certificate of one bank, on disk or in the bucket.

    The content path is looked in first, where one is set: the bank's
    directory there, for ``certificate-blank.png``. Only where that
    gives nothing is the bucket asked, where one is set, and the image
    is then fetched into a temporary file.

    The image is looked for by the bank's id alone. Which version of
    the bank an attempt was sat on is not asked.

    Args:
        bank_id: The question bank.

    Returns:
        Where the image is, and whether it is a temporary file.

    Raises:
        NoCertificateBackground: If neither holds the image, or neither
            is set.
    """
    # Find background image (local path or GCS)
    bg: Path | None = None
    tmp_bg: Path | None = None
    bank_path_str = settings.TEACHING_QUESTION_BANK_PATH

    if bank_path_str:
        bank_dir = storage.resolve_local_bank(bank_path_str, bank_id)
        if bank_dir:
            cert_file = bank_dir / "certificate-blank.png"
            if cert_file.is_file():
                bg = cert_file

    if not bg and settings.TEACHING_GCS_BUCKET:
        tmp_bg = certificate.download_certificate_background_from_gcs(
            settings.TEACHING_GCS_BUCKET,
            bank_id,
        )
        bg = tmp_bg

    if not bg:
        raise NoCertificateBackground()

    return CertificateBackground(path=bg, temporary=tmp_bg is not None)


def give_exam_reference(
    assessment: Assessment, config_row: QuestionBankConfig
) -> bool:
    """Give an attempt its exam reference, where it has none.

    For an attempt finished before references were written at the
    finish. The reference is the bank's ``results.exam_ref_prefix``
    followed by the attempt's id, as ``finish_attempt`` writes it. An
    attempt that has one keeps it, and a bank that gives no prefix
    leaves the attempt without.

    Nothing is flushed or committed here. The caller commits where this
    says a reference was written.

    Args:
        assessment: The learner's own attempt.
        config_row: The synced copy of the bank version it was sat on.

    Returns:
        True when a reference was written, False when the attempt had
        one already or the bank gives no prefix.
    """
    # Lazily generate exam_ref for assessments completed before the feature
    if assessment.exam_ref:
        return False

    prefix = config_row.config_yaml.get("results", {}).get(
        "exam_ref_prefix", ""
    )

    if not prefix:
        return False

    assessment.exam_ref = f"{prefix}{assessment.id}"

    return True


def certificate_pdf(
    assessment: Assessment,
    due: CertificateDue,
    background: CertificateBackground,
    *,
    candidate: User,
) -> bytes:
    """Hand the certificate module the words of one certificate.

    The name on it is the candidate's full name, or their username
    where they have given none. The scores are the criteria stored when
    the attempt was finished, the date is the day it was finished, and
    the layout is the ``certificate`` block of the bank version sat.
    The exam reference is printed where the attempt has one.

    A background fetched from the bucket is removed once the
    certificate is drawn. Should drawing fail, it is left behind: the
    route did the same.

    Args:
        assessment: The learner's own attempt.
        due: What ``certificate_due`` gave for it.
        background: What ``certificate_background`` gave for its bank.
        candidate: The person who sat it.

    Returns:
        The PDF.
    """
    config = due.config.config_yaml

    # The scores the certificate lists, as saved at completion
    criteria = (assessment.score_breakdown or {}).get("criteria", [])

    # Format date
    completion_date = due.completed_at.strftime("%-d %B %Y")

    # Candidate name
    candidate_name = candidate.full_name or candidate.username

    # Parse certificate style from config
    style = certificate.parse_certificate_style(config.get("certificate"))

    pdf_bytes = certificate.generate_certificate_pdf(
        background_path=background.path,
        exam_title=due.config.title,
        candidate_name=candidate_name,
        pass_summary=certificate.certificate_pass_summary(criteria),
        completion_date=completion_date,
        style=style,
        exam_ref=assessment.exam_ref,
    )

    # Clean up temp file downloaded from GCS
    if background.temporary:
        background.path.unlink(missing_ok=True)

    return pdf_bytes


# --- The answers, question by question --------------------------------------

_QUESTION_NUMBER = re.compile(r"(\d+)$")


def question_number_of(source_dir: str) -> int | None:
    """The question's number in its bank, from its directory name.

    Sync only accepts directories named ``question_<digits>``, so
    ``question_007`` gives 7. Anything without trailing digits gives
    ``None`` rather than a guess.
    """
    match = _QUESTION_NUMBER.search(source_dir)

    return int(match.group(1)) if match else None


def chosen_option_label(
    options: list[dict[str, Any]], selected_option: str | None
) -> str | None:
    """The label of the option a candidate chose, as they were shown it.

    Falls back to the option's id when the bank no longer lists it or
    gives it no label, so an answer is never shown blank. ``None`` only
    when nothing was chosen.
    """
    if selected_option is None:
        return None
    for option in options:
        if option.get("id") == selected_option:
            label = option.get("label")
            return str(label) if label else selected_option

    return selected_option


def scored_criteria(
    score_breakdown: dict[str, Any] | None,
) -> list[CriterionResult]:
    """The pass criteria as scored at completion, from the stored breakdown.

    The breakdown is a stored document, so an entry that does not have
    the shape ``evaluate_pass_criteria`` writes is left out rather than
    failing the whole page.
    """
    if not score_breakdown:
        return []

    results: list[CriterionResult] = []

    for criterion in score_breakdown.get("criteria", []):
        try:
            results.append(CriterionResult.model_validate(criterion))
        except ValidationError:
            logger.warning("Skipped a malformed stored pass criterion")

    return results


def question_results(
    db: Session, assessment: Assessment
) -> AssessmentQuestionResultsOut:
    """A finished attempt's answers, right and wrong, by question number.

    For audit: each question is named by its number in the bank rather
    than the shuffled position it was shown at, alongside the bank
    version the attempt was sat against. Only once the attempt is
    complete, since mid-exam it would say which answers so far are
    right. That is asked before anything of the attempt is read.

    The attempt is the caller's to have found as the learner's own:
    nobody else is given this.

    The option chosen is given by the label the candidate saw. Which
    option was right is never given, though where the answer is marked
    right the two are the same.

    Two queries: the synced copy of the version sat, then the attempt's
    answer rows, each with its item. A bank whose synced copy has gone
    is not refused: the title is left empty, and the options are read
    from each item.

    Args:
        db: Core database session.
        assessment: The learner's own attempt.

    Returns:
        The attempt and its questions, in order of question number. A
        question whose directory name carries no number comes after
        those that do, by name.

    Raises:
        AssessmentNotComplete: If the attempt is not finished.
    """
    if assessment.completed_at is None:
        raise AssessmentNotComplete()

    config_row = _bank_sat_if_any(db, assessment)

    # A uniform bank lists its options once, in its config; a variable
    # bank lists them on each item, as the candidate view reads them.
    uniform_options: list[dict[str, Any]] | None = (
        config_row.config_yaml.get("options", [])
        if config_row is not None and config_row.type == "uniform"
        else None
    )

    questions: list[AssessmentQuestionResultOut] = []

    for answer in assessment.answers:
        source_dir = str(answer.item.metadata_json.get("_source_dir", ""))
        options = (
            uniform_options
            if uniform_options is not None
            else (answer.item.options or [])
        )
        questions.append(
            AssessmentQuestionResultOut(
                question_number=question_number_of(source_dir),
                question_ref=source_dir,
                display_order=answer.display_order,
                answered=answer.selected_option is not None,
                selected_answer=chosen_option_label(
                    options, answer.selected_option
                ),
                is_correct=answer.is_correct,
                answered_at=answer.answered_at,
            )
        )
    # Numerically, so question 10 follows 9 rather than 1; anything
    # without a number goes last, by name.
    questions.sort(
        key=lambda q: (
            q.question_number is None,
            q.question_number or 0,
            q.question_ref,
        )
    )

    return AssessmentQuestionResultsOut(
        assessment_id=assessment.id,
        question_bank_id=assessment.question_bank_id,
        bank_version=assessment.bank_version,
        bank_title=config_row.title if config_row else None,
        exam_ref=assessment.exam_ref,
        completed_at=assessment.completed_at,
        is_passed=assessment.is_passed,
        criteria=scored_criteria(assessment.score_breakdown),
        questions=questions,
    )


def _bank_sat_if_any(
    db: Session, assessment: Assessment
) -> QuestionBankConfig | None:
    """The synced copy of the bank version an attempt was sat on, if any.

    Asked of the organisation the attempt is recorded against. None
    where that organisation holds no copy of that version, for the
    caller to refuse or to go without.
    """
    return (
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
