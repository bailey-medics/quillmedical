"""Pydantic schemas for the teaching feature API."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

# ------------------------------------------------------------------
# Question banks
# ------------------------------------------------------------------


class QuestionBankOut(BaseModel):
    """Summary of a question bank config (list endpoint)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    question_bank_id: str
    version: int
    title: str
    description: str
    type: str
    synced_at: datetime
    is_live: bool = False
    has_learning: bool = False
    cover_image_url: str | None = None
    cover_image_focus: str | None = None


class QuestionBankDetailOut(QuestionBankOut):
    """Full config detail (includes assessment params, options, etc.)."""

    config_yaml: dict[str, Any]


# ------------------------------------------------------------------
# Learning
# ------------------------------------------------------------------


class LearningSlideOut(BaseModel):
    """A single parsed slide from learning content."""

    slide_index: int
    layout: str
    title: str
    body: str | None = None
    callout_type: str | None = None
    callout_body: str | None = None
    youtube_id: str | None = None
    duration_seconds: int | None = None
    image_src: str | None = None
    image_alt: str | None = None
    image_caption: str | None = None
    image_position: str | None = None
    #: Resolved from the MDX ``ref`` at request time, never the raw key:
    #: the player composes a URL from the video-access ``base_url`` plus
    #: this filename, and should not have to resolve anything itself.
    #: Optional, so the API change is additive.
    #:
    #: The default rendition, and what plays without the learner
    #: touching anything — 720p where the transcode job has run, because
    #: hospital wifi is the common case. Falls back to the original
    #: upload where it has not.
    video_src: str | None = None
    #: The alternatives, each present only where the job recorded
    #: producing it. All optional and all additive: ``video_src`` keeps
    #: its meaning exactly, so a client that has never heard of these
    #: keeps working, per the expand-contract rule.
    #:
    #: Offered to the learner as a quality switch rather than chosen for
    #: them. Adaptive HLS is the eventual answer and stays deferred.
    video_src_1080p: str | None = None
    #: Poster frame, shown before playback begins.
    video_poster: str | None = None
    #: WebVTT captions. A WCAG 2.1 AA requirement for the learning
    #: centre, produced by the caption job rather than the transcode one,
    #: so this stays None until that job exists.
    video_captions: str | None = None


class LearningModuleOut(BaseModel):
    """Module metadata from module.yaml."""

    module_id: str
    title: str
    order: int
    status: str
    renewal_months: int | None = None
    has_learning: bool = False
    slide_count: int = 0
    description: str | None = None


class LearningContentOut(BaseModel):
    """Full learning content for a module."""

    module_id: str
    title: str
    slides: list[LearningSlideOut]


# ------------------------------------------------------------------
# Items
# ------------------------------------------------------------------


class QuestionBankItemOut(BaseModel):
    """One question bank item (educator list view)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    question_bank_id: str
    bank_version: int
    images: list[dict[str, Any]]
    text: str | None
    options: list[dict[str, Any]] | None
    correct_option_id: str | None
    metadata_json: dict[str, Any]
    status: str
    created_at: datetime


class ItemImageOut(BaseModel):
    """An image with its signed URL, for the candidate view."""

    key: str
    label: str | None = None
    url: str


class CandidateItemOut(BaseModel):
    """Item as presented to a candidate during an assessment.

    Does NOT include correct answer or metadata.
    """

    answer_id: int
    display_order: int
    question_type: str = "single"
    images: list[ItemImageOut]
    text: str | None = None
    options: list[dict[str, Any]]
    selected_option: str | None = None


# ------------------------------------------------------------------
# Assessments
# ------------------------------------------------------------------


class StartAssessmentIn(BaseModel):
    """Request body for starting a new assessment."""

    question_bank_id: str


class AssessmentOut(BaseModel):
    """Assessment summary (list / detail view)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    question_bank_id: str
    bank_version: int
    started_at: datetime
    completed_at: datetime | None
    time_limit_minutes: int
    total_items: int
    is_passed: bool | None
    exam_ref: str | None
    score_breakdown: dict[str, Any] | None


class AssessmentWithFirstItem(BaseModel):
    """Returned when starting an assessment — includes the first item."""

    assessment: AssessmentOut
    first_item: CandidateItemOut | None


# ------------------------------------------------------------------
# Answers
# ------------------------------------------------------------------


class SubmitAnswerIn(BaseModel):
    """Request body for submitting an answer."""

    selected_option: str


class AnswerResultOut(BaseModel):
    """Returned after submitting an answer.

    Includes the next item (or null if all answered).
    """

    answered: bool
    next_item: CandidateItemOut | None
    all_answered: bool


# ------------------------------------------------------------------
# Completion / results
# ------------------------------------------------------------------


class CriterionResult(BaseModel):
    """One pass-criterion result."""

    name: str
    value: float
    threshold: float
    passed: bool


class CompletionResultOut(BaseModel):
    """Returned after completing an assessment."""

    is_passed: bool
    criteria: list[CriterionResult]
    score_breakdown: dict[str, Any]


class AssessmentHistoryOut(BaseModel):
    """One historical assessment for the current user."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    question_bank_id: str
    bank_title: str
    bank_version: int
    started_at: datetime
    completed_at: datetime | None
    is_passed: bool | None
    exam_ref: str | None
    score_breakdown: dict[str, Any] | None
    total_items: int


# ------------------------------------------------------------------
# Sync / validation
# ------------------------------------------------------------------


class SyncTriggerIn(BaseModel):
    """Request body for triggering a sync."""

    question_bank_id: str


class ValidationMessageOut(BaseModel):
    """One validation error or warning."""

    path: str
    message: str


class ValidationResultOut(BaseModel):
    """Result of a validation dry-run or sync."""

    bank_id: str
    version: int
    is_valid: bool
    errors: list[ValidationMessageOut]
    warnings: list[ValidationMessageOut]
    item_count: int
    summary: str


class SyncResultOut(BaseModel):
    """Result after a sync operation."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    question_bank_id: str
    version: int
    status: str
    items_created: int
    items_updated: int
    errors: list[dict[str, Any]]
    warnings: list[dict[str, Any]]
    started_at: datetime
    completed_at: datetime | None


class SyncHistoryOut(BaseModel):
    """One sync record (list view)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    question_bank_id: str
    version: int
    status: str
    items_created: int
    items_updated: int
    started_at: datetime
    completed_at: datetime | None


# ------------------------------------------------------------------
# Admin — teaching modules overview
# ------------------------------------------------------------------


class AdminBankOut(BaseModel):
    """One question bank in the admin teaching overview.

    ``version`` is the newest imported; ``active_version`` is the one this
    organisation serves. They differ whenever a revision has arrived and
    nobody has promoted it, which is the state an admin needs to see.
    """

    bank_id: str
    title: str | None = None
    version: int | None = None
    active_version: int | None = None
    type: str | None = None
    synced_at: datetime | None = None
    in_gcs: bool = False
    in_db: bool = False
    item_count: int = 0


class SyncAllResultOut(BaseModel):
    """Aggregated result of syncing all banks."""

    synced: list[SyncResultOut]
    errors: list[dict[str, str]]


class CiSyncBankResult(BaseModel):
    """One bank successfully synced by the CI sync endpoint."""

    bank_id: str
    version: str


class CiSyncErrorItem(BaseModel):
    """One bank that failed to sync via the CI sync endpoint."""

    bank_id: str
    error: str


class CiTeachingSyncOut(BaseModel):
    """Result of the CI/CD teaching content sync trigger.

    Carried on a 200 when every bank synced and on a 422 when any was
    rejected, so a partial sync can still report both halves.

    Attributes:
        synced: Banks successfully synced.
        errors: Banks that failed to sync. Non-empty means the response
            status is 422.
        message: Set only when no banks were found to sync.
    """

    synced: list[CiSyncBankResult]
    errors: list[CiSyncErrorItem]
    message: str | None = None


# ------------------------------------------------------------------
# Teaching org settings
# ------------------------------------------------------------------


class TeachingOrgSettingsIn(BaseModel):
    """Update teaching settings for an organisation.

    The ``email_*`` fields are optional and left as they are when a request
    omits them, so a client that does not know about them cannot wipe
    branding somebody else set.
    """

    coordinator_email: str
    institution_name: str
    #: For the sender line, "EoEETA via Quill Medical". No quotes, angle
    #: brackets or line breaks: it becomes part of the From header.
    email_short_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=40,
        pattern=r'^[^"<>\r\n]+$',
    )
    #: A file name under frontend/public/email/partners/.
    email_logo: str | None = Field(
        default=None, max_length=100, pattern=r"^[a-z0-9][a-z0-9-]*\.png$"
    )
    #: The logo's width in pixels at 72px tall.
    email_logo_width: int | None = Field(default=None, ge=16, le=400)

    @model_validator(mode="after")
    def _logo_comes_with_its_width(self) -> TeachingOrgSettingsIn:
        """A logo without a width cannot be drawn safely in Outlook."""
        if (self.email_logo is None) != (self.email_logo_width is None):
            raise ValueError(
                "email_logo and email_logo_width are set together, or "
                "neither is"
            )
        return self


class CoordinatorEmailIn(BaseModel):
    """Update coordinator email for an organisation."""

    coordinator_email: str


class TeachingOrgSettingsOut(BaseModel):
    """Teaching settings for an organisation."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    #: The organisation, as an org_unit id.
    org_unit_id: int | None = None
    coordinator_email: str
    institution_name: str
    email_short_name: str | None = None
    email_logo: str | None = None
    email_logo_width: int | None = None


# ------------------------------------------------------------------
# Results (educator view)
# ------------------------------------------------------------------


class EducatorResultOut(BaseModel):
    """One assessment result for the educator reporting view."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    question_bank_id: str
    bank_version: int
    started_at: datetime
    completed_at: datetime | None
    is_passed: bool | None
    score_breakdown: dict[str, Any] | None
    total_items: int


# ------------------------------------------------------------------
# Delegates (admin view)
# ------------------------------------------------------------------


class DelegateOut(BaseModel):
    """One delegate row for the admin all-delegates view."""

    id: int
    name: str
    email: str | None
    site_name: str | None
    clinical_lead: str | None
    learning_completed: bool | None
    assessment_result: str | None
    assessment_date: datetime | None
    first_time_pass: bool


# ------------------------------------------------------------------
# Bank status (live / closed)
# ------------------------------------------------------------------


class QuestionBankOrgStatusIn(BaseModel):
    """Toggle live/closed status for a bank."""

    is_live: bool


class PromoteBankVersionIn(BaseModel):
    """Which version this organisation's candidates should receive."""

    version: int = Field(ge=1)


class PromoteBankVersionOut(BaseModel):
    """The pointer after promotion."""

    model_config = ConfigDict(from_attributes=True)

    question_bank_id: str
    active_version: int
    previous_version: int | None = None


class QuestionBankOrgSettingsIn(BaseModel):
    """Combined settings update for a bank-org pair."""

    is_live: bool
    site_registration: bool = False


class QuestionBankOrgSettingsOut(BaseModel):
    """Response for combined settings update."""

    model_config = ConfigDict(from_attributes=True)

    question_bank_id: str
    is_live: bool
    site_registration: bool = False


class QuestionBankOrgStatusOut(BaseModel):
    """Current live/closed status for a bank."""

    model_config = ConfigDict(from_attributes=True)

    question_bank_id: str
    is_live: bool


# ------------------------------------------------------------------
# Email templates (read-only preview)
# ------------------------------------------------------------------


class EmailTemplateOut(BaseModel):
    """Read-only preview of an email template YAML file."""

    subject: str
    body: str
    attach_certificate: bool = True


# ------------------------------------------------------------------
# Admin bank detail
# ------------------------------------------------------------------


class AdminBankDetailOut(BaseModel):
    """Detailed admin view of a single question bank.

    ``version`` is the newest imported; ``active_version`` is the one this
    organisation serves.
    """

    bank_id: str
    title: str | None = None
    version: int | None = None
    active_version: int | None = None
    type: str | None = None
    item_count: int = 0
    email_student_on_pass: bool = False
    email_coordinator_on_pass: bool = False
    coordinator_email_template: EmailTemplateOut | None = None
    student_email_template: EmailTemplateOut | None = None


class BankOrgRow(BaseModel):
    """One organisation's status for a question bank."""

    #: The organisation, as an org_unit id.
    org_unit_id: int | None = None
    organisation_name: str
    is_live: bool = False
    site_registration: bool = False


class VideoAccessOut(BaseModel):
    """A granted video session.

    The cookie itself is set as a header, not returned here: it is
    ``HttpOnly`` so that page script cannot read it, and so it never
    appears in the DOM, a copied link, a ``Referer`` header, or browser
    history. What comes back is only what the player needs to build
    asset URLs and to know when to ask again.
    """

    base_url: str
    expires_at: datetime


class MediaUploadUrlIn(BaseModel):
    """Ask for somewhere to upload one media file."""

    #: The MDX reference this upload is destined for.
    media_key: str
    #: What the admin called the file. Recorded as data and shown back to
    #: them, never used to address the object.
    original_filename: str
    content_type: str
    size_bytes: int


class MediaUploadUrlOut(BaseModel):
    """Where to upload, and what the file will be called once there."""

    upload_url: str
    #: Generated server-side. The client sends it back on completion so
    #: the link can be written against the object that now exists.
    asset_id: str


class MediaProgressOut(BaseModel):
    """How far an upload has got, in terms a person can act on.

    The card previously showed "No captions" throughout processing,
    which states absence where the truth was "not yet" — and sent
    someone re-uploading a video that was working. These fields exist to
    let it say which instead.

    ``stage`` and ``total_stages`` drive the bar; ``label`` is the line
    beneath it. ``stalled`` is the part that needs the start times: a job
    running far longer than it should looks identical to a finished one
    from the completion columns alone, and for two days a caption job
    that was never configured looked exactly like one in progress.
    """

    #: Stages finished, 1-based, for "X of N". Uploaded counts as one:
    #: the file is there, which is real progress and the only stage that
    #: is certain.
    stage: int
    total_stages: int
    #: What is happening now, or what is waiting. Written for a reader,
    #: not a developer: "Transcribing audio" rather than "caption job
    #: running".
    label: str
    #: Whether anything is expected to change without someone acting.
    #: False once the pipeline is done, and false when a job has been
    #: running long enough that it has probably failed.
    in_progress: bool
    #: Set when a started job has overrun what it plausibly needs. The
    #: card says so rather than showing a bar that will never move.
    stalled: bool = False
    #: Nothing further is expected, so the card drops the bar and keeps
    #: only the label. Defaulted false, so the change is additive and an
    #: older client simply keeps drawing the bar it drew before.
    is_final: bool = False


class MediaAssetOut(BaseModel):
    """One uploaded file, as the admin card shows it."""

    model_config = ConfigDict(from_attributes=True)

    #: What the object is keyed by in the bucket.
    asset_id: str
    #: Shown so the uploader recognises their own file. Never used to
    #: address the object.
    original_filename: str
    content_type: str
    size_bytes: int
    uploaded_at: datetime
    #: Whether the caption job produced a WebVTT track. Exposed so the
    #: admin card knows which rows can offer a caption editor at all.
    #: Optional, so the change is additive.
    has_captions: bool = False
    #: When someone last saved the captions after reading them, or None
    #: where nobody has. Whisper mishears clinical terminology, so
    #: machine output is a draft until a human has been over it — and a
    #: learner relying on captions cannot tell the difference.
    captions_reviewed_at: datetime | None = None
    #: How far through processing this upload is, and what is happening
    #: now. Derived server-side rather than in the card, so one org_unit
    #: decides what the states mean and the two cannot drift.
    progress: MediaProgressOut | None = None


class MediaReferenceOut(BaseModel):
    """One ``<Video ref>`` in the MDX, and what backs it."""

    #: The key as written in the content, e.g. ``lecture-01``.
    key: str
    #: The linked upload, or None when nothing has been uploaded yet.
    asset: MediaAssetOut | None = None
    #: Uploaded, but the transcode job has not recorded finishing.
    #: Distinct from having no asset at all, because the remedy differs:
    #: this needs waiting for, not uploading again. Optional, so the
    #: change is additive.
    awaiting_transcode: bool = False


class CaptionsOut(BaseModel):
    """One asset's WebVTT, as the admin editor loads it."""

    asset_id: str
    #: The whole file. None where the caption job has not run, which is
    #: a different thing from captions that exist and are empty.
    webvtt: str | None = None
    #: When someone last saved it after reading, or None where nobody
    #: has. Machine output is a draft until a human has been over it.
    reviewed_at: datetime | None = None


class CaptionsIn(BaseModel):
    """Corrected WebVTT, replacing what the caption job produced."""

    #: The whole file, not a patch. The editor hands back what it was
    #: given with the text fixed, so there is nothing to merge.
    webvtt: str


class TranscodeCompleteIn(BaseModel):
    """What the transcode job reports once its outputs verify.

    Filenames rather than flags, deliberately. The job knows what it
    uploaded; the backend holds the mapping from suffix to column
    (``RENDITION_FLAGS``), and keeping that mapping in one org_unit is what
    stops the two drifting apart. A job that learns column names is a
    job that has to be redeployed when a column is renamed.

    The three ids are the ones the job was invoked with, so the callback
    addresses the same link row the invocation came from.
    """

    org_id: int
    module_id: str
    asset_id: str
    #: Object keys written under ``{org_id}/{module_id}/``, as the job
    #: verified them. Names only — the prefix is reconstructed here, so a
    #: callback cannot name a path outside its own module.
    outputs: list[str]


class TranscodeCompleteOut(BaseModel):
    """Confirmation that completion was recorded."""

    recorded: bool
    #: Which rendition flags were set, so a job's logs say what the
    #: backend understood rather than only what was sent.
    flags: list[str]


class CaptionCompleteIn(BaseModel):
    """What the caption job reports once its track verifies.

    No output list, unlike the transcode report: this job writes exactly
    one file, at a name derived from the asset id. Naming it would add a
    value to validate and nothing to learn from it.
    """

    org_id: int
    module_id: str
    asset_id: str


class CaptionCompleteOut(BaseModel):
    """Confirmation that the caption track was recorded."""

    recorded: bool


class MediaLinkIn(BaseModel):
    """Attach an uploaded asset to an MDX reference.

    The file details come from the client because the backend never sees
    the bytes: the upload goes straight to GCS on a resumable URL, and
    this is the call that records what landed there. The asset id is the
    one minted by ``upload-url``, so it addresses an object this
    organisation was given somewhere to write.
    """

    asset_id: str
    #: Recorded as data and shown back to the uploader. Never used to
    #: address the object.
    original_filename: str
    content_type: str
    size_bytes: int


class ModuleMediaOut(BaseModel):
    """Everything the admin card renders for one module.

    Both halves matter. ``references`` drives the rows and the missing
    count; ``unattached`` is what a renamed or removed reference leaves
    behind, and without listing it those files are invisible bytes
    nobody can reach or remove.
    """

    module_id: str
    references: list[MediaReferenceOut]
    unattached: list[MediaAssetOut]
    #: Whether every reference has a file uploaded against it. The
    #: admin's measure: has everything the content references been
    #: asked for?
    is_complete: bool
    #: Whether a learner could actually play every reference. Stricter
    #: than ``is_complete``: a module whose uploads are all present but
    #: still transcoding is complete and not yet servable, and is hidden
    #: from learners until it is. Optional, so the change is additive.
    is_servable: bool = False
