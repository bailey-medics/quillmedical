"""SQLAlchemy ORM models for authentication database.

This module defines the database schema for user authentication and role-based
access control (RBAC). All models use SQLAlchemy 2.0 declarative style with
Mapped type hints for enhanced type safety.

The schema includes:
- User: User accounts with credentials and TOTP settings
- Role: Role definitions for RBAC
- user_role: Many-to-many association table linking users to roles
- PatientMetadata: Application-specific patient metadata (activation status, etc.)
"""

from __future__ import annotations

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    ForeignKey,
    Integer,
    String,
    Table,
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
