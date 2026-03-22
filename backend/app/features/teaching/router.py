"""Teaching feature API router.

All routes gated by ``requires_feature("teaching")``.
Educator routes additionally require ``manage_teaching_content`` competency.
"""

from __future__ import annotations

import random
from datetime import UTC, datetime, timedelta
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
from app.features.teaching.storage import get_storage_backend
from app.models import User, organisation_staff_member

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

    for idx, img in enumerate(item.images or []):
        key = img.get("key", "")
        label = img.get("label")
        if not label and idx < len(image_labels):
            label = image_labels[idx]
        url = storage.get_image_url(
            item.question_bank_id, f"question_{answer.display_order}", key
        )
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

    return CandidateItemOut(
        answer_id=answer.id,
        display_order=answer.display_order,
        images=images,
        text=item.text,
        options=safe_options,
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
) -> list[Assessment]:
    """List the current user's past assessments."""
    results = (
        db.execute(
            select(Assessment)
            .where(Assessment.user_id == user.id)
            .order_by(Assessment.started_at.desc())
        )
        .scalars()
        .all()
    )
    return list(results)


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
    from pathlib import Path

    from app.features.teaching.sync import sync_question_bank

    bank_path = body.get("bank_path", "")
    if not bank_path:
        raise HTTPException(400, "bank_path is required")

    org_id = _get_user_org_id(user, db)
    result, _ = sync_question_bank(
        Path(bank_path),
        org_id,
        user.id,
        db,
        validate_only=True,
    )
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
    from pathlib import Path

    from app.features.teaching.sync import sync_question_bank

    bank_path = body.get("bank_path", "")
    if not bank_path:
        raise HTTPException(400, "bank_path is required")

    org_id = _get_user_org_id(user, db)
    validation, sync_record = sync_question_bank(
        Path(bank_path),
        org_id,
        user.id,
        db,
    )

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
