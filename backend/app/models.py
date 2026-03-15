"""SQLAlchemy ORM models for authentication database.

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

from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.cbac.base_professions import resolve_user_competencies


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
    email: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    # TOTP (optional) - base32 secret string
    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # System Permissions: Administrative and system-level access control
    system_permissions: Mapped[str] = mapped_column(
        String(20), nullable=False, default="patient"
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
    professional_registrations: Mapped[dict | None] = mapped_column(
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


organisation_staff_member = Table(
    "organisation_staff_member",
    Base.metadata,
    Column(
        "organisation_id", ForeignKey("organizations.id"), primary_key=True
    ),
    Column("user_id", ForeignKey("users.id"), primary_key=True),
    Column("is_primary", Boolean, default=False, nullable=False),
)
"""Association table for many-to-many relationship between organisations and staff."""


organisation_patient_member = Table(
    "organisation_patient_member",
    Base.metadata,
    Column(
        "organisation_id", ForeignKey("organizations.id"), primary_key=True
    ),
    Column("patient_id", String(255), primary_key=True),
    Column("is_primary", Boolean, default=False, nullable=False),
)
"""Association table for many-to-many relationship between organisations and patients."""


class Organization(Base):
    """Healthcare organisation (hospital, GP practice, clinic, department).

    Represents a named group of healthcare staff who share responsibility for a
    defined group of patients. Uses American spelling in code/API (FHIR-aligned)
    but British spelling "Organisation" in UI.

    Attributes:
        id: Primary key.
        name: Organisation name (e.g., "Great Eastern Hospital").
        type: Organisation type (hospital_team, gp_practice, private_clinic, department).
        location: Optional location/address information.
        created_at: Timestamp when organisation was created.
        updated_at: Timestamp when organisation was last updated.
        staff_members: List of users (staff) who belong to this organisation.
    """

    __tablename__ = "organizations"

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
        secondary=organisation_staff_member,
        backref="organisations",
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
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
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
