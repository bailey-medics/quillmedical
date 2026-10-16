"""Security utilities for authentication and authorisation.

This module provides cryptographic functions for:
- Password hashing and verification (Argon2)
- JWT token creation and decoding (HS256)
- TOTP two-factor authentication (RFC 6238)
- CSRF token generation and validation

All functions use industry-standard algorithms and handle secrets securely.
"""

import binascii
import hmac
from datetime import UTC, datetime, timedelta
from typing import Any, NamedTuple

import jwt
import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from itsdangerous import (
    BadSignature,
    URLSafeSerializer,
    URLSafeTimedSerializer,
)

from app.config import settings

_ph = PasswordHasher()


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

    Hashes a plain text password using the Argon2id algorithm, which is
    recommended by OWASP for password storage. Uses argon2-cffi's default
    parameters (time_cost=3, memory_cost=65536, parallelism=4).

    Args:
        p: Plain text password to hash.

    Returns:
        str: Argon2 hash string in PHC format, suitable for database storage.

    Raises:
        ValueError: If password is empty or None.
    """
    # Defensive programming: validate input
    if not p:
        raise ValueError("Password cannot be empty")

    return _ph.hash(p)


def verify_password(p: str, h: str) -> bool:
    """Verify Password Against Hash.

    Verifies a plain text password against an Argon2 hash stored in the
    database. Uses constant-time comparison to prevent timing attacks.

    Args:
        p: Plain text password to verify.
        h: Argon2 hash from database (PHC format).

    Returns:
        bool: True if password matches hash, False otherwise.

    Raises:
        ValueError: If password or hash is empty.
    """
    if not p:
        raise ValueError("Password cannot be empty")
    if not h:
        raise ValueError("Hash cannot be empty")
    try:
        return _ph.verify(h, p)
    except VerifyMismatchError:
        return False


def password_needs_rehash(h: str) -> bool:
    """Whether a stored hash was made with weaker parameters than now.

    A hash carries the parameters it was made with, and verifying reads
    them from the hash, so raising the hasher's parameters changes
    nothing for a password already stored. This is how a stored hash
    catches up: the login route asks it once the password has verified,
    and hashes the password again if the answer is yes.

    Args:
        h: Argon2 hash from the database (PHC format).

    Returns:
        bool: True if the hash should be made again with the current
            parameters.
    """
    if not h:
        raise ValueError("Hash cannot be empty")

    return _ph.check_needs_rehash(h)


class TokenNotAcceptable(Exception):
    """A token that is not to be trusted, or is not the kind asked for.

    Raised by every decoder here, whatever was wrong: a bad signature, a
    token that has run out or carries no expiry at all, an algorithm
    other than ours, something that is not a token, or a token of one
    kind offered where another is wanted. One error, so that a caller
    never needs the name of the library underneath.
    """


#: What each kind of token calls itself, in its ``type`` claim. A token
#: is read only as the kind it says it is, so one minted for one purpose
#: cannot be presented for another though all are signed with one key.
ACCESS_TYPE = "access"
REFRESH_TYPE = "refresh"
INVITE_TYPE = "invite"


def _read(tok: str, kind: str, not_that_kind: str) -> dict[str, Any]:
    """Check a token and hand back its claims, or refuse it.

    Its signature is checked against our secret, under our algorithm and
    no other, so the token does not get to choose how it is checked. It
    must carry an expiry and not have reached it. Then it must say it is
    the kind asked for.

    Args:
        tok: The token.
        kind: The ``type`` it must carry.
        not_that_kind: What to say of a good token of another kind.

    Raises:
        TokenNotAcceptable: For any of the above.
    """
    try:
        data: dict[str, Any] = jwt.decode(
            tok,
            settings.JWT_SECRET.get_secret_value(),
            algorithms=[settings.JWT_ALG],
            options={"require": ["exp"]},
        )
    except jwt.InvalidTokenError as err:
        raise TokenNotAcceptable("Token is not valid") from err

    if data.get("type") != kind:
        raise TokenNotAcceptable(not_that_kind)

    return data


def create_access_token(sub: str, token_version: int = 0) -> str:
    """Create JWT Access Token.

    Creates a short-lived JWT access token naming the user. The token is
    signed with HS256 and expires after ACCESS_TTL_MIN minutes (default:
    15). Used for authenticating API requests.

    It carries who the user is and nothing about what they may do. Roles
    and competencies are read from the database on every request, in
    ``get_current_user``, so a grant or a removal takes effect at once
    rather than at the next refresh; and a token that listed them would
    grow with every competency granted, towards the browser's limit on
    the size of a cookie.

    Args:
        sub: Subject (username) for the token.
        token_version: User's token version for session invalidation.

    Returns:
        str: Encoded JWT access token valid for ACCESS_TTL_MIN minutes.

    Raises:
        ValueError: If subject is empty.
    """
    # Defensive programming: validate inputs
    if not sub or not sub.strip():
        raise ValueError("Subject (username) cannot be empty")

    payload: dict[str, Any] = {
        "sub": sub,
        "type": ACCESS_TYPE,
        "tv": token_version,
        "exp": _now() + timedelta(minutes=settings.ACCESS_TTL_MIN),
    }

    return jwt.encode(
        payload,
        settings.JWT_SECRET.get_secret_value(),
        algorithm=settings.JWT_ALG,
    )


def create_refresh_token(sub: str, token_version: int = 0) -> str:
    """Create JWT Refresh Token.

    Creates a long-lived JWT refresh token used to obtain new access tokens
    without requiring the user to log in again. Expires after REFRESH_TTL_DAYS
    (default: 7 days). Stored in HTTP-only cookie with restricted path.

    Args:
        sub: Subject (username) for the token.
        token_version: User's token version for session invalidation.

    Returns:
        str: Encoded JWT refresh token valid for REFRESH_TTL_DAYS days.

    Raises:
        ValueError: If subject is empty.
    """
    if not sub or not sub.strip():
        raise ValueError("Subject (username) cannot be empty")

    payload: dict[str, Any] = {
        "sub": sub,
        "type": REFRESH_TYPE,
        "tv": token_version,
        "exp": _now() + timedelta(days=settings.REFRESH_TTL_DAYS),
    }

    return jwt.encode(
        payload,
        settings.JWT_SECRET.get_secret_value(),
        algorithm=settings.JWT_ALG,
    )


def decode_token(tok: str) -> dict[str, Any]:
    """Check an access token and hand back its claims.

    The token a request carries in its ``access_token`` cookie. A refresh
    token is not one: it lives seven days where this lives fifteen
    minutes, and is refused here though its signature is good.

    Args:
        tok: The token.

    Returns:
        The claims: ``sub`` (the username), ``tv`` and ``exp``.

    Raises:
        TokenNotAcceptable: If the token is not valid, or is not an
            access token.
    """
    return _read(tok, ACCESS_TYPE, "Not an access token")


def decode_refresh_token(tok: str) -> dict[str, Any]:
    """Check a refresh token and hand back its claims.

    The token in the ``refresh_token`` cookie, exchanged for a new
    access token. An access token is not one, and is refused here.

    Args:
        tok: The token.

    Returns:
        The claims: ``sub`` (the username), ``tv`` and ``exp``.

    Raises:
        TokenNotAcceptable: If the token is not valid, or is not a
            refresh token.
    """
    return _read(tok, REFRESH_TYPE, "Not a refresh token")


# CSRF (double-submit cookie)
_csrf = URLSafeSerializer(settings.JWT_SECRET.get_secret_value(), salt="csrf")


def make_csrf(sub: str) -> str:
    """Create CSRF Protection Token.

    Generates a CSRF token for protecting state-changing operations against
    cross-site request forgery attacks. The token is signed with the JWT_SECRET
    and tied to the user's identity. Must be included in X-CSRF-Token header
    for POST/PUT/PATCH/DELETE requests.

    Args:
        sub: Subject (username) to tie the token to.

    Returns:
        str: URL-safe CSRF token signed with JWT_SECRET.

    Raises:
        ValueError: If the subject is empty.
    """
    if not sub or not sub.strip():
        raise ValueError("Subject (username) cannot be empty")

    return _csrf.dumps({"sub": sub})


def verify_csrf(token: str, sub: str) -> bool:
    """Verify CSRF Token.

    Verifies a CSRF token matches the expected username. Used by the
    require_csrf dependency to protect state-changing operations. Returns
    False when the signature is bad or the subject is another user's.
    Only a bad signature is caught: anything else raised here is a fault
    in our code, and surfaces rather than reading as a wrong token.

    Args:
        token: CSRF token from X-CSRF-Token header.
        sub: Expected subject (username) from JWT.

    Returns:
        bool: True if token is valid and subject matches, False otherwise.
    """
    try:
        data = _csrf.loads(token)
    except BadSignature:
        return False
    if not isinstance(data, dict):
        return False

    signed_sub = data.get("sub")
    if not isinstance(signed_sub, str):
        return False

    return hmac.compare_digest(signed_sub.encode(), sub.encode())


def generate_totp_secret() -> str:
    """Generate TOTP Secret.

    Generates a new cryptographically random TOTP secret for two-factor
    authentication. The secret is Base32-encoded for compatibility with
    authenticator apps like Google Authenticator, Authy, etc.

    Returns:
        str: Base32-encoded secret (32 characters).
    """
    return pyotp.random_base32()


def verify_totp_code(secret: str, code: str) -> bool:
    """Verify TOTP Code.

    Verifies a 6-digit TOTP code against the user's secret. Uses RFC 6238
    time-based one-time password algorithm with 30-second time steps.
    Only the current time step is accepted: ``verify`` is called without
    ``valid_window``, and pyotp's default is 0, so a code from the step
    before or after is refused.

    Args:
        secret: Base32-encoded TOTP secret from database.
        code: 6-digit TOTP code from authenticator app.

    A secret that is not valid Base32 is refused rather than raised on:
    that is what pyotp throws for one, and nothing else is caught.

    Returns:
        bool: True if code is valid for current time window, False otherwise.
    """
    try:
        totp = pyotp.TOTP(secret)
        return totp.verify(code)
    except ValueError, binascii.Error:
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


def create_invite_token(
    patient_id: str,
    email: str,
    user_type: str,
    *,
    ttl_days: int = 7,
) -> str:
    """Create a JWT invite token for external user access.

    Args:
        patient_id: FHIR Patient resource ID.
        email: Invitee email address.
        user_type: ``external_hcp`` or ``patient_advocate``.
        ttl_days: Token validity in days (default 7).

    Returns:
        str: Signed JWT invite token.
    """
    if not patient_id or not patient_id.strip():
        raise ValueError("patient_id must be a non-empty string")
    if not email or not email.strip():
        raise ValueError("email must be a non-empty string")
    if user_type not in ("external_hcp", "patient_advocate"):
        raise ValueError(
            "user_type must be 'external_hcp' or 'patient_advocate'"
        )
    if ttl_days < 1 or ttl_days > 365:
        raise ValueError("ttl_days must be between 1 and 365")

    payload: dict[str, Any] = {
        "type": INVITE_TYPE,
        "patient_id": patient_id,
        "email": email,
        "user_type": user_type,
        "exp": _now() + timedelta(days=ttl_days),
    }

    return jwt.encode(
        payload,
        settings.JWT_SECRET.get_secret_value(),
        algorithm=settings.JWT_ALG,
    )


def decode_invite_token(tok: str) -> dict[str, Any]:
    """Decode and verify an invite JWT.

    Returns:
        dict: Payload with ``patient_id``, ``email``, ``user_type``.

    Raises:
        TokenNotAcceptable: If the token is not valid, or is not an
            invite.
    """
    return _read(tok, INVITE_TYPE, "Not an invite token")


# --- Passport assessor invite tokens ---
#
# Deliberately separate from ``create_invite_token`` above, which the
# passport plan first proposed extending. That function is built around a
# patient: ``patient_id`` is required, it is carried in every payload,
# and ``accept_invite`` reads it unconditionally to create an
# ``ExternalPatientAccess`` grant. A passport assessor invite has no
# patient at all - it concerns a trainee's competency - so extending it
# would mean making the patient optional and branching the code path that
# gates patient record sharing, for a caller sharing none of its logic.
#
# **Single use is not enforced here, and cannot be.** A JWT carries no
# record of having been spent. What makes a passport invite single-use is
# the ``passport_assessor_invite`` row: its ``token_hash`` identifies the
# invite and ``accepted_at`` records that it has been consumed. This
# function only makes a token that expires; the row decides whether it
# may still be used.

#: How long a passport assessor invite lasts. Fourteen days because a
#: consultant asked to sign something off may be on nights, on leave, or
#: simply slow to read email, and a link that dies over a fortnight's
#: annual leave means the holder has to ask twice.
PASSPORT_INVITE_TTL_DAYS = 14

#: Marks a passport invite apart from the patient-sharing invite above.
#: Checked on decode, so a token minted for one purpose cannot be
#: presented for the other even though both are signed with the same key.
PASSPORT_INVITE_TYPE = "passport_assessor_invite"


def create_passport_invite_token(
    invite_id: str,
    email: str,
    *,
    ttl_days: int = PASSPORT_INVITE_TTL_DAYS,
) -> str:
    """Create a signed invite for somebody asked to sign off a competency.

    Args:
        invite_id: The ``passport_assessor_invite`` row this token is for.
            The row, not the passport: the token says which invitation
            was issued, and the row says what it was for and whether it
            has been used. A passport id here would let one token be
            replayed against a passport rather than spent once.
        email: Who it was sent to. Checked on acceptance, so a forwarded
            link cannot be redeemed by whoever received it.
        ttl_days: How long it lasts, defaulting to a fortnight.

    Returns:
        The signed token.

    Raises:
        ValueError: If the invite id or email is empty, or the lifetime
            is outside one day to one year.
    """
    if not invite_id or not invite_id.strip():
        raise ValueError("invite_id must be a non-empty string")
    if not email or not email.strip():
        raise ValueError("email must be a non-empty string")
    if ttl_days < 1 or ttl_days > 365:
        raise ValueError("ttl_days must be between 1 and 365")

    payload: dict[str, Any] = {
        "type": PASSPORT_INVITE_TYPE,
        "invite_id": invite_id.strip(),
        "email": email.strip().lower(),
        "exp": _now() + timedelta(days=ttl_days),
    }

    return jwt.encode(
        payload,
        settings.JWT_SECRET.get_secret_value(),
        algorithm=settings.JWT_ALG,
    )


def decode_passport_invite_token(tok: str) -> dict[str, Any]:
    """Decode and verify a passport assessor invite.

    Args:
        tok: The token from the invite link.

    Returns:
        The payload, carrying ``invite_id`` and ``email``.

    Raises:
        TokenNotAcceptable: If the signature is wrong, the token has
            expired, or it is not a passport invite. A patient-sharing
            invite is signed with the same key and would otherwise
            decode cleanly here, so the type is checked rather than
            assumed.
    """
    return _read(
        tok, PASSPORT_INVITE_TYPE, "Not a passport assessor invite token"
    )


# --- Password reset tokens ---
_password_reset = URLSafeTimedSerializer(
    settings.JWT_SECRET.get_secret_value(), salt="password-reset"
)


class ResetClaims(NamedTuple):
    """What a password reset token says, once its signature is good."""

    email: str
    token_version: int


def create_password_reset_token(email: str, token_version: int) -> str:
    """Create a time-limited password reset token.

    Generates a signed, time-limited token tied to the user's email.
    The token expires after PASSWORD_RESET_TTL_MIN minutes (default 30).

    It also carries the user's ``token_version``. A signed token has no
    record of having been used, so on its own a reset link would work
    as often as it was opened inside its lifetime. Resetting the
    password moves ``token_version`` on, so a link that names the old
    one is spent: the reset route compares the two.

    Args:
        email: User's email address.
        token_version: The user's ``token_version`` when the link is
            made.

    Returns:
        str: URL-safe signed token.

    Raises:
        ValueError: If email is empty.
    """
    if not email or not email.strip():
        raise ValueError("Email cannot be empty")

    return _password_reset.dumps(
        {"email": email.strip().lower(), "tv": token_version}
    )


def verify_password_reset_token(token: str) -> ResetClaims | None:
    """Verify a password reset token and return what it says.

    Checks the token signature and expiry. Whether the link has been
    spent is the caller's to decide, by comparing ``token_version``
    with the user's.

    Args:
        token: Password reset token from email link.

    Returns:
        The email address and token version if valid, None if the
        token is tampered with, expired, or does not carry both.
    """
    try:
        data = _password_reset.loads(
            token, max_age=settings.PASSWORD_RESET_TTL_MIN * 60
        )
    except BadSignature:
        return None
    if not isinstance(data, dict):
        return None

    email = data.get("email")
    token_version = data.get("tv")
    if not isinstance(email, str) or not isinstance(token_version, int):
        return None

    return ResetClaims(email, token_version)


# --- Email verification tokens ---
_email_verify = URLSafeTimedSerializer(
    settings.JWT_SECRET.get_secret_value(), salt="email-verify"
)


def create_email_verify_token(email: str) -> str:
    """Create a time-limited email verification token.

    Args:
        email: User's email address.

    Returns:
        URL-safe signed token.

    Raises:
        ValueError: If email is empty.
    """
    if not email or not email.strip():
        raise ValueError("Email cannot be empty")

    return _email_verify.dumps({"email": email.strip().lower()})


def verify_email_verify_token(token: str) -> str | None:
    """Verify an email verification token and return the email.

    Args:
        token: Email verification token from email link.

    Returns:
        The email address if valid, None otherwise.
    """
    try:
        data: dict[str, str] = _email_verify.loads(
            token, max_age=settings.EMAIL_VERIFY_TTL_MIN * 60
        )
        return data.get("email")
    except BadSignature:
        return None


# --- Marketing unsubscribe links ---
# Signed and never timed, unlike the two above. A newsletter is read
# months after it was sent, and a link that has stopped working is an
# unsubscribe refused. It names the user by id, so the address is not in
# the link, and it opens one thing: that person's marketing preference.
_marketing_unsubscribe = URLSafeSerializer(
    settings.JWT_SECRET.get_secret_value(), salt="marketing-unsubscribe"
)


def _unsubscribe_token(key: str, value: int) -> str:
    """Sign an unsubscribe token naming one row by its id."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("An id must be a whole number")
    if value <= 0:
        raise ValueError("An id must be positive")

    return _marketing_unsubscribe.dumps({key: value})


def _unsubscribe_token_id(token: str, key: str) -> int | None:
    """The id an unsubscribe token names under *key*, if it is a good one."""
    try:
        data = _marketing_unsubscribe.loads(token)
    except BadSignature:
        return None
    if not isinstance(data, dict):
        return None

    value = data.get(key)

    if isinstance(value, bool) or not isinstance(value, int):
        return None

    return value if value > 0 else None


def create_marketing_unsubscribe_token(user_id: int) -> str:
    """Create the token an unsubscribe link carries, for an account holder.

    It does not expire. It can be used to read and change one person's
    marketing preference and nothing else.

    Args:
        user_id: The person the link is for.

    Returns:
        URL-safe signed token.

    Raises:
        ValueError: If the id is not a positive whole number.
    """
    return _unsubscribe_token("user_id", user_id)


def verify_marketing_unsubscribe_token(token: str) -> int | None:
    """Verify an account holder's unsubscribe token and return whose it is.

    Args:
        token: The token from the link.

    Returns:
        The user's id if the signature is good and the token names a
        user, None otherwise. A subscriber's token names no user.
    """
    return _unsubscribe_token_id(token, "user_id")


def create_subscriber_unsubscribe_token(subscriber_id: int) -> str:
    """Create the token an unsubscribe link carries, for a subscriber.

    A subscriber is somebody on the mailing list with no account. Their
    token is signed the same way as an account holder's and names a
    different kind of row, so neither can be read as the other.

    Args:
        subscriber_id: The ``newsletter_subscriber`` row the link is for.

    Returns:
        URL-safe signed token.

    Raises:
        ValueError: If the id is not a positive whole number.
    """
    return _unsubscribe_token("subscriber_id", subscriber_id)


def verify_subscriber_unsubscribe_token(token: str) -> int | None:
    """Verify a subscriber's unsubscribe token and return whose it is.

    Args:
        token: The token from the link.

    Returns:
        The subscriber's id if the signature is good and the token names
        a subscriber, None otherwise.
    """
    return _unsubscribe_token_id(token, "subscriber_id")
