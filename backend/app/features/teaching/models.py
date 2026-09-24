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
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    event,
    false,
    select,
)
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Mapped, Mapper, mapped_column, relationship

from app.models import Base

#: A sync performed by a signed-in person, through the admin UI.
SYNC_ACTOR_USER = "user"

#: A sync performed by the content deploy pipeline, which has no user.
#: Recorded explicitly so a null ``synced_by`` reads as "the deploy bot"
#: rather than "we did not record it".
SYNC_ACTOR_DEPLOY_BOT = "deploy_bot"


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
            "org_unit_id",
            "question_bank_id",
            "version",
            name="uq_qb_config_place_bank_ver",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    #: Which org_unit this row belongs to. The only id it has.
    org_unit_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("org_unit.id", ondelete="CASCADE"),
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
    cover_image_filename: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    cover_image_focus: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )
    config_yaml: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    #: Who performed the sync. Null when it was not a person — see
    #: ``synced_by_actor``, which says so explicitly rather than leaving a
    #: null to be interpreted.
    synced_by: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    #: What performed the sync. Derived from ``synced_by`` so the two can
    #: never disagree: a null user means the deploy pipeline did it.
    synced_by_actor: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        server_default=SYNC_ACTOR_USER,
    )


# ------------------------------------------------------------------
# QuestionBankItem
# ------------------------------------------------------------------


class QuestionBankItem(Base):
    """One item (question) in a question bank."""

    __tablename__ = "question_bank_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    #: Which org_unit this row belongs to. The only id it has.
    org_unit_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("org_unit.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_bank_id: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )
    bank_version: Mapped[int] = mapped_column(Integer, nullable=False)
    images: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    options: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSON, nullable=True
    )
    correct_option_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    metadata_json: Mapped[dict[str, Any]] = mapped_column(
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
    #: Which org_unit this row belongs to. The only id it has.
    org_unit_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("org_unit.id", ondelete="CASCADE"),
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
    score_breakdown: Mapped[dict[str, Any] | None] = mapped_column(
        JSON, nullable=True
    )
    is_passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    exam_ref: Mapped[str | None] = mapped_column(
        String(100), nullable=True, unique=True, index=True
    )

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
    answered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    assessment: Mapped[Assessment] = relationship(
        back_populates="answers",
    )
    item: Mapped[QuestionBankItem] = relationship(lazy="joined")

    #: The tags of the option chosen, one row each: what scoring reads.
    #: Replaced a ``resolved_tags`` JSON column, which the database could
    #: not see into. See
    #: ``docs/docs/plans/2026-09-23-resolved-tags-plan.md``.
    tags: Mapped[list[AssessmentAnswerTag]] = relationship(
        back_populates="answer",
        lazy="selectin",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def set_tags(self, tags: list[str]) -> None:
        """Make this answer's tag rows exactly ``tags``.

        Rows for tags that stay are kept rather than deleted and written
        again, because the unit of work inserts before it deletes, and a
        fresh row for the same tag would collide with the old one on
        ``uq_assessment_answer_tag_answer_tag``.
        """
        wanted = set(tags)
        for row in list(self.tags):
            if row.tag not in wanted:
                self.tags.remove(row)
        held = {row.tag for row in self.tags}
        for tag in sorted(wanted - held):
            self.tags.append(AssessmentAnswerTag(tag=tag))


class AssessmentAnswerTag(Base):
    """One tag of the option a candidate chose, on one answer.

    A copy taken when they answer, not a join to the question bank. Within
    one bank version, sync rewrites items and options in place, so reading
    the chosen option's tags afterwards would re-score a finished attempt
    against today's options. The copy is what the attempt was scored on.

    While an assessment is in progress an answer can be changed, and its
    tags are replaced with the new option's. Once it is completed they are
    a record.
    """

    __tablename__ = "assessment_answer_tag"
    __table_args__ = (
        UniqueConstraint(
            "answer_id", "tag", name="uq_assessment_answer_tag_answer_tag"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    answer_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("assessment_answers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    #: Indexed for the questions this table exists to answer, across
    #: attempts: how often is a tag chosen, and how often is it right.
    tag: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    answer: Mapped[AssessmentAnswer] = relationship(back_populates="tags")


# ------------------------------------------------------------------
# TeachingOrgSettings
# ------------------------------------------------------------------


class TeachingOrgSettings(Base):
    """Per-organisation teaching configuration."""

    __tablename__ = "teaching_org_settings"
    __table_args__ = (
        UniqueConstraint(
            "org_unit_id",
            name="uq_teaching_org_settings_place",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    #: Which org_unit this row belongs to. The only id it has.
    org_unit_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("org_unit.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    coordinator_email: Mapped[str] = mapped_column(String(255), nullable=False)
    institution_name: Mapped[str] = mapped_column(String(500), nullable=False)


# ------------------------------------------------------------------
# QuestionBankOrgStatus
# ------------------------------------------------------------------


class QuestionBankOrgStatus(Base):
    """Per-bank-per-org live/closed status and active version.

    Banks default to closed until an admin explicitly sets them live.
    When ``email_coordinator_on_pass`` is enabled in the bank config, the
    coordinator email must be set before the bank can go live.

    ``active_version`` is the version this organisation's candidates
    receive.  Sync imports new versions but never moves it, so revising a
    live bank does not put the revision in front of candidates until a
    staff org admin advances the pointer — the same deliberate step a new
    bank already requires through ``is_live``.
    """

    __tablename__ = "question_bank_org_status"
    __table_args__ = (
        UniqueConstraint(
            "org_unit_id",
            "question_bank_id",
            name="uq_qb_org_status_place_bank",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    #: Which org_unit this row belongs to. The only id it has.
    org_unit_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("org_unit.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_bank_id: Mapped[str] = mapped_column(String(255), nullable=False)
    is_live: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    site_registration: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    coordinator_email: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    #: Version served to this organisation's candidates. Null means the
    #: bank has nothing promoted yet and serves nothing.
    active_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    #: Who last moved the pointer, and when. Promotion decides what a cohort
    #: sits, so it needs an answer to "who did this" that survives the person
    #: leaving — hence SET NULL rather than a cascade.
    active_version_set_by: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    active_version_set_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


# ------------------------------------------------------------------
# QuestionBankSync
# ------------------------------------------------------------------


class QuestionBankSync(Base):
    """Audit trail for sync operations."""

    __tablename__ = "question_bank_syncs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    #: Which org_unit this row belongs to. The only id it has.
    org_unit_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("org_unit.id", ondelete="CASCADE"),
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
    errors: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    warnings: Mapped[list[dict[str, Any]]] = mapped_column(
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


# ------------------------------------------------------------------
# ModuleMediaLink
# ------------------------------------------------------------------


class ModuleMediaLink(Base):
    """Links an MDX media reference to an uploaded file.

    ``<Video ref="lecture-01" />`` names *which* video belongs on a
    slide. It is a stable key, not a path and not the uploaded file's
    name — and this table is what turns one into the other.

    Keeping the two apart is what makes the rest work. A file can be
    uploaded before the MDX exists, or the MDX merged before the file
    arrives. Renaming the uploaded file, or changing the key in the
    repository, does not orphan a working video, because the link is
    stored rather than inferred from a string match. And aiming a slide
    at a different video already in the module is a dropdown, not
    another 900 MB over the wire.

    A filename match would have made the admin's job "produce a file
    with exactly this name", so a typo in the MDX could only be fixed by
    a pull request even with the correct file sitting in the bucket.

    **Per organisation**, which follows from media belonging to the
    module. Two organisations running near-identical modules each upload
    their own copy: storage is cheap, a shared authorisation boundary is
    not. It also keeps the cookie prefix ``{org_id}/{module_id}/``
    literally true, so the "one grant covers one module" property the
    video design rests on survives. The consequence is that "is this
    module complete" has no global answer, only a per-organisation one —
    the same shape ``QuestionBankOrgStatus`` established for liveness.
    """

    __tablename__ = "module_media_link"
    __table_args__ = (
        # One video per reference, per org_unit. Not per
        # ``organisation_id``: that column is the object's address in the
        # bucket, and the org_unit is what every query here reads.
        UniqueConstraint(
            "org_unit_id",
            "question_bank_id",
            "media_key",
            name="uq_module_media_link_place_bank_key",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    #: Where the object sits in the bucket, and nothing else.
    #:
    #: Media lives at ``{organisation_id}/{module}/{asset}``, and the
    #: signed cookie's prefix covers that path, so this number addresses
    #: a real file rather than filtering a table. It is the one column in
    #: this group that survives the organisations table: moving it means
    #: moving objects and reissuing cookies, which is storage work rather
    #: than a column switch.
    #:
    #: No foreign key, because there is no longer a table to point at.
    #: It is an address, and an address is not a reference — the number
    #: stays valid whether or not anything else still knows it. Which
    #: number an org_unit uses is ``org_unit.media_prefix_id``, read through
    #: ``app.organisations.media_prefix_of``.
    organisation_id: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        index=True,
    )
    #: Which org_unit this row belongs to, and what every query here uses.
    #:
    #: ``organisation_id`` above is an address, not an owner: every
    #: question this table is asked — is this module complete, whose
    #: upload is this — is answered by the org_unit.
    org_unit_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("org_unit.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_bank_id: Mapped[str] = mapped_column(String(255), nullable=False)
    #: The ``ref`` from the MDX tag. Unique per organisation and module:
    #: one video per reference.
    media_key: Mapped[str] = mapped_column(String(255), nullable=False)
    #: Generated server-side, and what the object is actually keyed by in
    #: the bucket. Never the uploaded filename: that makes collisions
    #: impossible, makes upload naming irrelevant, and stops a filename
    #: carrying a patient identifier from ever reaching a URL.
    asset_id: Mapped[str] = mapped_column(String(64), nullable=False)
    #: Kept so the uploader recognises their own file in the admin UI,
    #: and shown there rather than used to address anything.
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    #: Who uploaded it, and when. SET NULL rather than a cascade, so the
    #: fact an upload happened survives the person leaving.
    uploaded_by: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    #: When the transcode job finished and its outputs verified, or None
    #: where it has not run. Recorded here rather than discovered by
    #: listing the bucket: which renditions exist changes once in an
    #: asset's life, and asking GCS on every learner's read would put a
    #: network round trip on the hot path to detect it.
    #:
    #: Written by the backend when the job it invoked returns, so the
    #: transcode CLI stays database-free — see the trigger decision in
    #: the video plan.
    #:
    #: None also means "uploaded but not yet transcoded", the state the
    #: availability gate needs so a module is not served with a slide
    #: whose video has no renditions yet.
    transcoded_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    #: When each job was *invoked*, as distinct from when it finished.
    #:
    #: Without these, "started and not finished" is indistinguishable
    #: from "never started" — and the admin card said "No captions" for
    #: two days while the caption job was unconfigured and nothing was
    #: coming. Both readings fit the completion columns alone; only the
    #: moment of invocation separates them.
    #:
    #: They also give the card an elapsed time, which is what turns
    #: "transcribing" into "transcribing, started forty minutes ago" —
    #: the second of which a person can act on.
    #:
    #: Cleared alongside the completion state when a reference is
    #: re-linked, for the same reason: a previous asset's timings say
    #: nothing about this one.
    transcode_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    caption_started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    #: Which outputs the job actually produced. Separate booleans rather
    #: than inferred from ``transcoded_at``, because they genuinely
    #: differ: captions come from a second job that may not have run, and
    #: a 1080p rendition is skipped for a source smaller than that.
    #:
    #: The filenames themselves are deterministic — ``{asset_id}-720p.mp4``
    #: and so on — so these say whether to offer a file, never where it
    #: is.
    has_1080p: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=false()
    )
    has_poster: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=false()
    )
    has_captions: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=false()
    )
    #: When someone last saved the captions after reading them, or None
    #: where nobody has.
    #:
    #: Whisper mishears clinical terminology — "caecum" as "seek 'em",
    #: drug names mangled — and captions are a WCAG 2.1 AA requirement,
    #: so a learner relying on them is given the wrong word with nothing
    #: to signal it. Machine output is therefore a draft until a human
    #: has been over it, and this is what records that they have.
    #:
    #: Set by saving the captions rather than by a separate "mark as
    #: reviewed" action: someone who has edited the text has read it,
    #: and a button that only claims review is a box to tick without
    #: looking.
    captions_reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


def _fill_the_storage_address(
    _mapper: Mapper[Any], connection: Connection, target: ModuleMediaLink
) -> None:
    """Derive a media link's bucket prefix from the org_unit it belongs to.

    The one column of this group that outlives the organisations table
    is ``ModuleMediaLink.organisation_id``, because it is where the
    object sits rather than who owns it. A writer names the org_unit, as
    everything else here does, and the address follows from it.

    Read from the org_unit's own ``media_prefix_id``, falling back to its
    id, rather than from the organisations table: the objects already in
    the bucket sit under the organisation id the org_unit used to have, and
    that number is recorded on the org_unit so it survives the table.

    A listener rather than a line at each write for the same reason the
    pair of ids had one: the writers are not only the org_units the
    application creates these rows, and a row with the wrong prefix
    points at a file that is not there.
    """
    if target.organisation_id is not None or target.org_unit_id is None:
        return

    from app.models import OrgUnit

    row = connection.execute(
        select(OrgUnit.id, OrgUnit.media_prefix_id).where(
            OrgUnit.id == target.org_unit_id
        )
    ).first()
    if row is None:
        return
    own_id, recorded = row
    target.organisation_id = int(recorded if recorded is not None else own_id)


event.listen(ModuleMediaLink, "before_insert", _fill_the_storage_address)
event.listen(ModuleMediaLink, "before_update", _fill_the_storage_address)
