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
        org_unit_id: The org_unit to join, which for a registration is the
            organisation's own row in the tree (optional).
        site_id: ID of the site to join as trainee (optional). Already a
            org_unit id: a site is an org_unit.
    """

    model_config = ConfigDict(extra="forbid")

    username: str
    full_name: str | None = None
    email: EmailStr
    password: str
    org_unit_id: int | None = None
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

    All fields are optional – only provided fields are updated.

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
        platform_role: Whether this person operates Quill itself.
        totp_enabled: Whether 2FA is active.
        enabled_features: Features enabled on any of the user's orgs.
        clinical_services_enabled: Whether clinical services are enabled.
        competencies: Resolved CBAC competency IDs.
        fhir_patient_id: The patient record this account belongs to, where
            the same human is both. Null for staff who are not patients here.
        may_grant: The competencies this person may grant to and remove
            from other people, or null for no limit (``manage_users``).
            Empty for somebody who may grant nothing.
        may_assign_professions: The base professions they may give
            somebody, read the same way.
        owns_passport: Whether they hold a clinician passport of their own.
    """

    id: int
    username: str
    name: str | None
    email: str
    roles: list[str]
    platform_role: str
    totp_enabled: bool
    enabled_features: list[str]
    clinical_services_enabled: bool
    competencies: list[str]
    # Which record is this person's own. The interface needs it to decide
    # whether someone is messaging about their own health, and to name
    # the record when they are; the backend answers the same question
    # this way in three org_units.
    #
    # `access_own_patient_records` does not replace this, now that it
    # exists and belongs to the `patient` profession alone. The two
    # answer different questions: the competency says *may they read
    # their own record*, this says *which record is theirs*. A clinician
    # who is also a patient at their own trust holds the competency as
    # well, so reading it here would hide the patient picker from
    # someone messaging about a patient they treat.
    fhir_patient_id: str | None
    # Worked out from the whitelists in shared/competency-definitions/ by
    # app.cbac.grant_scope, so the admin pickers offer what the API will
    # accept rather than working the rule out again in the browser.
    # Optional, so a client that predates them keeps working.
    may_grant: list[str] | None = None
    may_assign_professions: list[str] | None = None
    # Whether they hold a clinician passport of their own. A holder may
    # always read and export it, whether or not the passport feature
    # reaches them, so the interface needs to know to offer the way in
    # when `enabled_features` does not. Optional, so a client that
    # predates it keeps working.
    owns_passport: bool = False


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
        org_unit_id: The organisation's own row in the tree, which is
            the id registration sends back. Replaces ``id``, which
            counted in the organisations table's own ids.
        name: Organisation name.
    """

    org_unit_id: int
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
        org_unit_id: The organisation, as an org_unit id – what the
            registration that follows sends back.
        site_id: ID of the site if valid, else None. Already an org_unit id:
            a site is an org_unit.
    """

    valid: bool
    site_name: str | None = None
    org_unit_id: int | None = None
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
        platform_role: Whether this person operates Quill itself.
        competencies: Resolved CBAC competency IDs.
        is_active: Whether user is active.
        full_name: User's full name (optional, for admin responses).
        organisations: List of organisation names (optional, for admin responses).
        sites: List of site names (optional, for admin responses).
    """

    id: int
    username: str
    email: str
    platform_role: str
    # So a staff picker can tell whether this person holds anything a
    # member of staff would. Adding somebody who holds nothing staff-like
    # is a real progression – a patient becoming a healthcare assistant –
    # and the interface asks rather than refusing, which it cannot do
    # without knowing what they hold.
    competencies: list[str]
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


class PractisingAtOut(BaseModel):
    """What somebody may practise at one org_unit.

    The shape the user form sends back as ``practising``, so the form
    opens with what is saved and returns it unchanged where nothing
    moved.

    Attributes:
        org_unit_id: The org_unit.
        competencies: What they may practise there, narrowed to what
            they hold: a row beyond their ceiling has no effect and is
            not listed.
    """

    org_unit_id: int
    competencies: list[str]


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
        platform_role: Whether this person operates Quill itself.
        is_active: Whether user is active.
        org_unit_ids: Every org_unit the user belongs to, organisations
            included, in the ids the org_units themselves answer in.
        practising: What they may practise at each org_unit they
            belong to that the caller reaches, one entry per org_unit.
    """

    id: int
    username: str
    email: str
    name: str
    base_profession: str
    additional_competencies: list[str]
    removed_competencies: list[str]
    platform_role: str
    is_active: bool
    org_unit_ids: list[int] = []
    practising: list[PractisingAtOut] = []


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
