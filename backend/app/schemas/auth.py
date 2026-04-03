"""Pydantic schemas for authentication API endpoints.

This module defines request and response models for user authentication,
registration, and two-factor authentication (TOTP) operations.
"""

from pydantic import BaseModel


class LoginIn(BaseModel):
    """Login request payload.

    Attributes:
        username: User's username for authentication.
        password: User's password (plain text, will be hashed on server).
        totp_code: Optional 6-digit TOTP code if 2FA is enabled.
    """

    username: str
    password: str
    totp_code: str | None = None


class RegisterIn(BaseModel):
    """User registration request payload.

    Attributes:
        username: Desired username (must be unique).
        full_name: User's full display name (optional).
        email: Email address (must be unique).
        password: Desired password (min 6 characters).
        organisation_id: ID of the organisation to join (optional).
    """

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

    current_password: str
    new_password: str
