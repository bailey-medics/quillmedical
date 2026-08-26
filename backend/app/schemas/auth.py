"""Pydantic schemas for authentication API endpoints.

This module defines request and response models for user authentication,
registration, and two-factor authentication (TOTP) operations.
"""

from pydantic import BaseModel, ConfigDict, EmailStr


class LoginIn(BaseModel):
    """Login request payload.

    Attributes:
        username: User's username for authentication.
        password: User's password (plain text, will be hashed on server).
        totp_code: Optional 6-digit TOTP code if 2FA is enabled.
    """

    model_config = ConfigDict(extra="forbid")

    username: str
    password: str
    totp_code: str | None = None


class RegisterIn(BaseModel):
    """User registration request payload.

    Attributes:
        username: Desired username (must be unique).
        full_name: User's full display name (optional).
        email: Email address (must be unique).
        password: Desired password (min 8 characters).
        organisation_id: ID of the organisation to join (optional).
        site_id: ID of the site to join as trainee (optional).
    """

    model_config = ConfigDict(extra="forbid")

    username: str
    full_name: str | None = None
    email: EmailStr
    password: str
    organisation_id: int | None = None
    site_id: int | None = None


class ChangePasswordIn(BaseModel):
    """Change password request payload.

    Attributes:
        current_password: User's current password for verification.
        new_password: Desired new password (min 8 characters).
    """

    model_config = ConfigDict(extra="forbid")

    current_password: str
    new_password: str


class ForgotPasswordIn(BaseModel):
    """Forgot password request payload.

    Attributes:
        email: Email address of the account to reset.
    """

    model_config = ConfigDict(extra="forbid")

    email: EmailStr


class ResetPasswordIn(BaseModel):
    """Reset password request payload.

    Attributes:
        token: Password reset token from the email link.
        new_password: Desired new password (min 8 characters).
    """

    model_config = ConfigDict(extra="forbid")

    token: str
    new_password: str


class TotpDisableIn(BaseModel):
    """TOTP disable request payload.

    Requires password re-entry to prevent session-hijack disabling of 2FA.

    Attributes:
        password: Current password for verification.
    """

    model_config = ConfigDict(extra="forbid")

    password: str


class VerifyEmailIn(BaseModel):
    """Email verification request payload.

    Attributes:
        token: Email verification token from the email link.
    """

    model_config = ConfigDict(extra="forbid")

    token: str


class ResendVerificationIn(BaseModel):
    """Resend verification email request payload.

    Attributes:
        email: Email address to resend verification to.
    """

    model_config = ConfigDict(extra="forbid")

    email: EmailStr


class UpdateProfileIn(BaseModel):
    """Profile update request payload.

    All fields are optional — only provided fields are updated.

    Attributes:
        full_name: Updated display name.
        email: Updated email address (resets email_verified).
    """

    model_config = ConfigDict(extra="forbid")

    full_name: str | None = None
    email: EmailStr | None = None


class DetailResponse(BaseModel):
    """Simple success response with detail message."""

    detail: str


class LoginOut(BaseModel):
    """Login response payload.

    Attributes:
        detail: Success message ("ok").
        user: User profile with username and roles.
    """

    detail: str
    user: dict[str, str | list[str]]


class RefreshOut(BaseModel):
    """Refresh token response payload.

    Attributes:
        detail: Success message ("ok").
    """

    detail: str


class MeOut(BaseModel):
    """Current user profile response.

    Attributes:
        id: User's database ID.
        username: User's username.
        name: User's full name (may be null).
        email: User's email address.
        roles: List of assigned role names.
        system_permissions: User's system permission level.
        totp_enabled: Whether 2FA is active.
        enabled_features: Features enabled on any of the user's orgs.
        clinical_services_enabled: Whether clinical services are enabled.
        competencies: Resolved CBAC competency IDs.
    """

    id: int
    username: str
    name: str | None
    email: str
    roles: list[str]
    system_permissions: str
    totp_enabled: bool
    enabled_features: list[str]
    clinical_services_enabled: bool
    competencies: list[str]


class ServiceHealthStatus(BaseModel):
    """Health status of a single service.

    Attributes:
        available: Whether the service is available.
        error: Error message if service is unavailable.
    """

    available: bool
    error: str | None = None


class HealthCheckOut(BaseModel):
    """Health check response.

    Attributes:
        status: Overall status ("healthy" or "degraded").
        services: Health status for each service (core_db, fhir, ehrbase).
    """

    status: str
    services: dict[
        str, ServiceHealthStatus | dict[str, bool | int | str | None]
    ]


class OrganisationListItem(BaseModel):
    """Organisation summary for public listing.

    Attributes:
        id: Organisation ID.
        name: Organisation name.
    """

    id: int
    name: str


class OrganisationsOut(BaseModel):
    """List organisations response.

    Attributes:
        organisations: List of organisations available for registration.
    """

    organisations: list[OrganisationListItem]


class TeachingModuleItem(BaseModel):
    """Teaching module summary for public listing.

    Attributes:
        value: Module ID or key.
        label: Human-readable module name.
    """

    value: str
    label: str


class TeachingModulesOut(BaseModel):
    """List teaching modules response.

    Attributes:
        modules: List of teaching modules available for registration.
    """

    modules: list[TeachingModuleItem]


class ValidateClinicalLeadOut(BaseModel):
    """Clinical lead validation response.

    Attributes:
        valid: Whether the email is a clinical lead for the bank.
        site_name: Name of the site if valid, else None.
        organisation_id: ID of the organisation if valid, else None.
        site_id: ID of the site if valid, else None.
    """

    valid: bool
    site_name: str | None = None
    organisation_id: int | None = None
    site_id: int | None = None


class UserActionOut(BaseModel):
    """User creation or update response.

    Attributes:
        detail: Status message ("created" or "updated").
        id: New or updated user's ID.
        username: New or updated user's username.
        email: New or updated user's email.
    """

    detail: str
    id: int
    username: str
    email: str


class UserIdActionOut(BaseModel):
    """User state change response (deactivate/reactivate).

    Attributes:
        detail: Status message ("deactivated" or "reactivated").
        id: User's ID.
        username: User's username.
    """

    detail: str
    id: int
    username: str


class UserSummaryItem(BaseModel):
    """Summary of a user in list context.

    Attributes:
        id: User's ID.
        username: User's username.
        email: User's email.
        system_permissions: User's system permission level.
        is_active: Whether user is active.
        full_name: User's full name (optional, for admin responses).
        organisations: List of organisation names (optional, for admin responses).
        sites: List of site names (optional, for admin responses).
    """

    id: int
    username: str
    email: str
    system_permissions: str
    is_active: bool
    full_name: str | None = None
    organisations: list[str] | None = None
    sites: list[str] | None = None


class UsersListOut(BaseModel):
    """List users response.

    Attributes:
        users: List of user summaries.
    """

    users: list[UserSummaryItem]


class UserOut(BaseModel):
    """Detailed user profile response.

    Attributes:
        id: User's ID.
        username: User's username.
        email: User's email.
        name: User's full name or username.
        base_profession: User's base profession ID.
        additional_competencies: User's additional competencies.
        removed_competencies: User's removed competencies.
        system_permissions: User's system permission level.
        is_active: Whether user is active.
        organisation_ids: Organisations the user belongs to.
        site_ids: Sites the user belongs to.
    """

    id: int
    username: str
    email: str
    name: str
    base_profession: str
    additional_competencies: list[str]
    removed_competencies: list[str]
    system_permissions: str
    is_active: bool
    organisation_ids: list[int]
    site_ids: list[int]


class LinkPatientIn(BaseModel):
    """Link patient to user request.

    Attributes:
        fhir_patient_id: FHIR patient ID to link.
    """

    model_config = ConfigDict(extra="forbid")
    fhir_patient_id: str


class LinkPatientOut(BaseModel):
    """Link patient to user response.

    Attributes:
        user_id: ID of the user linked to patient.
        fhir_patient_id: FHIR patient ID.
    """

    user_id: int
    fhir_patient_id: str
