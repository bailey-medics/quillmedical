"""Pydantic schemas for authentication API endpoints.

This module defines request and response models for user authentication,
registration, and two-factor authentication (TOTP) operations.
"""

from pydantic import BaseModel, ConfigDict


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
    """

    model_config = ConfigDict(extra="forbid")

    username: str
    full_name: str | None = None
    email: str
    password: str
    organisation_id: int | None = None


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

    email: str


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
