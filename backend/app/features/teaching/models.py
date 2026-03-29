"""SQLAlchemy models for the teaching feature.

Tables:
- QuestionBankConfig — cached config pulled from GCS bucket
- QuestionBankItem — one item (question) in a question bank
- Assessment — one candidate attempt at a question bank
- AssessmentAnswer — one answer within an assessment
- TeachingOrgSettings — per-org coordinator email + institution
- QuestionBankSync — audit trail for sync operations
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models import Base

# ------------------------------------------------------------------
# QuestionBankConfig
# ------------------------------------------------------------------


class QuestionBankConfig(Base):
    """Cached question bank config pulled from GCS.

    Images stay in the bucket; only text/YAML data is persisted here.
    """

    __tablename__ = "question_bank_configs"
    __table_args__ = (
        UniqueConstraint(
            "organisation_id",
            "question_bank_id",
            "version",
            name="uq_qb_config_org_bank_ver",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organisation_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_bank_id: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    config_yaml: Mapped[dict] = mapped_column(JSON, nullable=False)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    synced_by: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )


# ------------------------------------------------------------------
# QuestionBankItem
# ------------------------------------------------------------------


class QuestionBankItem(Base):
    """One item (question) in a question bank."""

    __tablename__ = "question_bank_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organisation_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_bank_id: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )
    bank_version: Mapped[int] = mapped_column(Integer, nullable=False)
    images: Mapped[list[dict]] = mapped_column(
        JSON, nullable=False, default=list
    )
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    options: Mapped[list[dict] | None] = mapped_column(JSON, nullable=True)
    correct_option_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    metadata_json: Mapped[dict] = mapped_column(
        JSON, nullable=False, default=dict
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft"
    )
    created_by: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )


# ------------------------------------------------------------------
# Assessment
# ------------------------------------------------------------------


class Assessment(Base):
    """One candidate attempt at a question bank."""

    __tablename__ = "assessments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organisation_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_bank_id: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )
    bank_version: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    time_limit_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    total_items: Mapped[int] = mapped_column(Integer, nullable=False)
    score_breakdown: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    is_passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    answers: Mapped[list[AssessmentAnswer]] = relationship(
        back_populates="assessment",
        cascade="all, delete-orphan",
        order_by="AssessmentAnswer.display_order",
    )


# ------------------------------------------------------------------
# AssessmentAnswer
# ------------------------------------------------------------------


class AssessmentAnswer(Base):
    """One answer within an assessment."""

    __tablename__ = "assessment_answers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    assessment_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("assessments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("question_bank_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    display_order: Mapped[int] = mapped_column(Integer, nullable=False)
    selected_option: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    resolved_tags: Mapped[list[str] | None] = mapped_column(
        JSON, nullable=True
    )
    answered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    assessment: Mapped[Assessment] = relationship(
        back_populates="answers",
    )
    item: Mapped[QuestionBankItem] = relationship(lazy="joined")


# ------------------------------------------------------------------
# TeachingOrgSettings
# ------------------------------------------------------------------


class TeachingOrgSettings(Base):
    """Per-organisation teaching configuration."""

    __tablename__ = "teaching_org_settings"
    __table_args__ = (
        UniqueConstraint(
            "organisation_id",
            name="uq_teaching_org_settings_org",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organisation_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    coordinator_email: Mapped[str] = mapped_column(String(255), nullable=False)
    institution_name: Mapped[str] = mapped_column(String(500), nullable=False)


# ------------------------------------------------------------------
# QuestionBankOrgStatus
# ------------------------------------------------------------------


class QuestionBankOrgStatus(Base):
    """Per-bank-per-org live/closed status.

    Banks default to closed until an admin explicitly sets them live.
    When ``email_on_pass`` is enabled in the bank config, the
    coordinator email must be set before the bank can go live.
    """

    __tablename__ = "question_bank_org_status"
    __table_args__ = (
        UniqueConstraint(
            "organisation_id",
            "question_bank_id",
            name="uq_qb_org_status_org_bank",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organisation_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_bank_id: Mapped[str] = mapped_column(String(255), nullable=False)
    is_live: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )


# ------------------------------------------------------------------
# QuestionBankSync
# ------------------------------------------------------------------


class QuestionBankSync(Base):
    """Audit trail for sync operations."""

    __tablename__ = "question_bank_syncs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organisation_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_bank_id: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="in_progress"
    )
    items_created: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    items_updated: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    errors: Mapped[list[dict]] = mapped_column(
        JSON, nullable=False, default=list
    )
    warnings: Mapped[list[dict]] = mapped_column(
        JSON, nullable=False, default=list
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    triggered_by: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
