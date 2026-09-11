"""SQLAlchemy ORM models for core database.

This module defines the database schema for user authentication, role-based
access control (RBAC), and messaging. All models use SQLAlchemy 2.0
declarative style with Mapped type hints for enhanced type safety.

The schema includes:
- User: User accounts with credentials and TOTP settings
- Role: Role definitions for RBAC
- user_role: Many-to-many association table linking users to roles
- PatientMetadata: Application-specific patient metadata (activation status, etc.)
- Conversation: Messaging thread about a patient
- ConversationParticipant: Who is in a conversation
- Message: SQL projection of FHIR Communication resources
"""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
    validates,
)

from app.cbac.base_professions import resolve_user_competencies
from app.cbac.competencies import validate_competency_ids


class Base(DeclarativeBase):
    """Base class for all database models."""

    pass


user_role = Table(
    "user_role",
    Base.metadata,
    Column("user_id", ForeignKey("users.id"), primary_key=True),
    Column("role_id", ForeignKey("roles.id"), primary_key=True),
)
"""Association table for many-to-many relationship between users and roles."""


class Role(Base):
    """Role definition for role-based access control.

    Attributes:
        id: Primary key.
        name: Unique role name (e.g., "Clinician", "Administrator").
        users: List of users assigned to this role.
    """

    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)

    # Many-to-many back-reference to users
    users: Mapped[list[User]] = relationship(
        secondary=user_role,
        back_populates="roles",
    )


class User(Base):
    """User account with authentication credentials and settings.

    Attributes:
        id: Primary key.
        username: Unique username for login (indexed).
        full_name: User's full display name (optional).
        email: Unique email address.
        password_hash: Argon2 password hash.
        totp_secret: Base32-encoded TOTP secret (optional for 2FA).
        is_totp_enabled: Whether two-factor authentication is enabled.
        is_active: Whether the account is active (for soft delete).
        roles: List of roles assigned to this user.
        base_profession: Base profession template (e.g., "consultant", "patient").
        additional_competencies: Extra competencies beyond base profession.
        removed_competencies: Competencies removed from base profession.
        professional_registrations: Professional registration details (GMC, NMC, etc.).
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(
        String(150), unique=True, index=True, nullable=False
    )
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # TOTP (optional) - base32 secret string
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    email_verified: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false"
    )

    # Token version — incremented on password change to invalidate sessions
    token_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    # FHIR patient ID link (for patient users)
    fhir_patient_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )

    # System Permissions: Administrative and system-level access control.
    #
    # Being replaced by ``platform_role`` below. This column holds one
    # field's worth of two unrelated ideas: ``admin`` and ``staff`` are
    # things a person is *somewhere*, now expressed as membership plus
    # competencies, while ``superadmin`` says they operate Quill itself,
    # which is true everywhere or nowhere. Kept until every caller has
    # moved — see docs/docs/plans/2026-09-09-platform-role-plan.md.
    system_permissions: Mapped[str] = mapped_column(
        String(20), nullable=False, default="single-user"
    )

    #: Whether this person operates Quill itself. One value and its
    #: absence, because that is the only question the old four-level
    #: column asked that was not about a place.
    #:
    #: Written alongside ``system_permissions`` while callers migrate;
    #: nothing reads it for authorisation yet.
    platform_role: Mapped[str] = mapped_column(
        String(20), nullable=False, default="member", server_default="member"
    )

    # CBAC: Competency-Based Access Control fields
    base_profession: Mapped[str] = mapped_column(
        String(100), nullable=False, default="patient"
    )
    additional_competencies: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=lambda: []
    )
    removed_competencies: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=lambda: []
    )
    professional_registrations: Mapped[dict[str, Any] | None] = mapped_column(
        JSON, nullable=True
    )

    roles: Mapped[list[Role]] = relationship(
        secondary=user_role,
        back_populates="users",
        lazy="joined",
    )

    def get_final_competencies(self) -> list[str]:
        """Compute final competencies for this user.

        Returns:
            List of competency IDs this user has.
        """
        return resolve_user_competencies(
            base_profession=self.base_profession,
            additional_competencies=self.additional_competencies,
            removed_competencies=self.removed_competencies,
        )


class PatientMetadata(Base):
    """Application-specific metadata for patients.

    This table stores metadata about patients that is specific to the Quill Medical
    application, separate from clinical data stored in FHIR. The patient_id field
    links to the FHIR Patient resource ID.

    Attributes:
        id: Primary key.
        patient_id: FHIR Patient resource ID (unique).
        is_active: Whether the patient is active in the system.
                   Deactivated patients are hidden from clinical views but
                   visible in admin pages.
    """

    __tablename__ = "patient_metadata"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    patient_id: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )


organisation_member = Table(
    "organisation_member",
    Base.metadata,
    Column(
        "organisation_id", ForeignKey("organisations.id"), primary_key=True
    ),
    Column("user_id", ForeignKey("users.id"), primary_key=True),
    # Least privilege: an insert that forgets to say gets the narrower
    # capacity, not the wider one. A row wrongly marked trainee loses access
    # and someone complains; a row wrongly marked staff keeps access nobody
    # notices, which is the failure that does not announce itself.
    Column("capacity", String(50), nullable=False, server_default="trainee"),
)
"""Association table: who is at an organisation, and in what capacity.

Named ``organisation_member`` rather than ``organisation_member``
because not everyone in it is staff. Registration put teaching delegates
here so that anything outside teaching could find them, and with only two
columns nothing could tell a student from a consultant — so the admin page
listed them together and the messaging self-join check had to fall back on
asking what platform level someone held.

Membership answers *where is this person*. What they may do there is a
practising competency, and who holds a post is a ``Position``.
"""


organisation_patient_member = Table(
    "organisation_patient_member",
    Base.metadata,
    Column(
        "organisation_id", ForeignKey("organisations.id"), primary_key=True
    ),
    Column("patient_id", String(255), primary_key=True),
)
"""Association table for many-to-many relationship between organisations and patients."""


class Organisation(Base):
    """Healthcare organisation (hospital, GP practice, clinic, department).

    Represents a named group of healthcare staff who share responsibility for a
    defined group of patients.

    Attributes:
        id: Primary key.
        name: Organisation name (e.g., "Great Eastern Hospital").
        type: Organisation type (hospital_team, gp_practice, private_clinic,
            department, teaching_establishment).
        location: Optional location/address information.
        created_at: Timestamp when organisation was created.
        updated_at: Timestamp when organisation was last updated.
        staff_members: List of users (staff) who belong to this organisation.
    """

    __tablename__ = "organisations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="hospital_team"
    )
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Many-to-many relationship to users (staff members)
    staff_members: Mapped[list[User]] = relationship(
        secondary=organisation_member,
        backref="organisations",
    )

    # One-to-many relationship to enabled features
    features: Mapped[list[OrganisationFeature]] = relationship(
        back_populates="organisation",
        cascade="all, delete-orphan",
    )


class OrganisationFeature(Base):
    """Feature flag for an organisation.

    Row existence = feature is enabled. Deleting the row disables the
    feature. No separate ``enabled`` boolean — avoids ambiguity between
    "row exists but disabled" and "row absent".

    Attributes:
        id: Primary key.
        organisation_id: FK to the owning organisation.
        feature_key: Feature identifier (e.g. "epr", "teaching").
        enabled_at: When the feature was enabled.
        enabled_by: FK to the user who enabled it.
    """

    __tablename__ = "organisation_features"
    __table_args__ = (
        UniqueConstraint(
            "organisation_id",
            "feature_key",
            name="uq_org_feature",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organisation_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("organisations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    feature_key: Mapped[str] = mapped_column(
        String(50), nullable=False, index=True
    )
    enabled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    enabled_by: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    organisation: Mapped[Organisation] = relationship(
        back_populates="features",
    )
    enabled_by_user: Mapped[User | None] = relationship(
        foreign_keys=[enabled_by],
        lazy="joined",
    )


message_organisation = Table(
    "message_organisation",
    Base.metadata,
    Column(
        "conversation_id",
        ForeignKey("conversations.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "organisation_id",
        ForeignKey("organisations.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)
"""Association table linking conversations to organisations."""


class ExternalPatientAccess(Base):
    """Per-patient access grant for external HCPs and patient advocates.

    Links an external user (external_hcp or patient_advocate) to a specific
    patient they have been granted access to. Access is granted via invite
    and can only be revoked by an admin.

    Attributes:
        id: Primary key.
        user_id: FK to the external user.
        patient_id: FHIR Patient resource ID.
        granted_by_user_id: FK to the user (patient or admin) who granted access.
        granted_at: When access was granted.
        revoked_at: When access was revoked (nullable; null = active).
        access_level: Access granularity (default "full").
    """

    __tablename__ = "external_patient_access"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "patient_id", name="uq_external_user_patient"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    patient_id: Mapped[str] = mapped_column(
        String(255), nullable=False, index=True
    )
    granted_by_user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    access_level: Mapped[str] = mapped_column(
        String(20), nullable=False, default="full"
    )

    user: Mapped[User] = relationship(foreign_keys=[user_id], lazy="joined")
    granted_by: Mapped[User] = relationship(
        foreign_keys=[granted_by_user_id], lazy="joined"
    )


class Conversation(Base):
    """Messaging thread about a patient.

    Each conversation belongs to exactly one patient (identified by FHIR
    patient UUID). Staff and patients are added as participants.
    Thread metadata (status, subject) lives here; message content is the
    source of truth in FHIR Communication resources and projected into
    the ``Message`` table for fast reads.

    Attributes:
        id: Primary key.
        fhir_conversation_id: UUID used in FHIR extensions to group
            Communication resources into a thread.
        patient_id: FHIR Patient resource UUID this thread is about.
        subject: Optional human-readable thread topic.
        status: Conversation lifecycle state.
        created_at: When the conversation was started.
        updated_at: When the last activity occurred.
        participants: Joined participants (via ConversationParticipant).
        messages: Messages in this thread (via Message).
    """

    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fhir_conversation_id: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    patient_id: Mapped[str] = mapped_column(
        String(255), index=True, nullable=False
    )
    subject: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="new"
    )
    include_patient_as_participant: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    participants: Mapped[list[ConversationParticipant]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
    )
    messages: Mapped[list[Message]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
    )
    organisations: Mapped[list[Organisation]] = relationship(
        secondary=message_organisation,
    )


class ConversationParticipant(Base):
    """Records a user's membership in a conversation.

    Attributes:
        id: Primary key.
        conversation_id: FK to conversation.
        user_id: FK to users table.
        role: How the user joined (initiator / participant / tagged).
        joined_at: When the user was added.
        last_read_at: Timestamp of the last time the user viewed the
            conversation — used to calculate unread counts.
    """

    __tablename__ = "conversation_participants"
    __table_args__ = (
        UniqueConstraint(
            "conversation_id", "user_id", name="uq_conv_participant"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(
        String(20), nullable=False, default="participant"
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    last_read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    conversation: Mapped[Conversation] = relationship(
        back_populates="participants"
    )
    user: Mapped[User] = relationship(lazy="joined")


class Message(Base):
    """SQL projection of a FHIR Communication resource.

    Each row mirrors a Communication stored in HAPI FHIR. The FHIR
    resource is the source of truth; this table provides fast SQL queries
    for threading, unread counts, and search.

    Messages are append-only: no editing or deletion.  Corrections are
    handled via the ``amends_id`` self-referential FK (amendment model).
    Redaction fields are placeholders for a future two-person sign-off
    workflow.

    Attributes:
        id: Primary key.
        fhir_communication_id: FHIR resource ID (unique).
        conversation_id: FK to conversations table.
        sender_id: FK to users table.
        body: Message text (markdown supported).
        amends_id: Self-FK to the message this one corrects (nullable).
        redacted_at: Future — when the message was redacted.
        redacted_by_id: Future — FK to user who performed redaction.
        created_at: Immutable creation timestamp.
    """

    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fhir_communication_id: Mapped[str] = mapped_column(
        String(255), unique=True, index=True, nullable=False
    )
    conversation_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("conversations.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    sender_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    body: Mapped[str] = mapped_column(String, nullable=False)
    amends_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("messages.id"), nullable=True
    )
    redacted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    redacted_by_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    conversation: Mapped[Conversation] = relationship(
        back_populates="messages"
    )
    sender: Mapped[User] = relationship(
        foreign_keys=[sender_id], lazy="joined"
    )
    amended_message: Mapped[Message | None] = relationship(
        remote_side="Message.id",
        foreign_keys=[amends_id],
    )


class PushSubscription(Base):
    """Web Push notification subscription.

    Stores browser push subscription details so notifications survive
    container restarts and deployments.

    Attributes:
        id: Primary key.
        user_id: FK to User who subscribed.
        endpoint: Push service endpoint URL (browser-specific).
        keys_p256dh: Public key for message encryption (Base64).
        keys_auth: Authentication secret for message encryption (Base64).
        created_at: When the subscription was registered.
    """

    __tablename__ = "push_subscriptions"
    __table_args__ = (
        UniqueConstraint("user_id", "endpoint", name="uq_push_user_endpoint"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    endpoint: Mapped[str] = mapped_column(String, nullable=False)
    keys_p256dh: Mapped[str] = mapped_column(String, nullable=False)
    keys_auth: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    user: Mapped[User] = relationship(foreign_keys=[user_id])


# ------------------------------------------------------------------
# Sites
# ------------------------------------------------------------------

organisation_site = Table(
    "organisation_site",
    Base.metadata,
    Column(
        "organisation_id",
        ForeignKey("organisations.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "site_id",
        ForeignKey("sites.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)
"""Association table: many-to-many between organisations and sites."""


# In what capacity someone is at a place, whether that place is an
# organisation or a site. Deliberately open-ended: more are expected —
# volunteer, contractor, honorary, visiting — so this is a string validated
# against a list in code rather than a database enum, which would need a
# migration to extend. A free string is not the alternative; that repeats the
# mistake competency ids made.
#
# **One list, not one per table.** An organisation and a site are different
# places, but a trainee is the same kind of member at either. Two lists would
# be two meanings of one word waiting to drift apart, which is exactly what
# `site_staff_member.role` did.
#
# **Not a ranking, and never a permission check.** A trainee on placement and
# a substantive staff member are different relationships to a place, not rungs
# of a ladder. What someone may *do* there is a practising competency; if a
# rule ever needs "contractors cannot do X", that belongs there, not here, or
# this column becomes the access-control-shaped field its predecessor was.
#: What a person is to Quill itself, as opposed to at a place.
#:
#: Two values, not a ladder. ``superadmin`` operates the platform;
#: ``member`` is everyone else, and says nothing about what they may do —
#: that is competencies, and where they may do it is membership. The
#: previous column ranked four values, which invited the reading that
#: ``superadmin`` subsumes clinical access. It does not.
PLATFORM_ROLES: tuple[str, ...] = ("member", "superadmin")


def validate_platform_role(value: str) -> str:
    """Return the platform role unchanged, or raise naming the known ones.

    Validated in code rather than as a database enum, so adding a value
    needs no migration — the same choice ``MEMBER_CAPACITIES`` made, and
    for the same reason.

    Args:
        value: The platform role to check.

    Returns:
        The same value.

    Raises:
        ValueError: If it is not a known platform role.
    """
    if value not in PLATFORM_ROLES:
        raise ValueError(
            f"Unknown platform role: {value}. Known roles are "
            + ", ".join(PLATFORM_ROLES)
            + "."
        )
    return value


MEMBER_CAPACITIES: tuple[str, ...] = ("staff", "trainee")

# Kept as the name the site code already uses.
SITE_CAPACITIES: tuple[str, ...] = MEMBER_CAPACITIES


def validate_member_capacity(value: str) -> str:
    """Return the capacity unchanged, or raise naming the known ones.

    Args:
        value: The capacity to check.

    Returns:
        The same value.

    Raises:
        ValueError: If it is not a known capacity.
    """
    if value not in MEMBER_CAPACITIES:
        raise ValueError(
            f"Unknown member capacity: {value}. Known capacities are "
            + ", ".join(MEMBER_CAPACITIES)
            + "."
        )
    return value


def validate_site_capacity(value: str) -> str:
    """Return the capacity unchanged, or raise. Kept for the site call sites."""
    return validate_member_capacity(value)


site_member = Table(
    "site_member",
    Base.metadata,
    Column(
        "site_id",
        ForeignKey("sites.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "user_id",
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("capacity", String(50), nullable=False),
)
"""Association table: who is at a site, and in what capacity.

Named ``site_member`` rather than ``site_staff_member`` because a third of
its rows were never staff: ``register``, the public self-registration route,
inserts teaching delegates, who are not employed by the site.

Membership answers *where is this person*. What they may do there is a
practising competency, and who holds a post is a ``Position`` — clinical
lead among them, which is why ``clinical_lead`` is no longer a capacity.
"""


class Site(Base):
    """Physical or virtual location within the healthcare system.

    Sites form a self-referential hierarchy (hospital > building > ward > room).
    They link to organisations via a many-to-many relationship and can serve
    both teaching (clinical lead governance) and clinical (EPR/trust) use cases.

    Attributes:
        id: Primary key.
        name: Site name (e.g. "Addenbrooke's Hospital").
        type: Site type (hospital, building, ward, room, clinic,
            department, virtual).
        parent_id: FK to parent site (nullable for top-level sites).
        location: Optional free-text address or description.
        created_at: Timestamp when site was created.
        updated_at: Timestamp when site was last updated.
    """

    __tablename__ = "sites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("sites.id", ondelete="SET NULL"), nullable=True
    )
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="true", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    parent: Mapped[Site | None] = relationship(
        remote_side="Site.id",
        foreign_keys=[parent_id],
    )
    organisations: Mapped[list[Organisation]] = relationship(
        secondary=organisation_site,
        backref="sites",
    )
    staff: Mapped[list[User]] = relationship(
        secondary=site_member,
        backref="sites",
    )


class PractisingCompetency(Base):
    """Whether a person may practise a competency at certain place.

    Named as the question it answers: can this person practise this
    competency here? Deliberately not a "grant" — the organisation does not
    confer the competency. That is held by the person, earned through
    training and sign-off. A row here only records that they are authorised
    to exercise it at this place.

    Healthcare draws the same line as credentialing versus privileging:
    verifying what someone is qualified for, then authorising specific work
    at a specific site. A person's *ceiling* stays on the user, resolved by
    ``get_final_competencies`` from base profession plus additions minus
    removals. This table is the second half.

    A row means authorised. There is no boolean: absence is the unauthorised
    state, so practice cannot be silently withdrawn without removing the row
    that says who authorised it.

    **Exactly one of organisation_id and site_id is set**, enforced by
    ``ck_practising_competency_one_place``. A shared "places" table was
    considered and rejected: it would need a row for every organisation and
    site forever, and a missed one makes that place invisible to the whole
    permission system.

    Nothing is inherited. A row at an organisation says nothing about its
    sites, and one at a site says nothing about its organisation — so a ward
    manager can administer their ward without trust-wide authority, and "why
    could this person do that?" is answered by one row rather than by
    replaying a hierarchy.

    Attributes:
        id: Primary key.
        user_id: The person.
        organisation_id: The organisation, when the place is an organisation.
        site_id: The site, when the place is a site.
        competency: A competency id from ``shared/competency-definitions/``.
        authorised_by: Who authorised practice here. Null once that user is
            deleted, so the fact it was authorised outlives the person who
            did it.
        authorised_at: When practice here was authorised.
    """

    __tablename__ = "practising_competency"
    __table_args__ = (
        CheckConstraint(
            "(organisation_id IS NOT NULL) <> (site_id IS NOT NULL)",
            name="ck_practising_competency_one_place",
        ),
        # Two partial unique indexes rather than one UniqueConstraint over
        # all four columns. One of the place columns is always NULL, and SQL
        # treats NULLs as distinct, so a four-column constraint never fires
        # and the same row could be written twice. Declared for both
        # dialects: the unit-test database is SQLite, where
        # postgresql_where is silently ignored.
        Index(
            "uq_practising_competency_org",
            "user_id",
            "organisation_id",
            "competency",
            unique=True,
            postgresql_where=text("organisation_id IS NOT NULL"),
            sqlite_where=text("organisation_id IS NOT NULL"),
        ),
        Index(
            "uq_practising_competency_site",
            "user_id",
            "site_id",
            "competency",
            unique=True,
            postgresql_where=text("site_id IS NOT NULL"),
            sqlite_where=text("site_id IS NOT NULL"),
        ),
        # Both directions the resolver asks: what may this person practise
        # here, and who here may practise this.
        Index(
            "ix_practising_competency_org",
            "organisation_id",
            "competency",
        ),
        Index(
            "ix_practising_competency_site",
            "site_id",
            "competency",
        ),
        Index("ix_practising_competency_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    organisation_id: Mapped[int | None] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"), nullable=True
    )
    site_id: Mapped[int | None] = mapped_column(
        ForeignKey("sites.id", ondelete="CASCADE"), nullable=True
    )
    competency: Mapped[str] = mapped_column(String(100), nullable=False)
    authorised_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    authorised_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    @validates("competency")
    def _competency_exists(self, _key: str, value: str) -> str:
        """Reject a competency id that is not in the catalogue.

        No foreign key can do this: the catalogue is
        ``shared/competency-definitions/``, deliberately kept out of the database
        because it is code-generated into the frontend's types. So the check
        lives on the attribute instead, covering every path that writes a
        row rather than one endpoint's schema.
        """
        validate_competency_ids([value])
        return value


# The positions the application itself reasons about. A free string would
# repeat the competency-id mistake — a bare value nothing validates — and a
# YAML catalogue is not earned yet at this size. Display names live on the
# row, so an organisation can call its clinical lead something else without
# the code losing track of what the post is.
POSITION_KINDS: tuple[str, ...] = (
    "clinical_lead",
    "caldicott_guardian",
    "clinical_safety_officer",
    "data_protection_officer",
)


class Position(Base):
    """A slot an organisation or site has, which may be vacant.

    The test that separates this from a competency is **can it be vacant?**
    "This site has no clinical lead" is a real and actionable state; a
    competency nobody holds is simply absent, which is fine. One needs
    chasing, the other does not.

    A competency says what a person can do. A position says what the
    organisation is required to have, filled by name:

    - **Accountability.** After an incident, "who was the clinical lead?"
      needs one name, even if five people were eligible.
    - **Routing.** Escalations go to the post, not to everyone qualified.
    - **Statutory duty.** A Caldicott Guardian is something the organisation
      must have, not a fact about a person.

    Holding is recorded separately, in ``PositionHolding``, so the slot
    outlives whoever fills it and the post's history is queryable.

    **Exactly one of organisation_id and site_id is set**, matching
    ``PractisingCompetency`` and enforced the same way.

    Attributes:
        id: Primary key.
        organisation_id: The organisation, when the place is an organisation.
        site_id: The site, when the place is a site.
        kind: One of ``POSITION_KINDS``.
        title: What this organisation calls it, for display.
        requires_competency: A competency the holder must have authorised at
            this place, or None where the post needs no particular one.
        max_holders: How many people may hold it substantively, or None for
            no limit. A fact about this place — one site may job-share a post
            another treats as singular — so it lives here rather than on the
            kind.
    """

    __tablename__ = "position"
    __table_args__ = (
        CheckConstraint(
            "(organisation_id IS NOT NULL) <> (site_id IS NOT NULL)",
            name="ck_position_one_place",
        ),
        CheckConstraint(
            "max_holders IS NULL OR max_holders > 0",
            name="ck_position_max_holders_positive",
        ),
        Index(
            "uq_position_org_kind",
            "organisation_id",
            "kind",
            unique=True,
            postgresql_where=text("organisation_id IS NOT NULL"),
            sqlite_where=text("organisation_id IS NOT NULL"),
        ),
        Index(
            "uq_position_site_kind",
            "site_id",
            "kind",
            unique=True,
            postgresql_where=text("site_id IS NOT NULL"),
            sqlite_where=text("site_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    organisation_id: Mapped[int | None] = mapped_column(
        ForeignKey("organisations.id", ondelete="CASCADE"), nullable=True
    )
    site_id: Mapped[int | None] = mapped_column(
        ForeignKey("sites.id", ondelete="CASCADE"), nullable=True
    )
    kind: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(100), nullable=False)
    requires_competency: Mapped[str | None] = mapped_column(
        String(100), nullable=True
    )
    max_holders: Mapped[int | None] = mapped_column(Integer, nullable=True)

    @validates("kind")
    def _kind_is_known(self, _key: str, value: str) -> str:
        """Reject a position kind the application does not reason about."""
        if value not in POSITION_KINDS:
            raise ValueError(
                f"Unknown position kind: {value}. Known kinds are "
                + ", ".join(POSITION_KINDS)
                + "."
            )
        return value

    @validates("requires_competency")
    def _competency_exists(self, _key: str, value: str | None) -> str | None:
        """Reject a competency id that is not in the catalogue."""
        if value is not None:
            validate_competency_ids([value])
        return value


class PositionHolding(Base):
    """Who holds a position, and for how long.

    Separate from ``Position`` so that a vacancy is a real state — a post
    with no current holding — rather than a missing row nobody can ask
    about. It also makes the post's history queryable: "who was Caldicott
    Guardian in March?" is a question about the slot over time, which a
    single holder column on the position could not answer.

    ``is_acting`` covers leave. An acting holding sits alongside the
    substantive one rather than replacing it, so the record still shows who
    the post belonged to, and acting holdings do not count against
    ``max_holders``.

    Attributes:
        id: Primary key.
        position_id: The post being held.
        user_id: The holder.
        started_on: When they took it up.
        ended_on: When they gave it up, or None while current.
        is_acting: Whether this is temporary cover rather than the
            substantive appointment.
        appointed_by: Who appointed them. Null once that user is deleted, so
            the fact an appointment was made outlives the person who made it.
    """

    __tablename__ = "position_holding"
    __table_args__ = (
        CheckConstraint(
            "ended_on IS NULL OR ended_on >= started_on",
            name="ck_position_holding_dates_ordered",
        ),
        Index("ix_position_holding_position", "position_id"),
        Index("ix_position_holding_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    position_id: Mapped[int] = mapped_column(
        ForeignKey("position.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    started_on: Mapped[date] = mapped_column(Date, nullable=False)
    ended_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_acting: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    appointed_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
