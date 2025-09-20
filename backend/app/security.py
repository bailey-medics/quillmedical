# app/security.py
from datetime import UTC, datetime, timedelta

import pyotp
from itsdangerous import URLSafeSerializer
from jose import jwt
from passlib.hash import argon2

from app.config import settings


def _now() -> datetime:
    return datetime.now(UTC)


def hash_password(p: str) -> str:
    return argon2.hash(p)


def verify_password(p: str, h: str) -> bool:
    return argon2.verify(p, h)


def create_access_token(sub: str, roles: list[str]) -> str:
    payload = {
        "sub": sub,
        "roles": roles,
        "exp": _now() + timedelta(minutes=settings.ACCESS_TTL_MIN),
    }
    return jwt.encode(
        payload,
        settings.JWT_SECRET.get_secret_value(),
        algorithm=settings.JWT_ALG,
    )


def create_refresh_token(sub: str) -> str:
    payload = {
        "sub": sub,
        "type": "refresh",
        "exp": _now() + timedelta(days=settings.REFRESH_TTL_DAYS),
    }
    return jwt.encode(
        payload,
        settings.JWT_SECRET.get_secret_value(),
        algorithm=settings.JWT_ALG,
    )


def decode_token(tok: str) -> dict:
    return jwt.decode(
        tok,
        settings.JWT_SECRET.get_secret_value(),
        algorithms=[settings.JWT_ALG],
    )


# CSRF (double-submit cookie)
_csrf = URLSafeSerializer(settings.JWT_SECRET.get_secret_value(), salt="csrf")


def make_csrf(sub: str) -> str:
    return _csrf.dumps({"sub": sub})


def verify_csrf(token: str, sub: str) -> bool:
    try:
        data = _csrf.loads(token)
        return data.get("sub") == sub
    except Exception:
        return False


# ----- TOTP helpers (pyotp) -----
def generate_totp_secret() -> str:
    """Return a base32 secret for a new TOTP key."""
    return pyotp.random_base32()


def totp_provisioning_uri(
    secret: str, username: str, issuer: str | None = None
) -> str:
    """Return an otpauth:// URI which can be converted to QR code by
    the frontend.
    """
    totp = pyotp.totp.TOTP(secret)
    if issuer:
        return totp.provisioning_uri(name=username, issuer_name=issuer)
    return totp.provisioning_uri(name=username)


def verify_totp_code(secret: str, code: str) -> bool:
    try:
        t = pyotp.TOTP(secret)
        # allow short window to accommodate clock drift
        return t.verify(code, valid_window=1)
    except Exception:
        return False
