# app/security.py
from datetime import datetime, timedelta, timezone

from app.config import settings
from itsdangerous import URLSafeSerializer
from jose import jwt
from passlib.hash import argon2


def _now() -> datetime:
    return datetime.now(timezone.utc)


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
