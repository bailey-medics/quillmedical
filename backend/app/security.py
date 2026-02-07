"""Security utilities for authentication and authorisation.

This module provides cryptographic functions for:
- Password hashing and verification (Argon2)
- JWT token creation and decoding (HS256)
- TOTP two-factor authentication (RFC 6238)
- CSRF token generation and validation

All functions use industry-standard algorithms and handle secrets securely.
"""

from datetime import UTC, datetime, timedelta
from typing import Any

import pyotp
from itsdangerous import URLSafeSerializer
from jose import jwt  # type: ignore[import-untyped]
from passlib.hash import argon2  # type: ignore[import-untyped]

from app.config import settings


def _now() -> datetime:
    """Current UTC Time.

    Returns the current datetime in UTC timezone. Used internally for
    consistent timestamp generation across all authentication operations.

    Returns:
        datetime: Current time with UTC timezone information.
    """
    return datetime.now(UTC)


def hash_password(p: str) -> str:
    """Hash Password with Argon2.

    Hashes a plain text password using the Argon2 algorithm, which is
    recommended by OWASP for password storage. Uses passlib's default
    Argon2 parameters (time_cost=2, memory_cost=512MB, parallelism=2).

    Args:
        p: Plain text password to hash.

    Returns:
        str: Argon2 hash string in PHC format, suitable for database storage.
    """
    return argon2.hash(p)  # type: ignore[no-any-return]


def verify_password(p: str, h: str) -> bool:
    """Verify Password Against Hash.

    Verifies a plain text password against an Argon2 hash stored in the
    database. Uses constant-time comparison to prevent timing attacks.

    Args:
        p: Plain text password to verify.
        h: Argon2 hash from database (PHC format).

    Returns:
        bool: True if password matches hash, False otherwise.
    """
    return argon2.verify(p, h)  # type: ignore[no-any-return]


def create_access_token(sub: str, roles: list[str]) -> str:
    """Create JWT Access Token.

    Creates a short-lived JWT access token containing the user's identity
    and assigned roles. The token is signed with HS256 and expires after
    ACCESS_TTL_MIN minutes (default: 15). Used for authenticating API requests.

    Args:
        sub: Subject (username) for the token.
        roles: List of role names assigned to the user (e.g., ["Clinician"]).

    Returns:
        str: Encoded JWT access token valid for ACCESS_TTL_MIN minutes.
    """
    payload: dict[str, Any] = {
        "sub": sub,
        "roles": roles,
        "exp": _now() + timedelta(minutes=settings.ACCESS_TTL_MIN),
    }
    return jwt.encode(  # type: ignore[no-any-return]
        payload,
        settings.JWT_SECRET.get_secret_value(),
        algorithm=settings.JWT_ALG,
    )


def create_refresh_token(sub: str) -> str:
    """Create JWT Refresh Token.

    Creates a long-lived JWT refresh token used to obtain new access tokens
    without requiring the user to log in again. Expires after REFRESH_TTL_DAYS
    (default: 7 days). Stored in HTTP-only cookie with restricted path.

    Args:
        sub: Subject (username) for the token.

    Returns:
        str: Encoded JWT refresh token valid for REFRESH_TTL_DAYS days.
    """
    payload = {
        "sub": sub,
        "type": "refresh",
        "exp": _now() + timedelta(days=settings.REFRESH_TTL_DAYS),
    }
    return jwt.encode(  # type: ignore[no-any-return]
        payload,
        settings.JWT_SECRET.get_secret_value(),
        algorithm=settings.JWT_ALG,
    )


def decode_token(tok: str) -> dict[str, Any]:
    """Decode and Verify JWT Token.

    Decodes a JWT token and verifies its signature using the configured
    JWT_SECRET. Also validates the token hasn't expired. Used by authentication
    middleware to extract user identity from access and refresh tokens.

    Args:
        tok: JWT token string to decode.

    Returns:
        dict: Decoded token payload containing 'sub' (username), 'roles',
            'exp' (expiration), and other claims.

    Raises:
        jose.JWTError: If token signature is invalid.
        jose.ExpiredSignatureError: If token has expired.
        jose.JWTClaimsError: If token claims are invalid.
    """
    return jwt.decode(  # type: ignore[no-any-return]
        tok,
        settings.JWT_SECRET.get_secret_value(),
        algorithms=[settings.JWT_ALG],
    )


# CSRF (double-submit cookie)
_csrf = URLSafeSerializer(settings.JWT_SECRET.get_secret_value(), salt="csrf")


def create_csrf_token(username: str) -> str:
    """Create CSRF Protection Token.

    Generates a CSRF token for protecting state-changing operations against
    cross-site request forgery attacks. The token is signed with the JWT_SECRET
    and tied to the user's identity. Must be included in X-CSRF-Token header
    for POST/PUT/PATCH/DELETE requests.

    Args:
        username: Username to tie the token to.

    Returns:
        str: URL-safe CSRF token signed with JWT_SECRET.
    """
    return _csrf.dumps({"sub": username})


def make_csrf(sub: str) -> str:
    """Create CSRF Token (Legacy).

    Legacy alias for create_csrf_token. Generates a CSRF token signed with
    the user's identity. Maintained for backward compatibility with existing
    code that uses this function name.

    Args:
        sub: Subject (username) to sign the token with.

    Returns:
        str: URL-safe CSRF token.
    """
    return _csrf.dumps({"sub": sub})


def verify_csrf(token: str, sub: str) -> bool:
    """Verify CSRF Token.

    Verifies a CSRF token matches the expected username. Used by the
    require_csrf dependency to protect state-changing operations. Returns
    False for any verification failure (invalid signature, wrong subject).

    Args:
        token: CSRF token from X-CSRF-Token header.
        sub: Expected subject (username) from JWT.

    Returns:
        bool: True if token is valid and subject matches, False otherwise.
    """
    try:
        data = _csrf.loads(token)
        return bool(data.get("sub") == sub)
    except Exception:
        return False


def generate_totp_secret() -> str:
    """Generate TOTP Secret.

    Generates a new cryptographically random TOTP secret for two-factor
    authentication. The secret is Base32-encoded for compatibility with
    authenticator apps like Google Authenticator, Authy, etc.

    Returns:
        str: Base32-encoded secret (32 characters).
    """
    return pyotp.random_base32()


def generate_totp_provision_uri(
    username: str, secret: str, issuer: str = "Quill"
) -> str:
    """Generate TOTP Provisioning URI.

    Creates an otpauth:// URI for QR code generation, compatible with
    authenticator apps. The URI contains the secret, username, and issuer
    information. Users scan this QR code to add the account to their app.

    Args:
        username: User's username for labeling the TOTP entry.
        secret: Base32-encoded TOTP secret from generate_totp_secret().
        issuer: Application name displayed in authenticator app (default: "Quill").

    Returns:
        str: otpauth://totp/... URI for QR code generation.
    """
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=username, issuer_name=issuer)


def verify_totp_code(secret: str, code: str) -> bool:
    """Verify TOTP Code.

    Verifies a 6-digit TOTP code against the user's secret. Uses RFC 6238
    time-based one-time password algorithm with 30-second time steps.
    Allows for clock drift of ±1 time step (default pyotp behavior).

    Args:
        secret: Base32-encoded TOTP secret from database.
        code: 6-digit TOTP code from authenticator app.

    Returns:
        bool: True if code is valid for current time window, False otherwise.
    """
    try:
        totp = pyotp.TOTP(secret)
        return totp.verify(code)
    except Exception:
        return False


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
