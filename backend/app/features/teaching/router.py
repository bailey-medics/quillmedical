"""Teaching feature API router.

All routes gated by ``requires_feature("teaching")``.
Educator routes additionally require ``manage_teaching_content`` competency.
"""

from __future__ import annotations

import logging
import random
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.decorators import has_competency
from app.db import get_session
from app.features import requires_feature
from app.features.teaching.models import (
    Assessment,
    AssessmentAnswer,
    QuestionBankConfig,
    QuestionBankItem,
    QuestionBankSync,
    TeachingOrgSettings,
)
from app.features.teaching.schemas import (
    AdminBankOut,
    AnswerResultOut,
    AssessmentHistoryOut,
    AssessmentOut,
    AssessmentWithFirstItem,
    CandidateItemOut,
    CompletionResultOut,
    CriterionResult,
    EducatorResultOut,
    ItemImageOut,
    QuestionBankDetailOut,
    QuestionBankItemOut,
    QuestionBankOut,
    StartAssessmentIn,
    SubmitAnswerIn,
    SyncAllResultOut,
    SyncHistoryOut,
    SyncResultOut,
    TeachingOrgSettingsIn,
    TeachingOrgSettingsOut,
    ValidationMessageOut,
    ValidationResultOut,
)
from app.features.teaching.scoring import (
    evaluate_pass_criteria,
    score_answer_uniform,
    score_answer_variable,
)
from app.features.teaching.storage import (
    download_bank_from_gcs,
    get_storage_backend,
    list_bank_images_in_gcs,
    list_banks_in_gcs,
)
from app.models import User, organisation_staff_member

logger = logging.getLogger(__name__)

teaching_router = APIRouter(
    prefix="/teaching",
    tags=["teaching"],
    dependencies=[Depends(requires_feature("teaching"))],
)

_DEP_SESSION = Depends(get_session)


def _get_current_user(request: Request, db: Session = _DEP_SESSION) -> User:
    """Resolve authenticated user (lazy import to avoid circular dep)."""
    from app.main import current_user

    return current_user(request, db)


_DEP_USER = Depends(_get_current_user)


def _get_user_org_id(user: User, db: Session) -> int:
    """Return the user's primary organisation ID or raise 403."""
    org_id = db.execute(
        select(organisation_staff_member.c.organisation_id).where(
            organisation_staff_member.c.user_id == user.id,
            organisation_staff_member.c.is_primary.is_(True),
        )
    ).scalar_one_or_none()
    if org_id is None:
        raise HTTPException(403, "User has no primary organisation")
    return int(org_id)


def _build_candidate_item(
    answer: AssessmentAnswer,
    config: dict[str, Any],
    bank_type: str,
) -> CandidateItemOut:
    """Build a CandidateItemOut from an AssessmentAnswer + its item."""
    item = answer.item
    storage = get_storage_backend()

    # Resolve images
    images: list[ItemImageOut] = []
    image_labels = config.get("image_labels", [])
    item_folder = item.metadata_json.get(
        "_source_dir", f"question_{answer.display_order}"
    )

    for idx, img in enumerate(item.images or []):
        key = img.get("key", "")
        label = img.get("label")
        if not label and idx < len(image_labels):
            label = image_labels[idx]
        url = storage.get_image_url(item.question_bank_id, item_folder, key)
        images.append(ItemImageOut(key=key, label=label, url=url))

    # Resolve options
    if bank_type == "uniform":
        options = config.get("options", [])
    else:
        options = item.options or []

    # Strip tags and correct answer info from options for candidate view
    safe_options = [
        {"id": o.get("id"), "label": o.get("label")} for o in options
    ]

    # Resolve question type (variable banks store it in metadata)
    question_type = item.metadata_json.get("question_type", "single")

    return CandidateItemOut(
        answer_id=answer.id,
        display_order=answer.display_order,
        question_type=question_type,
        images=images,
        text=item.text,
        options=safe_options,
        selected_option=answer.selected_option,
    )


# ------------------------------------------------------------------
# Question banks (read — all teaching users)
# ------------------------------------------------------------------


@teaching_router.get(
    "/question-banks",
    response_model=list[QuestionBankOut],
)
def list_question_banks(
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> list[QuestionBankConfig]:
    """List question bank configs for the user's organisation."""
    org_id = _get_user_org_id(user, db)
    configs = (
        db.execute(
            select(QuestionBankConfig)
            .where(QuestionBankConfig.organisation_id == org_id)
            .order_by(QuestionBankConfig.question_bank_id)
        )
        .scalars()
        .all()
    )
    return list(configs)


@teaching_router.get(
    "/question-banks/{bank_id}",
    response_model=QuestionBankDetailOut,
)
def get_question_bank(
    bank_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> QuestionBankConfig:
    """Get full detail for a question bank config."""
    org_id = _get_user_org_id(user, db)
    config = (
        db.execute(
            select(QuestionBankConfig)
            .where(
                QuestionBankConfig.organisation_id == org_id,
                QuestionBankConfig.question_bank_id == bank_id,
            )
            .order_by(QuestionBankConfig.version.desc())
        )
        .scalars()
        .first()
    )
    if not config:
        raise HTTPException(404, "Question bank not found")
    return config


# ------------------------------------------------------------------
# Assessments (candidate endpoints)
# ------------------------------------------------------------------


@teaching_router.post(
    "/assessments",
    response_model=AssessmentWithFirstItem,
)
def start_assessment(
    body: StartAssessmentIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> dict[str, Any]:
    """Start a new assessment for the current user."""
    org_id = _get_user_org_id(user, db)

    # Load latest config
    config_row = (
        db.execute(
            select(QuestionBankConfig)
            .where(
                QuestionBankConfig.organisation_id == org_id,
                QuestionBankConfig.question_bank_id == body.question_bank_id,
            )
            .order_by(QuestionBankConfig.version.desc())
        )
        .scalars()
        .first()
    )
    if not config_row:
        raise HTTPException(404, "Question bank not found")

    config = config_row.config_yaml
    assessment_cfg = config.get("assessment", {})
    items_per_attempt = assessment_cfg.get("items_per_attempt", 0)
    time_limit = assessment_cfg.get("time_limit_minutes", 0)
    min_pool = assessment_cfg.get("min_pool_size", 0)

    # Load published items for this bank + version
    published_items = (
        db.execute(
            select(QuestionBankItem).where(
                QuestionBankItem.organisation_id == org_id,
                QuestionBankItem.question_bank_id == body.question_bank_id,
                QuestionBankItem.bank_version == config_row.version,
                QuestionBankItem.status == "published",
            )
        )
        .scalars()
        .all()
    )

    if len(published_items) < min_pool:
        raise HTTPException(
            409,
            f"Insufficient items: {len(published_items)} published, "
            f"need {min_pool}",
        )

    # Randomly select and order items
    selected = random.sample(
        list(published_items),
        min(items_per_attempt, len(published_items)),
    )
    if assessment_cfg.get("randomise_order", True):
        random.shuffle(selected)

    # Create assessment
    assessment = Assessment(
        user_id=user.id,
        organisation_id=org_id,
        question_bank_id=body.question_bank_id,
        bank_version=config_row.version,
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
    db.commit()
    db.refresh(assessment)

    # Build first item
    first_answer = (
        db.execute(
            select(AssessmentAnswer)
            .where(
                AssessmentAnswer.assessment_id == assessment.id,
                AssessmentAnswer.selected_option.is_(None),
            )
            .order_by(AssessmentAnswer.display_order)
        )
        .scalars()
        .first()
    )

    first_item = None
    if first_answer:
        first_item = _build_candidate_item(
            first_answer, config, config_row.type
        )

    return {
        "assessment": assessment,
        "first_item": first_item,
    }


@teaching_router.get(
    "/assessments/history",
    response_model=list[AssessmentHistoryOut],
)
def assessment_history(
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> list[AssessmentHistoryOut]:
    """List the current user's past assessments."""
    rows = db.execute(
        select(Assessment, QuestionBankConfig.title)
        .outerjoin(
            QuestionBankConfig,
            (
                QuestionBankConfig.question_bank_id
                == Assessment.question_bank_id
            )
            & (QuestionBankConfig.version == Assessment.bank_version)
            & (
                QuestionBankConfig.organisation_id
                == Assessment.organisation_id
            ),
        )
        .where(Assessment.user_id == user.id)
        .order_by(Assessment.started_at.desc())
    ).all()
    return [
        AssessmentHistoryOut(
            id=a.id,
            question_bank_id=a.question_bank_id,
            bank_title=title or a.question_bank_id,
            bank_version=a.bank_version,
            started_at=a.started_at,
            completed_at=a.completed_at,
            is_passed=a.is_passed,
            score_breakdown=a.score_breakdown,
            total_items=a.total_items,
        )
        for a, title in rows
    ]


@teaching_router.get(
    "/assessments/{assessment_id}",
    response_model=AssessmentOut,
)
def get_assessment(
    assessment_id: int,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> Assessment:
    """Get assessment state."""
    assessment = db.get(Assessment, assessment_id)
    if not assessment or assessment.user_id != user.id:
        raise HTTPException(404, "Assessment not found")
    return assessment


@teaching_router.get(
    "/assessments/{assessment_id}/current",
    response_model=CandidateItemOut | None,
)
def get_current_item(
    assessment_id: int,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> CandidateItemOut | None:
    """Get the next unanswered item (for resuming after disconnect)."""
    assessment = db.get(Assessment, assessment_id)
    if not assessment or assessment.user_id != user.id:
        raise HTTPException(404, "Assessment not found")
    if assessment.completed_at:
        raise HTTPException(409, "Assessment already completed")

    next_answer = (
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

    if not next_answer:
        return None

    config_row = (
        db.execute(
            select(QuestionBankConfig).where(
                QuestionBankConfig.organisation_id
                == assessment.organisation_id,
                QuestionBankConfig.question_bank_id
                == assessment.question_bank_id,
                QuestionBankConfig.version == assessment.bank_version,
            )
        )
        .scalars()
        .first()
    )
    if not config_row:
        raise HTTPException(500, "Config not found for assessment")

    return _build_candidate_item(
        next_answer, config_row.config_yaml, config_row.type
    )


@teaching_router.get(
    "/assessments/{assessment_id}/item/{display_order}",
    response_model=CandidateItemOut,
)
def get_item_by_order(
    assessment_id: int,
    display_order: int,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> CandidateItemOut:
    """Get a specific item by display order (for navigating back)."""
    assessment = db.get(Assessment, assessment_id)
    if not assessment or assessment.user_id != user.id:
        raise HTTPException(404, "Assessment not found")
    if assessment.completed_at:
        raise HTTPException(409, "Assessment already completed")

    answer = (
        db.execute(
            select(AssessmentAnswer).where(
                AssessmentAnswer.assessment_id == assessment_id,
                AssessmentAnswer.display_order == display_order,
            )
        )
        .scalars()
        .first()
    )
    if not answer:
        raise HTTPException(404, "Item not found")

    config_row = (
        db.execute(
            select(QuestionBankConfig).where(
                QuestionBankConfig.organisation_id
                == assessment.organisation_id,
                QuestionBankConfig.question_bank_id
                == assessment.question_bank_id,
                QuestionBankConfig.version == assessment.bank_version,
            )
        )
        .scalars()
        .first()
    )
    if not config_row:
        raise HTTPException(500, "Config not found for assessment")

    return _build_candidate_item(
        answer, config_row.config_yaml, config_row.type
    )


@teaching_router.post(
    "/assessments/{assessment_id}/answer",
    response_model=AnswerResultOut,
)
def submit_answer(
    assessment_id: int,
    body: SubmitAnswerIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> dict[str, Any]:
    """Submit an answer, score it, and return the next item."""
    assessment = db.get(Assessment, assessment_id)
    if not assessment or assessment.user_id != user.id:
        raise HTTPException(404, "Assessment not found")
    if assessment.completed_at:
        raise HTTPException(409, "Assessment already completed")

    # Time limit check
    now = datetime.now(UTC)
    deadline = assessment.started_at.replace(tzinfo=UTC) + timedelta(
        minutes=assessment.time_limit_minutes
    )
    if now > deadline:
        raise HTTPException(409, "Time limit exceeded")

    # Find current unanswered item
    current = (
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
    if not current:
        raise HTTPException(409, "All items already answered")

    # Load config
    config_row = (
        db.execute(
            select(QuestionBankConfig).where(
                QuestionBankConfig.organisation_id
                == assessment.organisation_id,
                QuestionBankConfig.question_bank_id
                == assessment.question_bank_id,
                QuestionBankConfig.version == assessment.bank_version,
            )
        )
        .scalars()
        .first()
    )
    if not config_row:
        raise HTTPException(500, "Config not found for assessment")

    config = config_row.config_yaml
    item = current.item

    # Score the answer
    if config_row.type == "uniform":
        is_correct, resolved_tags = score_answer_uniform(
            body.selected_option, config, item.metadata_json
        )
    else:
        is_correct, resolved_tags = score_answer_variable(
            body.selected_option,
            item.options or [],
            item.correct_option_id or "",
        )

    # Persist
    current.selected_option = body.selected_option
    current.is_correct = is_correct
    current.resolved_tags = resolved_tags
    current.answered_at = now
    db.flush()

    # Find next unanswered
    next_answer = (
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

    next_item = None
    all_answered = next_answer is None
    if next_answer:
        next_item = _build_candidate_item(next_answer, config, config_row.type)

    db.commit()

    return {
        "answered": True,
        "next_item": next_item,
        "all_answered": all_answered,
    }


@teaching_router.put(
    "/assessments/{assessment_id}/answer/{answer_id}",
    response_model=CandidateItemOut,
)
def update_answer(
    assessment_id: int,
    answer_id: int,
    body: SubmitAnswerIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> CandidateItemOut:
    """Update an already-answered item (before assessment completion)."""
    assessment = db.get(Assessment, assessment_id)
    if not assessment or assessment.user_id != user.id:
        raise HTTPException(404, "Assessment not found")
    if assessment.completed_at:
        raise HTTPException(409, "Assessment already completed")

    now = datetime.now(UTC)
    deadline = assessment.started_at.replace(tzinfo=UTC) + timedelta(
        minutes=assessment.time_limit_minutes
    )
    if now > deadline:
        raise HTTPException(409, "Time limit exceeded")

    answer = (
        db.execute(
            select(AssessmentAnswer).where(
                AssessmentAnswer.id == answer_id,
                AssessmentAnswer.assessment_id == assessment_id,
            )
        )
        .scalars()
        .first()
    )
    if not answer:
        raise HTTPException(404, "Answer not found")

    config_row = (
        db.execute(
            select(QuestionBankConfig).where(
                QuestionBankConfig.organisation_id
                == assessment.organisation_id,
                QuestionBankConfig.question_bank_id
                == assessment.question_bank_id,
                QuestionBankConfig.version == assessment.bank_version,
            )
        )
        .scalars()
        .first()
    )
    if not config_row:
        raise HTTPException(500, "Config not found for assessment")

    config = config_row.config_yaml
    item = answer.item

    if config_row.type == "uniform":
        is_correct, resolved_tags = score_answer_uniform(
            body.selected_option, config, item.metadata_json
        )
    else:
        is_correct, resolved_tags = score_answer_variable(
            body.selected_option,
            item.options or [],
            item.correct_option_id or "",
        )

    answer.selected_option = body.selected_option
    answer.is_correct = is_correct
    answer.resolved_tags = resolved_tags
    answer.answered_at = now
    db.commit()

    return _build_candidate_item(answer, config, config_row.type)


@teaching_router.post(
    "/assessments/{assessment_id}/complete",
    response_model=CompletionResultOut,
)
def complete_assessment(
    assessment_id: int,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> dict[str, Any]:
    """Finalise the assessment and compute aggregate scores."""
    assessment = db.get(Assessment, assessment_id)
    if not assessment or assessment.user_id != user.id:
        raise HTTPException(404, "Assessment not found")
    if assessment.completed_at:
        raise HTTPException(409, "Assessment already completed")

    # Load config
    config_row = (
        db.execute(
            select(QuestionBankConfig).where(
                QuestionBankConfig.organisation_id
                == assessment.organisation_id,
                QuestionBankConfig.question_bank_id
                == assessment.question_bank_id,
                QuestionBankConfig.version == assessment.bank_version,
            )
        )
        .scalars()
        .first()
    )
    if not config_row:
        raise HTTPException(500, "Config not found for assessment")

    config = config_row.config_yaml
    pass_criteria = config.get("pass_criteria", [])

    # Gather scored answers
    answers = (
        db.execute(
            select(AssessmentAnswer).where(
                AssessmentAnswer.assessment_id == assessment_id
            )
        )
        .scalars()
        .all()
    )

    answer_dicts = [
        {
            "selected_option": a.selected_option,
            "is_correct": a.is_correct,
            "resolved_tags": a.resolved_tags,
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

    assessment.completed_at = datetime.now(UTC)
    assessment.score_breakdown = score_breakdown
    assessment.is_passed = overall_passed
    db.commit()

    return {
        "is_passed": overall_passed,
        "criteria": [
            CriterionResult(
                name=c["name"],
                value=c["value"],
                threshold=c["threshold"],
                passed=c["passed"],
            )
            for c in criteria_results
        ],
        "score_breakdown": score_breakdown,
    }


# ------------------------------------------------------------------
# Certificate
# ------------------------------------------------------------------


@teaching_router.get(
    "/assessments/{assessment_id}/certificate",
)
def download_certificate(
    assessment_id: int,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> Any:
    """Generate and return a PDF certificate for a passed assessment."""
    from fastapi.responses import Response

    from app.config import settings
    from app.features.teaching.certificate import (
        find_certificate_background,
        generate_certificate_pdf,
    )

    assessment = db.get(Assessment, assessment_id)
    if not assessment or assessment.user_id != user.id:
        raise HTTPException(404, "Assessment not found")

    if not assessment.completed_at or not assessment.is_passed:
        raise HTTPException(
            400, "Certificate only available for passed assessments"
        )

    # Load config to check certificate_download is enabled
    config_row = (
        db.execute(
            select(QuestionBankConfig).where(
                QuestionBankConfig.organisation_id
                == assessment.organisation_id,
                QuestionBankConfig.question_bank_id
                == assessment.question_bank_id,
                QuestionBankConfig.version == assessment.bank_version,
            )
        )
        .scalars()
        .first()
    )
    if not config_row:
        raise HTTPException(500, "Config not found for assessment")

    config = config_row.config_yaml
    if not config.get("results", {}).get("certificate_download"):
        raise HTTPException(404, "Certificates not enabled for this bank")

    # Find background image
    bank_path_str = settings.TEACHING_QUESTION_BANK_PATH
    if not bank_path_str:
        raise HTTPException(500, "TEACHING_QUESTION_BANK_PATH not configured")

    bank_path = Path(bank_path_str)
    bg = find_certificate_background(bank_path, assessment.question_bank_id)
    if not bg:
        raise HTTPException(
            404, "No certificate background found for this bank"
        )

    # Build pass summary from score breakdown
    criteria = (assessment.score_breakdown or {}).get("criteria", [])
    summary_parts: list[str] = []
    for c in criteria:
        pct = round(c.get("value", 0) * 100)
        summary_parts.append(f"{c.get('name', '')}: {pct}%")
    pass_summary = (
        "Pass — " + ", ".join(summary_parts) if summary_parts else "Pass"
    )

    # Format date
    completion_date = assessment.completed_at.strftime("%-d %B %Y")

    # Candidate name
    candidate_name = user.username

    pdf_bytes = generate_certificate_pdf(
        background_path=bg,
        exam_title=config_row.title,
        candidate_name=candidate_name,
        pass_summary=pass_summary,
        completion_date=completion_date,
    )

    filename = f"certificate-{assessment.question_bank_id}-{assessment.id}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


# ------------------------------------------------------------------
# Educator endpoints
# ------------------------------------------------------------------

_DEP_MANAGE = Depends(has_competency("manage_teaching_content"))


@teaching_router.get(
    "/items",
    response_model=list[QuestionBankItemOut],
    dependencies=[_DEP_MANAGE],
)
def list_items(
    question_bank_id: str | None = None,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> list[QuestionBankItem]:
    """List items in the org's question bank (educator only)."""
    org_id = _get_user_org_id(user, db)
    stmt = select(QuestionBankItem).where(
        QuestionBankItem.organisation_id == org_id
    )
    if question_bank_id:
        stmt = stmt.where(
            QuestionBankItem.question_bank_id == question_bank_id
        )
    stmt = stmt.order_by(
        QuestionBankItem.question_bank_id,
        QuestionBankItem.bank_version,
    )
    return list(db.execute(stmt).scalars().all())


def _resolve_bank_path(bank_id: str) -> Path:
    """Resolve a bank_id to a safe filesystem path.

    Uses ``TEACHING_QUESTION_BANK_PATH`` from config.  Raises 400 if
    the setting is not configured, 404 if the bank directory does not
    exist.  Rejects path-traversal attempts (``..`` or ``/``).
    """
    from app.config import settings

    if not bank_id or "/" in bank_id or ".." in bank_id:
        raise HTTPException(400, "Invalid bank_id")

    base = settings.TEACHING_QUESTION_BANK_PATH
    if not base:
        raise HTTPException(
            400,
            "TEACHING_QUESTION_BANK_PATH is not configured",
        )

    resolved = Path(base) / bank_id
    if not resolved.is_dir():
        raise HTTPException(404, f"Question bank '{bank_id}' not found")
    return resolved


def _resolve_bank_path_or_gcs(bank_id: str) -> tuple[Path, bool]:
    """Resolve bank to filesystem path or download from GCS.

    Returns (path, is_temp) — caller must clean up when is_temp is True.
    """
    from app.config import settings

    if not bank_id or "/" in bank_id or ".." in bank_id:
        raise HTTPException(400, "Invalid bank_id")

    # Try local path first
    base = settings.TEACHING_QUESTION_BANK_PATH
    if base:
        resolved = Path(base) / bank_id
        if resolved.is_dir():
            return resolved, False

    # Fall back to GCS
    bucket = settings.TEACHING_GCS_BUCKET
    if bucket:
        try:
            bank_dir = download_bank_from_gcs(bucket, bank_id)
            return bank_dir, True
        except FileNotFoundError:
            raise HTTPException(
                404, f"Question bank '{bank_id}' not found in GCS"
            ) from None

    raise HTTPException(
        400,
        "Neither TEACHING_QUESTION_BANK_PATH nor "
        "TEACHING_GCS_BUCKET is configured",
    )


def _build_image_inventory(
    bank_id: str,
    is_gcs: bool,
) -> dict[str, set[str]] | None:
    """Build an image inventory when the bank is sourced from GCS."""
    if not is_gcs:
        return None
    from app.config import settings

    bucket = settings.TEACHING_GCS_BUCKET
    if not bucket:
        return None
    return list_bank_images_in_gcs(bucket, bank_id)


@teaching_router.post(
    "/items/validate",
    response_model=ValidationResultOut,
    dependencies=[_DEP_MANAGE],
)
def validate_items(
    body: dict[str, str],
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> dict[str, Any]:
    """Dry-run validation of a question bank (no import)."""
    import shutil

    from app.features.teaching.sync import sync_question_bank

    bank_id = body.get("bank_id", "")
    if not bank_id:
        raise HTTPException(400, "bank_id is required")

    bank_path, is_temp = _resolve_bank_path_or_gcs(bank_id)
    try:
        org_id = _get_user_org_id(user, db)
        inventory = _build_image_inventory(bank_id, is_temp)
        result, _ = sync_question_bank(
            bank_path,
            org_id,
            user.id,
            db,
            validate_only=True,
            image_inventory=inventory,
        )
    finally:
        if is_temp:
            shutil.rmtree(bank_path.parent, ignore_errors=True)

    return {
        "bank_id": result.bank_id,
        "version": result.version,
        "is_valid": result.is_valid,
        "errors": [
            ValidationMessageOut(path=e.path, message=e.message)
            for e in result.errors
        ],
        "warnings": [
            ValidationMessageOut(path=w.path, message=w.message)
            for w in result.warnings
        ],
        "item_count": result.item_count,
        "summary": result.summary,
    }


@teaching_router.post(
    "/items/sync",
    response_model=SyncResultOut,
    dependencies=[_DEP_MANAGE],
)
def sync_items(
    body: dict[str, str],
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> QuestionBankSync:
    """Trigger sync from filesystem/GCS to database."""
    import shutil

    from app.features.teaching.sync import sync_question_bank

    bank_id = body.get("bank_id", "")
    if not bank_id:
        raise HTTPException(400, "bank_id is required")

    bank_path, is_temp = _resolve_bank_path_or_gcs(bank_id)
    try:
        org_id = _get_user_org_id(user, db)
        inventory = _build_image_inventory(bank_id, is_temp)
        validation, sync_record = sync_question_bank(
            bank_path,
            org_id,
            user.id,
            db,
            image_inventory=inventory,
        )
    finally:
        if is_temp:
            shutil.rmtree(bank_path.parent, ignore_errors=True)

    if sync_record is None:
        raise HTTPException(500, "Sync failed unexpectedly")

    return sync_record


@teaching_router.get(
    "/results",
    response_model=list[EducatorResultOut],
    dependencies=[_DEP_MANAGE],
)
def list_results(
    question_bank_id: str | None = None,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> list[Assessment]:
    """List all assessment results for the educator's org."""
    org_id = _get_user_org_id(user, db)
    stmt = select(Assessment).where(
        Assessment.organisation_id == org_id,
        Assessment.completed_at.isnot(None),
    )
    if question_bank_id:
        stmt = stmt.where(Assessment.question_bank_id == question_bank_id)
    stmt = stmt.order_by(Assessment.completed_at.desc())
    return list(db.execute(stmt).scalars().all())


@teaching_router.get(
    "/syncs",
    response_model=list[SyncHistoryOut],
    dependencies=[_DEP_MANAGE],
)
def list_syncs(
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> list[QuestionBankSync]:
    """List sync history for the educator's org."""
    org_id = _get_user_org_id(user, db)
    return list(
        db.execute(
            select(QuestionBankSync)
            .where(QuestionBankSync.organisation_id == org_id)
            .order_by(QuestionBankSync.started_at.desc())
        )
        .scalars()
        .all()
    )


# ------------------------------------------------------------------
# Admin endpoints — teaching modules overview
# ------------------------------------------------------------------


@teaching_router.get(
    "/admin/banks",
    response_model=list[AdminBankOut],
    dependencies=[_DEP_MANAGE],
)
def list_admin_banks(
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> list[AdminBankOut]:
    """List all teaching modules (from DB + GCS)."""
    from app.config import settings

    org_id = _get_user_org_id(user, db)

    # DB banks — latest version per bank_id
    db_configs = (
        db.execute(
            select(QuestionBankConfig)
            .where(QuestionBankConfig.organisation_id == org_id)
            .order_by(
                QuestionBankConfig.question_bank_id,
                QuestionBankConfig.version.desc(),
            )
        )
        .scalars()
        .all()
    )

    # De-duplicate: keep only the latest version per bank_id
    seen: dict[str, QuestionBankConfig] = {}
    for c in db_configs:
        if c.question_bank_id not in seen:
            seen[c.question_bank_id] = c

    # Count items per bank
    item_counts: dict[str, int] = {}
    for bank_id, cfg in seen.items():
        count = db.execute(
            select(QuestionBankItem.id).where(
                QuestionBankItem.organisation_id == org_id,
                QuestionBankItem.question_bank_id == bank_id,
                QuestionBankItem.bank_version == cfg.version,
            )
        ).all()
        item_counts[bank_id] = len(count)

    # GCS banks
    gcs_bank_ids: set[str] = set()
    bucket = settings.TEACHING_GCS_BUCKET
    if bucket:
        try:
            gcs_bank_ids = set(list_banks_in_gcs(bucket))
        except Exception:
            logger.exception("Failed to list GCS banks")

    # Merge
    all_bank_ids = set(seen.keys()) | gcs_bank_ids
    result: list[AdminBankOut] = []

    for bank_id in sorted(all_bank_ids):
        bank_cfg = seen.get(bank_id)
        result.append(
            AdminBankOut(
                bank_id=bank_id,
                title=bank_cfg.title if bank_cfg else None,
                version=bank_cfg.version if bank_cfg else None,
                type=bank_cfg.type if bank_cfg else None,
                synced_at=bank_cfg.synced_at if bank_cfg else None,
                in_gcs=bank_id in gcs_bank_ids,
                in_db=bank_id in seen,
                item_count=item_counts.get(bank_id, 0),
            )
        )

    return result


@teaching_router.post(
    "/admin/sync-all",
    response_model=SyncAllResultOut,
    dependencies=[_DEP_MANAGE],
)
def sync_all_banks(
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> dict[str, Any]:
    """Sync all question banks from GCS (or local filesystem)."""
    import shutil

    from app.config import settings
    from app.features.teaching.sync import sync_question_bank

    org_id = _get_user_org_id(user, db)
    bucket = settings.TEACHING_GCS_BUCKET
    base_path = settings.TEACHING_QUESTION_BANK_PATH

    # Discover bank IDs
    bank_ids: list[str] = []
    if bucket:
        try:
            bank_ids = list_banks_in_gcs(bucket)
        except Exception:
            logger.exception("Failed to list GCS banks")
    elif base_path:
        base = Path(base_path)
        if base.is_dir():
            bank_ids = sorted(
                d.name
                for d in base.iterdir()
                if d.is_dir() and (d / "config.yaml").is_file()
            )

    synced: list[QuestionBankSync] = []
    errors: list[dict[str, str]] = []

    for bank_id in bank_ids:
        bank_path: Path | None = None
        is_temp = False
        try:
            bank_path, is_temp = _resolve_bank_path_or_gcs(bank_id)
            inventory = _build_image_inventory(bank_id, is_temp)
            _validation, sync_record = sync_question_bank(
                bank_path,
                org_id,
                user.id,
                db,
                image_inventory=inventory,
            )
            if sync_record:
                synced.append(sync_record)
        except Exception as exc:
            logger.exception("Failed to sync bank '%s'", bank_id)
            errors.append({"bank_id": bank_id, "error": str(exc)})
        finally:
            if is_temp and bank_path:
                shutil.rmtree(bank_path.parent, ignore_errors=True)

    return {"synced": synced, "errors": errors}


@teaching_router.put(
    "/settings",
    response_model=TeachingOrgSettingsOut,
    dependencies=[_DEP_MANAGE],
)
def update_settings(
    body: TeachingOrgSettingsIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> TeachingOrgSettings:
    """Update teaching settings for the educator's org."""
    org_id = _get_user_org_id(user, db)
    settings_row = db.execute(
        select(TeachingOrgSettings).where(
            TeachingOrgSettings.organisation_id == org_id
        )
    ).scalar_one_or_none()

    if settings_row:
        settings_row.coordinator_email = body.coordinator_email
        settings_row.institution_name = body.institution_name
    else:
        settings_row = TeachingOrgSettings(
            organisation_id=org_id,
            coordinator_email=body.coordinator_email,
            institution_name=body.institution_name,
        )
        db.add(settings_row)

    db.commit()
    db.refresh(settings_row)
    return settings_row
