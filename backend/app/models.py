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
    delete,
    event,
    update,
)
from sqlalchemy.engine import Connection
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Mapper,
    mapped_column,
    relationship,
    validates,
)

from app.cbac.base_professions import resolve_user_competencies
from app.cbac.competencies import validate_competency_ids
from app.org_units.relations import validate_org_unit_relation


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
        competency_grants: Competencies granted beyond, or removed from,
            the base profession, one ``user_competency`` row each.
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
    #: Whether this person operates Quill itself. One value and its
    #: absence, because that is the only question the old four-level
    #: ``system_permissions`` column asked that was not about an org_unit.
    #:
    #: That column is gone. ``admin`` and ``staff`` described a person
    #: *somewhere* and became membership plus competencies; only
    #: ``superadmin`` stood alone, and it is this. See
    #: docs/docs/plans/2026-09-09-platform-role-plan.md.
    platform_role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="standard",
        server_default="standard",
    )

    # CBAC: Competency-Based Access Control fields
    base_profession: Mapped[str] = mapped_column(
        String(100), nullable=False, default="patient"
    )
    professional_registrations: Mapped[dict[str, Any] | None] = mapped_column(
        JSON, nullable=True
    )

    roles: Mapped[list[Role]] = relationship(
        secondary=user_role,
        back_populates="users",
        lazy="joined",
    )

    #: Every competency this person has been granted or had removed, one
    #: row each, current and closed alike. Loaded with the user rather
    #: than on demand because ``get_final_competencies`` takes no
    #: session, and ``selectin`` loads a whole list of users' rows in one
    #: query rather than one per user.
    competency_grants: Mapped[list[UserCompetency]] = relationship(
        foreign_keys="UserCompetency.user_id",
        back_populates="user",
        lazy="selectin",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    def _current_competency_ids(self, *, granted: bool) -> list[str]:
        """Competency ids with a current row of the given kind, sorted."""
        now = datetime.now(UTC)
        return sorted(
            {
                row.competency_id
                for row in self.competency_grants
                if row.granted == granted and row.is_current(now)
            }
        )

    @property
    def additional_competency_ids(self) -> list[str]:
        """What this person holds beyond their base profession, from rows.

        The competencies with a current grant row. Replaces the
        ``additional_competencies`` JSON column, now dropped.
        """
        return self._current_competency_ids(granted=True)

    @property
    def removed_competency_ids(self) -> list[str]:
        """What their profession gives them that they do not hold, from rows.

        The competencies with a current removal row. Replaces the
        ``removed_competencies`` JSON column, now dropped.
        """
        return self._current_competency_ids(granted=False)

    def get_final_competencies(self) -> list[str]:
        """Compute final competencies for this user.

        Base profession, plus every current grant row, minus every current
        removal row. A grant whose ``ends_on`` has passed is not held,
        which is how ``passport_write`` lapses.

        Returns:
            List of competency IDs this user has.
        """
        return resolve_user_competencies(
            base_profession=self.base_profession,
            additional_competencies=self.additional_competency_ids,
            removed_competencies=self.removed_competency_ids,
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


org_unit_patient_member = Table(
    "org_unit_patient_member",
    Base.metadata,
    Column("org_unit_id", ForeignKey("org_unit.id"), primary_key=True),
    Column("patient_id", String(255), primary_key=True),
)
"""Association table: which patients an org_unit is responsible for.

The org_unit is an organisation's own row in the tree. Whether a patient
list may ever hang below a root is a product decision rather than a
schema one; nothing stops it here.
"""


class OrgUnitFeature(Base):
    """Feature flag for an organisation.

    Row existence = feature is enabled. Deleting the row disables the
    feature. No separate ``enabled`` boolean — avoids ambiguity between
    "row exists but disabled" and "row absent".

    Attributes:
        id: Primary key.
        org_unit_id: FK to the org_unit the feature is enabled at, which is
            an organisation's own row in the tree. Nullable in the column
            type only: the check constraint requires it, which is how a
            required column is added to a populated table without a
            server default that would make no sense for an id.
        feature_key: Feature identifier (e.g. "epr", "teaching").
        enabled_at: When the feature was enabled.
        enabled_by: FK to the user who enabled it.
    """

    __tablename__ = "org_unit_feature"
    __table_args__ = (
        UniqueConstraint(
            "org_unit_id",
            "feature_key",
            name="uq_org_unit_feature",
        ),
        CheckConstraint(
            "org_unit_id IS NOT NULL",
            name="ck_org_unit_feature_place_required",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_unit_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("org_unit.id", ondelete="CASCADE"),
        nullable=True,
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

    org_unit: Mapped[OrgUnit | None] = relationship()
    enabled_by_user: Mapped[User | None] = relationship(
        foreign_keys=[enabled_by],
        lazy="joined",
    )


message_org_unit = Table(
    "message_org_unit",
    Base.metadata,
    Column(
        "conversation_id",
        ForeignKey("conversations.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "org_unit_id",
        ForeignKey("org_unit.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)
"""Association table linking conversations to org_units.

The org_unit is an organisation's own row in the tree. The column was
renamed rather than repointed in silence: it holds a different number
than it used to, and a call site that had not been moved across would
otherwise have matched a different org_unit without saying so.
"""


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
    # The org_units a conversation belongs to: an organisation's own row in
    # the tree. Named ``org_units`` rather than ``organisations`` because the
    # rows hold an org_unit id now, and a name that still said organisation
    # would be a set of numbers that do not mean what the name says.
    places: Mapped[list[OrgUnit]] = relationship(
        secondary=message_org_unit,
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


# In what capacity someone is at an org_unit, whether that org_unit is an
# organisation or a site. Deliberately open-ended: more are expected —
# volunteer, contractor, honorary, visiting — so this is a string validated
# against a list in code rather than a database enum, which would need a
# migration to extend. A free string is not the alternative; that repeats the
# mistake competency ids made.
#
# **One list, not one per table.** An organisation and a site are different
# org_units, but a trainee is the same kind of member at either. Two lists would
# be two meanings of one word waiting to drift apart, which is exactly what
# `site_staff_member.role` did.
#
# **Not a ranking, and never a permission check.** A trainee on placement and
# a substantive staff member are different relationships to an org_unit, not rungs
# of a ladder. What someone may *do* there is a practising competency; if a
# rule ever needs "contractors cannot do X", that belongs there, not here, or
# this column becomes the access-control-shaped field its predecessor was.
#: What a person is to Quill itself, as opposed to at an org_unit.
#:
#: Two values, not a ladder. ``superadmin`` operates the platform;
#: ``standard`` is everyone else, and says nothing about what they may do —
#: that is competencies, and where they may do it is membership. The
#: previous column ranked four values, which invited the reading that
#: ``superadmin`` subsumes clinical access. It does not.
#:
#: ``standard`` rather than ``member``: membership already means belonging
#: to an organisation or a site, with its own tables and its own capacity
#: column. Reusing the word here would have put two unrelated ideas behind
#: one term, which is the mistake this column exists to undo.
PLATFORM_ROLES: tuple[str, ...] = ("standard", "superadmin")


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

    #: What relationship a person has to an org_unit. Never a ranking and never a
    #: permission check: what somebody may do comes from their competencies,
    #: and this says only how they come to be here at all.
    #:
    #: ``external`` is for somebody who belongs to another org_unit entirely and
    #: is here for one purpose — a consultant from another trust invited to
    #: sign off a trainee's competency. It has to be its own word rather than
    #: reusing ``staff``: ``staff`` carries a live behavioural check, letting
    #: a member self-join a conversation in ``messaging.py``, and a visiting
    #: assessor should not gain that.
    #:
    #: ``patient`` is added alongside because the membership plan already
    #: anticipates it. What it means in business logic is settled there, not
    #: here — this only reserves the word so the two plans cannot each invent
    #: a different one.


MEMBER_CAPACITIES: tuple[str, ...] = (
    "staff",
    "trainee",
    "external",
    "patient",
)

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


org_unit_member = Table(
    "org_unit_member",
    Base.metadata,
    Column(
        "org_unit_id",
        ForeignKey("org_unit.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "user_id",
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    # Least privilege, carried across from the organisation membership
    # table as the two merged. An insert that forgets to say gets the narrower
    # capacity, not the wider one: a row wrongly marked trainee loses
    # access and someone complains; a row wrongly marked staff keeps
    # access nobody notices, which is the failure that does not announce
    # itself. This table had no default at all, so the merge would have
    # quietly lost that behaviour.
    Column("capacity", String(50), nullable=False, server_default="trainee"),
)
"""Association table: who is at an org_unit, and in what capacity.

Keyed on an org_unit in the tree, so a membership at an organisation is a row
against that organisation's own row — the root — and a membership at a
ward is a row against the ward. One table for both, because a trainee is
the same kind of member at either, and two tables were two meanings of
one word waiting to drift apart.

Named ``site_member`` rather than ``site_staff_member`` because a third of
its rows were never staff: ``register``, the public self-registration route,
inserts teaching delegates, who are not employed by the site.

Membership answers *where is this person*. What they may do there is a
practising competency, and who holds a post is a ``Position`` — clinical
lead among them, which is why ``clinical_lead`` is no longer a capacity.
"""


class OrgUnit(Base):
    """Physical or virtual location within the healthcare system.

    Sites form a self-referential hierarchy (organisation > hospital >
    building > ward > room). Each sits beneath exactly one parent, and can
    serve both teaching (clinical lead governance) and clinical (EPR/trust)
    use cases.

    **One owner, not many.** A site used to be linked to any number of
    organisations, which left three questions with no single answer: whose
    features apply here, who the clinical lead is, and which admins may edit
    it. Ownership is now the parent column alone, and a relationship that is
    not ownership — a medical school teaching on a trust's wards — becomes a
    typed link rather than a second owner.

    **Organisations are rows in this table too**, carrying
    ``type = "organisation"`` and no parent. What a row is comes from its
    type and never from its position, so a body sitting above today's
    organisations would need no schema change. The accountable organisation
    for any org_unit is found by walking up to the root; see
    ``app/org_units/tree.py``.

    Attributes:
        id: Primary key.
        name: Site name (e.g. "Faroff Hospital").
        type: Site type (hospital, building, ward, room, clinic,
            department, virtual).
        parent_id: FK to parent site (nullable for top-level sites).
        location: Optional free-text address or description.
        created_at: Timestamp when site was created.
        updated_at: Timestamp when site was last updated.
    """

    __tablename__ = "org_unit"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("org_unit.id", ondelete="SET NULL"),
        nullable=True,
        # Every walk up or down the tree goes through this column, and
        # scoping now walks it on every admin request. Only the name
        # column was indexed, so a walk scanned the whole table.
        index=True,
    )
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    #: The number this org_unit's media objects are filed under in the
    #: bucket, when it is not the org_unit's own id.
    #:
    #: Media lives at ``{prefix}/{module}/{asset}`` and the signed
    #: cookie covers that path, so every object of one module at one
    #: organisation has to share a prefix — a second number for the same
    #: organisation would need a second cookie nobody issues. The prefix
    #: in use was the organisation's own id, which is going, so it is
    #: recorded here instead of being derived from a table that will not
    #: be there.
    #:
    #: Null for an org_unit created since, which files under its own id.
    #: Read through :func:`app.organisations.media_prefix_of` rather than
    #: directly, so the fallback is in one org_unit.
    media_prefix_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
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

    parent: Mapped[OrgUnit | None] = relationship(
        remote_side="OrgUnit.id",
        foreign_keys=[parent_id],
    )


class OrgUnitLink(Base):
    """A relationship between two org_units that is not ownership.

    Ownership is the parent column: one parent each, no cycles, and one
    answer to who is accountable. A medical school teaching on a trust's
    wards is a real relationship and not ownership, so it lives here
    rather than becoming a second parent and splitting every governance
    question into two answers.

    Plays the part ``OrganizationAffiliation`` plays in FHIR and the
    relationship codes play in NHS ODS. **A link confers no membership and
    no admin rights.** What a relation may confer is declared beside it in
    ``app/org_units/relations.py``, so a route asks the relation rather
    than matching on its name.

    Both ends point at ``sites``, which is the table the org_unit tree is
    being built in: organisations become rows there in a later step, at
    which point a school-to-trust link becomes expressible without this
    table changing.

    **Direction matters.** ``teaches_at`` from a school to a trust is not
    the same fact as the reverse, so the pair is ordered and the same two
    org_units may hold a link each way.

    Attributes:
        id: Primary key.
        source_id: The org_unit the relationship is *from*.
        target_id: The org_unit the relationship is *to*.
        relation: A relation id from ``app/org_units/relations.py``.
        created_by: Who recorded the link. Null once that user is deleted,
            so the fact that somebody recorded it outlives the person.
        created_at: When the link was recorded.
    """

    __tablename__ = "org_unit_link"
    __table_args__ = (
        UniqueConstraint(
            "source_id",
            "target_id",
            "relation",
            name="uq_org_unit_link_triple",
        ),
        CheckConstraint(
            "source_id <> target_id",
            name="ck_org_unit_link_not_self",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("org_unit.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("org_unit.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    relation: Mapped[str] = mapped_column(String(50), nullable=False)
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

    @validates("relation")
    def _relation_known(self, _key: str, value: str) -> str:
        """Refuse a relation the code does not define.

        The list is in code rather than a database enum so it can grow
        without a migration, which means the model is the only org_unit that
        can refuse an unknown value before it is stored.
        """
        return validate_org_unit_relation(value)

        # ------------------------------------------------------------------
        # Every organisation is a row in the tree as well
        # ------------------------------------------------------------------
        #
        # An organisation is the root of its own tree: the row every org_unit beneath
        # it walks up to, and the thing that answers "who is accountable here". An
        # organisation without one is invisible to the whole permission system —
        # its sites reach no root, so nobody can administer them and nothing can be
        # scoped to them.
        #
        # That is exactly the failure the plan warns about, so the invariant is
        # held by the mapper rather than by remembering to call something. The two
        # tables become one when the merge finishes, at which point this goes: a
        # row cannot fail to be itself.


@event.listens_for(OrgUnit, "before_delete")
def _clear_what_hangs_off_an_org_unit(
    _mapper: Mapper[OrgUnit],
    connection: Connection,
    target: OrgUnit,
) -> None:
    """Take everything that hangs off an org_unit away with it.

    Its members, its features, its patient list, its conversations, who
    may practise there, the posts it holds and the links it made.

    The org_units beneath it are detached rather than deleted, which is
    what deleting an organisation did before the tree existed. The
    delete route refuses an org_unit that still has children, so this is the
    net rather than the rule.

    All of it is written out rather than left to the foreign keys, which
    would do the same job in Postgres. The unit-test database does not
    enforce foreign keys, so leaving it to the database would make the
    behaviour true only in production, which is the half of a delete
    nobody notices is missing.

    This was a listener on ``Organisation`` until that table went. It
    already did its work through the org_unit the organisation stood for,
    so moving it here asks the same of the row that actually holds the
    rest.
    """
    org_unit_id = target.id

    connection.execute(
        update(OrgUnit)
        .where(OrgUnit.parent_id == org_unit_id)
        .values(parent_id=None)
    )
    for table in (
        org_unit_member,
        org_unit_patient_member,
        message_org_unit,
    ):
        connection.execute(
            table.delete().where(table.c.org_unit_id == org_unit_id)
        )
    connection.execute(
        delete(OrgUnitFeature).where(OrgUnitFeature.org_unit_id == org_unit_id)
    )
    connection.execute(
        delete(PractisingCompetency).where(
            PractisingCompetency.org_unit_id == org_unit_id
        )
    )
    connection.execute(
        delete(Position).where(Position.org_unit_id == org_unit_id)
    )
    connection.execute(
        delete(OrgUnitLink).where(
            (OrgUnitLink.source_id == org_unit_id)
            | (OrgUnitLink.target_id == org_unit_id)
        )
    )


class PractisingCompetency(Base):
    """Whether a person may practise a competency at certain org_unit.

    Named as the question it answers: can this person practise this
    competency here? Deliberately not a "grant" — the organisation does not
    confer the competency. That is held by the person, earned through
    training and sign-off. A row here only records that they are authorised
    to exercise it at this org_unit.

    Healthcare draws the same line as credentialing versus privileging:
    verifying what someone is qualified for, then authorising specific work
    at a specific site. A person's *ceiling* stays on the user, resolved by
    ``get_final_competencies`` from base profession plus additions minus
    removals. This table is the second half.

    A row means authorised. There is no boolean: absence is the unauthorised
    state, so practice cannot be silently withdrawn without removing the row
    that says who authorised it.

    **One org_unit column, and it is required**, enforced by
    ``ck_practising_competency_place_required``. It used to be a pair of
    columns with exactly one of them set, because organisations and sites
    were different tables. They are one table now, so the pair, the check
    that policed it and the two partial unique indexes it forced all go.

    The objection once raised against a shared "org_units" table — that it
    would need a row for every organisation and site forever, and a missed
    one makes that org_unit invisible to the whole permission system — does
    not apply: every org_unit is a row by construction, because there is
    nowhere else for it to be.

    Nothing is inherited. A row at an organisation says nothing about its
    wards, and one at a ward says nothing about its organisation — so a ward
    manager can administer their ward without trust-wide authority, and "why
    could this person do that?" is answered by one row rather than by
    replaying a hierarchy.

    Attributes:
        id: Primary key.
        user_id: The person.
        org_unit_id: The org_unit. An organisation's org_unit is its own row in
            the tree. Nullable in the column type only: the check
            constraint requires it, which is how a required column is
            added to a populated table without a server default that would
            make no sense for an id.
        competency: A competency id from ``shared/competency-definitions/``.
        authorised_by: Who authorised practice here. Null once that user is
            deleted, so the fact it was authorised outlives the person who
            did it.
        authorised_at: When practice here was authorised.
    """

    __tablename__ = "practising_competency"
    __table_args__ = (
        CheckConstraint(
            "org_unit_id IS NOT NULL",
            name="ck_practising_competency_place_required",
        ),
        # One ordinary unique constraint now that there is one org_unit
        # column. It used to be two partial unique indexes, because one of
        # the two org_unit columns was always NULL and SQL treats NULLs as
        # distinct, so a constraint over all of them never fired.
        UniqueConstraint(
            "user_id",
            "org_unit_id",
            "competency",
            name="uq_practising_competency_org_unit",
        ),
        # Both directions the resolver asks: what may this person practise
        # here, and who here may practise this.
        Index(
            "ix_practising_competency_org_unit",
            "org_unit_id",
            "competency",
        ),
        Index("ix_practising_competency_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    org_unit_id: Mapped[int | None] = mapped_column(
        ForeignKey("org_unit.id", ondelete="CASCADE"), nullable=True
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


#: How a ``user_competency`` row came to exist. Checked in code rather than
#: by a database enum or check constraint, so a new way of granting needs no
#: migration — the choice ``validate_org_unit_type`` made for org unit types.
COMPETENCY_GRANT_SOURCES: tuple[str, ...] = (
    # A holder of `manage_users`, through the user editor or by adding
    # somebody to an org_unit.
    "admin",
    # An operator editing their own competencies.
    "operator",
    # The command-line scripts that create the first superadmin, where
    # nobody is signed in to be `granted_by`.
    "bootstrap",
    # A term of `passport_write` paid for by an organisation, or bought by
    # the person. The two values the retired `passport_write_entitlement`
    # table used.
    "organisation",
    "individual",
    # Copied from the JSON columns and the entitlement table when this
    # table was introduced.
    "migrated",
)


class UserCompetency(Base):
    """One grant, or one removal, of a competency to one person.

    Replaced ``User.additional_competencies`` and
    ``User.removed_competencies``, two JSON lists of ids that could say
    nothing about an entry beyond its name: not when it started, not when
    it ends, not who made it. See
    ``docs/docs/plans/2026-09-23-user-competency-table-plan.md``.

    **``granted`` false is a removal**: this person does not hold something
    their base profession would give them. It keeps the subtraction
    ``resolve_user_competencies`` performs, and unlike a string in a list it
    can say who removed it and when.

    **No foreign key on ``competency_id``.** The catalogue is
    ``shared/competency-definitions/``, not a table, and a retired
    competency has to stay readable on the rows that name it — the position
    ``PassportSignOffRequest.competency_id`` takes for the same reason.
    Validation happens at the write boundary, in the request schemas.

    **No unique constraint on the person and competency.** Somebody may
    hold ``passport_write`` from their trust and from a subscription of
    their own at once, with different end dates, and losing one must not
    end the other. The question asked is whether *any* row is current.

    **Rows are inserted or closed, never deleted.** Taking a competency
    away sets ``ends_on``, so what somebody could do last year stays
    answerable.

    Attributes:
        id: Primary key.
        user_id: The person.
        competency_id: A competency id from
            ``shared/competency-definitions/``.
        granted: True for a grant, false for a removal.
        starts_on: When it took effect. Null on rows copied from the JSON
            lists, which never recorded it.
        ends_on: When it stops, or stopped. Null for a grant with no end.
        source: How it came to exist, one of ``COMPETENCY_GRANT_SOURCES``.
        org_unit_id: The org_unit it was granted through, where there was
            one. Null once that org_unit is deleted.
        granted_by: Who made it. Null for a migrated or scripted row, and
            once that user is deleted.
        created_at: When the row was written.
    """

    __tablename__ = "user_competency"
    __table_args__ = (
        CheckConstraint(
            "ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on",
            name="ck_user_competency_ends_after_start",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    competency_id: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True
    )
    granted: Mapped[bool] = mapped_column(Boolean, nullable=False)
    starts_on: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    ends_on: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    org_unit_id: Mapped[int | None] = mapped_column(
        ForeignKey("org_unit.id", ondelete="SET NULL"), nullable=True
    )
    granted_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    user: Mapped[User] = relationship(
        foreign_keys=[user_id], back_populates="competency_grants"
    )

    def is_current(self, now: datetime) -> bool:
        """Whether this row is still in force at ``now``.

        Current means no end, or an end still in the future. SQLite hands
        back naive datetimes where Postgres hands back aware ones, so a
        naive value is read as UTC, which is what every writer stores.

        Args:
            now: An aware datetime to check against.

        Returns:
            True while the row is in force.
        """
        if self.ends_on is None:
            return True
        ends_on = self.ends_on
        if ends_on.tzinfo is None:
            ends_on = ends_on.replace(tzinfo=UTC)
        return ends_on > now

    @validates("source")
    def _source_known(self, _key: str, value: str) -> str:
        """Reject a source outside ``COMPETENCY_GRANT_SOURCES``."""
        if value not in COMPETENCY_GRANT_SOURCES:
            raise ValueError(
                f"Unknown competency grant source: {value}. Known sources "
                "are " + ", ".join(COMPETENCY_GRANT_SOURCES) + "."
            )
        return value


POSITION_KINDS: tuple[str, ...] = (
    "clinical_lead",
    "caldicott_guardian",
    "clinical_safety_officer",
    "data_protection_officer",
)


class Position(Base):
    """A slot an org_unit has, which may be vacant.

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

    **One org_unit column, and it is required**, matching
    ``PractisingCompetency`` and enforced the same way.

    Attributes:
        id: Primary key.
        org_unit_id: The org_unit. An organisation's org_unit is its own row in
            the tree.
        kind: One of ``POSITION_KINDS``.
        title: What this organisation calls it, for display.
        requires_competency: A competency the holder must have authorised at
            this org_unit, or None where the post needs no particular one.
        max_holders: How many people may hold it substantively, or None for
            no limit. A fact about this org_unit — one site may job-share a post
            another treats as singular — so it lives here rather than on the
            kind.
    """

    __tablename__ = "position"
    __table_args__ = (
        CheckConstraint(
            "org_unit_id IS NOT NULL",
            name="ck_position_place_required",
        ),
        CheckConstraint(
            "max_holders IS NULL OR max_holders > 0",
            name="ck_position_max_holders_positive",
        ),
        UniqueConstraint(
            "org_unit_id",
            "kind",
            name="uq_position_org_unit_kind",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    org_unit_id: Mapped[int | None] = mapped_column(
        ForeignKey("org_unit.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
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
