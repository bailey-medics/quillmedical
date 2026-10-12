"""Teaching feature API router.

All routes gated by ``requires_feature("teaching")``.
Educator routes additionally require ``manage_teaching`` competency.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
)
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.cbac.positions import clinical_leads_of
from app.db import get_core_db
from app.deps import (
    DEP_CURRENT_USER,
    DEP_REQUIRE_CSRF,
    has_competency,
)
from app.features.gating import requires_feature
from app.features.teaching.access import (
    MODULES_COMPETENCY,
    RESULTS_COMPETENCY,
    banks_on_show_to,
    delegates_in_view,
    modules_open_to,
    modules_served_where_they_belong,
    newest_copies_held_by,
    organisations_open_for_modules,
    organisations_with_teaching_on,
)
from app.features.teaching.admin_banks import admin_bank_detail
from app.features.teaching.attempt_results import (
    certificate_background,
    certificate_due,
    certificate_pdf,
    give_exam_reference,
    question_results,
)
from app.features.teaching.attempts import (
    AttemptFinished,
    attempt_in_progress,
    attempt_of,
    bank_to_sit,
    begin_or_pick_up_attempt,
    change_answer,
    finish_attempt,
    finish_if_out_of_time,
    item_at_position,
    next_unanswered_item,
    pick_up_attempt,
    record_answer,
    unfinished_attempts,
)
from app.features.teaching.enrolment import enrolled_on_offer, is_enrolled
from app.features.teaching.listing import (
    admin_bank_rows,
    bank_organisation_rows,
    delegate_rows,
    learning_module_rows,
    question_bank_rows,
)
from app.features.teaching.manual_sync import (
    bank_named_in,
    check_bank,
    discard_download,
    sync_bank,
    sync_banks_by_hand,
)
from app.features.teaching.media_uploads import (
    delete_upload,
    link_upload,
    local_upload_file,
    local_upload_root,
    new_upload_target,
    save_captions,
    upload_held_by,
)
from app.features.teaching.models import (
    Assessment,
    AssessmentAnswer,
    ModuleMediaLink,
    QuestionBankConfig,
    QuestionBankItem,
    QuestionBankOrgStatus,
    QuestionBankSync,
    TeachingOrgSettings,
)
from app.features.teaching.module_content import (
    check_bank_id,
    check_video_may_be_granted,
    learning_content,
    question_bank_detail,
    video_prefix_to_grant,
)
from app.features.teaching.schemas import (
    AdminBankDetailOut,
    AdminBankOut,
    AnswerResultOut,
    AssessmentHistoryOut,
    AssessmentOut,
    AssessmentQuestionResultsOut,
    AssessmentWithFirstItem,
    BankOrgRow,
    CandidateItemOut,
    CaptionsIn,
    CaptionsOut,
    CompletionResultOut,
    CriterionResult,
    DelegateModuleOut,
    DelegateOut,
    EducatorResultOut,
    ItemImageOut,
    LearningContentOut,
    LearningModuleOut,
    MediaAssetOut,
    MediaLinkIn,
    MediaProgressOut,
    MediaReferenceOut,
    MediaUploadUrlIn,
    MediaUploadUrlOut,
    ModuleMediaOut,
    PromoteBankVersionIn,
    PromoteBankVersionOut,
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
    ValidationResultOut,
    VideoAccessOut,
)
from app.features.teaching.storage import (
    download_bank_from_gcs,
    get_storage_backend,
    list_bank_images_in_gcs,
)
from app.features.teaching.video_access import (
    sign_cookie,
)
from app.models import (
    User,
)
from app.organisations import (
    get_member_org_unit_ids,
)
from app.rate_limit import limiter

logger = logging.getLogger(__name__)

teaching_router = APIRouter(
    prefix="/teaching",
    tags=["teaching"],
    dependencies=[Depends(requires_feature("teaching"))],
)

_DEP_SESSION = Depends(get_core_db)


# The two doors a learner goes through. Every learner route carries one
# of them at its decorator, and `tests/teaching_learner_gates_test.py`
# fails if a route is added with neither.
#
# Results is the outer door: reaching teaching at all, and somebody's
# own past results and certificates. Modules is the inner one: entering
# a module to learn and be assessed. They are separate so the inner one
# can be taken away and leave a certificate reachable.
_DEP_RESULTS = Depends(has_competency(RESULTS_COMPETENCY))
_DEP_MODULES = Depends(has_competency(MODULES_COMPETENCY))


def _get_user_org_ids(user: User, db: Session) -> list[int]:
    """Return the organisations whose modules the user may take, or 403.

    Every learner route that serves a module asks this, and only they
    do. It used to be reach from any membership: belonging anywhere
    under a teaching organisation opened its modules. It is now reach
    from the org_units where the person holds a ``practising_competency``
    row for ``take_teaching_modules``, so a centre's people can have
    their way in withdrawn while the centre, its members and their
    results stay where they are. See ``app.features.teaching.access``.
    """
    place_ids = organisations_open_for_modules(db, user)

    if not place_ids:
        raise HTTPException(403, "User has no organisation")

    return place_ids


def _require_place_for_attempt(
    db: Session, user: User, assessment: Assessment
) -> None:
    """Refuse an attempt at a module the user may no longer enter.

    An attempt under way stops when the place it was started through is
    withdrawn, or the enrolment on its module ends. The same 404 as an
    attempt that is not theirs, so nothing is confirmed. Reading the
    finished result does not come through here: results ask for neither.
    """
    if assessment.org_unit_id not in organisations_open_for_modules(db, user):
        raise HTTPException(404, "Assessment not found")
    if not is_enrolled(
        db,
        user.id,
        org_unit_id=assessment.org_unit_id,
        question_bank_id=assessment.question_bank_id,
    ):
        raise HTTPException(404, "Assessment not found")


def _get_user_org_id(user: User, db: Session) -> int:
    """Return an organisation the user is a *member* of, or raise 403.

    **Membership, not reach**, and it is the only caller of the two that
    asks for the narrower answer. Every one of its eighteen call sites is
    an administrative route behind ``manage_teaching`` - syncing
    items, linking and deleting media, writing captions, changing bank
    settings. Reach is why a ward trainee *receives* the trust's content;
    it was never why they would edit it. While this delegated to
    :func:`_get_user_org_ids`, a teaching admin whose only membership was
    a linked site resolved to the trust and administered it.

    The plural helper keeps reach, deliberately: content visibility is
    the question it answers, and narrowing it would lock out exactly the
    people teaching exists for.

    **Which organisation it returns is still arbitrary**, and that is a
    separate, known bug rather than something this fixes. With two
    memberships it picks whichever comes back first - see
    ``promote_bank_version_at_org_unit``, which takes ``org_unit_id`` in the
    path for that reason, and the test named
    ``test_a_bank_held_only_by_your_second_organisation_is_found``.
    Narrowing to membership shrinks the set it chooses from without
    making the choice correct.
    """
    place_ids = get_member_org_unit_ids(db, user.id)

    if not place_ids:
        # Deliberately not "no organisation": somebody at a ward of the
        # trust has an org_unit, and saying otherwise would send them looking
        # for the wrong fix.
        raise HTTPException(403, "User is not a member of any organisation")

    return place_ids[0]


def resolve_visible_module(user: User, db: Session, module_id: str) -> int:
    """Return an org_unit id that makes ``module_id`` visible to ``user``.

    A module is visible when any of the user's organisations - reached
    directly or through a site - has a ``QuestionBankOrgStatus`` row for
    it that is live. The same permissive union the bank list uses: one
    live organisation is enough, and which one is returned does not
    matter to the caller, only that the user may see the module.

    Every refusal is a 404, never a 403. A 403 would confirm that a
    module exists while telling the caller they may not have it, which
    hands them the existence of another organisation's content. "Not
    yours", "not live" and "no such module" are deliberately
    indistinguishable from outside.

    This is the single gate for learning content *and* for video access.
    Both must consult it rather than growing their own copy of the
    query, because two copies drift and the looser one is the one nobody
    notices.
    """
    try:
        org_ids = _get_user_org_ids(user, db)
    except HTTPException:
        # A user in no organisation sees nothing, and learns nothing
        # about what exists. The 403 that helper raises is right for
        # admin routes; here it would leak.
        raise HTTPException(404, "Module not found") from None

    statuses = (
        db.execute(
            select(QuestionBankOrgStatus).where(
                QuestionBankOrgStatus.org_unit_id.in_(org_ids),
                enrolled_on_offer(user.id),
                QuestionBankOrgStatus.question_bank_id == module_id,
            )
        )
        .scalars()
        .all()
    )

    for status in statuses:
        # A null org_unit means a row written before the column existed and
        # not touched since; the migration backfilled every one, so this
        # is belt and braces rather than an expected state.
        if status.is_live and status.org_unit_id is not None:
            return int(status.org_unit_id)

    raise HTTPException(404, "Module not found")


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
    item_folder = item.metadata_json.get(
        "_source_dir", f"question_{answer.display_order}"
    )

    for idx, img in enumerate(item.images or []):
        key = img.get("key", "")
        label = image_label(img, idx, config)
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
    # Question banks (read - all teaching users)
    # ------------------------------------------------------------------


@teaching_router.get(
    "/question-banks",
    dependencies=[_DEP_RESULTS],
    response_model=list[QuestionBankOut],
)
def list_question_banks(
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> list[dict[str, Any]]:
    """List question bank configs visible to the user.

    A bank is visible if ANY of the user's organisations has a
    QuestionBankOrgStatus row for it. The actual QuestionBankConfig
    may be owned by a different (educator) organisation - we fetch
    configs by bank ID regardless of owning org.

    The page that lists modules is the one that lists results, so it is
    reached with the results competency alone. Which banks is
    ``banks_on_show_to``, which asks for the modules competency itself;
    what is said of each is ``question_bank_rows``.
    """
    return question_bank_rows(db, banks_on_show_to(db, user))


@teaching_router.get(
    "/question-banks/{bank_id}",
    dependencies=[_DEP_MODULES],
    response_model=QuestionBankDetailOut,
)
def get_question_bank(
    bank_id: str,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> dict[str, Any]:
    """Get full detail for a question bank config.

    The id is checked before the caller's organisations are, so a bad
    id is answered 400 whoever sends it. What is shown, and every 404,
    is ``question_bank_detail``.
    """
    check_bank_id(bank_id)

    org_ids = _get_user_org_ids(user, db)

    return question_bank_detail(
        db, user.id, organisation_ids=org_ids, bank_id=bank_id
    )

    # ------------------------------------------------------------------
    # Learning modules (read - all teaching users)
    # ------------------------------------------------------------------


@teaching_router.get(
    "/modules/{module_id}/learning",
    dependencies=[_DEP_MODULES],
    response_model=LearningContentOut,
)
def get_learning_content(
    module_id: str,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> dict[str, Any]:
    """Get parsed learning slides for a module.

    Gated on organisation membership *and* `take_teaching_modules`, the
    two questions this codebase keeps separate: membership says where a
    person is, the competency says what they may do there. The video
    route beside this one already required both; slides required only
    the first, which made the material cheaper to reach than the video
    of it.

    A user reads a module only if one
    of their organisations has it live. Until this gate existed, any
    authenticated user in a teaching-enabled organisation could read any
    module's slides by guessing its ID, including modules their
    organisation never licensed.
    """
    # Before any bucket or filesystem read, so an unauthorised caller
    # cannot infer a module's existence from an error or from timing.
    org_id = resolve_visible_module(user, db, module_id)

    return learning_content(db, organisation_id=org_id, module_id=module_id)


@teaching_router.get(
    "/modules",
    dependencies=[_DEP_MODULES],
    response_model=list[LearningModuleOut],
)
def list_learning_modules(
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> list[dict[str, Any]]:
    """List the modules with learning content that the user may see.

    Requires `take_teaching_modules`, like the content it points at. A
    listing looser than the material it links to is how the pair came to
    be half-closed before, so the two are gated alike.

    Filtered rather than gated on *membership*: an empty list is the
    correct answer for a user whose organisations have nothing live, not
    an error. Which modules is ``modules_open_to``; what is said of each
    is ``learning_module_rows``.
    """
    return learning_module_rows(db, modules_open_to(db, user))


@teaching_router.post(
    "/modules/{module_id}/video-access",
    dependencies=[_DEP_MODULES],
    response_model=VideoAccessOut,
)
@limiter.limit("10/minute")
def grant_video_access(
    request: Request,
    module_id: str,
    response: Response,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
    __: User = DEP_REQUIRE_CSRF,
) -> VideoAccessOut:
    """Mint a Cloud CDN cookie for one module's video.

    The access decision stays here, next to the feature gate and the
    competency check; the bytes are then served from the edge without
    the request reaching this application again. That is the whole
    shape of the design - see the video auth gate plan.

    The cookie is scoped to this module's prefix and nothing else, so a
    learner granted one module cannot reach another's video with it.

    Rate-limited because an unlimited endpoint that returns credentials
    is an oracle: it would let a caller enumerate which modules their
    organisation has live, one 404 at a time.
    """
    from app.config import settings

    # One helper, shared with the learning content routes, so the video
    # gate and the content gate cannot drift apart. Raises 404 for "not
    # yours", "not live" and "no such module" alike.
    org_id = resolve_visible_module(user, db, module_id)

    # The content gate hides an incomplete module, so minting a cookie
    # for one would grant access to material the learner cannot reach.
    # Refused the same way, for the same reason.
    check_video_may_be_granted(db, organisation_id=org_id, module_id=module_id)

    base_url = settings.TEACHING_VIDEO_BASE_URL
    key_name = settings.TEACHING_VIDEO_SIGNING_KEY_NAME
    key = settings.TEACHING_VIDEO_SIGNING_KEY

    expires_at = datetime.now(UTC) + timedelta(
        minutes=settings.TEACHING_VIDEO_COOKIE_TTL_MINUTES
    )

    if not (base_url and key_name and key):
        # Development: video is served off disk by a local route, with
        # no CDN, no signature and no cookie. "No cookie was set" is the
        # normal answer here rather than an error, so the frontend runs
        # the same code path in both environments.
        logger.info(
            "video access granted (local) user=%s org=%s module=%s",
            user.id,
            org_id,
            module_id,
        )
        return VideoAccessOut(
            base_url=f"/api/teaching/videos/{module_id}",
            expires_at=expires_at,
        )

    # One module at one organisation: the prefix is everything the
    # cookie signed below can reach.
    url_prefix = video_prefix_to_grant(
        db, organisation_id=org_id, module_id=module_id, base_url=base_url
    )

    cookie = sign_cookie(
        url_prefix,
        expires_at,
        key_name,
        key.get_secret_value(),
    )

    # The header is built by hand rather than with `set_cookie`, and
    # that is load-bearing. Starlette sets cookies through Python's
    # `SimpleCookie`, which wraps any value containing characters
    # outside its safe set in double quotes - and this value is full of
    # `:` and `=`:
    #
    #   Cloud-CDN-Cookie="URLPrefix=…:Signature=…"; Path=/videos/
    #
    # The browser stores the quotes and sends them back, so Cloud CDN
    # sees a policy beginning with `"` and refuses it. It presents as a
    # 403 with `signed_request_invalid_encoding` in the load balancer
    # log and a black player with a dead play button in the page, which
    # is indistinguishable from every other reason a video might not
    # load. Signing, key names and object keys were all checked before
    # the quotes were noticed.
    #
    # Scoped to the media path, so it is not sent on ordinary API or
    # page requests. Host-only - no Domain attribute - so it cannot
    # leak to a sibling subdomain.
    max_age = settings.TEACHING_VIDEO_COOKIE_TTL_MINUTES * 60
    response.raw_headers.append(
        (
            b"set-cookie",
            (
                f"Cloud-CDN-Cookie={cookie}; Max-Age={max_age}; "
                f"Path=/videos/; Secure; HttpOnly; SameSite=Lax"
            ).encode("latin-1"),
        )
    )

    # The grant, not the credential. Never the cookie value or the key,
    # and no filenames: this line goes to a log that is not PHI-safe.
    logger.info(
        "video access granted user=%s org=%s module=%s expires=%s",
        user.id,
        org_id,
        module_id,
        expires_at.isoformat(),
    )

    return VideoAccessOut(
        base_url=url_prefix.rstrip("/"), expires_at=expires_at
    )

    # ------------------------------------------------------------------
    # Assessments (candidate endpoints)
    # ------------------------------------------------------------------


@teaching_router.post(
    "/assessments",
    dependencies=[_DEP_MODULES, DEP_REQUIRE_CSRF],
    response_model=AssessmentWithFirstItem,
)
def start_assessment(
    body: StartAssessmentIn,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> dict[str, Any]:
    """Start an assessment for the current user, or hand back theirs.

    Which bank, and every refusal but one, is ``bank_to_sit``; the draw
    and the writes are ``begin_or_pick_up_attempt``. The refusal for
    too small a pool stays here, between the two, because its words
    carry two counts: how many items are published and how many the
    bank asks for.

    Before any of that, each unfinished attempt of theirs on the bank
    whose time has run out is finished.

    A learner has one attempt in progress on a bank, and sits it at
    the organisation they started it at. Where they have one already it
    is handed back as a new one would be, with its next unanswered
    question, and nothing is written. That holds for a learner who can
    sit the bank through two organisations: only the one the attempt
    was started at is asked, so they are never given a second attempt
    at the other.

    ``bank_to_sit`` still has its say first, about that one
    organisation: so a bank since closed to new attempts there, or a
    place there since lost, is refused here as it always was, whether
    or not an attempt on it is in progress, and that attempt is still
    read and answered by its id. The size of the pool is not asked of
    an attempt already drawn.
    """
    for unfinished in unfinished_attempts(
        db, user.id, bank_id=body.question_bank_id
    ):
        finish_and_tell_if_out_of_time(db, user, unfinished)

    org_ids = _get_user_org_ids(user, db)
    under_way = attempt_in_progress(db, user.id, bank_id=body.question_bank_id)

    # An attempt in progress is sat where it was started, and nowhere
    # else: only that organisation is asked whether the bank is open
    if under_way is not None:
        org_ids = [
            org_id for org_id in org_ids if org_id == under_way.org_unit_id
        ]

    bank = bank_to_sit(
        db,
        user.id,
        organisation_ids=org_ids,
        bank_id=body.question_bank_id,
    )

    if under_way is not None:
        attempt = pick_up_attempt(db, under_way)
    else:
        if len(bank.published_items) < bank.min_pool_size:
            raise HTTPException(
                409,
                f"Insufficient items: {len(bank.published_items)} "
                f"published, need {bank.min_pool_size}",
            )

        attempt = begin_or_pick_up_attempt(db, user.id, bank)

    # Build first item
    first_item = None

    if attempt.first:
        first_item = _build_candidate_item(
            attempt.first.answer,
            attempt.first.config.config_yaml,
            attempt.first.config.type,
        )

    return {
        "assessment": attempt.assessment,
        "first_item": first_item,
    }


@teaching_router.get(
    "/assessments/history",
    dependencies=[_DEP_RESULTS],
    response_model=list[AssessmentHistoryOut],
)
def assessment_history(
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> list[AssessmentHistoryOut]:
    """List the current user's past assessments.

    Each unfinished attempt of theirs whose time has run out is
    finished first, so one nobody came back to is listed with its
    result and not as still under way.
    """
    for unfinished in unfinished_attempts(db, user.id):
        finish_and_tell_if_out_of_time(db, user, unfinished)

    rows = db.execute(
        select(Assessment, QuestionBankConfig.title)
        .outerjoin(
            QuestionBankConfig,
            (
                QuestionBankConfig.question_bank_id
                == Assessment.question_bank_id
            )
            & (QuestionBankConfig.version == Assessment.bank_version)
            & (QuestionBankConfig.org_unit_id == Assessment.org_unit_id),
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
    dependencies=[_DEP_RESULTS],
    response_model=AssessmentOut,
)
def get_assessment(
    assessment_id: int,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> AssessmentOut:
    """Get assessment state.

    Carries the module's title and whether a pass earns a certificate,
    read from the version that was sat. The result page needs both, and
    would otherwise ask for the module, which is behind the modules
    competency: somebody keeping their results after losing their way
    into modules would see a result with no title and no certificate.

    An attempt whose time has run out is finished before it is read.
    """
    assessment = db.get(Assessment, assessment_id)

    if not assessment or assessment.user_id != user.id:
        raise HTTPException(404, "Assessment not found")

    finish_and_tell_if_out_of_time(db, user, assessment)

    config_row = (
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
    out = AssessmentOut.model_validate(assessment)

    if config_row is not None:
        results = (config_row.config_yaml or {}).get("results") or {}
        out.bank_title = config_row.title
        out.certificate_available = bool(
            assessment.is_passed and results.get("certificate_download")
        )

    return out


def image_label(
    image: dict[str, Any], index: int, config: dict[str, Any]
) -> str | None:
    """The caption for one image of an item, or ``None`` when it has none.

    A variable item carries its own label. A uniform item stores only the
    file name, so its label comes from the bank: the ``images`` entry with
    the same ``key``, or, in a bank written before that list existed, the
    ``image_labels`` entry at the same position.
    """
    own = image.get("label")

    if own:
        return str(own)

    key = image.get("key")
    declared = config.get("images")

    if key and isinstance(declared, list):
        for entry in declared:
            if isinstance(entry, dict) and entry.get("key") == key:
                label = entry.get("label")
                if label:
                    return str(label)

    legacy = config.get("image_labels")

    if isinstance(legacy, list) and 0 <= index < len(legacy):
        label = legacy[index]
        if label:
            return str(label)

    return None


@teaching_router.get(
    "/assessments/{assessment_id}/question-results",
    dependencies=[_DEP_RESULTS],
    response_model=AssessmentQuestionResultsOut,
)
def get_assessment_question_results(
    assessment_id: int,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> AssessmentQuestionResultsOut:
    """A finished attempt's answers, right and wrong, by question number.

    Only the candidate may see it, which is ``attempt_of``, and only
    once the attempt is complete, which is ``question_results`` with
    the rest. An attempt whose time has run out is finished first.
    """
    assessment = attempt_of(db, user.id, assessment_id)
    finish_and_tell_if_out_of_time(db, user, assessment)

    return question_results(db, assessment)


@teaching_router.get(
    "/assessments/{assessment_id}/current",
    dependencies=[_DEP_MODULES],
    response_model=CandidateItemOut | None,
)
def get_current_item(
    assessment_id: int,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> CandidateItemOut | None:
    """Get the next unanswered item (for resuming after disconnect).

    Whose attempt it is comes first, then whether they may still enter
    its module, then ``next_unanswered_item``. An attempt whose time
    has run out is finished as soon as it is known to be theirs, and
    is then refused as a finished one.
    """
    assessment = attempt_of(db, user.id, assessment_id)
    finish_and_tell_if_out_of_time(db, user, assessment)
    _require_place_for_attempt(db, user, assessment)

    item = next_unanswered_item(db, assessment)

    if item is None:
        return None

    return _build_candidate_item(
        item.answer, item.config.config_yaml, item.config.type
    )


@teaching_router.get(
    "/assessments/{assessment_id}/item/{display_order}",
    dependencies=[_DEP_MODULES],
    response_model=CandidateItemOut,
)
def get_item_by_order(
    assessment_id: int,
    display_order: int,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> CandidateItemOut:
    """Get a specific item by display order (for navigating back).

    Whose attempt it is comes first, then whether they may still enter
    its module, then ``item_at_position``. An attempt whose time has
    run out is finished as soon as it is known to be theirs, and is
    then refused as a finished one.
    """
    assessment = attempt_of(db, user.id, assessment_id)
    finish_and_tell_if_out_of_time(db, user, assessment)
    _require_place_for_attempt(db, user, assessment)

    item = item_at_position(db, assessment, display_order)

    return _build_candidate_item(
        item.answer, item.config.config_yaml, item.config.type
    )


@teaching_router.post(
    "/assessments/{assessment_id}/answer",
    dependencies=[_DEP_MODULES, DEP_REQUIRE_CSRF],
    response_model=AnswerResultOut,
)
def submit_answer(
    assessment_id: int,
    body: SubmitAnswerIn,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> dict[str, Any]:
    """Submit an answer, score it, and return the next item.

    Whose attempt it is comes first, then whether they may still enter
    its module, then ``record_answer``. Whether the answer was right is
    stored and never sent back. An attempt whose time has run out is
    finished as soon as it is known to be theirs, and the answer is
    then refused as out of time.
    """
    assessment = attempt_of(db, user.id, assessment_id)
    finish_and_tell_if_out_of_time(db, user, assessment)
    _require_place_for_attempt(db, user, assessment)

    recorded = record_answer(
        db, assessment, body.selected_option, body.answer_id
    )

    next_item = None
    all_answered = recorded.next_answer is None

    if recorded.next_answer:
        next_item = _build_candidate_item(
            recorded.next_answer,
            recorded.config.config_yaml,
            recorded.config.type,
        )

    return {
        "answered": True,
        "next_item": next_item,
        "all_answered": all_answered,
    }


@teaching_router.put(
    "/assessments/{assessment_id}/answer/{answer_id}",
    dependencies=[_DEP_MODULES, DEP_REQUIRE_CSRF],
    response_model=CandidateItemOut,
)
def update_answer(
    assessment_id: int,
    answer_id: int,
    body: SubmitAnswerIn,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> CandidateItemOut:
    """Update an already-answered item (before assessment completion).

    Whose attempt it is comes first, then whether they may still enter
    its module, then ``change_answer``. An attempt whose time has run
    out is finished as soon as it is known to be theirs, and the change
    is then refused as out of time.
    """
    assessment = attempt_of(db, user.id, assessment_id)
    finish_and_tell_if_out_of_time(db, user, assessment)
    _require_place_for_attempt(db, user, assessment)

    changed = change_answer(db, assessment, answer_id, body.selected_option)

    return _build_candidate_item(
        changed.answer, changed.config.config_yaml, changed.config.type
    )

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
        certificate_pass_summary,
        download_certificate_background_from_gcs,
        generate_certificate_pdf,
    )
    from app.features.teaching.email_templates import (
        email_partner,
        extract_email_template,
        in_branded_layout,
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
            QuestionBankOrgStatus.org_unit_id == assessment.org_unit_id,
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
            TeachingOrgSettings.org_unit_id == assessment.org_unit_id
        )
    ).scalar_one_or_none()

    display_name = user.full_name or user.username
    # Who these emails are sent for: the organisation's name, logo and
    # coordinator, shown in the partner strip and used as the reply-to.
    partner = email_partner(org_settings, config_row.title)
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
        pdf_bytes = generate_certificate_pdf(
            background_path=bg,
            exam_title=config_row.title,
            candidate_name=user.full_name or user.username,
            pass_summary=certificate_pass_summary(criteria_results),
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
                attachments=att,
                **in_branded_layout(
                    rendered,
                    reason=(
                        "You are receiving this because you sat an "
                        "assessment on Quill."
                    ),
                    partner=partner,
                ),
            )

            # Coordinator (clinical lead) email - look up from site staff
    if email_coordinator:
        coord_template = extract_email_template(config, "coordinator_email")
        if coord_template:
            from app.org_units.tree import descendant_ids

            # Whoever holds the clinical lead post at an org_unit beneath this
            # organisation. Read from the post rather than a role on a
            # staff row: a post can be vacant, and a vacancy must mean
            # nobody is emailed rather than the wrong person.
            #
            # An exact match on one org_unit, with no walk up the tree: a
            # ward does not inherit its hospital's lead, and implying it
            # did would email the wrong person without raising anything.
            org_org_unit_id = assessment.org_unit_id
            org_site_ids = (
                sorted(descendant_ids(db, [org_org_unit_id]))
                if org_org_unit_id is not None
                else []
            )
            lead_ids = set(clinical_leads_of(db, org_site_ids).values())
            clinical_leads = (
                list(
                    db.execute(select(User).where(User.id.in_(lead_ids)))
                    .unique()
                    .scalars()
                    .all()
                )
                if lead_ids
                else []
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
                        attachments=att,
                        **in_branded_layout(
                            rendered,
                            reason=(
                                "You are receiving this because you are a "
                                "clinical lead where this assessment was "
                                "sat."
                            ),
                            partner=partner,
                        ),
                    )


def finish_and_tell_if_out_of_time(
    db: Session, user: User, assessment: Assessment
) -> AttemptFinished | None:
    """Finish a learner's attempt if its time has run out, and say so.

    Every route that touches one attempt calls this as soon as it knows
    the attempt is the caller's own. Whether there is anything to do,
    and the marking, is ``finish_if_out_of_time``. What follows it here
    is what ``complete_assessment`` does after marking an attempt: the
    result is committed, and a pass is written to whoever the bank says
    to write to.

    The emails are sent before this returns, and not queued behind the
    response as ``complete_assessment`` queues them. Many of the routes
    go on to refuse the request, and anything queued behind a response
    is dropped when the route raises, so a learner who passed by the
    clock would never be sent their certificate.

    Only the call that finished the attempt writes to anybody. A second
    request for the same attempt, at the same moment or later, is given
    None by ``finish_if_out_of_time`` and does nothing here, so the
    emails go once for each attempt.

    Args:
        db: Core database session.
        user: The learner, whose own attempt it is.
        assessment: Their attempt.

    Returns:
        What the marking gave when this call finished the attempt, and
        None when there was nothing to do.
    """
    from app.email_send import (
        EmailNotAllowedError,
        EmailRateLimitError,
        EmailSendError,
    )

    finished = finish_if_out_of_time(db, assessment)

    if finished is None:
        return None

    # A checkpoint: the result is kept, and the lock on the attempt let
    # go, whatever the route goes on to answer. A route that refuses the
    # request rolls back everything it has not committed.
    db.commit()

    if not finished.overall_passed:
        return finished

    queued = BackgroundTasks()
    _maybe_enqueue_certificate_emails(
        background_tasks=queued,
        assessment=assessment,
        config_row=finished.config,
        user=user,
        db=db,
        criteria_results=finished.criteria_results,
        exam_ref=assessment.exam_ref,
    )

    for task in queued.tasks:
        try:
            task.func(*task.args, **task.kwargs)
        except (
            EmailNotAllowedError,
            EmailRateLimitError,
            EmailSendError,
        ) as exc:
            # The result stands and the request is still answered, as
            # when an email queued behind a response fails. The address
            # and the provider's words stay out of the log.
            logger.error(
                "Certificate email not sent for assessment %d: %s",
                assessment.id,
                type(exc).__name__,
            )

    return finished


@teaching_router.post(
    "/assessments/{assessment_id}/complete",
    dependencies=[_DEP_MODULES, DEP_REQUIRE_CSRF],
    response_model=CompletionResultOut,
)
def complete_assessment(
    assessment_id: int,
    background_tasks: BackgroundTasks,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> dict[str, Any]:
    """Finalise the assessment and compute aggregate scores.

    Whose attempt it is comes first, then whether they may still enter
    its module, then ``finish_attempt``, which marks it. The emails
    about a pass are queued from here, after the result is committed.

    An attempt whose time has run out is finished as soon as it is
    known to be theirs, as on every route, and its result is what is
    sent back: the learner asked for it to be finished and it has been.
    """
    assessment = attempt_of(db, user.id, assessment_id)
    finished = finish_and_tell_if_out_of_time(db, user, assessment)
    _require_place_for_attempt(db, user, assessment)

    if finished is None:
        finished = finish_attempt(db, assessment)

        # A checkpoint: the result is kept even if building the
        # certificate or queueing the emails below fails.
        db.commit()

        # --- Email certificate on pass ---
        if finished.overall_passed:
            _maybe_enqueue_certificate_emails(
                background_tasks=background_tasks,
                assessment=assessment,
                config_row=finished.config,
                user=user,
                db=db,
                criteria_results=finished.criteria_results,
                exam_ref=assessment.exam_ref,
            )

    return {
        "is_passed": finished.overall_passed,
        "criteria": [
            CriterionResult(
                name=c["name"],
                value=c["value"],
                threshold=c["threshold"],
                passed=c["passed"],
            )
            for c in finished.criteria_results
        ],
        "score_breakdown": finished.score_breakdown,
    }

    # ------------------------------------------------------------------
    # Certificate
    # ------------------------------------------------------------------


# api-schema-check: allow-opaque-permanent
@teaching_router.get(
    "/assessments/{assessment_id}/certificate",
    dependencies=[_DEP_RESULTS],
)
def download_certificate(
    assessment_id: int,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> Response:
    """Generate and return a PDF certificate for a passed assessment.

    Whose attempt it is comes first, then ``certificate_due``, which
    says whether it has a certificate, then the blank one it is printed
    on. The attempt is given its exam reference before the certificate
    is drawn, if it has none. An attempt whose time has run out is
    finished first, so one that passes by the clock has its certificate.
    """
    assessment = attempt_of(db, user.id, assessment_id)
    finish_and_tell_if_out_of_time(db, user, assessment)

    due = certificate_due(db, assessment)
    background = certificate_background(assessment.question_bank_id)

    if give_exam_reference(assessment, due.config):
        # A checkpoint: the reference is kept even if drawing the
        # certificate below fails.
        db.commit()

    pdf_bytes = certificate_pdf(assessment, due, background, candidate=user)

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


_DEP_MANAGE = Depends(has_competency("manage_teaching"))


@teaching_router.get(
    "/items",
    response_model=list[QuestionBankItemOut],
    dependencies=[_DEP_MANAGE],
)
def list_items(
    question_bank_id: str | None = None,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> list[QuestionBankItem]:
    """List items in the org's question bank (educator only)."""
    org_id = _get_user_org_id(user, db)
    stmt = select(QuestionBankItem).where(
        QuestionBankItem.org_unit_id == org_id
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

    Returns (path, is_temp) - caller must clean up when is_temp is True.
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
    dependencies=[_DEP_MANAGE, DEP_REQUIRE_CSRF],
)
def validate_items(
    body: dict[str, str],
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> ValidationResultOut:
    """Dry-run validation of a question bank (no import).

    The bank is looked for before the caller's membership is asked, so
    where both are wrong it is the bank that is reported. The check
    itself is ``check_bank``.
    """
    bank_id = bank_named_in(body)
    bank_path, is_temp = _resolve_bank_path_or_gcs(bank_id)

    try:
        org_id = _get_user_org_id(user, db)

        return check_bank(
            db,
            bank_path,
            org_unit_id=org_id,
            user_id=user.id,
            image_inventory=_build_image_inventory(bank_id, is_temp),
        )
    finally:
        discard_download(bank_path, is_temp)


@teaching_router.post(
    "/items/sync",
    response_model=SyncResultOut,
    dependencies=[_DEP_MANAGE, DEP_REQUIRE_CSRF],
)
def sync_items(
    body: dict[str, str],
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> SyncResultOut:
    """Trigger sync from filesystem/GCS to database.

    The bank is looked for before the caller's membership is asked, as
    in ``validate_items``. The sync itself is ``sync_bank``. Where
    there was nothing to do, the answer is the record of the sync that
    loaded what is being served, marked ``unchanged``.
    """
    bank_id = bank_named_in(body)
    bank_path, is_temp = _resolve_bank_path_or_gcs(bank_id)

    try:
        org_id = _get_user_org_id(user, db)
        outcome = sync_bank(
            db,
            bank_path,
            bank_id=bank_id,
            downloaded=is_temp,
            org_unit_id=org_id,
            user_id=user.id,
            image_inventory=_build_image_inventory(bank_id, is_temp),
        )
    finally:
        discard_download(bank_path, is_temp)

    answer = SyncResultOut.model_validate(outcome.record)
    answer.unchanged = outcome.unchanged

    return answer


@teaching_router.get(
    "/results",
    response_model=list[EducatorResultOut],
    dependencies=[_DEP_MANAGE],
)
def list_results(
    question_bank_id: str | None = None,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> list[Assessment]:
    """List all assessment results for the educator's org."""
    org_id = _get_user_org_id(user, db)
    stmt = select(Assessment).where(
        Assessment.org_unit_id == org_id,
        Assessment.completed_at.isnot(None),
    )

    if question_bank_id:
        stmt = stmt.where(Assessment.question_bank_id == question_bank_id)

    stmt = stmt.order_by(Assessment.completed_at.desc())

    return list(db.execute(stmt).scalars().all())


@teaching_router.post(
    "/admin/modules/{module_id}/media/upload-url",
    response_model=MediaUploadUrlOut,
    dependencies=[_DEP_MANAGE, DEP_REQUIRE_CSRF],
)
def create_media_upload_url(
    module_id: str,
    body: MediaUploadUrlIn,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> MediaUploadUrlOut:
    """Mint a resumable upload URL for one media file.

    The only org_unit the backend holds real GCS write credentials, and it
    writes to the source bucket alone. Releasing a video to a learner is
    an HMAC over a shared secret, so the processed bucket needs no
    credential here at all.

    The uploaded filename never reaches the object path - the asset id
    is generated here - so the filename needs no path validation. It is
    recorded as data and shown back to the admin so they recognise their
    own file.
    """
    from app.features.teaching.storage import (
        ALLOWED_MEDIA_TYPES,
        create_resumable_upload_url,
    )

    # Validate the request before consulting configuration. A caller
    # sending an unsupported type should hear that, not "the bucket is
    # missing" - the second tells them about our deployment and hides
    # the fault that is actually theirs.
    ext = Path(body.original_filename).suffix.lower()
    expected = ALLOWED_MEDIA_TYPES.get(ext)

    if expected is None:
        allowed = ", ".join(sorted(ALLOWED_MEDIA_TYPES))
        raise HTTPException(400, f"Unsupported file type (allowed: {allowed})")
        # Both are checked rather than either: a caller controls both, and
        # trusting one to vouch for the other is how an allow-list is walked
        # around.
    if body.content_type != expected:
        raise HTTPException(
            400, f"Content type does not match {ext} (expected {expected})"
        )

    org_id = _get_user_org_id(user, db)
    target = new_upload_target(db, org_id)
    asset_id = target.asset_id

    if target.bucket is None:
        # Development: no bucket, so the bytes come through this API to
        # the module's own learning/ directory instead. The frontend
        # PUTs to whatever URL it is handed, so pointing it at a local
        # route is the whole difference - nothing above this learns
        # which environment it is in.
        logger.info(
            "media upload url issued (local) user=%s org=%s module=%s "
            "asset=%s",
            user.id,
            org_id,
            module_id,
            asset_id,
        )
        return MediaUploadUrlOut(
            upload_url=(
                f"/api/teaching/admin/modules/{module_id}"
                f"/media/{asset_id}/content"
            ),
            asset_id=asset_id,
        )

    try:
        url = create_resumable_upload_url(
            target.bucket,
            target.storage_prefix_id,
            module_id,
            asset_id,
            body.content_type,
        )
    except ValueError:
        # An unsafe module_id reached the path builder. The path is what
        # the video cookie's prefix is scoped to, so refuse rather than
        # mint anything.
        raise HTTPException(404, "Module not found") from None

    logger.info(
        "media upload url issued user=%s org=%s module=%s asset=%s",
        user.id,
        org_id,
        module_id,
        asset_id,
    )

    return MediaUploadUrlOut(upload_url=url, asset_id=asset_id)


@teaching_router.get(
    "/admin/modules/{module_id}/media",
    response_model=ModuleMediaOut,
    dependencies=[_DEP_MANAGE],
)
def get_module_media(
    module_id: str,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> ModuleMediaOut:
    """What media this module references, and which of it is present.

    The admin card's data. Built on the shared inventory rather than a
    second query: the learner gate and the merge gate ask the same
    question, and three implementations would drift - with the most
    permissive one being the one nobody noticed.

    Scoped to the caller's organisation, because the links are. Two
    organisations running the same module hold separate uploads, so one
    trust's file must never make another's module look complete.
    """
    from app.features.teaching.media import (
        describe_progress,
        get_media_inventory,
        get_referenced_media_keys,
    )

    org_id = _get_user_org_id(user, db)
    keys = get_referenced_media_keys(module_id)
    inventory = get_media_inventory(db, org_id, module_id, keys)

    def _asset(link: ModuleMediaLink) -> MediaAssetOut:
        # Attached to every asset the card shows, through the one helper
        # that builds them, so no row can be rendered without the state
        # that says whether it is still being worked on.
        out = MediaAssetOut.model_validate(link)
        progress = describe_progress(link)
        out.progress = MediaProgressOut(
            stage=progress.stage,
            total_stages=progress.total_stages,
            label=progress.label,
            in_progress=progress.in_progress,
            stalled=progress.stalled,
            is_final=progress.is_final,
        )

        return out

    return ModuleMediaOut(
        module_id=module_id,
        references=[
            MediaReferenceOut(
                key=ref.key,
                asset=_asset(ref.link) if ref.link else None,
                awaiting_transcode=ref.is_awaiting_transcode,
            )
            for ref in inventory.references
        ],
        unattached=[_asset(link) for link in inventory.unattached],
        is_complete=inventory.is_complete,
        is_servable=inventory.is_servable,
    )


@teaching_router.post(
    "/admin/modules/{module_id}/media/{media_key}/link",
    response_model=MediaAssetOut,
    dependencies=[_DEP_MANAGE, DEP_REQUIRE_CSRF],
)
def link_module_media(
    module_id: str,
    media_key: str,
    body: MediaLinkIn,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> MediaAssetOut:
    """Attach an uploaded asset to an MDX reference.

    Called once the resumable upload has finished, because the backend
    never sees the bytes - this is what records that they arrived.

    Re-linking a key that already has an asset replaces the link rather
    than refusing it. One video per reference is the rule the unique
    constraint enforces, and pointing a slide at a different upload is a
    dropdown in the admin card, not a reason to make the admin detach
    first. The reference then starts clean: what the old upload's jobs
    recorded is cleared, the check of its captions included, and the
    old video's files are removed.
    """
    from app.features.teaching.storage import ALLOWED_MEDIA_TYPES

    # The same allow-list the upload URL was minted against. A caller
    # controls this body, so trusting it to describe what it uploaded
    # would let an unlisted type be recorded as a linked asset.
    if body.content_type not in ALLOWED_MEDIA_TYPES.values():
        allowed = ", ".join(sorted(set(ALLOWED_MEDIA_TYPES.values())))
        raise HTTPException(400, f"Unsupported type (allowed: {allowed})")

    org_id = _get_user_org_id(user, db)

    link = link_upload(
        db,
        user_id=user.id,
        org_unit_id=org_id,
        module_id=module_id,
        media_key=media_key,
        asset_id=body.asset_id,
        original_filename=body.original_filename,
        content_type=body.content_type,
        size_bytes=body.size_bytes,
    )

    return MediaAssetOut.model_validate(link)


# A 204 carries no body at all, so there is no schema for oasdiff to
# diff. Same shape as the analytics 204s, which carry this marker too.
# api-schema-check: allow-opaque-permanent
@teaching_router.delete(
    "/admin/modules/{module_id}/media/{media_key}/link",
    status_code=204,
    dependencies=[_DEP_MANAGE, DEP_REQUIRE_CSRF],
)
def unlink_module_media(
    module_id: str,
    media_key: str,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> Response:
    """Detach a reference from its asset, keeping the file.

    Detaching is not deleting. The upload stays in the bucket and
    reappears in the card as unattached, because a reference removed
    today may well return - and that is someone's 900 MB either way.
    Removing the file is a separate, destructive call.
    """
    org_id = _get_user_org_id(user, db)

    link = db.execute(
        select(ModuleMediaLink).where(
            ModuleMediaLink.org_unit_id == org_id,
            ModuleMediaLink.question_bank_id == module_id,
            ModuleMediaLink.media_key == media_key,
        )
    ).scalar_one_or_none()

    # Scoped to the caller's organisation, so another trust's link is
    # not found rather than refused: whether they have one is not this
    # caller's to learn.
    if link is None:
        raise HTTPException(404, "No linked media for this reference")

    db.delete(link)
    db.flush()
    logger.info(
        "media unlinked user=%s org=%s module=%s key=%s asset=%s",
        user.id,
        org_id,
        module_id,
        media_key,
        link.asset_id,
    )

    return Response(status_code=204)


@teaching_router.get(
    "/syncs",
    response_model=list[SyncHistoryOut],
    dependencies=[_DEP_MANAGE],
)
def list_syncs(
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> list[QuestionBankSync]:
    """List sync history for the educator's org."""
    org_id = _get_user_org_id(user, db)

    return list(
        db.execute(
            select(QuestionBankSync)
            .where(QuestionBankSync.org_unit_id == org_id)
            .order_by(QuestionBankSync.started_at.desc())
        )
        .scalars()
        .all()
    )

    # ------------------------------------------------------------------
    # Admin endpoints - delegates
    # ------------------------------------------------------------------


# Declared before `/admin/delegates` only to sit beside it: the two paths
# do not collide.
@teaching_router.get(
    "/admin/delegates/modules",
    response_model=list[DelegateModuleOut],
    dependencies=[_DEP_MANAGE],
)
def list_delegate_modules(
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> list[DelegateModuleOut]:
    """The modules with an assessment that the caller's organisations serve.

    What the all-delegates view narrows by. An organisation serves a module
    once it has a ``QuestionBankOrgStatus`` row with an active version,
    which is the rule the learner's own module list uses. A module that has
    only been synced is not listed: every organisation's sync may bring in
    modules it was never given. One closed to new attempts is still listed,
    since its results are still wanted.

    Each is named by the title of the version being served, and the list
    is in title order. The rule is ``modules_served_where_they_belong``.
    """
    return [
        DelegateModuleOut(bank_id=module.module_id, title=module.title)
        for module in modules_served_where_they_belong(db, user)
    ]


@teaching_router.get(
    "/admin/delegates",
    response_model=list[DelegateOut],
    dependencies=[_DEP_MANAGE],
)
def list_delegates(
    bank_id: str | None = Query(default=None, min_length=1, max_length=255),
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> list[DelegateOut]:
    """List all delegates with access to the caller's org(s).

    Returns all users who are members of the caller's organisations
    (either direct org staff or site staff), with their latest
    assessment result if they have one.

    ``bank_id`` narrows the results to one module's assessments. Without
    it every module's attempts are read together, so with two modules a
    delegate's latest attempt may be in either, and an attempt at one
    counts against a first-time pass in the other.

    With ``bank_id``, only somebody who has started that module's
    assessment is listed, whether or not they finished it, and that
    includes the caller if they have. Without it, every member but the
    caller is listed, a result or none.

    Who is listed is ``delegates_in_view``; what is said of each is
    ``delegate_rows``.
    """
    view = delegates_in_view(db, user, one_module=bank_id is not None)

    return delegate_rows(db, view, bank_id=bank_id)

    # ------------------------------------------------------------------
    # Admin endpoints - teaching modules overview
    # ------------------------------------------------------------------


@teaching_router.get(
    "/admin/banks",
    response_model=list[AdminBankOut],
    dependencies=[_DEP_MANAGE],
)
def list_admin_banks(
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> list[AdminBankOut]:
    """List all teaching modules (from DB + GCS).

    Which synced copies are the caller's to see is
    ``newest_copies_held_by``; what is said of each bank, and of the
    banks in the bucket, is ``admin_bank_rows``.
    """
    org_id = _get_user_org_id(user, db)

    return admin_bank_rows(db, org_id, newest_copies_held_by(db, org_id))


@teaching_router.post(
    "/admin/sync-all",
    response_model=SyncAllResultOut,
    dependencies=[_DEP_MANAGE, DEP_REQUIRE_CSRF],
)
def sync_all_banks(
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> dict[str, Any]:
    """Sync all question banks from GCS (or local filesystem).

    The loop is ``sync_banks_by_hand``. It is handed the two helpers
    that find a bank and list its images, which stay here because other
    routes use them.

    Answers 200 even where a bank failed, unlike the deploy pipeline's
    sync. The admin page reads the two lists to show what became of
    each bank, and on any other status it can only show every bank as
    failed.
    """
    org_id = _get_user_org_id(user, db)
    outcome = sync_banks_by_hand(
        db,
        org_unit_id=org_id,
        user_id=user.id,
        find_bank=_resolve_bank_path_or_gcs,
        list_images=_build_image_inventory,
    )

    return {"synced": outcome.synced, "errors": outcome.errors}


@teaching_router.put(
    "/settings",
    response_model=TeachingOrgSettingsOut,
    dependencies=[_DEP_MANAGE, DEP_REQUIRE_CSRF],
)
def update_settings(
    body: TeachingOrgSettingsIn,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> TeachingOrgSettings:
    """Update teaching settings for the educator's org."""
    org_id = _get_user_org_id(user, db)
    settings_row = db.execute(
        select(TeachingOrgSettings).where(
            TeachingOrgSettings.org_unit_id == org_id
        )
    ).scalar_one_or_none()

    if settings_row:
        settings_row.coordinator_email = body.coordinator_email
        settings_row.institution_name = body.institution_name
    else:
        settings_row = TeachingOrgSettings(
            org_unit_id=org_id,
            coordinator_email=body.coordinator_email,
            institution_name=body.institution_name,
        )
        db.add(settings_row)

    # Email branding changes only when the request sends it, so a client
    # that has not heard of these fields cannot clear them.
    if "email_short_name" in body.model_fields_set:
        settings_row.email_short_name = body.email_short_name
    if "email_logo" in body.model_fields_set:
        settings_row.email_logo = body.email_logo
        settings_row.email_logo_width = body.email_logo_width

    db.flush()
    db.refresh(settings_row)

    return settings_row


@teaching_router.get(
    "/settings",
    response_model=TeachingOrgSettingsOut,
    dependencies=[_DEP_MANAGE],
)
def get_settings(
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> TeachingOrgSettings:
    """Return teaching settings for the educator's organisation."""
    org_id = _get_user_org_id(user, db)
    settings_row = db.execute(
        select(TeachingOrgSettings).where(
            TeachingOrgSettings.org_unit_id == org_id
        )
    ).scalar_one_or_none()

    if not settings_row:
        raise HTTPException(404, "Teaching settings not found")

    return settings_row

    # ------------------------------------------------------------------
    # Admin - bank detail & status
    # ------------------------------------------------------------------


@teaching_router.get(
    "/admin/banks/{bank_id}",
    response_model=AdminBankDetailOut,
    dependencies=[_DEP_MANAGE],
)
def get_admin_bank_detail(
    bank_id: str,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> AdminBankDetailOut:
    """Return detailed admin view of a single question bank.

    The rules are ``admin_bank_detail``.
    """
    org_id = _get_user_org_id(user, db)

    return admin_bank_detail(db, org_id, bank_id)


@teaching_router.get(
    "/admin/banks/{bank_id}/organisations",
    response_model=list[BankOrgRow],
    dependencies=[_DEP_MANAGE],
)
def list_bank_organisations(
    bank_id: str,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> list[BankOrgRow]:
    """List all organisations with teaching enabled and their status for this bank.

    Organisations only. A site may have teaching switched on as well, but
    a bank is set live for an organisation and reaches its sites from
    there, so ``_update_bank_org_settings`` refuses anything else. A site
    listed here was a row whose settings could never be saved.

    Which organisations is ``organisations_with_teaching_on``, and it is
    every one of them, not only the caller's. What is said of each is
    ``bank_organisation_rows``.
    """
    # Verify caller has an organisation (i.e. is an educator)
    _get_user_org_id(user, db)

    return bank_organisation_rows(
        db, bank_id, organisations_with_teaching_on(db)
    )


def _promote_bank_version(
    bank_id: str,
    org_unit_id: int,
    body: PromoteBankVersionIn,
    user: User,
    db: Session,
) -> PromoteBankVersionOut:
    """Move which version of a bank an org_unit's candidates receive.

    The org_unit is the one the caller named, and they must be a member of
    it. Not inferred from the caller: ``_get_user_org_id`` returns
    whichever membership happens to come back first, so a person
    teaching for two would silently promote for the wrong one.

    Restricted to the caller's own organisations because nothing models which
    organisations one may promote on behalf of. That question belongs to
    docs/docs/plans/2026-09-06-org-scoped-access-findings.md.

    Rolling back is the same operation naming an earlier version.
    """
    # Membership, not reach. Reach is why a ward trainee receives the
    # trust's content; it is not why they would decide which version the
    # trust serves. `_get_user_org_ids` answers reach, so a teaching admin
    # whose only membership is a linked site passed this check and could
    # promote for the whole organisation above them.
    if org_unit_id not in get_member_org_unit_ids(db, user.id):
        raise HTTPException(
            403, "You cannot promote a version for that organisation"
        )

        # The version must exist for this organisation. Content is shared, but a
        # version another organisation has synced is not one this one can serve.
    target = (
        db.execute(
            select(QuestionBankConfig).where(
                QuestionBankConfig.org_unit_id == org_unit_id,
                QuestionBankConfig.question_bank_id == bank_id,
                QuestionBankConfig.version == body.version,
            )
        )
        .scalars()
        .first()
    )

    if not target:
        raise HTTPException(
            404, f"Version {body.version} not found for this question bank"
        )

    status_row = (
        db.execute(
            select(QuestionBankOrgStatus).where(
                QuestionBankOrgStatus.org_unit_id == org_unit_id,
                QuestionBankOrgStatus.question_bank_id == bank_id,
            )
        )
        .scalars()
        .first()
    )

    if not status_row:
        raise HTTPException(
            404, "This question bank is not set up for your organisation"
        )

    previous = status_row.active_version
    status_row.active_version = body.version
    status_row.active_version_set_by = user.id
    status_row.active_version_set_at = datetime.now(UTC)
    db.flush()

    logger.info(
        "Bank '%s' promoted from v%s to v%d at place %d by user %d",
        bank_id,
        previous,
        body.version,
        org_unit_id,
        user.id,
    )

    return PromoteBankVersionOut(
        question_bank_id=bank_id,
        active_version=body.version,
        previous_version=previous,
    )


@teaching_router.put(
    "/admin/banks/{bank_id}/org-units/{org_unit_id}/settings",
    response_model=QuestionBankOrgSettingsOut,
    dependencies=[_DEP_MANAGE, DEP_REQUIRE_CSRF],
)
def update_bank_org_unit_settings(
    bank_id: str,
    org_unit_id: int,
    body: QuestionBankOrgSettingsIn,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> QuestionBankOrgSettingsOut:
    """Set a bank live or closed for an org_unit.

    The only address for this now. The ``places`` spelling answered
    beside it for a release and has been retired.
    """
    return _update_bank_org_settings(bank_id, org_unit_id, body, user, db)


@teaching_router.put(
    "/admin/banks/{bank_id}/org-units/{org_unit_id}/active-version",
    response_model=PromoteBankVersionOut,
    dependencies=[_DEP_MANAGE, DEP_REQUIRE_CSRF],
)
def promote_bank_version_at_org_unit(
    bank_id: str,
    org_unit_id: int,
    body: PromoteBankVersionIn,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> PromoteBankVersionOut:
    """Move which version an org_unit's candidates receive.

    Served at two addresses while the older one is retired, as with the
    settings route beside it.
    """
    return _promote_bank_version(bank_id, org_unit_id, body, user, db)


def _update_bank_org_settings(
    bank_id: str,
    org_unit_id: int,
    body: QuestionBankOrgSettingsIn,
    user: User,
    db: Session,
) -> QuestionBankOrgSettingsOut:
    """Update settings (status) for a bank at an org_unit.

    The caller must be a member of the org_unit named. Without that, anyone
    holding ``manage_teaching`` could set a bank live or closed
    anywhere at all - and closing one mid-cohort locks its candidates
    out of an assessment they are part-way through.
    """
    # Membership, not reach - the docstring above already says *member*,
    # and reaching a trust from a ward is not belonging to it. Closing a
    # bank is the operation this protects: it locks candidates out of an
    # assessment they are part-way through.
    org_org_unit_ids = get_member_org_unit_ids(db, user.id)

    if org_unit_id not in org_org_unit_ids:
        raise HTTPException(
            403, "You cannot change settings for that organisation"
        )

    # The bank must be one the caller can see, which is not the same as one
    # the target organisation has already synced: setting a bank live for an
    # organisation that has never synced it is how a bank is first set up,
    # and the branch below handles that by leaving the pointer null.
    #
    # Across every organisation the caller belongs to, rather than
    # `_get_user_org_id`'s arbitrary first one - with two, that decided
    # whether the bank was found at all.
    config_row = (
        db.execute(
            select(QuestionBankConfig).where(
                QuestionBankConfig.org_unit_id.in_(org_org_unit_ids),
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
            QuestionBankOrgStatus.org_unit_id == org_unit_id,
            QuestionBankOrgStatus.question_bank_id == bank_id,
        )
    ).scalar_one_or_none()

    if status_row:
        # active_version is deliberately untouched. Switching a bank off and
        # on again must not promote a revision that arrived meanwhile - the
        # whole point of the pointer is that advancing it is a separate,
        # deliberate act.
        status_row.is_live = body.is_live
        status_row.site_registration = body.site_registration
    else:
        # A bank being set up for an organisation starts on the newest
        # version that organisation has. Nothing else writes this, so
        # leaving it null would mean candidates saw nothing once the
        # queries follow it.
        #
        # Deliberately not config_row.version: that row was looked up for
        # the caller's organisation to check the bank exists, and versions
        # are per organisation. Null when this one has nothing synced yet,
        # which is honest - there is no version to serve.
        active_version = db.execute(
            select(func.max(QuestionBankConfig.version)).where(
                QuestionBankConfig.org_unit_id == org_unit_id,
                QuestionBankConfig.question_bank_id == bank_id,
            )
        ).scalar_one_or_none()

        status_row = QuestionBankOrgStatus(
            org_unit_id=org_unit_id,
            question_bank_id=bank_id,
            is_live=body.is_live,
            site_registration=body.site_registration,
            active_version=active_version,
        )
        db.add(status_row)

    db.flush()
    db.refresh(status_row)

    return QuestionBankOrgSettingsOut(
        question_bank_id=bank_id,
        is_live=status_row.is_live,
        site_registration=status_row.site_registration,
    )


# A 204 carries no body at all, so there is no schema for oasdiff to
# diff. Same shape as the unlink 204 above.
# api-schema-check: allow-opaque-permanent
@teaching_router.put(
    "/admin/modules/{module_id}/media/{asset_id}/content",
    status_code=204,
    dependencies=[_DEP_MANAGE, DEP_REQUIRE_CSRF],
)
async def upload_media_content_locally(
    module_id: str,
    asset_id: str,
    request: Request,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> Response:
    """Receive an uploaded video and write it to disk. Development only.

    In the teaching environment the bytes never touch this application:
    the browser PUTs them straight to GCS on a resumable URL, which is
    why a lecture does not pass through Cloud Run twice. There is no
    bucket locally, so they come here instead and land in the module's
    own ``learning/`` directory, beside the ``content.mdx`` that names
    them.

    The frontend PUTs to whatever URL the upload-url endpoint handed
    it, so nothing above this knows which of the two happened - which
    is the point. A developer drives the real admin card, and the only
    difference is where the file ends up.

    Refuses outright where a bucket is configured. This route writes to
    a bind mount from an authenticated request body, which is
    acceptable on a developer's machine and is not a thing to have
    running anywhere a bucket exists.
    """
    from app.features.teaching.storage import ALLOWED_MEDIA_TYPES

    base_path = local_upload_root()

    content_type = request.headers.get("content-type", "")

    if content_type not in ALLOWED_MEDIA_TYPES.values():
        allowed = ", ".join(sorted(set(ALLOWED_MEDIA_TYPES.values())))
        raise HTTPException(400, f"Unsupported type (allowed: {allowed})")

    destination = local_upload_file(
        base_path, module_id, asset_id, content_type
    )

    # Streamed rather than read whole: a lecture is hundreds of
    # megabytes and holding one in memory to write it out again is a
    # needless way to run a developer's machine out of it.
    #
    # A dropped connection part-way leaves a truncated file that nothing
    # would ever clean up: the link call never runs, so no row points at
    # it and the admin never sees it. The bucket path has a lifecycle
    # rule for exactly this; on disk there is nothing but this except
    # clause. Removed rather than kept, because a half-written video is
    # not a partial success to resume - it is a file that would play as
    # a broken one if anything later picked it up by name.
    written = 0

    try:
        with destination.open("wb") as handle:
            async for chunk in request.stream():
                written += len(chunk)
                handle.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        logger.warning(
            "media upload interrupted, partial file removed "
            "user=%s module=%s asset=%s bytes=%s",
            user.id,
            module_id,
            asset_id,
            written,
        )
        raise

    logger.info(
        "media stored locally user=%s module=%s asset=%s bytes=%s",
        user.id,
        module_id,
        asset_id,
        written,
    )

    return Response(status_code=204)


# A 204 carries no body at all, so there is no schema for oasdiff to
# diff. Same shape as the unlink 204 above.
# api-schema-check: allow-opaque-permanent
@teaching_router.delete(
    "/admin/modules/{module_id}/media/{asset_id}",
    status_code=204,
    dependencies=[_DEP_MANAGE, DEP_REQUIRE_CSRF],
)
def delete_media_asset(
    module_id: str,
    asset_id: str,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> Response:
    """Remove an uploaded asset and its link. The destructive one.

    Deleting cannot leave a learner with a broken slide: an incomplete
    module is not served at all, so the reference simply reverts to
    missing and the module goes quiet until a replacement lands. That
    is what makes plain delete safe here, with no separate replace
    action.

    The row goes first and the files second: the upload, and the
    renditions, poster and captions made from it. If the store refuses
    the transaction rolls back, so the row stays, and the answer is 502
    "The video could not be deleted".
    """
    org_id = _get_user_org_id(user, db)

    delete_upload(
        db,
        user_id=user.id,
        org_unit_id=org_id,
        module_id=module_id,
        asset_id=asset_id,
    )

    return Response(status_code=204)


@teaching_router.get(
    "/admin/modules/{module_id}/media/{asset_id}/captions",
    response_model=CaptionsOut,
    dependencies=[_DEP_MANAGE],
)
def get_media_captions(
    module_id: str,
    asset_id: str,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> CaptionsOut:
    """The current WebVTT for one asset, for the admin editor.

    Whisper mishears clinical terminology, so what the caption job wrote
    is a draft. This is how an admin reads it - and, with the sibling
    below, how they fix it.

    A missing file is not an error: ``webvtt`` is None where the caption
    job has not run, which the editor shows as "no captions yet" rather
    than as an empty box the admin might save over nothing.
    """
    from app.config import settings
    from app.features.teaching.storage import read_caption_object

    org_id = _get_user_org_id(user, db)
    link = upload_held_by(db, org_id, module_id, asset_id)

    bucket = settings.TEACHING_VIDEOS_BUCKET

    if not bucket:
        # Development, where the caption job has never run and there is
        # no processed bucket to read. Reported as "none yet" rather
        # than a 503, so the card renders the same everywhere.
        return CaptionsOut(
            asset_id=asset_id,
            webvtt=None,
            reviewed_at=link.captions_reviewed_at,
        )

    return CaptionsOut(
        asset_id=asset_id,
        webvtt=read_caption_object(bucket, org_id, module_id, asset_id),
        reviewed_at=link.captions_reviewed_at,
    )


@teaching_router.put(
    "/admin/modules/{module_id}/media/{asset_id}/captions",
    response_model=CaptionsOut,
    dependencies=[_DEP_MANAGE, DEP_REQUIRE_CSRF],
)
def put_media_captions(
    module_id: str,
    asset_id: str,
    body: CaptionsIn,
    user: User = DEP_CURRENT_USER,
    db: Session = _DEP_SESSION,
) -> CaptionsOut:
    """Replace one asset's WebVTT with corrected text.

    Saving is what records the review. Someone who has edited the text
    has read it, whereas a separate "mark as reviewed" button is a box
    to tick without looking - so ``captions_reviewed_at`` is set here
    rather than by an action of its own.

    The body is checked to begin ``WEBVTT`` and nothing more. That
    catches the common mistake - a paste that lost its header, or the
    wrong file entirely - without pretending to validate a format this
    endpoint has no business parsing. A player given a malformed track
    shows no captions and says nothing about why, so the cheap check
    earns its org_unit.
    """
    org_id = _get_user_org_id(user, db)

    return save_captions(
        db,
        user_id=user.id,
        org_unit_id=org_id,
        module_id=module_id,
        asset_id=asset_id,
        webvtt=body.webvtt,
    )
