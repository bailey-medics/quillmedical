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

import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import httpx
from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    HTTPException,
    Request,
    Response,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.cbac.decorators import has_competency
from app.config import settings
from app.db import get_session
from app.ehrbase_client import (
    create_letter_composition,
    get_letter_composition,
    list_letters_for_patient,
)
from app.fhir_client import (
    FhirCommunicationError,
    create_fhir_patient,
    list_fhir_patients,
    read_fhir_patient,
    update_fhir_patient,
)
from app.logging_config import setup_logging
from app.messaging import (
    add_participant,
    create_conversation,
    get_conversation_detail,
    join_conversation,
    list_conversations,
    list_patient_conversations,
    mark_conversation_read,
    send_message,
)
from app.models import (
    Conversation,
    ExternalPatientAccess,
    OrganisationFeature,
    Organization,
    PatientMetadata,
    User,
    organisation_patient_member,
    organisation_staff_member,
)
from app.organisations import (
    get_accessible_patient_ids,
    get_org_staff_ids,
    get_patient_org_ids,
    get_shared_org_ids,
)
from app.push import router as push_router
from app.push_send import router as push_send_router
from app.schemas.auth import LoginIn, RegisterIn
from app.schemas.cbac import (
    PrescriptionRequest,
    UpdateCompetenciesRequest,
    UserCompetenciesResponse,
)
from app.schemas.features import FeatureOut, FeatureToggleIn
from app.schemas.letters import LetterIn
from app.schemas.messaging import (
    AcceptInviteIn,
    AddParticipantIn,
    ConversationCreateIn,
    ConversationDetailOut,
    ConversationListOut,
    ConversationOut,
    ConversationStatusUpdateIn,
    InviteExternalIn,
    MessageCreateIn,
    MessageOut,
    ParticipantOut,
)
from app.security import (
    create_invite_token,
    create_jwt_with_competencies,
    create_refresh_token,
    decode_invite_token,
    decode_token,
    generate_totp_secret,
    hash_password,
    make_csrf,
    totp_provisioning_uri,
    verify_csrf,
    verify_password,
    verify_totp_code,
)
from app.system_permissions.permissions import is_external_user

setup_logging()
logger = logging.getLogger(__name__)

DEV_MODE = settings.BACKEND_ENV.lower().startswith("dev")


router = APIRouter(prefix=settings.API_PREFIX)

router.include_router(push_router)

app = FastAPI(
    title="Quill API",
    docs_url=f"{settings.API_PREFIX}/docs" if DEV_MODE else None,
    redoc_url=f"{settings.API_PREFIX}/redoc" if DEV_MODE else None,
    openapi_url=f"{settings.API_PREFIX}/openapi.json" if DEV_MODE else None,
    swagger_ui_parameters={"persistAuthorization": True},
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)

# --- Rate limiting (slowapi) ---
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# --- Request logging middleware ---
@app.middleware("http")
async def log_requests(
    request: Request,
    call_next: Callable,  # type: ignore[type-arg]
) -> Response:
    """Log every request with timing, method, path, and status."""
    request_id = uuid4().hex[:12]
    start = time.monotonic()
    response: Response = await call_next(request)
    elapsed_ms = round((time.monotonic() - start) * 1000, 1)

    logger.info(
        "%s %s %s %.1fms",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
        extra={
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": elapsed_ms,
            "client_ip": request.client.host if request.client else None,
        },
    )
    return response


app.include_router(push_send_router)

DEP_GET_SESSION = Depends(get_session)


# Type the cookie kwargs properly to avoid mypy complaints
COOKIE_KW: dict[str, Any] = {
    "httponly": True,
    "samesite": "lax",
    "secure": settings.SECURE_COOKIES,
    "domain": settings.COOKIE_DOMAIN,
}


def require_clinical_services() -> None:
    """FastAPI dependency: raises 503 when FHIR/EHRbase are disabled."""
    if not settings.CLINICAL_SERVICES_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Clinical services are not available in this deployment",
        )


DEP_REQUIRE_CLINICAL = Depends(require_clinical_services)


def check_fhir_health() -> dict[str, bool | int | str]:
    """Check if FHIR server is available and ready to serve data.

    Tests actual patient data access rather than just metadata endpoint,
    since HAPI FHIR can return metadata before it's ready to serve resources.

    Safety-critical: This determines whether frontend shows "Database initialising"
    vs "No patients to show". False positive could cause clinical staff to think
    database is empty when it's still loading.

    Returns:
        dict with 'available' boolean and optional 'error' message
    """
    if not settings.CLINICAL_SERVICES_ENABLED:
        return {"available": False, "error": "Clinical services disabled"}
    try:
        # Test actual data access, not just metadata
        # This ensures database is ready and indexes are loaded
        response = httpx.get(
            f"{settings.FHIR_SERVER_URL}/Patient?_count=1", timeout=5.0
        )
        # 200 = success (even if 0 patients), means FHIR is truly ready
        # Other codes mean FHIR still loading or has errors
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
    if not settings.CLINICAL_SERVICES_ENABLED:
        return {"available": False, "error": "Clinical services disabled"}
    try:
        # Use get_secret_value() to extract the actual password string
        api_user = settings.EHRBASE_API_USER
        api_password: str = settings.EHRBASE_API_PASSWORD.get_secret_value()

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

    if settings.CLINICAL_SERVICES_ENABLED:
        fhir_status = check_fhir_health()
        if fhir_status["available"]:
            print("✓ FHIR server is available")
        else:
            print(
                f"✗ WARNING: FHIR server not available - {fhir_status.get('error', 'Unknown error')}"
            )
            print("  Patient operations will fail until FHIR server is ready")

        ehrbase_status = check_ehrbase_health()
        if ehrbase_status["available"]:
            print("✓ EHRbase server is available")
        else:
            print(
                f"✗ WARNING: EHRbase not available - {ehrbase_status.get('error', 'Unknown error')}"
            )
            print(
                "  Clinical letter operations will fail until EHRbase is ready"
            )
    else:
        print("- Clinical services disabled (FHIR/EHRbase skipped)")

    print("=" * 60 + "\n")


def set_auth_cookies(
    response: Response, access: str, refresh: str, xsrf: str
) -> None:
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
    response.delete_cookie(
        "access_token", path="/", domain=settings.COOKIE_DOMAIN
    )
    response.delete_cookie(
        "refresh_token",
        path=f"{settings.API_PREFIX}/auth/refresh",
        domain=settings.COOKIE_DOMAIN,
    )
    response.delete_cookie(
        "XSRF-TOKEN", path="/", domain=settings.COOKIE_DOMAIN
    )


@router.get("/health")
def health_check() -> dict[str, Any]:
    """Health Check Endpoint.

    Checks availability of all required services (FHIR, EHRbase).
    Returns overall status and detailed service availability.

    Returns:
        dict: Health status with service availability details
    """
    services: dict[str, dict[str, bool | int | str]] = {
        "auth_db": {
            "available": True
        },  # If we can respond, auth DB is working
    }

    # Only check FHIR/EHRbase when clinical services are enabled
    if settings.CLINICAL_SERVICES_ENABLED:
        services["fhir"] = check_fhir_health()
        services["ehrbase"] = check_ehrbase_health()
    else:
        services["fhir"] = {
            "available": False,
            "error": "Not provisioned",
        }
        services["ehrbase"] = {
            "available": False,
            "error": "Not provisioned",
        }

    all_healthy = all(s.get("available", False) for s in services.values())

    return {
        "status": "healthy" if all_healthy else "degraded",
        "services": services,
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
@limiter.limit("5/minute")
def login(
    request: Request,
    data: LoginIn,
    response: Response,
    db: Session = DEP_GET_SESSION,
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

    user = db.scalar(
        select(User).where(User.username == data.username.strip())
    )

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
    competencies = user.get_final_competencies()
    access = create_jwt_with_competencies(user.username, roles, competencies)
    refresh = create_refresh_token(user.username)
    xsrf = make_csrf(user.username)
    set_auth_cookies(response, access, refresh, xsrf)
    return {
        "detail": "ok",
        "user": {"username": user.username, "roles": roles},
    }


@router.post("/auth/register")
@limiter.limit("3/minute")
def register(
    request: Request,
    payload: RegisterIn,
    db: Session = DEP_GET_SESSION,
) -> dict[str, str]:
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


class AdminUserCreateIn(BaseModel):
    """Admin User Creation Request.

    Request model for administrators to create new users with full CBAC settings.
    Requires admin or superadmin system permissions.

    Attributes:
        name: User's full name (stored as username if username not provided).
        username: Unique username for login.
        email: Unique email address.
        password: Plain text password (will be hashed).
        base_profession: Base profession template (e.g., "consultant", "patient").
        additional_competencies: Extra competencies beyond base profession.
        removed_competencies: Competencies to remove from base profession.
        system_permissions: System permission level (patient, staff, admin, superadmin).
    """

    name: str
    username: str | None = None
    email: str
    password: str
    base_profession: str = "patient"
    additional_competencies: list[str] = []
    removed_competencies: list[str] = []
    system_permissions: str = "patient"


class AdminUserUpdateIn(BaseModel):
    """Admin User Update Input Schema.

    Pydantic model for updating existing user accounts via admin endpoints.
    All fields are optional - only provided fields will be updated.

    Attributes:
        name: Full name (optional).
        username: Unique username (optional).
        email: Email address (optional).
        password: New password (optional, only if changing).
        base_profession: Base profession ID (optional).
        additional_competencies: Competencies to add (optional).
        removed_competencies: Competencies to remove (optional).
        system_permissions: System permission level (optional).
    """

    name: str | None = None
    username: str | None = None
    email: str | None = None
    password: str | None = None
    base_profession: str | None = None
    additional_competencies: list[str] | None = None
    removed_competencies: list[str] | None = None
    system_permissions: str | None = None


@router.post("/users")
def create_user_with_cbac(
    payload: AdminUserCreateIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Admin User Creation with CBAC.

    Creates a new user account with full CBAC (Competency-Based Access Control)
    settings including base profession, competencies, and system permissions.
    Only accessible to users with admin or superadmin system permissions.

    Validation Rules:
    - Email and password must not be empty
    - Password must be at least 8 characters long
    - Username must be unique across all users
    - Email must be unique across all users
    - Requesting user must have admin or superadmin permissions

    Args:
        payload: User creation data with CBAC settings.
        current_user: Currently authenticated user (must be admin/superadmin).
        db: Database session for user creation.

    Returns:
        dict: Success response with new user ID and username.

    Raises:
        HTTPException: 403 if requesting user lacks admin permissions.
        HTTPException: 400 if validation fails or constraints violated.
    """
    # Check authorization
    if current_user.system_permissions not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Admin or superadmin permissions required to create users",
        )

    # Validation
    email = payload.email.strip()
    password = payload.password
    username = (
        payload.username or payload.name.strip().replace(" ", "").lower()
    )

    if not email or not password:
        raise HTTPException(status_code=400, detail="Missing required fields")

    if len(password) < 8:
        raise HTTPException(
            status_code=400, detail="Password must be at least 8 characters"
        )

    # Check uniqueness
    existing = db.scalar(select(User).where(User.username == username))
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")

    # Create user
    user = User(
        username=username,
        email=email,
        password_hash=hash_password(password),
        base_profession=payload.base_profession,
        additional_competencies=payload.additional_competencies,
        removed_competencies=payload.removed_competencies,
        system_permissions=payload.system_permissions,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "detail": "created",
        "id": user.id,
        "username": user.username,
        "email": user.email,
    }


@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    payload: AdminUserUpdateIn,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Update User Account.

    Updates an existing user account with new CBAC settings and/or credentials.
    Only provided fields will be updated - omitted fields remain unchanged.
    Password is only updated if provided (optional for security).

    Requires admin or superadmin system permissions.

    Validation Rules:
    - Only updates fields that are provided (not None)
    - Email must be unique if being changed
    - Username must be unique if being changed
    - Password must be at least 8 characters if being changed
    - Requesting user must have admin or superadmin permissions

    Args:
        user_id: ID of the user to update.
        payload: User update data (all fields optional).
        current_user: Currently authenticated user (admin/superadmin only).
        db: Database session.

    Returns:
        dict: Success response with updated user details.

    Raises:
        HTTPException: 403 if requesting user lacks admin permissions.
        HTTPException: 404 if user not found.
        HTTPException: 400 if validation fails or constraints violated.
    """
    # Check authorization
    if current_user.system_permissions not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Admin or superadmin permissions required to update users",
        )

    # Fetch user
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate and update username
    if payload.username is not None:
        username = payload.username.strip()
        if username != user.username:
            existing = db.scalar(select(User).where(User.username == username))
            if existing:
                raise HTTPException(
                    status_code=400, detail="Username already exists"
                )
            user.username = username

    # Validate and update email
    if payload.email is not None:
        email = payload.email.strip()
        if email != user.email:
            if not email:
                raise HTTPException(
                    status_code=400, detail="Email is required"
                )
            existing = db.scalar(select(User).where(User.email == email))
            if existing:
                raise HTTPException(
                    status_code=400, detail="Email already exists"
                )
            user.email = email

    # Update password if provided
    if payload.password is not None and payload.password:
        if len(payload.password) < 8:
            raise HTTPException(
                status_code=400,
                detail="Password must be at least 8 characters",
            )
        user.password_hash = hash_password(payload.password)

    # Update CBAC fields if provided
    if payload.base_profession is not None:
        user.base_profession = payload.base_profession

    if payload.additional_competencies is not None:
        user.additional_competencies = payload.additional_competencies

    if payload.removed_competencies is not None:
        user.removed_competencies = payload.removed_competencies

    if payload.system_permissions is not None:
        user.system_permissions = payload.system_permissions

    # Commit changes
    db.commit()
    db.refresh(user)

    return {
        "detail": "updated",
        "id": user.id,
        "username": user.username,
        "email": user.email,
    }


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
def me(
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Get Current User Profile.

    Returns the authenticated user's profile information including username,
    email, assigned roles, system permissions, TOTP status, and enabled
    features from the user's primary organisation.

    Args:
        u: Currently authenticated user from JWT.
        db: Database session.

    Returns:
        dict: User profile with keys:
            - id: User's database ID
            - username: User's username
            - email: User's email address
            - roles: List of assigned role names
            - system_permissions: User's system permission level
            - totp_enabled: Whether 2FA is active
            - enabled_features: Features enabled on user's primary org
    """
    # Resolve features from user's primary org
    enabled_features: list[str] = []
    primary_org_row = db.execute(
        select(organisation_staff_member.c.organisation_id).where(
            organisation_staff_member.c.user_id == u.id,
            organisation_staff_member.c.is_primary.is_(True),
        )
    ).first()
    if primary_org_row:
        features = (
            db.execute(
                select(OrganisationFeature.feature_key).where(
                    OrganisationFeature.organisation_id == primary_org_row[0],
                )
            )
            .scalars()
            .all()
        )
        enabled_features = list(features)

    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "roles": [r.name for r in u.roles],
        "system_permissions": u.system_permissions,
        "totp_enabled": u.is_totp_enabled,
        "enabled_features": enabled_features,
    }


@router.get("/users")
def list_users(
    patient_id: str | None = None,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """List users, optionally filtered by shared org with a patient.

    When ``patient_id`` is provided, returns staff who share an org with
    that patient plus external users with active access grants. This is
    used by the message participant picker.

    Without ``patient_id``, returns all users (admin/superadmin only).

    Args:
        patient_id: Optional FHIR patient ID to filter by shared org.
        u: Currently authenticated user.
        db: Database session.

    Returns:
        dict: Response with users array.

    Raises:
        HTTPException: 403 if user lacks permissions.
    """
    if patient_id:
        # Filtered mode: staff in patient's orgs + external with access
        patient_orgs = get_patient_org_ids(db, patient_id)
        staff_ids = (
            get_org_staff_ids(db, patient_orgs) if patient_orgs else set()
        )

        # Also include external users with active access to this patient
        external_rows = db.execute(
            select(ExternalPatientAccess.user_id).where(
                ExternalPatientAccess.patient_id == patient_id,
                ExternalPatientAccess.revoked_at.is_(None),
            )
        ).all()
        external_ids = {r[0] for r in external_rows}

        all_ids = staff_ids | external_ids
        if not all_ids:
            return {"users": []}

        users = (
            db.execute(select(User).where(User.id.in_(all_ids)))
            .scalars()
            .unique()
            .all()
        )
        return {
            "users": [
                {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "system_permissions": user.system_permissions,
                }
                for user in users
            ]
        }

    # Unfiltered mode: admin/superadmin only
    if u.system_permissions not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Requires admin or superadmin permissions",
        )

    try:
        users = db.execute(select(User)).scalars().unique().all()
        return {
            "users": [
                {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "system_permissions": user.system_permissions,
                }
                for user in users
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/users/{user_id}")
def get_user(
    user_id: int,
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Get User Details.

    Retrieves detailed information about a specific user including their
    CBAC settings (base profession, competencies) and system permissions.
    Used by the admin interface when editing user accounts.

    Requires admin or superadmin system permissions.

    Args:
        user_id: ID of the user to retrieve.
        current_user: Currently authenticated user (admin/superadmin only).
        db: Database session.

    Returns:
        dict: User details with keys:
            - id: User ID
            - username: Username
            - email: Email address
            - name: Full name (currently same as username)
            - base_profession: Base profession ID
            - additional_competencies: Array of additional competency IDs
            - removed_competencies: Array of removed competency IDs
            - system_permissions: System permission level

    Raises:
        HTTPException: 403 if user lacks admin/superadmin permissions.
        HTTPException: 404 if user not found.
    """
    # Check permissions
    if current_user.system_permissions not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Requires admin or superadmin permissions",
        )

    # Fetch user
    user = db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "name": user.username,  # TODO: Add name field to User model
        "base_profession": user.base_profession,
        "additional_competencies": user.additional_competencies or [],
        "removed_competencies": user.removed_competencies or [],
        "system_permissions": user.system_permissions,
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
    competencies = user.get_final_competencies()
    new_access = create_jwt_with_competencies(
        user.username, roles, competencies
    )
    new_refresh = create_refresh_token(user.username)  # rotate
    xsrf = make_csrf(user.username)
    set_auth_cookies(response, new_access, new_refresh, xsrf)
    return {"detail": "refreshed"}


@router.post(
    "/patients/verify",
    dependencies=[
        DEP_REQUIRE_CLINICAL,
        DEP_REQUIRE_ROLES_CLINICIAN,
        DEP_REQUIRE_CSRF,
    ],
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
def list_patients(
    include_inactive: bool = False,
    scope: str | None = None,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """List patients from FHIR, filtered by organisation membership.

    By default, staff see only patients in their organisation(s).
    Admin/superadmin can pass ``scope=admin`` to see all patients.
    External users see only patients they have ExternalPatientAccess for.

    Args:
        include_inactive: If true, include deactivated patients (admin only).
        scope: Pass "admin" to bypass org filtering (admin/superadmin only).
        u: Currently authenticated user.
        db: Database session.

    Returns:
        dict: Response with patients array and fhir_ready flag.
    """
    try:
        patients = list_fhir_patients()

        # Fetch all patient metadata from database
        stmt = select(PatientMetadata)
        metadata_records = db.execute(stmt).scalars().all()
        metadata_map = {m.patient_id: m.is_active for m in metadata_records}

        # Determine which patients are accessible
        is_admin = u.system_permissions in ["admin", "superadmin"]
        admin_scope = scope == "admin" and is_admin

        accessible_ids: set[str] | None = None
        if admin_scope:
            accessible_ids = None  # no filtering
        else:
            accessible_ids = get_accessible_patient_ids(db, u)

        # Enrich patients with activation status and filter
        enriched_patients = []
        for patient in patients:
            patient_id = patient.get("id")
            if patient_id is None:
                continue

            # Org-based filtering (skip for admin scope)
            if accessible_ids is not None and patient_id not in accessible_ids:
                continue

            is_active = metadata_map.get(patient_id, True)

            # Filter based on activation status
            if is_active or (include_inactive and is_admin):
                patient["is_active"] = is_active
                enriched_patients.append(patient)

        return {"patients": enriched_patients, "fhir_ready": True}
    except Exception:
        return {"patients": [], "fhir_ready": False}


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
def list_letters(
    patient_id: str, u: User = DEP_CURRENT_USER
) -> dict[str, Any]:
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


@router.get("/patients/{patient_id}")
def get_patient(patient_id: str, u: User = DEP_CURRENT_USER) -> dict[str, Any]:
    """Get Single Patient from FHIR.

    Retrieves a specific patient's demographics from the FHIR server by ID.
    Returns the complete FHIR R4 Patient resource including name, birth date,
    gender, and identifiers. Used by the admin interface when editing patient
    records.

    Args:
        patient_id: FHIR Patient resource ID to retrieve.
        u: Currently authenticated user (any role can view patients).

    Returns:
        dict: Complete FHIR Patient resource.

    Raises:
        HTTPException: 404 if patient not found in FHIR server.
        HTTPException: 500 if FHIR server communication fails.
    """
    try:
        patient = read_fhir_patient(patient_id)
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")
        # Mypy type narrowing: patient is now guaranteed to be dict[str, Any]
        assert patient is not None
        return patient
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve patient: {e}"
        ) from e


@router.patch("/patients/{patient_id}")
def update_patient(
    patient_id: str,
    data: FHIRPatientCreateIn,
    u: User = DEP_CURRENT_USER,
) -> dict[str, Any]:
    """Update Patient in FHIR.

    Updates an existing patient's demographics in the FHIR server. Accepts
    the same fields as patient creation (name, birth_date, gender, identifiers).
    Used by the admin interface when editing patient records.

    Args:
        patient_id: FHIR Patient resource ID to update.
        data: Updated patient demographics.
        u: Currently authenticated user (any role can update patients).

    Returns:
        dict: Complete updated FHIR Patient resource.

    Raises:
        HTTPException: 404 if patient not found in FHIR server.
        HTTPException: 500 if FHIR update operation fails.
    """
    try:
        # Read existing patient to verify it exists
        existing = read_fhir_patient(patient_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Patient not found")

        # Build update dict with provided fields
        updates: dict[str, Any] = {}

        # Update name
        if data.given_name or data.family_name:
            updates["name"] = [
                {
                    "use": "official",
                    "given": [data.given_name] if data.given_name else [],
                    "family": data.family_name if data.family_name else "",
                }
            ]

        # Update birth date
        if data.birth_date:
            updates["birthDate"] = data.birth_date

        # Update gender
        if data.gender:
            updates["gender"] = data.gender

        # Update identifiers (NHS number, MRN)
        identifiers = []
        if data.nhs_number:
            identifiers.append(
                {
                    "system": "https://fhir.nhs.uk/Id/nhs-number",
                    "value": data.nhs_number,
                }
            )
        if data.mrn:
            identifiers.append(
                {
                    "system": "http://hospital.example.org/mrn",
                    "value": data.mrn,
                }
            )
        if identifiers:
            updates["identifier"] = identifiers

        # Perform update
        updated_patient = update_fhir_patient(patient_id, updates)
        if not updated_patient:
            raise HTTPException(
                status_code=500, detail="Failed to update patient"
            )
        # Mypy type narrowing: updated_patient is now guaranteed to be dict[str, Any]
        assert updated_patient is not None
        return updated_patient
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to update patient: {e}"
        ) from e


@router.get("/patients/{patient_id}/metadata")
def get_patient_metadata(
    patient_id: str,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Get Patient Metadata.

    Returns application-specific metadata for a patient, including activation
    status. If no metadata record exists, returns default values (is_active=True).

    Args:
        patient_id: FHIR Patient resource ID.
        u: Currently authenticated user.
        db: Database session.

    Returns:
        dict: Patient metadata with keys:
            - patient_id: FHIR Patient resource ID
            - is_active: Whether patient is active in the system
    """
    stmt = select(PatientMetadata).where(
        PatientMetadata.patient_id == patient_id
    )
    metadata = db.execute(stmt).scalar_one_or_none()

    if metadata:
        return {
            "patient_id": metadata.patient_id,
            "is_active": metadata.is_active,
        }
    else:
        # No metadata record means patient is active by default
        return {
            "patient_id": patient_id,
            "is_active": True,
        }


@router.post("/patients/{patient_id}/deactivate")
def deactivate_patient(
    patient_id: str,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Deactivate Patient Record.

    Marks a patient as inactive in the system. Deactivated patients are hidden
    from clinical views but remain visible in admin pages with a deactivated flag.
    Requires admin or superadmin system permissions.

    Args:
        patient_id: FHIR Patient resource ID to deactivate.
        u: Currently authenticated user.
        db: Database session.

    Returns:
        dict: Confirmation with keys:
            - patient_id: The deactivated patient ID
            - is_active: False
            - message: Success message

    Raises:
        HTTPException: 403 if user lacks admin permissions.
        HTTPException: 404 if patient not found in FHIR.
    """
    # Check permissions
    if u.system_permissions not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Admin or superadmin permission required to deactivate patients",
        )

    # Verify patient exists in FHIR
    patient = read_fhir_patient(patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Get or create metadata record
    stmt = select(PatientMetadata).where(
        PatientMetadata.patient_id == patient_id
    )
    metadata = db.execute(stmt).scalar_one_or_none()

    if metadata:
        # Update existing record
        metadata.is_active = False
    else:
        # Create new metadata record
        metadata = PatientMetadata(
            patient_id=patient_id,
            is_active=False,
        )
        db.add(metadata)

    db.commit()

    return {
        "patient_id": patient_id,
        "is_active": False,
        "message": "Patient deactivated successfully",
    }


@router.post("/patients/{patient_id}/activate")
def activate_patient(
    patient_id: str,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Activate Patient Record.

    Reactivates a previously deactivated patient, making them visible in all
    views again. Requires admin or superadmin system permissions.

    Args:
        patient_id: FHIR Patient resource ID to activate.
        u: Currently authenticated user.
        db: Database session.

    Returns:
        dict: Confirmation with keys:
            - patient_id: The activated patient ID
            - is_active: True
            - message: Success message

    Raises:
        HTTPException: 403 if user lacks admin permissions.
        HTTPException: 404 if patient not found in FHIR.
    """
    # Check permissions
    if u.system_permissions not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Admin or superadmin permission required to activate patients",
        )

    # Verify patient exists in FHIR
    patient = read_fhir_patient(patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Get or create metadata record
    stmt = select(PatientMetadata).where(
        PatientMetadata.patient_id == patient_id
    )
    metadata = db.execute(stmt).scalar_one_or_none()

    if metadata:
        # Update existing record
        metadata.is_active = True
    else:
        # Create new metadata record (already active by default)
        metadata = PatientMetadata(
            patient_id=patient_id,
            is_active=True,
        )
        db.add(metadata)

    db.commit()

    return {
        "patient_id": patient_id,
        "is_active": True,
        "message": "Patient activated successfully",
    }


@router.get("/patients/{patient_id}/shared-organisations")
def shared_organisations_endpoint(
    patient_id: str,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Return organisations shared between the current user and a patient.

    For external users this returns an empty list (they use
    per-patient access grants, not org membership).

    Args:
        patient_id: FHIR Patient resource ID.
        u: Authenticated user.
        db: Database session.

    Returns:
        dict: ``organisations`` list with id/name/type for each shared org.
    """
    if is_external_user(u.system_permissions):
        return {"organisations": []}

    shared_ids = get_shared_org_ids(db, u.id, patient_id)
    if not shared_ids:
        return {"organisations": []}

    orgs = (
        db.execute(select(Organization).where(Organization.id.in_(shared_ids)))
        .scalars()
        .all()
    )
    return {
        "organisations": [
            {"id": o.id, "name": o.name, "type": o.type} for o in orgs
        ]
    }


# ==========================================================================
# CBAC (Competency-Based Access Control) Routes
# ==========================================================================


@router.get(
    "/cbac/my-competencies",
    response_model=UserCompetenciesResponse,
    tags=["cbac"],
)
async def get_my_competencies(
    user: User = DEP_CURRENT_USER,
) -> UserCompetenciesResponse:
    """Get current user's resolved competencies.

    Returns the authenticated user's base profession and final competencies
    after resolving base profession + additional - removed competencies.

    Returns:
        UserCompetenciesResponse: User's competency information
    """
    return UserCompetenciesResponse(
        user_id=user.id,
        username=user.username,
        base_profession=user.base_profession,
        additional_competencies=user.additional_competencies or [],
        removed_competencies=user.removed_competencies or [],
        final_competencies=user.get_final_competencies(),
    )


@router.post(
    "/prescriptions/controlled",
    tags=["cbac", "prescriptions"],
    status_code=201,
)
async def prescribe_controlled(
    prescription: PrescriptionRequest,
    user: User = Depends(has_competency("prescribe_controlled_schedule_2")),
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Prescribe controlled substance (Schedule 2).

    Example endpoint demonstrating CBAC protection. Only users with
    'prescribe_controlled_schedule_2' competency can access this endpoint.

    Requires:
        - Competency: prescribe_controlled_schedule_2
        - Authentication: JWT cookie

    Args:
        prescription: Prescription details
        user: Authenticated user (injected by dependency)
        db: Database session

    Returns:
        dict: Prescription confirmation

    Raises:
        HTTPException: 403 if user lacks competency
    """
    # In real implementation, this would create prescription in database
    return {
        "status": "success",
        "prescription_id": "RX001",
        "prescriber": user.username,
        "patient_id": prescription.patient_id,
        "medication": prescription.medication,
        "dose": prescription.dose,
        "duration_days": prescription.duration_days,
    }


@router.patch(
    "/cbac/my-competencies",
    response_model=UserCompetenciesResponse,
    tags=["cbac"],
)
async def update_my_competencies(
    data: UpdateCompetenciesRequest,
    user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> UserCompetenciesResponse:
    """Update user's additional/removed competencies.

    Allows system administrators to add or remove competencies from a user's
    base profession template. This endpoint should be protected with additional
    authorization in production (e.g., require "Administrator" role).

    NOTE: In production, this should require Administrator role and CSRF token.

    Args:
        data: Additional and removed competencies to update
        user: Authenticated user
        db: Database session

    Returns:
        UserCompetenciesResponse: Updated user competency information
    """
    # Update user's competencies
    if data.additional_competencies is not None:
        user.additional_competencies = data.additional_competencies
    if data.removed_competencies is not None:
        user.removed_competencies = data.removed_competencies

    db.commit()
    db.refresh(user)

    return UserCompetenciesResponse(
        user_id=user.id,
        username=user.username,
        base_profession=user.base_profession,
        additional_competencies=user.additional_competencies or [],
        removed_competencies=user.removed_competencies or [],
        final_competencies=user.get_final_competencies(),
    )


# ==========================================================================
# ORGANIZATION ENDPOINTS
# ==========================================================================


@router.get("/organizations")
def list_organizations(
    u: User = DEP_CURRENT_USER, db: Session = DEP_GET_SESSION
) -> dict[str, Any]:
    """List All Organizations.

    Retrieves all organizations from the database. Returns basic information
    for each organization. Used by admin interface to display organization
    list and management options.

    Requires admin or superadmin system permissions.

    Args:
        u: Currently authenticated user (admin/superadmin only).
        db: Database session.

    Returns:
        dict: Response with key:
            - organizations: Array of organization objects

    Raises:
        HTTPException: 403 if user lacks admin/superadmin permissions.
        HTTPException: 500 if database query fails.
    """
    # Check permissions
    if u.system_permissions not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Requires admin or superadmin permissions",
        )

    try:
        organizations = db.execute(select(Organization)).scalars().all()
        return {
            "organizations": [
                {
                    "id": org.id,
                    "name": org.name,
                    "type": org.type,
                    "location": org.location,
                    "created_at": org.created_at.isoformat(),
                    "updated_at": org.updated_at.isoformat(),
                }
                for org in organizations
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/organizations/{org_id}")
def get_organization(
    org_id: int,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Get Organization Details.

    Retrieves detailed information about a specific organization including
    staff members and patient count.

    Requires admin or superadmin system permissions.

    Args:
        org_id: ID of the organization to retrieve.
        u: Currently authenticated user (admin/superadmin only).
        db: Database session.

    Returns:
        dict: Organization details with staff and patient information.

    Raises:
        HTTPException: 403 if user lacks admin/superadmin permissions.
        HTTPException: 404 if organization not found.
    """
    # Check permissions
    if u.system_permissions not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Requires admin or superadmin permissions",
        )

    # Fetch organization
    org = db.scalar(select(Organization).where(Organization.id == org_id))
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Get staff members with primary status
    staff_query = (
        select(
            User.id,
            User.username,
            User.email,
            organisation_staff_member.c.is_primary,
        )
        .join(
            organisation_staff_member,
            organisation_staff_member.c.user_id == User.id,
        )
        .where(organisation_staff_member.c.organisation_id == org_id)
    )

    staff_members = db.execute(staff_query).all()

    # Get patient members
    patient_query = select(
        organisation_patient_member.c.patient_id,
        organisation_patient_member.c.is_primary,
    ).where(organisation_patient_member.c.organisation_id == org_id)

    patient_members = db.execute(patient_query).all()

    return {
        "id": org.id,
        "name": org.name,
        "type": org.type,
        "location": org.location,
        "created_at": org.created_at.isoformat(),
        "updated_at": org.updated_at.isoformat(),
        "staff_count": len(staff_members),
        "patient_count": len(patient_members),
        "staff_members": [
            {
                "id": sm.id,
                "username": sm.username,
                "email": sm.email,
                "is_primary": sm.is_primary or False,
            }
            for sm in staff_members
        ],
        "patient_members": [
            {
                "patient_id": pm.patient_id,
                "is_primary": pm.is_primary or False,
            }
            for pm in patient_members
        ],
    }


class CreateOrganizationIn(BaseModel):
    """Request body for creating a new organisation."""

    name: str
    type: str
    location: str | None = None

    model_config = {"extra": "forbid"}


class UpdateOrganizationIn(BaseModel):
    """Request body for updating an organisation."""

    name: str | None = None
    type: str | None = None
    location: str | None = None

    model_config = {"extra": "forbid"}


@router.put("/organizations/{org_id}")
def update_organization(
    org_id: int,
    body: UpdateOrganizationIn,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Update Organisation.

    Updates an existing organisation's details.

    Requires admin or superadmin system permissions.

    Args:
        org_id: ID of the organisation to update.
        body: Fields to update (name, type, location). Only provided fields are updated.
        u: Currently authenticated user (admin/superadmin only).
        db: Database session.

    Returns:
        dict: Updated organisation details.

    Raises:
        HTTPException: 400 if type is invalid.
        HTTPException: 403 if user lacks admin/superadmin permissions.
        HTTPException: 404 if organisation not found.
    """
    if u.system_permissions not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Requires admin or superadmin permissions",
        )
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    valid_types = [
        "hospital_team",
        "gp_practice",
        "private_clinic",
        "department",
    ]

    if body.name is not None:
        org.name = body.name.strip()
    if body.type is not None:
        if body.type not in valid_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid organisation type. Must be one of: {', '.join(valid_types)}",
            )
        org.type = body.type
    if body.location is not None:
        org.location = body.location.strip() or None

    db.commit()
    db.refresh(org)

    return {
        "id": org.id,
        "name": org.name,
        "type": org.type,
        "location": org.location,
        "created_at": org.created_at.isoformat(),
        "updated_at": org.updated_at.isoformat(),
    }


@router.post("/organizations")
def create_organization(
    body: CreateOrganizationIn,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Create Organisation.

    Creates a new organisation in the database.

    Requires admin or superadmin system permissions.

    Args:
        body: Organisation details (name, type, optional location).
        u: Currently authenticated user (admin/superadmin only).
        db: Database session.

    Returns:
        dict: Created organisation details.

    Raises:
        HTTPException: 400 if type is invalid.
        HTTPException: 403 if user lacks admin/superadmin permissions.
    """
    if u.system_permissions not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Requires admin or superadmin permissions",
        )

    valid_types = [
        "hospital_team",
        "gp_practice",
        "private_clinic",
        "department",
    ]
    if body.type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid organisation type. Must be one of: {', '.join(valid_types)}",
        )

    org = Organization(
        name=body.name.strip(),
        type=body.type,
        location=body.location.strip() if body.location else None,
    )
    db.add(org)
    db.commit()
    db.refresh(org)

    return {
        "id": org.id,
        "name": org.name,
        "type": org.type,
        "location": org.location,
        "created_at": org.created_at.isoformat(),
        "updated_at": org.updated_at.isoformat(),
    }


class AddStaffIn(BaseModel):
    """Request body for adding a staff member to an organisation."""

    user_id: int

    model_config = {"extra": "forbid"}


@router.post("/organizations/{org_id}/staff")
def add_staff_to_organization(
    org_id: int,
    body: AddStaffIn,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Add Staff Member to Organisation.

    Adds an existing user as a staff member of an organisation.

    Requires admin or superadmin system permissions.

    Args:
        org_id: ID of the organisation.
        body: Staff member details (user_id).
        u: Currently authenticated user (admin/superadmin only).
        db: Database session.

    Returns:
        dict: Confirmation with organisation and user IDs.

    Raises:
        HTTPException: 403 if user lacks admin/superadmin permissions.
        HTTPException: 404 if organisation or user not found.
        HTTPException: 409 if user is already a staff member.
    """
    if u.system_permissions not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Requires admin or superadmin permissions",
        )

    org = db.scalar(select(Organization).where(Organization.id == org_id))
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    user = db.scalar(select(User).where(User.id == body.user_id))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check if already a member
    existing = db.scalar(
        select(organisation_staff_member).where(
            organisation_staff_member.c.organisation_id == org_id,
            organisation_staff_member.c.user_id == body.user_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="User is already a staff member of this organisation",
        )

    db.execute(
        organisation_staff_member.insert().values(
            organisation_id=org_id,
            user_id=body.user_id,
            is_primary=False,
        )
    )
    db.commit()

    return {
        "organisation_id": org_id,
        "user_id": body.user_id,
        "username": user.username,
    }


class AddPatientIn(BaseModel):
    """Request body for adding a patient to an organisation."""

    patient_id: str

    model_config = {"extra": "forbid"}


@router.post("/organizations/{org_id}/patients")
def add_patient_to_organization(
    org_id: int,
    body: AddPatientIn,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Add Patient to Organisation.

    Adds a patient to an organisation by their FHIR patient ID.

    Requires admin or superadmin system permissions.

    Args:
        org_id: ID of the organisation.
        body: Patient details (patient_id).
        u: Currently authenticated user (admin/superadmin only).
        db: Database session.

    Returns:
        dict: Confirmation with organisation and patient IDs.

    Raises:
        HTTPException: 403 if user lacks admin/superadmin permissions.
        HTTPException: 404 if organisation not found.
        HTTPException: 409 if patient is already a member.
    """
    if u.system_permissions not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Requires admin or superadmin permissions",
        )

    org = db.scalar(select(Organization).where(Organization.id == org_id))
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Check if already a member
    existing = db.scalar(
        select(organisation_patient_member).where(
            organisation_patient_member.c.organisation_id == org_id,
            organisation_patient_member.c.patient_id == body.patient_id,
        )
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail="Patient is already a member of this organisation",
        )

    db.execute(
        organisation_patient_member.insert().values(
            organisation_id=org_id,
            patient_id=body.patient_id,
            is_primary=False,
        )
    )
    db.commit()

    return {
        "organisation_id": org_id,
        "patient_id": body.patient_id,
    }


@router.delete(
    "/organizations/{org_id}/staff/{user_id}",
    dependencies=[DEP_REQUIRE_CSRF],
)
def remove_staff_from_organization(
    org_id: int,
    user_id: int,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, str]:
    """Remove a staff member from an organisation.

    Admin/superadmin only.

    Args:
        org_id: Organisation ID.
        user_id: User ID to remove.
        u: Authenticated admin user.
        db: Database session.

    Returns:
        dict: Confirmation.
    """
    if u.system_permissions not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin only")

    existing = db.scalar(
        select(organisation_staff_member).where(
            organisation_staff_member.c.organisation_id == org_id,
            organisation_staff_member.c.user_id == user_id,
        )
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Membership not found")

    db.execute(
        organisation_staff_member.delete().where(
            organisation_staff_member.c.organisation_id == org_id,
            organisation_staff_member.c.user_id == user_id,
        )
    )
    db.commit()
    return {"status": "removed"}


@router.delete(
    "/organizations/{org_id}/patients/{patient_id}",
    dependencies=[DEP_REQUIRE_CSRF],
)
def remove_patient_from_organization(
    org_id: int,
    patient_id: str,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, str]:
    """Remove a patient from an organisation.

    Admin/superadmin only.

    Args:
        org_id: Organisation ID.
        patient_id: FHIR Patient resource ID.
        u: Authenticated admin user.
        db: Database session.

    Returns:
        dict: Confirmation.
    """
    if u.system_permissions not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin only")

    existing = db.scalar(
        select(organisation_patient_member).where(
            organisation_patient_member.c.organisation_id == org_id,
            organisation_patient_member.c.patient_id == patient_id,
        )
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Membership not found")

    db.execute(
        organisation_patient_member.delete().where(
            organisation_patient_member.c.organisation_id == org_id,
            organisation_patient_member.c.patient_id == patient_id,
        )
    )
    db.commit()
    return {"status": "removed"}


# ==========================================================================
# ORGANISATION FEATURE ENDPOINTS
# ==========================================================================


@router.get("/organizations/{org_id}/features")
def list_org_features(
    org_id: int,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, list[dict[str, Any]]]:
    """List enabled features for an organisation.

    Admin/superadmin only.
    """
    if u.system_permissions not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin only")

    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    return {
        "features": [
            FeatureOut(
                feature_key=f.feature_key,
                enabled_at=f.enabled_at,
                enabled_by=f.enabled_by,
            ).model_dump()
            for f in org.features
        ]
    }


@router.put(
    "/organizations/{org_id}/features/{feature_key}",
    dependencies=[DEP_REQUIRE_CSRF],
)
def toggle_org_feature(
    org_id: int,
    feature_key: str,
    body: FeatureToggleIn,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, str]:
    """Enable or disable a feature on an organisation.

    Admin/superadmin only.  When ``enabled=true`` a row is created;
    when ``enabled=false`` the row is deleted.
    """
    if u.system_permissions not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin only")

    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organisation not found")

    existing = db.scalar(
        select(OrganisationFeature).where(
            OrganisationFeature.organisation_id == org_id,
            OrganisationFeature.feature_key == feature_key,
        )
    )

    if body.enabled:
        if existing:
            return {"status": "already_enabled"}
        feature = OrganisationFeature(
            organisation_id=org_id,
            feature_key=feature_key,
            enabled_by=u.id,
        )
        db.add(feature)
        db.commit()
        return {"status": "enabled"}
    else:
        if not existing:
            return {"status": "already_disabled"}
        db.delete(existing)
        db.commit()
        return {"status": "disabled"}


@router.patch(
    "/users/{user_id}/link-patient",
    dependencies=[DEP_REQUIRE_CSRF],
)
def link_patient_to_user(
    user_id: int,
    body: dict[str, str],
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Link a user account to a FHIR patient record.

    Admin/superadmin only. Sets ``fhir_patient_id`` on the user.

    Args:
        user_id: User ID.
        body: Must contain ``fhir_patient_id``.
        u: Authenticated admin user.
        db: Database session.

    Returns:
        dict: Confirmation with user and patient IDs.
    """
    if u.system_permissions not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin only")

    fhir_patient_id = body.get("fhir_patient_id")
    if not fhir_patient_id:
        raise HTTPException(
            status_code=422, detail="fhir_patient_id is required"
        )

    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")

    # Check not already linked to another user
    clash = db.scalar(
        select(User).where(
            User.fhir_patient_id == fhir_patient_id,
            User.id != user_id,
        )
    )
    if clash is not None:
        raise HTTPException(
            status_code=409,
            detail="FHIR patient already linked to another user",
        )

    target.fhir_patient_id = fhir_patient_id
    db.commit()

    return {
        "user_id": user_id,
        "fhir_patient_id": fhir_patient_id,
    }


# ==========================================================================
# EXTERNAL ACCESS (invite / accept / revoke)
# ==========================================================================


@router.post(
    "/patients/{patient_id}/invite-external",
    dependencies=[DEP_REQUIRE_CSRF],
)
def invite_external_user(
    patient_id: str,
    body: InviteExternalIn,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Generate an invite link for an external user.

    Only the patient themselves (via ``fhir_patient_id``) or an
    admin/superadmin may issue invites.

    Args:
        patient_id: FHIR Patient resource ID.
        body: Email and user type.
        u: Authenticated user.
        db: Database session.

    Returns:
        dict: ``invite_url`` containing the signed JWT.
    """
    # Only patient-self or admin can invite
    is_own = u.fhir_patient_id is not None and u.fhir_patient_id == patient_id
    is_admin = u.system_permissions in ("admin", "superadmin")
    if not (is_own or is_admin):
        raise HTTPException(
            status_code=403,
            detail="Only the patient or an admin can invite external users",
        )

    token = create_invite_token(
        patient_id=patient_id,
        email=body.email,
        user_type=body.user_type,
    )

    # In production the base URL would come from settings
    invite_url = f"/app/accept-invite?token={token}"

    return {"invite_url": invite_url, "token": token}


@router.post("/accept-invite")
def accept_invite(
    body: AcceptInviteIn,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """Accept an invite — register or grant access to existing user.

    If the email matches an existing user, access is granted
    immediately. Otherwise a new user is created with the fields
    supplied in the request body.

    Args:
        body: Invite token and optional registration fields.
        db: Database session.

    Returns:
        dict: Status and redirect information.
    """
    from jose import JWTError

    try:
        payload = decode_invite_token(body.token)
    except JWTError as err:
        raise HTTPException(
            status_code=400, detail="Invalid or expired invite token"
        ) from err

    patient_id: str = payload["patient_id"]
    email: str = payload["email"]
    user_type: str = payload["user_type"]

    # Check if user already exists
    existing = db.scalar(select(User).where(User.email == email))

    if existing is not None:
        # Grant access to existing user (idempotent)
        grant = db.scalar(
            select(ExternalPatientAccess).where(
                ExternalPatientAccess.user_id == existing.id,
                ExternalPatientAccess.patient_id == patient_id,
            )
        )
        if grant is None:
            db.add(
                ExternalPatientAccess(
                    user_id=existing.id,
                    patient_id=patient_id,
                    granted_by_user_id=existing.id,
                )
            )
            db.commit()
        elif grant.revoked_at is not None:
            grant.revoked_at = None
            db.commit()
        return {"status": "access_granted", "user_id": existing.id}

    # New user registration
    if not body.username or not body.password:
        raise HTTPException(
            status_code=422,
            detail="username and password required for new registration",
        )

    # Validate uniqueness
    if db.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(status_code=409, detail="Username already taken")

    new_user = User(
        username=body.username,
        email=email,
        password_hash=hash_password(body.password),
        system_permissions=user_type,
        base_profession="patient",
    )
    db.add(new_user)
    db.flush()

    db.add(
        ExternalPatientAccess(
            user_id=new_user.id,
            patient_id=patient_id,
            granted_by_user_id=new_user.id,
        )
    )
    db.commit()

    return {"status": "registered", "user_id": new_user.id}


@router.delete(
    "/patients/{patient_id}/external-access/{user_id}",
    dependencies=[DEP_REQUIRE_CSRF],
)
def revoke_external_access(
    patient_id: str,
    user_id: int,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, str]:
    """Revoke an external user's access to a patient.

    Admin/superadmin only. Soft-deletes by setting ``revoked_at``.

    Args:
        patient_id: FHIR Patient resource ID.
        user_id: ID of the external user.
        u: Authenticated admin user.
        db: Database session.

    Returns:
        dict: Confirmation message.
    """
    if u.system_permissions not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin only")

    grant = db.scalar(
        select(ExternalPatientAccess).where(
            ExternalPatientAccess.user_id == user_id,
            ExternalPatientAccess.patient_id == patient_id,
            ExternalPatientAccess.revoked_at.is_(None),
        )
    )
    if grant is None:
        raise HTTPException(
            status_code=404, detail="Active access grant not found"
        )

    grant.revoked_at = datetime.now(UTC)
    db.commit()

    return {"status": "revoked"}


@router.get("/patients/{patient_id}/external-access")
def list_external_access(
    patient_id: str,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, Any]:
    """List external users with access to a patient.

    Returns active (non-revoked) external access grants.

    Args:
        patient_id: FHIR Patient resource ID.
        u: Authenticated user.
        db: Database session.

    Returns:
        dict: ``grants`` list with user info and access details.
    """
    # Only admin or the patient themselves
    is_own = u.fhir_patient_id is not None and u.fhir_patient_id == patient_id
    is_admin = u.system_permissions in ("admin", "superadmin")
    if not (is_own or is_admin):
        raise HTTPException(status_code=403, detail="Access denied")

    grants = (
        db.execute(
            select(ExternalPatientAccess).where(
                ExternalPatientAccess.patient_id == patient_id,
                ExternalPatientAccess.revoked_at.is_(None),
            )
        )
        .scalars()
        .all()
    )

    return {
        "grants": [
            {
                "user_id": g.user_id,
                "username": g.user.username,
                "email": g.user.email,
                "user_type": g.user.system_permissions,
                "granted_at": g.granted_at.isoformat(),
                "access_level": g.access_level,
            }
            for g in grants
        ]
    }


# ---------------------------------------------------------------------------
# Messaging
# ---------------------------------------------------------------------------


@router.post(
    "/conversations",
    response_model=ConversationDetailOut,
    dependencies=[DEP_REQUIRE_CSRF],
)
def create_conversation_endpoint(
    body: ConversationCreateIn,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> ConversationDetailOut:
    """Create a new messaging conversation.

    Creates a FHIR Communication resource as the source of truth,
    then projects the data into SQL for fast reads.

    Args:
        body: Conversation details including first message.
        u: Authenticated user (conversation creator).
        db: Database session.

    Returns:
        ConversationDetailOut: The newly created conversation.
    """
    try:
        return create_conversation(
            db=db,
            creator=u,
            patient_id=body.patient_id,
            initial_message=body.initial_message,
            subject=body.subject,
            participant_ids=body.participant_ids,
            include_patient_as_participant=(
                body.include_patient_as_participant
            ),
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except FhirCommunicationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Failed to create message in clinical store",
        ) from exc


@router.get("/conversations", response_model=ConversationListOut)
def list_conversations_endpoint(
    status: str | None = None,
    patient_id: str | None = None,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> ConversationListOut:
    """List conversations for the current user.

    Returns conversations the user participates in, optionally
    filtered by status or patient.

    Args:
        status: Optional filter by conversation status.
        patient_id: Optional filter by FHIR patient ID.
        u: Authenticated user.
        db: Database session.

    Returns:
        ConversationListOut: List of conversations with metadata.
    """
    items = list_conversations(
        db=db,
        user=u,
        status=status,
        patient_id=patient_id,
    )
    return ConversationListOut(conversations=items)


@router.get(
    "/patients/{patient_id}/conversations",
    response_model=ConversationListOut,
)
def list_patient_conversations_endpoint(
    patient_id: str,
    status: str | None = None,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> ConversationListOut:
    """List all conversations about a patient.

    Returns all conversations for the patient regardless of
    whether the current user is a participant.

    Args:
        patient_id: FHIR patient ID.
        status: Optional filter by conversation status.
        u: Authenticated user.
        db: Database session.

    Returns:
        ConversationListOut: All conversations for this patient.
    """
    items = list_patient_conversations(
        db=db,
        patient_id=patient_id,
        user=u,
        status=status,
    )
    return ConversationListOut(conversations=items)


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationDetailOut,
)
def get_conversation_endpoint(
    conversation_id: int,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> ConversationDetailOut:
    """Get a single conversation with all messages.

    Also marks the conversation as read for the current user.

    Args:
        conversation_id: ID of the conversation.
        u: Authenticated user (must be a participant).
        db: Database session.

    Returns:
        ConversationDetailOut: Full conversation with messages.

    Raises:
        HTTPException: 404 if not found or user is not a participant.
    """
    result = get_conversation_detail(
        db=db, conversation_id=conversation_id, user=u
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return result


@router.patch(
    "/conversations/{conversation_id}",
    response_model=ConversationOut,
    dependencies=[DEP_REQUIRE_CSRF],
)
def update_conversation_status_endpoint(
    conversation_id: int,
    body: ConversationStatusUpdateIn,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> ConversationOut:
    """Update conversation status (e.g. close, archive).

    Only participants can update a conversation's status.

    Args:
        conversation_id: ID of the conversation.
        body: New status value.
        u: Authenticated user.
        db: Database session.

    Returns:
        ConversationOut: Updated conversation.

    Raises:
        HTTPException: 404 if not found or user is not a participant.
    """
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    cp = next((p for p in conv.participants if p.user_id == u.id), None)
    if cp is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conv.status = body.status
    db.commit()
    db.refresh(conv)

    # Calculate unread
    if cp.last_read_at:
        unread = sum(
            1
            for m in conv.messages
            if m.created_at > cp.last_read_at and m.sender_id != u.id
        )
    else:
        unread = sum(1 for m in conv.messages if m.sender_id != u.id)

    last_msg = (
        max(conv.messages, key=lambda m: m.created_at)
        if conv.messages
        else None
    )
    return ConversationOut(
        id=conv.id,
        fhir_conversation_id=conv.fhir_conversation_id,
        patient_id=conv.patient_id,
        subject=conv.subject,
        status=conv.status,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        participants=[
            ParticipantOut(
                user_id=p.user_id,
                username=p.user.username,
                display_name=p.user.username,
                role=p.role,
                joined_at=p.joined_at,
            )
            for p in conv.participants
        ],
        last_message_preview=last_msg.body[:200] if last_msg else None,
        last_message_time=last_msg.created_at if last_msg else None,
        unread_count=unread,
    )


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=MessageOut,
    dependencies=[DEP_REQUIRE_CSRF],
)
def send_message_endpoint(
    conversation_id: int,
    body: MessageCreateIn,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> MessageOut:
    """Send a message in a conversation.

    Writes to FHIR first, then projects to SQL.

    Args:
        conversation_id: ID of the conversation.
        body: Message body (and optional amendment reference).
        u: Authenticated user (must be a participant).
        db: Database session.

    Returns:
        MessageOut: The newly created message.

    Raises:
        HTTPException: 404 if conversation not found.
        HTTPException: 403 if user is not a participant.
        HTTPException: 502 if FHIR write fails.
    """
    try:
        return send_message(
            db=db,
            conversation_id=conversation_id,
            sender=u,
            body=body.body,
            amends_id=body.amends_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except FhirCommunicationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Failed to create message in clinical store",
        ) from exc


@router.post(
    "/conversations/{conversation_id}/participants",
    response_model=ParticipantOut,
    dependencies=[DEP_REQUIRE_CSRF],
)
def add_participant_endpoint(
    conversation_id: int,
    body: AddParticipantIn,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> ParticipantOut:
    """Add a participant to a conversation.

    Only existing participants can add others.

    Args:
        conversation_id: ID of the conversation.
        body: User to add and their role.
        u: Authenticated user.
        db: Database session.

    Returns:
        ParticipantOut: The added participant.

    Raises:
        HTTPException: 404 if conversation not found.
        HTTPException: 403 if requesting user is not a participant.
    """
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    cp = next((p for p in conv.participants if p.user_id == u.id), None)
    if cp is None:
        raise HTTPException(
            status_code=403,
            detail="Only participants can add others",
        )
    try:
        return add_participant(
            db=db,
            conversation_id=conversation_id,
            user_id=body.user_id,
            role=body.role,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/conversations/{conversation_id}/participants",
    response_model=list[ParticipantOut],
)
def list_participants_endpoint(
    conversation_id: int,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> list[ParticipantOut]:
    """List participants in a conversation.

    Args:
        conversation_id: ID of the conversation.
        u: Authenticated user (must be a participant).
        db: Database session.

    Returns:
        list[ParticipantOut]: Participants in the conversation.

    Raises:
        HTTPException: 404 if not found or user is not a participant.
    """
    conv = db.get(Conversation, conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    cp = next((p for p in conv.participants if p.user_id == u.id), None)
    if cp is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return [
        ParticipantOut(
            user_id=p.user_id,
            username=p.user.username,
            display_name=p.user.username,
            role=p.role,
            joined_at=p.joined_at,
        )
        for p in conv.participants
    ]


@router.post(
    "/conversations/{conversation_id}/join",
    response_model=ParticipantOut,
    dependencies=[DEP_REQUIRE_CSRF],
)
def join_conversation_endpoint(
    conversation_id: int,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> ParticipantOut:
    """Join a conversation as a staff member.

    Staff can self-join any conversation they can see.
    Patients cannot self-join; they must be added by a participant.

    Args:
        conversation_id: ID of the conversation.
        u: Authenticated user.
        db: Database session.

    Returns:
        ParticipantOut: The new or existing participant record.

    Raises:
        HTTPException: 404 if conversation not found.
        HTTPException: 403 if user is a patient.
    """
    try:
        return join_conversation(
            db=db,
            conversation_id=conversation_id,
            user=u,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post(
    "/conversations/{conversation_id}/read",
    dependencies=[DEP_REQUIRE_CSRF],
)
def mark_read_endpoint(
    conversation_id: int,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> dict[str, bool]:
    """Mark a conversation as read for the current user.

    Args:
        conversation_id: ID of the conversation.
        u: Authenticated user.
        db: Database session.

    Returns:
        dict: Success status.

    Raises:
        HTTPException: 404 if not found or user is not a participant.
    """
    ok = mark_conversation_read(
        db=db, conversation_id=conversation_id, user_id=u.id
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"ok": True}


from app.features.teaching.router import teaching_router  # noqa: E402

router.include_router(teaching_router)
app.include_router(router)
