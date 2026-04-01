"""Pydantic schemas for the teaching feature API."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

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


class QuestionBankDetailOut(QuestionBankOut):
    """Full config detail (includes assessment params, options, etc.)."""

    config_yaml: dict[str, Any]


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
    """One question bank in the admin teaching overview."""

    bank_id: str
    title: str | None = None
    version: int | None = None
    type: str | None = None
    synced_at: datetime | None = None
    in_gcs: bool = False
    in_db: bool = False
    item_count: int = 0


class SyncAllResultOut(BaseModel):
    """Aggregated result of syncing all banks."""

    synced: list[SyncResultOut]
    errors: list[dict[str, str]]


# ------------------------------------------------------------------
# Teaching org settings
# ------------------------------------------------------------------


class TeachingOrgSettingsIn(BaseModel):
    """Update teaching settings for an organisation."""

    coordinator_email: str
    institution_name: str


class CoordinatorEmailIn(BaseModel):
    """Update coordinator email for an organisation."""

    coordinator_email: str


class TeachingOrgSettingsOut(BaseModel):
    """Teaching settings for an organisation."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    organisation_id: int
    coordinator_email: str
    institution_name: str


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
# Bank status (live / closed)
# ------------------------------------------------------------------


class QuestionBankOrgStatusIn(BaseModel):
    """Toggle live/closed status for a bank."""

    is_live: bool


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
    """Detailed admin view of a single question bank."""

    bank_id: str
    title: str | None = None
    version: int | None = None
    type: str | None = None
    item_count: int = 0
    email_student_on_pass: bool = False
    email_coordinator_on_pass: bool = False
    coordinator_email_template: EmailTemplateOut | None = None
    student_email_template: EmailTemplateOut | None = None


class BankOrgRow(BaseModel):
    """One organisation's status for a question bank."""

    organisation_id: int
    organisation_name: str
    is_live: bool = False
    coordinator_email: str | None = None
