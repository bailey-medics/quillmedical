from pydantic import BaseModel


class LoginIn(BaseModel):
    """Input model for login requests."""

    username: str
    password: str
    totp_code: str | None = None


class RegisterIn(BaseModel):
    """Input model for registration requests."""

    username: str
    email: str
    password: str
