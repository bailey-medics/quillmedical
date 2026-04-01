"""Pydantic schemas for authentication API endpoints.

This module defines request and response models for user authentication,
registration, and two-factor authentication (TOTP) operations.
"""

from pydantic import BaseModel, EmailStr, Field


class LoginIn(BaseModel):
    """Login request payload.

    Attributes:
        username: User's username for authentication.
        password: User's password (plain text, will be hashed on server).
        totp_code: Optional 6-digit TOTP code if 2FA is enabled.
    """

    username: str = Field(..., min_length=1, max_length=150)
    password: str = Field(..., min_length=1)
    totp_code: str | None = None

    model_config = {"extra": "forbid"}


class RegisterIn(BaseModel):
    """User registration request payload.

    Attributes:
        username: Desired username (must be unique).
        email: Email address (must be unique, validated format).
        password: Desired password (min 8 characters).
        organisation_id: ID of the organisation to join (optional).
    """

    username: str = Field(..., min_length=1, max_length=150)
    email: EmailStr
    password: str = Field(..., min_length=8)
    organisation_id: int | None = None

    model_config = {"extra": "forbid"}
