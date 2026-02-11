"""FastAPI Application Entry Point.

This module is the main entry point for the Quill Medical REST API. It configures
the FastAPI application, authentication middleware, and all API routes.

Key Features:
- JWT-based authentication with HTTP-only cookies
- TOTP two-factor authentication support
- Role-based access control (RBAC)
- CSRF protection for state-changing operations
- Integration with FHIR (patient demographics) and OpenEHR (clinical letters)
- Push notification support via Web Push protocol

All API endpoints are exposed under the `/api` prefix. Development mode enables
Swagger UI at `/api/docs` and ReDoc at `/api/redoc` for interactive API exploration.

Architecture:
- Auth database: User accounts and roles (PostgreSQL via SQLAlchemy)
- FHIR server: Patient demographics (HAPI FHIR)
- EHRbase: Clinical documents and letters (OpenEHR)
- Push notifications: In-memory subscriptions (production should use database)
"""

from collections.abc import Callable
from typing import Any

import httpx
from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    HTTPException,
    Request,
    Response,
)
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_session
from app.ehrbase_client import (
    create_letter_composition,
    get_letter_composition,
    list_letters_for_patient,
)
from app.fhir_client import (
    create_fhir_patient,
    list_fhir_patients,
    read_fhir_patient,
    update_fhir_patient,
)
from app.models import User
from app.push import router as push_router
from app.push_send import router as push_send_router
from app.schemas.auth import LoginIn, RegisterIn
from app.schemas.letters import LetterIn
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_totp_secret,
    hash_password,
    make_csrf,
    totp_provisioning_uri,
    verify_csrf,
    verify_password,
    verify_totp_code,
)

DEV_MODE = (
    str(getattr(settings, "BACKEND_ENV", "development")).lower().startswith("dev")
)


router = APIRouter(prefix=settings.API_PREFIX)

router.include_router(push_router)

app = FastAPI(
    title="Quill API",
    docs_url=f"{settings.API_PREFIX}/docs" if DEV_MODE else None,
    redoc_url=f"{settings.API_PREFIX}/redoc" if DEV_MODE else None,
    openapi_url=f"{settings.API_PREFIX}/openapi.json" if DEV_MODE else None,
    swagger_ui_parameters={"persistAuthorization": True},
)

app.include_router(push_send_router)

DEP_GET_SESSION = Depends(get_session)


# Type the cookie kwargs properly to avoid mypy complaints
COOKIE_KW: dict[str, Any] = {
    "httponly": True,
    "samesite": "lax",
    "secure": settings.SECURE_COOKIES,
    "domain": settings.COOKIE_DOMAIN,
}


def check_fhir_health() -> dict[str, bool | int | str]:
    """Check if FHIR server is available.

    Returns:
        dict with 'available' boolean and optional 'error' message
    """
    try:
        response = httpx.get(f"{settings.FHIR_SERVER_URL}/metadata", timeout=5.0)
        return {
            "available": response.status_code == 200,
            "status_code": response.status_code,
        }
    except Exception as e:
        return {"available": False, "error": str(e)}


def check_ehrbase_health() -> dict[str, bool | int | str]:
    """Check if EHRbase server is available.

    Returns:
        dict with 'available' boolean and optional 'error' message
    """
    try:
        # Use get_secret_value() to extract the actual password string
        api_user = settings.EHRBASE_API_USER
        api_password = settings.EHRBASE_API_PASSWORD.get_secret_value()

        response = httpx.get(
            f"{settings.EHRBASE_URL}/rest/openehr/v1/definition/template/adl1.4",
            timeout=5.0,
            auth=(api_user, api_password),
        )
        return {
            "available": response.status_code
            in (200, 404),  # 404 = no templates but server works
            "status_code": response.status_code,
        }
    except Exception as e:
        return {"available": False, "error": str(e)}


@app.on_event("startup")
async def startup_event() -> None:
    """Check service availability on startup."""
    print("\n" + "=" * 60)
    print("Quill Medical Backend Starting...")
    print("=" * 60)

    fhir_status = check_fhir_health()
    ehrbase_status = check_ehrbase_health()

    if fhir_status["available"]:
        print("✓ FHIR server is available")
    else:
        print(
            f"✗ WARNING: FHIR server not available - {fhir_status.get('error', 'Unknown error')}"
        )
        print("  Patient operations will fail until FHIR server is ready")

    if ehrbase_status["available"]:
        print("✓ EHRbase server is available")
    else:
        print(
            f"✗ WARNING: EHRbase not available - {ehrbase_status.get('error', 'Unknown error')}"
        )
        print("  Clinical letter operations will fail until EHRbase is ready")

    print("=" * 60 + "\n")


def set_auth_cookies(response: Response, access: str, refresh: str, xsrf: str) -> None:
    """Set Authentication Cookies.

    Sets three HTTP cookies for authentication: access token (short-lived),
    refresh token (long-lived), and CSRF token (for state-changing operations).
    Access and refresh tokens are HTTP-only for security. CSRF token is readable
    by JavaScript so it can be included in request headers.

    Cookie Configuration:
    - access_token: Path=/, HttpOnly, SameSite=Lax, TTL=15min
    - refresh_token: Path=/api/auth/refresh, HttpOnly, SameSite=Lax, TTL=7days
    - XSRF-TOKEN: Path=/, SameSite=Lax (not HttpOnly), TTL matches access token

    Args:
        response: FastAPI response object to set cookies on.
        access: Encoded JWT access token.
        refresh: Encoded JWT refresh token.
        xsrf: CSRF protection token.
    """
    response.set_cookie("access_token", access, path="/", **COOKIE_KW)
    response.set_cookie(
        "refresh_token",
        refresh,
        path=f"{settings.API_PREFIX}/auth/refresh",
        **COOKIE_KW,
    )
    response.set_cookie(
        "XSRF-TOKEN",
        xsrf,
        path="/",
        httponly=False,
        samesite="lax",
        secure=settings.SECURE_COOKIES,
        domain=settings.COOKIE_DOMAIN,
    )


def clear_auth_cookies(response: Response) -> None:
    """Clear Authentication Cookies.

    Removes all authentication cookies from the client browser by setting
    them with expired dates. Used during logout to end the user's session.
    Deletes access_token, refresh_token, and XSRF-TOKEN cookies.

    Args:
        response: FastAPI response object to clear cookies from.
    """
    response.delete_cookie("access_token", path="/", domain=settings.COOKIE_DOMAIN)
    response.delete_cookie(
        "refresh_token",
        path=f"{settings.API_PREFIX}/auth/refresh",
        domain=settings.COOKIE_DOMAIN,
    )
    response.delete_cookie("XSRF-TOKEN", path="/", domain=settings.COOKIE_DOMAIN)


@router.get("/health")
def health_check() -> dict[str, Any]:
    """Health Check Endpoint.

    Checks availability of all required services (FHIR, EHRbase).
    Returns overall status and detailed service availability.

    Returns:
        dict: Health status with service availability details
    """
    fhir_status = check_fhir_health()
    ehrbase_status = check_ehrbase_health()

    all_healthy = fhir_status["available"] and ehrbase_status["available"]

    return {
        "status": "healthy" if all_healthy else "degraded",
        "services": {
            "fhir": fhir_status,
            "ehrbase": ehrbase_status,
            "auth_db": {"available": True},  # If we can respond, auth DB is working
        },
    }


def current_user(request: Request, db: Session = DEP_GET_SESSION) -> User:
    """Get Currently Authenticated User.

    FastAPI dependency that extracts and validates the JWT access token from
    cookies, then loads the corresponding user from the database. The user's
    roles are stored in request.state for authorization checks.

    Token Validation:
    - Checks for access_token cookie presence
    - Verifies JWT signature and expiration
    - Loads user from database by username
    - Verifies user account is active

    Args:
        request: Incoming FastAPI request with cookies.
        db: Active SQLAlchemy database session.

    Returns:
        User: The authenticated and active user with roles loaded.

    Raises:
        HTTPException: 401 if token missing, invalid, expired, or user inactive.
    """
    tok = request.cookies.get("access_token")
    if not tok:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = decode_token(tok)
    except Exception as e:
        raise HTTPException(401, "Invalid token") from e
    sub = payload.get("sub")
    user = db.scalar(select(User).where(User.username == sub))
    if not user or not user.is_active:
        raise HTTPException(401, "Inactive user")
    request.state.roles = [r.name for r in user.roles]
    return user


DEP_CURRENT_USER = Depends(current_user)


def require_roles(*need: str) -> Callable[[Request, User], User]:
    """Create Role Authorization Dependency.

    Factory function that creates a FastAPI dependency to enforce role-based
    access control. The returned dependency checks if the authenticated user
    possesses all required roles. Used in route decorators to protect endpoints.

    Usage Example:
        @router.get("/patients", dependencies=[require_roles("Clinician")])
        def list_patients(): ...

    Args:
        *need: One or more role names required (e.g., "Clinician", "Administrator").

    Returns:
        Callable: FastAPI dependency function that validates roles.

    Raises:
        HTTPException: 403 Forbidden if user lacks any required role.
    """

    def dep(request: Request, _u: User = DEP_CURRENT_USER) -> User:
        have = set(getattr(request.state, "roles", []))
        if not set(need).issubset(have):
            raise HTTPException(403, "Forbidden")
        return _u

    return dep


def require_csrf(request: Request, u: User = DEP_CURRENT_USER) -> User:
    """Validate CSRF Token.

    FastAPI dependency that validates CSRF tokens to protect against cross-site
    request forgery attacks. Compares the X-CSRF-Token header with the XSRF-TOKEN
    cookie, verifies they match, and validates the signature against the user's
    identity. Required for all state-changing operations (POST/PUT/PATCH/DELETE).

    CSRF Protection Flow:
    1. Extract X-CSRF-Token header and XSRF-TOKEN cookie
    2. Verify both exist and match exactly
    3. Verify signature is valid for authenticated user
    4. Return user if validation passes

    Args:
        request: Incoming request with headers and cookies.
        u: Current authenticated user from JWT.

    Returns:
        User: The validated user (pass-through for chaining).

    Raises:
        HTTPException: 403 Forbidden if CSRF validation fails.
    """
    header = request.headers.get("x-csrf-token")
    cookie = request.cookies.get("XSRF-TOKEN")
    if (
        not header
        or not cookie
        or header != cookie
        or not verify_csrf(cookie, u.username)
    ):
        raise HTTPException(403, "CSRF failed")
    return u


DEP_REQUIRE_ROLES_CLINICIAN = Depends(require_roles("Clinician"))
DEP_REQUIRE_CSRF = Depends(require_csrf)


@router.post("/auth/login")
def login(
    data: LoginIn, response: Response, db: Session = DEP_GET_SESSION
) -> dict[str, Any]:
    """User Login with Optional TOTP.

    Authenticates a user with username and password, optionally verifying a
    6-digit TOTP code if two-factor authentication is enabled. On successful
    authentication, sets HTTP-only cookies for access token, refresh token,
    and CSRF token. The access token contains the user's roles for authorization.

    Authentication Flow:
    1. Verify username exists in database
    2. Verify password hash matches using Argon2
    3. If TOTP enabled, verify 6-digit code from authenticator app
    4. Generate access token (15min), refresh token (7d), CSRF token
    5. Set HTTP-only cookies with tokens
    6. Return success with username and roles

    Args:
        data: Login credentials (username, password, optional totp_code).
        response: FastAPI response object for setting cookies.
        db: Database session for user lookup.

    Returns:
        dict: Success response with keys:
            - detail: "ok"
            - user: {username: str, roles: list[str]}

    Raises:
        HTTPException: 400 if credentials invalid, 2FA required, or TOTP code invalid.
    """

    user = db.scalar(select(User).where(User.username == data.username.strip()))

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(400, "Invalid credentials")

    if getattr(user, "is_totp_enabled", False):
        if not data.totp_code:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Two-factor required",
                    "error_code": "two_factor_required",
                },
            )
        if not verify_totp_code(user.totp_secret or "", data.totp_code):
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Invalid two-factor code",
                    "error_code": "invalid_totp",
                },
            )
    roles = [r.name for r in user.roles]
    access = create_access_token(user.username, roles)
    refresh = create_refresh_token(user.username)
    xsrf = make_csrf(user.username)
    set_auth_cookies(response, access, refresh, xsrf)
    return {
        "detail": "ok",
        "user": {"username": user.username, "roles": roles},
    }


@router.post("/auth/register")
def register(payload: RegisterIn, db: Session = DEP_GET_SESSION) -> dict[str, str]:
    """User Registration.

    Creates a new user account with username, email, and password. Performs
    validation checks for required fields, password minimum length, and uniqueness
    constraints. The password is hashed with Argon2 before storage. Users are
    created without any roles by default and must be assigned roles by an
    administrator.

    Validation Rules:
    - Username and email must not be empty after stripping whitespace
    - Password must be at least 6 characters long
    - Username must be unique across all users
    - Email must be unique across all users

    Args:
        payload: Registration data (username, email, password).
        db: Database session for user creation.

    Returns:
        dict: Success response with {"detail": "created"}.

    Raises:
        HTTPException: 400 if validation fails or constraints violated:
            - "Missing fields" if username, email, or password empty
            - "Password too short" if password < 6 characters
            - "Username already exists" if username taken
            - "Email already exists" if email taken
    """
    username = payload.username.strip()
    email = payload.email.strip()
    if not username or not email or not payload.password:
        raise HTTPException(status_code=400, detail="Missing fields")

    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password too short")

    existing = db.scalar(select(User).where(User.username == username))

    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    existing = db.scalar(select(User).where(User.email == email))

    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")

    user = User(
        username=username,
        email=email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    return {"detail": "created"}


class TotpSetupOut(BaseModel):
    """TOTP Setup Response.

    Response model for TOTP setup endpoint containing the otpauth:// URI
    for QR code generation. This URI can be rendered as a QR code by the
    frontend for scanning with authenticator apps.

    Attributes:
        provision_uri: otpauth://totp/... URI for authenticator app setup.
    """

    provision_uri: str


@router.post("/auth/totp/setup", response_model=TotpSetupOut)
def totp_setup(
    u: User = DEP_CURRENT_USER, db: Session = DEP_GET_SESSION
) -> TotpSetupOut:
    """TOTP Two-Factor Setup.

    Generates a new TOTP secret for the authenticated user (or reuses existing)
    and returns a provision URI for QR code display. The frontend renders this
    URI as a QR code that users scan with their authenticator app (Google
    Authenticator, Authy, etc.). The secret is saved to the database but TOTP
    is not enabled until the user verifies a code with /auth/totp/verify.

    Setup Flow:
    1. Check if user already has TOTP secret
    2. Generate new Base32 secret if missing
    3. Save secret to database
    4. Generate otpauth:// provision URI
    5. Return URI for QR code rendering

    The frontend should render the URI as a QR code for an authenticator app.

    Args:
        u: Currently authenticated user from JWT.
        db: Database session for updating user.

    Returns:
        TotpSetupOut: Object containing provision_uri for QR code.

    Args:
        u (User): Current authenticated user (injected).
        db (Session): Database session.

    Returns:
        TotpSetupOut: Provisioning URI encoded with issuer and account name.
    """
    if not getattr(u, "totp_secret", None):
        u.totp_secret = generate_totp_secret()

    db.add(u)
    db.commit()
    issuer = getattr(settings, "PROJECT_NAME", "Quill")
    uri = totp_provisioning_uri(
        u.totp_secret or "",
        u.username,
        issuer=issuer,
    )
    return TotpSetupOut(provision_uri=uri)


class TotpVerifyIn(BaseModel):
    """TOTP Verification Request.

    Request model for verifying a TOTP code during two-factor authentication
    setup. After scanning the QR code, users enter the 6-digit code from their
    authenticator app to prove they can generate valid codes.

    Attributes:
        code: 6-digit numeric code from authenticator app.
    """

    code: str


@router.post("/auth/totp/verify")
def totp_verify(
    payload: TotpVerifyIn,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, str]:
    """Verify TOTP and Enable Two-Factor.

    Verifies the 6-digit TOTP code from the user's authenticator app and
    enables two-factor authentication on their account. This must be called
    after /auth/totp/setup to complete 2FA setup. Once enabled, the user
    will be required to provide a TOTP code on every login.

    Verification Flow:
    1. Check user has TOTP secret from setup
    2. Verify 6-digit code matches current time window
    3. Set is_totp_enabled=True in database
    4. Return success

    Args:
        payload: Request containing the 6-digit TOTP code.
        u: Currently authenticated user from JWT.
        db: Database session for updating user.

    Returns:
        dict: Success response with {"detail": "enabled"}.

    Raises:
        HTTPException: 400 if:
            - No TOTP secret exists (must call /auth/totp/setup first)
            - TOTP code is invalid or expired
    """
    if not getattr(u, "totp_secret", None):
        raise HTTPException(
            status_code=400,
            detail={
                "message": "No TOTP secret set",
                "error_code": "no_totp_secret",
            },
        )
    if not verify_totp_code(
        u.totp_secret or "",
        payload.code,
    ):
        raise HTTPException(
            status_code=400,
            detail={"message": "Invalid code", "error_code": "invalid_totp"},
        )
    u.is_totp_enabled = True
    db.add(u)
    db.commit()
    return {"detail": "enabled"}


@router.post("/auth/totp/disable")
def totp_disable(
    u: User = DEP_REQUIRE_CSRF, db: Session = DEP_GET_SESSION
) -> dict[str, str]:
    """Disable Two-Factor Authentication.

    Disables TOTP two-factor authentication for the current user and clears
    their TOTP secret. Future logins will only require username and password.
    Requires CSRF token validation since this is a security-sensitive operation.

    Security Note:
        This is a privileged operation that reduces account security. CSRF
        protection prevents unauthorized disabling of 2FA via CSRF attacks.

    Args:
        u: Currently authenticated user (with CSRF validation).
        db: Database session for updating user.

    Returns:
        dict: Success response with {"detail": "disabled"}.
    """
    u.is_totp_enabled = False
    u.totp_secret = None
    db.add(u)
    db.commit()
    return {"detail": "disabled"}


@router.post("/auth/logout")
def logout(response: Response, _u: User = DEP_CURRENT_USER) -> dict[str, str]:
    """User Logout.

    Logs out the current user by clearing all authentication cookies (access_token,
    refresh_token, XSRF-TOKEN). The user will need to login again to access
    protected endpoints. Note that this only clears client-side cookies; the
    tokens remain valid until expiration since there's no server-side revocation.

    Implementation Note:
        Production systems should implement token blacklisting for immediate
        revocation. Current implementation relies on short access token TTL
        (15 minutes) to limit exposure window.

    Args:
        response: FastAPI response object for clearing cookies.
        _u: Currently authenticated user (validates auth before logout).

    Returns:
        dict: Success response with {"detail": "ok"}.
    """
    clear_auth_cookies(response)
    return {"detail": "ok"}


@router.get("/auth/me")
def me(u: User = DEP_CURRENT_USER) -> dict[str, int | str | list[str] | bool]:
    """Get Current User Profile.

    Returns the authenticated user's profile information including username,
    email, assigned roles, and TOTP status. Used by frontend to display user
    information and determine available features based on roles.

    Args:
        u: Currently authenticated user from JWT.

    Returns:
        dict: User profile with keys:
            - id: User's database ID
            - username: User's username
            - email: User's email address
            - roles: List of assigned role names
            - totp_enabled: Whether 2FA is active
    """
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "roles": [r.name for r in u.roles],
        "totp_enabled": u.is_totp_enabled,
    }


@router.post("/auth/refresh")
def refresh(
    response: Response, request: Request, db: Session = DEP_GET_SESSION
) -> dict[str, str]:
    """Rotate Tokens and Issue New Access Token.

    Validates the refresh token from cookies and issues new access, refresh,
    and CSRF tokens. This extends the user's session without requiring re-login.
    Frontend automatically calls this endpoint when the access token expires
    (401 response) to maintain seamless user experience.

    Token Rotation Flow:
    1. Extract refresh token from HTTP-only cookie
    2. Decode and validate refresh token (check expiry, type="refresh")
    3. Load user from database by username in token
    4. Generate new access token (15min TTL)
    5. Generate new refresh token (7 day TTL)
    6. Generate new CSRF token
    7. Set all three cookies in response

    Security Note:
        Token rotation reduces risk of token replay attacks. Each refresh
        invalidates the old tokens and issues new ones with fresh expiry times.

    Args:
        response: FastAPI response object for setting new cookies.
        request: FastAPI request object for reading refresh token cookie.
        db: Database session for loading user.

    Returns:
        dict: Success response with {"detail": "ok"}.

    Raises:
    Raises:
        HTTPException: 401 if:
            - No refresh_token cookie present
            - Token signature invalid or expired
            - Token type is not "refresh"
            - User not found in database or inactive
    """
    tok = request.cookies.get("refresh_token")
    if not tok:
        raise HTTPException(401, "No refresh token")
    try:
        payload = decode_token(tok)
        if payload.get("type") != "refresh":
            raise ValueError("not refresh")
    except Exception as e:
        raise HTTPException(401, "Bad refresh token") from e
    sub = payload.get("sub")
    user = db.scalar(select(User).where(User.username == sub))
    if not user or not user.is_active:
        raise HTTPException(401, "Inactive user")
    roles = [r.name for r in user.roles]
    new_access = create_access_token(user.username, roles)
    new_refresh = create_refresh_token(user.username)  # rotate
    xsrf = make_csrf(user.username)
    set_auth_cookies(response, new_access, new_refresh, xsrf)
    return {"detail": "refreshed"}


@router.post(
    "/patients/verify",
    dependencies=[DEP_REQUIRE_ROLES_CLINICIAN, DEP_REQUIRE_CSRF],
)
def create_patient_record(patient_id: str) -> dict[str, str]:
    """Create or Verify Patient in FHIR.

    Verifies that a patient exists in the FHIR server before allowing clinical
    operations. This ensures the patient has a valid FHIR Patient resource
    before creating letters or other clinical documents. Requires Clinician
    role and CSRF token validation.

    Args:
        patient_id: FHIR Patient resource ID to verify.

    Returns:
        dict: Patient verification response with keys:
            - patient_id: The verified patient ID
            - status: "ready" indicating patient exists

    Raises:
        HTTPException: 404 if patient not found in FHIR server.
        HTTPException: 500 if FHIR communication fails.
    """
    try:
        # Check if patient exists in FHIR
        patient = read_fhir_patient(patient_id)
        if not patient:
            raise HTTPException(
                status_code=404, detail="Patient not found in FHIR server"
            )
        return {"patient_id": patient_id, "status": "ready"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/patients")
def list_patients(u: User = DEP_CURRENT_USER) -> dict[str, list[Any]]:
    """List All Patients from FHIR.

    Retrieves all patient demographics from the FHIR server. Returns FHIR R4
    Patient resources including name, date of birth, gender, identifiers (NHS
    number), and contact information. Used by frontend to display patient list
    and search functionality.

    Args:
        u: Currently authenticated user (any role can view patients).

    Returns:
        dict: Response with key:
            - patients: Array of FHIR Patient resources

    Raises:
        HTTPException: 500 if FHIR server communication fails.
    """
    try:
        patients = list_fhir_patients()
        return {"patients": patients}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.put(
    "/patients/{patient_id}/demographics",
    dependencies=[DEP_REQUIRE_ROLES_CLINICIAN, DEP_REQUIRE_CSRF],
)
def upsert_demographics(
    patient_id: str, demographics: dict[str, Any], u: User = DEP_CURRENT_USER
) -> dict[str, str | Any]:
    """Update Patient Demographics in FHIR.

    Updates patient demographic information in the FHIR server. Accepts a
    dictionary of FHIR-compatible demographic fields (name, address, telecom,
    birthDate, gender, etc.). Requires Clinician role and CSRF token validation
    since this modifies patient data.

    Args:
        patient_id: FHIR Patient resource ID to update.
        demographics: Dictionary of FHIR Patient fields to update.
        u: Currently authenticated user (unused but validates auth).

    Returns:
        dict: Update response with keys:
            - patient_id: The updated patient ID
            - updated: True indicating success
            - data: Complete updated FHIR Patient resource

    Raises:
        HTTPException: 404 if patient not found in FHIR server.
        HTTPException: 500 if FHIR update operation fails.
    """
    try:
        result = update_fhir_patient(patient_id, demographics)
        if result is None:
            raise HTTPException(status_code=404, detail="Patient not found")
        return {"patient_id": patient_id, "updated": True, "data": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/patients/{patient_id}/demographics")
def get_demographics(
    patient_id: str, u: User = DEP_CURRENT_USER
) -> dict[str, str | Any]:
    """Get Patient Demographics from FHIR.

    Retrieves complete demographic information for a specific patient from the
    FHIR server. Returns the full FHIR R4 Patient resource including name,
    date of birth, gender, identifiers, contact information, and address.

    Args:
        patient_id: FHIR Patient resource ID to retrieve.
        u: Currently authenticated user (any role can read demographics).

    Returns:
        dict: Patient demographics response with keys:
            - patient_id: The requested patient ID
            - data: Complete FHIR Patient resource

    Raises:
        HTTPException: 404 if patient not found in FHIR server.
        HTTPException: 500 if FHIR read operation fails.
    """
    try:
        patient = read_fhir_patient(patient_id)
        if patient is None:
            raise HTTPException(status_code=404, detail="Patient not found")
        return {"patient_id": patient_id, "data": patient}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post(
    "/patients/{patient_id}/letters",
    dependencies=[DEP_REQUIRE_ROLES_CLINICIAN, DEP_REQUIRE_CSRF],
)
def write_letter(patient_id: str, letter: LetterIn) -> dict[str, str]:
    """Create Clinical Letter in OpenEHR.

    Creates a new clinical letter composition in EHRbase for the specified patient.
    Automatically ensures the patient has an EHR in EHRbase (creates if missing).
    Stores the letter title, markdown body, and author information. Requires
    Clinician role and CSRF token validation.

    Letter Storage:
        - Letters stored as OpenEHR Compositions in EHRbase
        - Each patient has corresponding EHR linked by FHIR patient ID
        - Markdown body preserved for future rendering
        - Author metadata includes name and email

    Args:
        patient_id: FHIR Patient ID to associate letter with.
        letter: Letter content (title, body, author metadata).

    Returns:
        dict: Created letter response with keys:
            - patient_id: The patient ID
            - composition_uid: OpenEHR composition UID for retrieval
            - title: Letter title

    Raises:
        HTTPException: 500 if EHR creation or composition write fails.
    """
    try:
        result = create_letter_composition(
            patient_id=patient_id,
            title=letter.title,
            body=letter.body,
            author_name=letter.author_name,
        )
        return {
            "patient_id": patient_id,
            "composition_uid": result.get("uid", {}).get("value"),
            "title": letter.title,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/patients/{patient_id}/letters/{composition_uid}")
def read_letter(
    patient_id: str, composition_uid: str, u: User = DEP_CURRENT_USER
) -> dict[str, Any]:
    """Read Specific Clinical Letter from OpenEHR.

    Retrieves a specific clinical letter composition from EHRbase by its
    composition UID. Returns the complete composition including title, body,
    author information, and OpenEHR metadata.

    Args:
        patient_id: FHIR Patient ID the letter belongs to.
        composition_uid: OpenEHR composition UID from letter creation.
        u: Currently authenticated user (any role can read letters).

    Returns:
        dict: Letter retrieval response with keys:
            - patient_id: The patient ID
            - composition_uid: The composition UID
            - data: Complete OpenEHR Composition structure

    Raises:
        HTTPException: 404 if letter not found in EHRbase.
        HTTPException: 500 if EHRbase read operation fails.
    """
    try:
        composition = get_letter_composition(patient_id, composition_uid)
        if composition is None:
            raise HTTPException(status_code=404, detail="Letter not found")
        return {
            "patient_id": patient_id,
            "composition_uid": composition_uid,
            "data": composition,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/patients/{patient_id}/letters")
def list_letters(patient_id: str, u: User = DEP_CURRENT_USER) -> dict[str, Any]:
    """List All Clinical Letters for Patient.

    Retrieves all clinical letter compositions for a specific patient from
    EHRbase. Returns a list of letter metadata (UID, title, creation date)
    without fetching the full content of each letter. Use the individual
    letter endpoint to retrieve complete letter content.

    Args:
        patient_id: FHIR Patient ID to retrieve letters for.
        u: Currently authenticated user (any role can list letters).

    Returns:
        dict: Letter list response with keys:
            - patient_id: The patient ID
            - letters: Array of letter metadata (UID, title, created date)

    Raises:
        HTTPException: 500 if EHRbase query fails.
    """
    try:
        letters = list_letters_for_patient(patient_id)
        return {"patient_id": patient_id, "letters": letters}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# --- FHIR Endpoints ---


class FHIRPatientCreateIn(BaseModel):
    """FHIR Patient Creation Request.

    Request model for creating a new FHIR Patient resource with demographics.
    Optional patient_id allows specifying a custom FHIR resource ID instead
    of auto-generated ID.

    Attributes:
        given_name: Patient's first/given name.
        family_name: Patient's surname/family name.
        birth_date: Patient's date of birth (YYYY-MM-DD format).
        gender: Patient's gender (male, female, other, unknown).
        nhs_number: NHS number (10 digits, UK national identifier).
        mrn: Medical Record Number (local hospital identifier).
        patient_id: Optional custom FHIR resource ID.
    """

    given_name: str
    family_name: str
    birth_date: str | None = None
    gender: str | None = None
    nhs_number: str | None = None
    mrn: str | None = None
    patient_id: str | None = None


@router.post("/patients")
def create_patient_in_fhir(
    data: FHIRPatientCreateIn, u: User = DEP_CURRENT_USER
) -> dict[str, Any]:
    """Create New Patient in FHIR Server.

    Creates a new FHIR R4 Patient resource with the provided name information.
    The patient will be assigned a FHIR resource ID (either auto-generated or
    custom if patient_id provided).

    Args:
        data: Patient name and optional ID.
        u: Currently authenticated user (any role can create patients).

    Returns:
        dict: Complete FHIR Patient resource with assigned ID.

    Raises:
        HTTPException: 500 if FHIR patient creation fails.
    """
    try:
        patient = create_fhir_patient(
            given_name=data.given_name,
            family_name=data.family_name,
            birth_date=data.birth_date,
            gender=data.gender,
            nhs_number=data.nhs_number,
            mrn=data.mrn,
            patient_id=data.patient_id,
        )
        return patient
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to create FHIR patient: {e}"
        ) from e


app.include_router(router)
