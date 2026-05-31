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

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
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
    QuestionBankOrgStatus,
    QuestionBankSync,
    TeachingOrgSettings,
)
from app.features.teaching.schemas import (
    AdminBankDetailOut,
    AdminBankOut,
    AnswerResultOut,
    AssessmentHistoryOut,
    AssessmentOut,
    AssessmentWithFirstItem,
    BankOrgRow,
    CandidateItemOut,
    CompletionResultOut,
    CriterionResult,
    DelegateOut,
    EducatorResultOut,
    EmailTemplateOut,
    ItemImageOut,
    LearningContentOut,
    LearningModuleOut,
    QuestionBankDetailOut,
    QuestionBankItemOut,
    QuestionBankOrgSettingsIn,
    QuestionBankOrgSettingsOut,
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
    get_module_status_from_gcs,
    get_storage_backend,
    has_learning_content,
    list_bank_images_in_gcs,
    list_banks_in_gcs,
    resolve_module_dir,
)
from app.models import (
    OrganisationFeature,
    Organization,
    User,
    organisation_site,
    organisation_staff_member,
    site_staff_member,
)

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


def _get_user_org_ids(user: User, db: Session) -> list[int]:
    """Return all organisation IDs the user belongs to, or raise 403.

    Resolves membership via direct org staff OR site staff linked to an org.
    """
    # Direct org membership
    direct = set(
        db.execute(
            select(organisation_staff_member.c.organisation_id).where(
                organisation_staff_member.c.user_id == user.id
            )
        )
        .scalars()
        .all()
    )
    # Indirect via site → org linkage
    via_site = set(
        db.execute(
            select(organisation_site.c.organisation_id)
            .join(
                site_staff_member,
                site_staff_member.c.site_id == organisation_site.c.site_id,
            )
            .where(site_staff_member.c.user_id == user.id)
        )
        .scalars()
        .all()
    )
    org_ids = direct | via_site
    if not org_ids:
        raise HTTPException(403, "User has no organisation")
    return [int(r) for r in org_ids]


def _get_user_org_id(user: User, db: Session) -> int:
    """Return the user's first organisation ID or raise 403."""
    return _get_user_org_ids(user, db)[0]


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
) -> list[dict[str, Any]]:
    """List question bank configs for all the user's organisations."""
    from app.config import settings

    org_ids = _get_user_org_ids(user, db)
    configs = (
        db.execute(
            select(QuestionBankConfig)
            .where(QuestionBankConfig.organisation_id.in_(org_ids))
            .order_by(QuestionBankConfig.question_bank_id)
        )
        .scalars()
        .all()
    )

    # Look up is_live status for each bank across all orgs
    statuses = (
        db.execute(
            select(QuestionBankOrgStatus).where(
                QuestionBankOrgStatus.organisation_id.in_(org_ids),
            )
        )
        .scalars()
        .all()
    )
    # A bank is live if ANY of the user's orgs has it live
    live_map: dict[str, bool] = {}
    for s in statuses:
        if s.is_live:
            live_map[s.question_bank_id] = True

    # Check which banks have learning content in the local repos
    base_path = settings.TEACHING_QUESTION_BANK_PATH or ""

    # De-duplicate by question_bank_id (user may be in multiple orgs
    # with the same bank configured)
    seen: set[str] = set()
    results: list[dict[str, Any]] = []
    for c in configs:
        if c.question_bank_id in seen:
            continue
        seen.add(c.question_bank_id)
        results.append(
            {
                "id": c.id,
                "question_bank_id": c.question_bank_id,
                "version": c.version,
                "title": c.title,
                "description": c.description,
                "type": c.type,
                "synced_at": c.synced_at,
                "is_live": live_map.get(c.question_bank_id, False),
                "has_learning": has_learning_content(
                    base_path, c.question_bank_id
                ),
            }
        )
    return results


@teaching_router.get(
    "/question-banks/{bank_id}",
    response_model=QuestionBankDetailOut,
)
def get_question_bank(
    bank_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> dict[str, Any]:
    """Get full detail for a question bank config."""
    from app.config import settings

    org_ids = _get_user_org_ids(user, db)
    config = (
        db.execute(
            select(QuestionBankConfig)
            .where(
                QuestionBankConfig.organisation_id.in_(org_ids),
                QuestionBankConfig.question_bank_id == bank_id,
            )
            .order_by(QuestionBankConfig.version.desc())
        )
        .scalars()
        .first()
    )
    if not config:
        raise HTTPException(404, "Question bank not found")

    status_row = (
        db.execute(
            select(QuestionBankOrgStatus).where(
                QuestionBankOrgStatus.organisation_id.in_(org_ids),
                QuestionBankOrgStatus.question_bank_id == bank_id,
                QuestionBankOrgStatus.is_live.is_(True),
            )
        )
        .scalars()
        .first()
    )

    return {
        "id": config.id,
        "question_bank_id": config.question_bank_id,
        "version": config.version,
        "title": config.title,
        "description": config.description,
        "type": config.type,
        "synced_at": config.synced_at,
        "config_yaml": config.config_yaml,
        "is_live": status_row.is_live if status_row else False,
        "has_learning": has_learning_content(
            settings.TEACHING_QUESTION_BANK_PATH or "",
            config.question_bank_id,
        ),
    }


# ------------------------------------------------------------------
# Learning modules (read — all teaching users)
# ------------------------------------------------------------------


@teaching_router.get(
    "/modules/{module_id}/learning",
    response_model=LearningContentOut,
)
def get_learning_content(
    module_id: str,
    user: User = _DEP_USER,
) -> dict[str, Any]:
    """Get parsed learning slides for a module."""
    from app.config import settings
    from app.features.teaching.mdx_parser import (
        load_learning_content,
        load_module_yaml,
        parse_mdx_to_slides,
    )
    from app.features.teaching.storage import (
        download_learning_mdx_from_gcs,
        download_module_yaml_from_gcs,
    )

    bucket = settings.TEACHING_GCS_BUCKET
    base_path = settings.TEACHING_QUESTION_BANK_PATH

    if bucket:
        # Production: load from GCS
        meta = download_module_yaml_from_gcs(bucket, module_id) or {}
        mdx_content = download_learning_mdx_from_gcs(bucket, module_id)
        if not mdx_content:
            raise HTTPException(404, "No learning content for this module")
        slides = parse_mdx_to_slides(mdx_content)
    elif base_path:
        # Local dev: load from filesystem
        module_dir = resolve_module_dir(base_path, module_id)
        if not module_dir:
            raise HTTPException(404, "Module not found")
        meta = load_module_yaml(module_dir)
        slides = load_learning_content(module_dir)
        if not slides:
            raise HTTPException(404, "No learning content for this module")
    else:
        raise HTTPException(404, "Teaching content not configured")

    def _resolve_image_url(module_id: str, filename: str) -> str:
        """Build a URL for a learning image."""
        if bucket:
            from app.features.teaching.storage import (
                get_learning_image_url_gcs,
            )

            return get_learning_image_url_gcs(bucket, module_id, filename)
        return f"/api/teaching/images/learning/{module_id}/{filename}"

    return {
        "module_id": module_id,
        "title": meta.get("title", module_id),
        "slides": [
            {
                "slide_index": s.slide_index,
                "layout": s.layout,
                "title": s.title,
                "body": s.body,
                "callout_type": s.callout_type,
                "callout_body": s.callout_body,
                "youtube_id": s.youtube_id,
                "duration_seconds": s.duration_seconds,
                "image_src": (
                    _resolve_image_url(module_id, s.figure_src)
                    if s.figure_src
                    else None
                ),
                "image_alt": s.figure_alt,
                "image_caption": s.figure_caption,
                "image_position": s.figure_position,
            }
            for s in slides
        ],
    }


@teaching_router.get(
    "/modules",
    response_model=list[LearningModuleOut],
)
def list_learning_modules(
    user: User = _DEP_USER,
) -> list[dict[str, Any]]:
    """List all modules that have learning content."""
    from app.config import settings
    from app.features.teaching.mdx_parser import (
        load_learning_content,
        load_module_yaml,
        parse_mdx_to_slides,
    )
    from app.features.teaching.storage import (
        discover_local_banks,
        download_learning_mdx_from_gcs,
        download_module_yaml_from_gcs,
        has_learning_content_gcs,
        list_banks_in_gcs,
    )

    bucket = settings.TEACHING_GCS_BUCKET
    base_path = settings.TEACHING_QUESTION_BANK_PATH

    if bucket:
        # Production: discover from GCS
        try:
            bank_ids = list_banks_in_gcs(bucket)
        except Exception:
            return []
    elif base_path:
        bank_ids = discover_local_banks(base_path)
    else:
        return []

    modules: list[dict[str, Any]] = []

    for bank_id in bank_ids:
        if bucket:
            meta = download_module_yaml_from_gcs(bucket, bank_id) or {}
            if not meta:
                continue
            has_learning = has_learning_content_gcs(bucket, bank_id)
            if has_learning:
                mdx = download_learning_mdx_from_gcs(bucket, bank_id)
                slide_count = len(parse_mdx_to_slides(mdx)) if mdx else 0
            else:
                slide_count = 0
        else:
            module_dir = resolve_module_dir(base_path or "", bank_id)
            if not module_dir:
                continue
            meta = load_module_yaml(module_dir)
            if not meta:
                continue
            learning_path = module_dir / "learning" / "content.mdx"
            has_learning = learning_path.is_file()
            slide_count = (
                len(load_learning_content(module_dir)) if has_learning else 0
            )

        modules.append(
            {
                "module_id": meta.get("moduleId", bank_id),
                "title": meta.get("title", bank_id),
                "order": meta.get("order", 0),
                "status": meta.get("status", "draft"),
                "renewal_months": meta.get("renewalMonths"),
                "has_learning": has_learning,
                "slide_count": slide_count,
                "description": meta.get("description"),
            }
        )

    modules.sort(key=lambda m: m["order"])
    return modules


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

    # Block assessment start when bank is not live
    status_row = (
        db.execute(
            select(QuestionBankOrgStatus).where(
                QuestionBankOrgStatus.organisation_id == org_id,
                QuestionBankOrgStatus.question_bank_id
                == body.question_bank_id,
            )
        )
        .scalars()
        .first()
    )
    if not status_row or not status_row.is_live:
        raise HTTPException(403, "This assessment is not currently open")

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
            exam_ref=a.exam_ref,
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


# ------------------------------------------------------------------
# Certificate email helper
# ------------------------------------------------------------------


def _maybe_enqueue_certificate_emails(
    *,
    background_tasks: BackgroundTasks,
    assessment: Assessment,
    config_row: QuestionBankConfig,
    user: User,
    db: Session,
    criteria_results: list[dict[str, Any]],
    exam_ref: str | None = None,
) -> None:
    """Enqueue certificate emails if the bank is live and email sending is enabled."""
    from app.config import settings as app_settings
    from app.email_send import Attachment as EmailAttachment
    from app.email_send import send_email
    from app.features.teaching.certificate import (
        download_certificate_background_from_gcs,
        generate_certificate_pdf,
    )
    from app.features.teaching.email_templates import (
        extract_email_template,
        render_email,
    )

    config = config_row.config_yaml
    results = config.get("results", {})
    email_student = results.get("email_student_on_pass", False)
    email_coordinator = results.get("email_coordinator_on_pass", False)
    if not email_student and not email_coordinator:
        return

    # Only send for live exams
    status_row = db.execute(
        select(QuestionBankOrgStatus).where(
            QuestionBankOrgStatus.organisation_id
            == assessment.organisation_id,
            QuestionBankOrgStatus.question_bank_id
            == assessment.question_bank_id,
        )
    ).scalar_one_or_none()
    if not status_row or not status_row.is_live:
        return

    bank_id = assessment.question_bank_id

    # Build context for template rendering
    summary_parts: list[str] = []
    for c in criteria_results:
        pct = round(c.get("value", 0) * 100)
        summary_parts.append(f"{c.get('name', '')}: {pct}%")
    score_summary = ", ".join(summary_parts) if summary_parts else "Pass"

    completion_date = ""
    if assessment.completed_at:
        completion_date = assessment.completed_at.strftime("%-d %B %Y")

    # Look up org settings for institution name
    org_settings = db.execute(
        select(TeachingOrgSettings).where(
            TeachingOrgSettings.organisation_id == assessment.organisation_id
        )
    ).scalar_one_or_none()

    display_name = user.full_name or user.username
    context: dict[str, str] = {
        "exam_title": config_row.title,
        "student_name": (
            f"{display_name} ({user.username})"
            if user.full_name
            else user.username
        ),
        "completion_date": completion_date,
        "score_summary": score_summary,
        "institution_name": (
            org_settings.institution_name if org_settings else ""
        ),
        "recipient_name": "",
    }

    # Generate certificate PDF for attachment (local path or GCS)
    attachments: list[EmailAttachment] = []
    bg: Path | None = None
    tmp_bg: Path | None = None
    bank_path_str = app_settings.TEACHING_QUESTION_BANK_PATH
    if bank_path_str:
        from app.features.teaching.storage import resolve_local_bank

        bank_dir = resolve_local_bank(bank_path_str, bank_id)
        if bank_dir:
            cert_file = bank_dir / "certificate-blank.png"
            if cert_file.is_file():
                bg = cert_file

    if not bg and app_settings.TEACHING_GCS_BUCKET:
        tmp_bg = download_certificate_background_from_gcs(
            app_settings.TEACHING_GCS_BUCKET, bank_id
        )
        bg = tmp_bg

    if bg:
        pass_text = (
            "Pass\n" + "\n".join(score_summary.split(", "))
            if score_summary
            else "Pass"
        )
        pdf_bytes = generate_certificate_pdf(
            background_path=bg,
            exam_title=config_row.title,
            candidate_name=user.full_name or user.username,
            pass_summary=pass_text,
            completion_date=completion_date,
            exam_ref=exam_ref,
        )
        if pdf_bytes:
            attachments.append(
                EmailAttachment(
                    filename=f"certificate-{bank_id}.pdf",
                    content=pdf_bytes,
                )
            )

    # Clean up temp file downloaded from GCS
    if tmp_bg:
        tmp_bg.unlink(missing_ok=True)

    # Student email
    if email_student:
        student_template = extract_email_template(config, "student_email")
        if student_template and user.email:
            ctx = {**context, "recipient_name": display_name}
            rendered = render_email(student_template, ctx)
            att = attachments if student_template["attach_certificate"] else []
            background_tasks.add_task(
                send_email,
                to=user.email,
                subject=rendered["subject"],
                html_body=rendered["html_body"],
                attachments=att,
            )

    # Coordinator (clinical lead) email — look up from site staff
    if email_coordinator:
        coord_template = extract_email_template(config, "coordinator_email")
        if coord_template:
            from app.models import organisation_site, site_staff_member

            # Find clinical leads at sites linked to this org
            clinical_leads = (
                db.execute(
                    select(User)
                    .join(
                        site_staff_member,
                        site_staff_member.c.user_id == User.id,
                    )
                    .join(
                        organisation_site,
                        organisation_site.c.site_id
                        == site_staff_member.c.site_id,
                    )
                    .where(
                        organisation_site.c.organisation_id
                        == assessment.organisation_id,
                        site_staff_member.c.role == "clinical_lead",
                    )
                )
                .unique()
                .scalars()
                .all()
            )
            for lead in clinical_leads:
                if lead.email:
                    ctx = {
                        **context,
                        "recipient_name": (
                            lead.full_name or lead.email.split("@")[0]
                        ),
                    }
                    rendered = render_email(coord_template, ctx)
                    att = (
                        attachments
                        if coord_template["attach_certificate"]
                        else []
                    )
                    background_tasks.add_task(
                        send_email,
                        to=lead.email,
                        subject=rendered["subject"],
                        html_body=rendered["html_body"],
                        attachments=att,
                    )


@teaching_router.post(
    "/assessments/{assessment_id}/complete",
    response_model=CompletionResultOut,
)
def complete_assessment(
    assessment_id: int,
    background_tasks: BackgroundTasks,
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

    # Generate exam reference from prefix in config
    exam_ref_prefix = config.get("results", {}).get("exam_ref_prefix", "")
    if exam_ref_prefix:
        assessment.exam_ref = f"{exam_ref_prefix}{assessment.id}"

    db.commit()

    # --- Email certificate on pass ---
    if overall_passed:
        _maybe_enqueue_certificate_emails(
            background_tasks=background_tasks,
            assessment=assessment,
            config_row=config_row,
            user=user,
            db=db,
            criteria_results=criteria_results,
            exam_ref=assessment.exam_ref,
        )

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
        download_certificate_background_from_gcs,
        generate_certificate_pdf,
        parse_certificate_style,
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

    # Find background image (local path or GCS)
    bg: Path | None = None
    tmp_bg: Path | None = None
    bank_path_str = settings.TEACHING_QUESTION_BANK_PATH
    if bank_path_str:
        from app.features.teaching.storage import resolve_local_bank

        bank_dir = resolve_local_bank(
            bank_path_str, assessment.question_bank_id
        )
        if bank_dir:
            cert_file = bank_dir / "certificate-blank.png"
            if cert_file.is_file():
                bg = cert_file

    if not bg and settings.TEACHING_GCS_BUCKET:
        tmp_bg = download_certificate_background_from_gcs(
            settings.TEACHING_GCS_BUCKET,
            assessment.question_bank_id,
        )
        bg = tmp_bg

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
        "Pass\n" + "\n".join(summary_parts) if summary_parts else "Pass"
    )

    # Format date
    completion_date = assessment.completed_at.strftime("%-d %B %Y")

    # Candidate name
    candidate_name = user.full_name or user.username

    # Lazily generate exam_ref for assessments completed before the feature
    exam_ref = assessment.exam_ref
    if not exam_ref:
        prefix = config.get("results", {}).get("exam_ref_prefix", "")
        if prefix:
            exam_ref = f"{prefix}{assessment.id}"
            assessment.exam_ref = exam_ref
            db.commit()

    # Parse certificate style from config
    style = parse_certificate_style(config.get("certificate"))

    pdf_bytes = generate_certificate_pdf(
        background_path=bg,
        exam_title=config_row.title,
        candidate_name=candidate_name,
        pass_summary=pass_summary,
        completion_date=completion_date,
        style=style,
        exam_ref=exam_ref,
    )

    # Clean up temp file downloaded from GCS
    if tmp_bg:
        tmp_bg.unlink(missing_ok=True)

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
    from app.features.teaching.storage import resolve_local_bank

    if not bank_id or "/" in bank_id or ".." in bank_id:
        raise HTTPException(400, "Invalid bank_id")

    base = settings.TEACHING_QUESTION_BANK_PATH
    if not base:
        raise HTTPException(
            400,
            "TEACHING_QUESTION_BANK_PATH is not configured",
        )

    resolved = resolve_local_bank(base, bank_id)
    if not resolved:
        raise HTTPException(404, f"Question bank '{bank_id}' not found")
    return resolved


def _resolve_bank_path_or_gcs(bank_id: str) -> tuple[Path, bool]:
    """Resolve bank to filesystem path or download from GCS.

    Returns (path, is_temp) — caller must clean up when is_temp is True.
    """
    from app.config import settings
    from app.features.teaching.storage import resolve_local_bank

    if not bank_id or "/" in bank_id or ".." in bank_id:
        raise HTTPException(400, "Invalid bank_id")

    # Try local path first
    base = settings.TEACHING_QUESTION_BANK_PATH
    if base:
        resolved = resolve_local_bank(base, bank_id)
        if resolved:
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

        # Resolve module status for version guard
        status: str | None = None
        if is_temp:
            from app.config import settings

            bucket = settings.TEACHING_GCS_BUCKET
            if bucket:
                status = get_module_status_from_gcs(bucket, bank_id)

        validation, sync_record = sync_question_bank(
            bank_path,
            org_id,
            user.id,
            db,
            image_inventory=inventory,
            module_status=status,
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
# Admin endpoints — delegates
# ------------------------------------------------------------------


@teaching_router.get(
    "/admin/delegates",
    response_model=list[DelegateOut],
    dependencies=[_DEP_MANAGE],
)
def list_delegates(
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> list[DelegateOut]:
    """List all delegates with access to the caller's org(s).

    Returns all users who are members of the caller's organisations
    (either direct org staff or site staff), with their latest
    assessment result if they have one.
    """
    from app.models import (
        Site,
        organisation_site,
        organisation_staff_member,
        site_staff_member,
    )

    # Get all orgs the caller belongs to
    caller_org_ids = [
        row[0]
        for row in db.execute(
            select(organisation_staff_member.c.organisation_id).where(
                organisation_staff_member.c.user_id == user.id
            )
        ).all()
    ]
    if not caller_org_ids:
        return []

    # Get all members: org staff + site staff for linked sites
    org_member_ids = set(
        row[0]
        for row in db.execute(
            select(organisation_staff_member.c.user_id).where(
                organisation_staff_member.c.organisation_id.in_(
                    caller_org_ids
                ),
            )
        ).all()
    )

    site_member_ids = set(
        row[0]
        for row in db.execute(
            select(site_staff_member.c.user_id)
            .join(
                organisation_site,
                organisation_site.c.site_id == site_staff_member.c.site_id,
            )
            .where(
                organisation_site.c.organisation_id.in_(caller_org_ids),
            )
        ).all()
    )

    member_ids = org_member_ids | site_member_ids
    # Exclude the caller themselves
    member_ids.discard(user.id)

    if not member_ids:
        return []

    # Fetch user details — exclude admins/superadmins
    user_ids = list(member_ids)
    users_map: dict[int, User] = {
        u.id: u
        for u in db.execute(
            select(User).where(
                User.id.in_(user_ids),
                User.system_permissions.notin_(["admin", "superadmin"]),
            )
        )
        .unique()
        .scalars()
        .all()
    }

    # Narrow to only non-admin user IDs
    user_ids = list(users_map.keys())
    if not user_ids:
        return []

    # Get assessments for these users in caller's orgs
    assessments = (
        db.execute(
            select(Assessment)
            .where(
                Assessment.organisation_id.in_(caller_org_ids),
                Assessment.user_id.in_(user_ids),
            )
            .order_by(Assessment.started_at.desc())
        )
        .scalars()
        .all()
    )

    latest_by_user: dict[int, Assessment] = {}
    all_by_user: dict[int, list[Assessment]] = {}
    for a in assessments:
        all_by_user.setdefault(a.user_id, []).append(a)
        if a.user_id not in latest_by_user:
            latest_by_user[a.user_id] = a

    # Get site and clinical lead info for each delegate
    site_info: dict[int, tuple[str | None, str | None]] = {}
    for uid in user_ids:
        site_row = db.execute(
            select(Site.name)
            .join(
                site_staff_member,
                site_staff_member.c.site_id == Site.id,
            )
            .join(
                organisation_site,
                organisation_site.c.site_id == Site.id,
            )
            .where(
                site_staff_member.c.user_id == uid,
                site_staff_member.c.role == "trainee",
                organisation_site.c.organisation_id.in_(caller_org_ids),
            )
        ).first()

        site_name = site_row[0] if site_row else None

        # Find clinical lead at the same site
        lead_name: str | None = None
        if site_row:
            lead_row = db.execute(
                select(User.full_name, User.username)
                .join(
                    site_staff_member,
                    site_staff_member.c.user_id == User.id,
                )
                .join(
                    Site,
                    Site.id == site_staff_member.c.site_id,
                )
                .where(
                    Site.name == site_name,
                    site_staff_member.c.role == "clinical_lead",
                )
            ).first()
            if lead_row:
                lead_name = lead_row[0] or lead_row[1]

        site_info[uid] = (site_name, lead_name)

    # Build response
    delegates: list[DelegateOut] = []
    for uid in user_ids:
        u = users_map.get(uid)
        if not u:
            continue

        latest = latest_by_user.get(uid)

        # Determine assessment result
        result: str | None = None
        first_time_pass = False
        assessment_date = None

        if latest:
            if latest.is_passed is True:
                result = "pass"
            elif latest.is_passed is False:
                result = "fail"
            elif latest.completed_at is None:
                result = "incomplete"
            assessment_date = latest.completed_at

            # First time pass: passed on first attempt
            user_assessments = all_by_user.get(uid, [])
            completed_assessments = [
                a for a in user_assessments if a.completed_at is not None
            ]
            first_time_pass = (
                latest.is_passed is True and len(completed_assessments) == 1
            )

        s_name, cl_name = site_info.get(uid, (None, None))

        delegates.append(
            DelegateOut(
                id=uid,
                name=u.full_name or u.username,
                email=u.email,
                site_name=s_name,
                clinical_lead=cl_name,
                learning_completed=None,
                assessment_result=result,
                assessment_date=assessment_date,
                first_time_pass=first_time_pass,
            )
        )

    return delegates


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
    from app.features.teaching.tooling_validate import (
        run_tooling_validation,
    )

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
        from app.features.teaching.storage import discover_local_banks

        bank_ids = discover_local_banks(base_path)

    synced: list[QuestionBankSync] = []
    errors: list[dict[str, str]] = []

    for bank_id in bank_ids:
        bank_path: Path | None = None
        is_temp = False
        tooling_module_dir: Path | None = None
        tooling_is_temp = False
        try:
            # Run teaching-tooling CI validation (second layer of
            # defence — clinical safety requirement)
            if base_path and not bucket:
                from app.features.teaching.storage import (
                    resolve_module_dir,
                )

                tooling_module_dir = resolve_module_dir(base_path, bank_id)
            elif bucket:
                from app.features.teaching.storage import (
                    download_module_from_gcs,
                )

                tooling_module_dir = download_module_from_gcs(bucket, bank_id)
                tooling_is_temp = tooling_module_dir is not None

            if tooling_module_dir:
                tooling_errors = run_tooling_validation(tooling_module_dir)
                if tooling_errors:
                    msg = "; ".join(e["message"] for e in tooling_errors[:5])
                    errors.append({"bank_id": bank_id, "error": msg})
                    continue
            else:
                # No module directory found — block sync for safety
                errors.append(
                    {
                        "bank_id": bank_id,
                        "error": (
                            "module directory not found — "
                            "cannot run tooling validation"
                        ),
                    }
                )
                continue

            bank_path, is_temp = _resolve_bank_path_or_gcs(bank_id)
            inventory = _build_image_inventory(bank_id, is_temp)

            # Resolve module status for version guard
            status: str | None = None
            if is_temp and bucket:
                status = get_module_status_from_gcs(bucket, bank_id)

            _validation, sync_record = sync_question_bank(
                bank_path,
                org_id,
                user.id,
                db,
                image_inventory=inventory,
                module_status=status,
            )
            if sync_record:
                synced.append(sync_record)
        except Exception as exc:
            logger.exception("Failed to sync bank '%s'", bank_id)
            errors.append({"bank_id": bank_id, "error": str(exc)})
        finally:
            if is_temp and bank_path:
                shutil.rmtree(bank_path.parent, ignore_errors=True)
            if tooling_is_temp and tooling_module_dir:
                shutil.rmtree(tooling_module_dir.parent, ignore_errors=True)

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


@teaching_router.get(
    "/settings",
    response_model=TeachingOrgSettingsOut,
    dependencies=[_DEP_MANAGE],
)
def get_settings(
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> TeachingOrgSettings:
    """Return teaching settings for the educator's organisation."""
    org_id = _get_user_org_id(user, db)
    settings_row = db.execute(
        select(TeachingOrgSettings).where(
            TeachingOrgSettings.organisation_id == org_id
        )
    ).scalar_one_or_none()
    if not settings_row:
        raise HTTPException(404, "Teaching settings not found")
    return settings_row


# ------------------------------------------------------------------
# Admin — bank detail & status
# ------------------------------------------------------------------


@teaching_router.get(
    "/admin/banks/{bank_id}",
    response_model=AdminBankDetailOut,
    dependencies=[_DEP_MANAGE],
)
def get_admin_bank_detail(
    bank_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> AdminBankDetailOut:
    """Return detailed admin view of a single question bank."""
    org_id = _get_user_org_id(user, db)

    # Get bank config from DB
    config_row = (
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
    if not config_row:
        raise HTTPException(404, "Question bank not found")

    # Item count
    item_count = (
        db.execute(
            select(QuestionBankItem.id).where(
                QuestionBankItem.organisation_id == org_id,
                QuestionBankItem.question_bank_id == bank_id,
            )
        )
        .scalars()
        .all()
    )

    config = config_row.config_yaml
    results = config.get("results", {})
    email_student_on_pass: bool = results.get("email_student_on_pass", False)
    email_coordinator_on_pass: bool = results.get(
        "email_coordinator_on_pass", False
    )

    # Load email templates if either email flag is enabled
    coordinator_template: EmailTemplateOut | None = None
    student_template: EmailTemplateOut | None = None

    if email_student_on_pass or email_coordinator_on_pass:
        from app.features.teaching.email_templates import (
            extract_email_template,
        )

        ct = extract_email_template(config, "coordinator_email")
        if ct:
            coordinator_template = EmailTemplateOut(
                subject=ct["subject"],
                body=ct["body"],
                attach_certificate=ct.get("attach_certificate", True),
            )
        st = extract_email_template(config, "student_email")
        if st:
            student_template = EmailTemplateOut(
                subject=st["subject"],
                body=st["body"],
                attach_certificate=st.get("attach_certificate", True),
            )

    return AdminBankDetailOut(
        bank_id=bank_id,
        title=config_row.title,
        version=config_row.version,
        type=config_row.type,
        item_count=len(item_count),
        email_student_on_pass=email_student_on_pass,
        email_coordinator_on_pass=email_coordinator_on_pass,
        coordinator_email_template=coordinator_template,
        student_email_template=student_template,
    )


@teaching_router.get(
    "/admin/banks/{bank_id}/organisations",
    response_model=list[BankOrgRow],
    dependencies=[_DEP_MANAGE],
)
def list_bank_organisations(
    bank_id: str,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> list[BankOrgRow]:
    """List all organisations with teaching enabled and their status for this bank."""
    # Verify caller has a primary org (i.e. is an educator)
    _get_user_org_id(user, db)

    # All orgs that have the "teaching" feature enabled
    orgs = (
        db.execute(
            select(Organization)
            .join(
                OrganisationFeature,
                OrganisationFeature.organisation_id == Organization.id,
            )
            .where(OrganisationFeature.feature_key == "teaching")
            .order_by(Organization.name)
        )
        .scalars()
        .all()
    )

    org_ids = [o.id for o in orgs]

    # Get bank status rows for these orgs
    statuses = {
        row.organisation_id: row
        for row in db.execute(
            select(QuestionBankOrgStatus).where(
                QuestionBankOrgStatus.question_bank_id == bank_id,
                QuestionBankOrgStatus.organisation_id.in_(org_ids),
            )
        )
        .scalars()
        .all()
    }

    rows: list[BankOrgRow] = []
    for org in orgs:
        status = statuses.get(org.id)
        rows.append(
            BankOrgRow(
                organisation_id=org.id,
                organisation_name=org.name,
                is_live=status.is_live if status else False,
                site_registration=(
                    status.site_registration if status else False
                ),
            )
        )

    return rows


@teaching_router.put(
    "/admin/banks/{bank_id}/organisations/{org_id}/settings",
    response_model=QuestionBankOrgSettingsOut,
    dependencies=[_DEP_MANAGE],
)
def update_bank_org_settings(
    bank_id: str,
    org_id: int,
    body: QuestionBankOrgSettingsIn,
    user: User = _DEP_USER,
    db: Session = _DEP_SESSION,
) -> QuestionBankOrgSettingsOut:
    """Update settings (status) for a bank-org pair."""
    _get_user_org_id(user, db)

    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(404, "Organisation not found")

    # Verify bank exists
    caller_org_id = _get_user_org_id(user, db)
    config_row = (
        db.execute(
            select(QuestionBankConfig).where(
                QuestionBankConfig.organisation_id == caller_org_id,
                QuestionBankConfig.question_bank_id == bank_id,
            )
        )
        .scalars()
        .first()
    )
    if not config_row:
        raise HTTPException(404, "Question bank not found")

    # Upsert status row
    status_row = db.execute(
        select(QuestionBankOrgStatus).where(
            QuestionBankOrgStatus.organisation_id == org_id,
            QuestionBankOrgStatus.question_bank_id == bank_id,
        )
    ).scalar_one_or_none()

    if status_row:
        status_row.is_live = body.is_live
        status_row.site_registration = body.site_registration
    else:
        status_row = QuestionBankOrgStatus(
            organisation_id=org_id,
            question_bank_id=bank_id,
            is_live=body.is_live,
            site_registration=body.site_registration,
        )
        db.add(status_row)

    db.commit()
    db.refresh(status_row)
    return QuestionBankOrgSettingsOut(
        question_bank_id=bank_id,
        is_live=status_row.is_live,
        site_registration=status_row.site_registration,
    )
