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
- Core database: User accounts and roles (PostgreSQL via SQLAlchemy)
- FHIR server: Patient demographics (HAPI FHIR)
- EHRbase: Clinical documents and letters (OpenEHR)
- Push notifications: Persistent subscriptions (PostgreSQL)
"""

import logging
import time
from collections.abc import Callable, Sequence
from typing import Any, cast
from uuid import uuid4

from fastapi import (
    APIRouter,
    FastAPI,
    HTTPException,
    Request,
    Response,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analytics.router import router as analytics_router
from app.api_compatibility import REQUIRED_CLIENT_GENERATION
from app.body_limit import BodyLimitMiddleware
from app.cbac.grant_scope import scope_for
from app.cbac.router import router as cbac_router
from app.compat_harness_endpoints import test_api_router
from app.config import settings
from app.deps import (
    DEP_CURRENT_USER,
    DEP_GET_SESSION,
    DEP_REQUIRE_CSRF,
)
from app.ehrbase_client import (
    EhrbaseClientError,
)
from app.email.account import account_email_values
from app.email.render import RenderedEmail, render_email, send_args
from app.email_send import (
    EmailNotAllowedError,
    EmailRateLimitError,
    EmailSendError,
    send_email,
)
from app.features.passport.errors import PassportError
from app.features.passport.models import Passport
from app.features.teaching.ci_router import router as teaching_ci_router
from app.features.teaching.errors import TeachingError
from app.features.teaching.public_router import (
    router as teaching_public_router,
)
from app.feedback.router import router as feedback_router
from app.fhir_client import (
    FhirClientError,
)
from app.guides.router import router as guides_router
from app.health import check_ehrbase_health, check_fhir_health
from app.health import router as health_router
from app.inbox.router import router as inbox_router
from app.log_context import request_id_var, user_id_var
from app.logging_config import setup_logging
from app.marketing.admin_router import router as newsletter_admin_router
from app.marketing.preferences import (
    MARKETING_WORDING_VERSION,
    set_marketing_preference,
)
from app.marketing.router import router as marketing_router
from app.marketing.subscribers import fold_into_account
from app.messaging_router import router as messaging_router
from app.models import (
    OrgUnitFeature,
    User,
    normalise_email,
    org_unit_member,
)
from app.org_units.errors import OrgUnitError
from app.org_units.router import router as org_units_router
from app.organisations import (
    feature_holder_ids_of,
)
from app.patients.router import router as patients_router
from app.push import router as push_router
from app.push_send import router as push_send_router
from app.rate_limit import limiter
from app.retention_router import router as retention_router
from app.schemas.auth import (
    ChangePasswordIn,
    DetailResponse,
    ForgotPasswordIn,
    LoginIn,
    LoginOut,
    MeOut,
    RefreshOut,
    RegisterIn,
    ResendVerificationIn,
    ResetPasswordIn,
    TotpDisableIn,
    UpdateProfileIn,
    VerifyEmailIn,
)
from app.schemas.limits import MAX_TOTP_CODE
from app.schemas.messaging import (
    AcceptInviteIn,
)
from app.schemas.patients import (
    AcceptInviteOut,
)
from app.security import (
    create_access_token,
    create_email_verify_token,
    create_password_reset_token,
    create_refresh_token,
    decode_refresh_token,
    generate_totp_secret,
    hash_password,
    make_csrf,
    password_needs_rehash,
    totp_provisioning_uri,
    verify_email_verify_token,
    verify_password,
    verify_password_reset_token,
)
from app.users.errors import UserAdminError
from app.users.invites import accept_external_invite
from app.users.register import (
    Registration,
    register_account,
    undo_registration,
)
from app.users.router import router as users_router
from app.users.totp import use_totp_code

setup_logging()
logger = logging.getLogger(__name__)

DEV_MODE = settings.BACKEND_ENV.lower().startswith("dev")


def _verification_email(
    user: User, verify_url: str, *, welcome: bool
) -> RenderedEmail:
    """The email that asks somebody to verify their address.

    Sent from three places: on registering (``welcome`` greets them), and
    when a fresh link is asked for or an unverified login is refused.

    Args:
        user: The account whose address is being verified.
        verify_url: The verification link.
        welcome: True on registering.

    Returns:
        The rendered email, for ``send_email(to=..., **send_args(...))``.
    """
    return render_email(
        "email_verification.html.j2",
        "quill",
        {
            **account_email_values(user),
            "verify_url": verify_url,
            "ttl_minutes": settings.EMAIL_VERIFY_TTL_MIN,
            "welcome": welcome,
        },
    )


router = APIRouter(prefix=settings.API_PREFIX)

router.include_router(analytics_router)
router.include_router(feedback_router)
router.include_router(guides_router)
router.include_router(inbox_router)
router.include_router(marketing_router)
router.include_router(newsletter_admin_router)
router.include_router(retention_router)
router.include_router(push_router)

# Permanent API-compatibility test harness (item 19) - always false in real
# deployments; CI sets this true only when dumping OpenAPI specs for the
# breaking-change check.
if settings.TEST_API_ENDPOINTS_ENABLED:
    router.include_router(test_api_router)

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

# --- Request body size limit ---
# One megabyte, and more for the few routes that take a file. The limits
# and the reasons are in app/body_limit.py.
app.add_middleware(BodyLimitMiddleware)


@app.middleware("http")
async def add_compat_generation_header(
    request: Request,
    call_next: Callable,  # type: ignore[type-arg]
) -> Response:
    """Attach Compat-Generation so clients can detect a forced-reload API change."""
    response: Response = await call_next(request)
    response.headers["Compat-Generation"] = str(REQUIRED_CLIENT_GENERATION)

    return response

    # --- Rate limiting (slowapi) ---
    # Created in app.rate_limit so routers in their own modules can decorate with
    # it without importing main. Re-exported here by the import above, so
    # `from app.main import limiter` keeps working.


app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]


# --- FHIR client error handler ---
@app.exception_handler(FhirClientError)
async def fhir_client_error_handler(
    request: Request, exc: FhirClientError
) -> Response:
    """Return a clean 502 response for FHIR service failures."""
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=502,
        content={"detail": str(exc)},
    )

    # --- EHRbase client error handler ---


@app.exception_handler(UserAdminError)
async def user_admin_error_handler(
    request: Request, exc: UserAdminError
) -> Response:
    """Answer a refused change to an account with its own words.

    The status and the message are the class's, fixed where the refusal
    is defined, so this formats nothing. The body is the one an
    ``HTTPException`` gives.
    """
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message},
    )


@app.exception_handler(OrgUnitError)
async def org_unit_error_handler(
    request: Request, exc: OrgUnitError
) -> Response:
    """Answer something refused at an org unit with its own words.

    The status and the message are the class's, fixed where the refusal
    is defined, so this formats nothing. The body is the one an
    ``HTTPException`` gives.
    """
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message},
    )


@app.exception_handler(PassportError)
async def passport_error_handler(
    request: Request, exc: PassportError
) -> Response:
    """Answer something refused of a passport with its own words.

    The status and the message are the class's, fixed where the refusal
    is defined, so this formats nothing. The body is the one an
    ``HTTPException`` gives.
    """
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message},
    )


@app.exception_handler(TeachingError)
async def teaching_error_handler(
    request: Request, exc: TeachingError
) -> Response:
    """Answer something refused of teaching content with its own words.

    The status and the message are the class's, fixed where the refusal
    is defined, so this formats nothing. The body is the one an
    ``HTTPException`` gives.
    """
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message},
    )


@app.exception_handler(EhrbaseClientError)
async def ehrbase_client_error_handler(
    request: Request, exc: EhrbaseClientError
) -> Response:
    """Return a clean 502 response for EHRbase service failures."""
    from fastapi.responses import JSONResponse

    return JSONResponse(
        status_code=502,
        content={"detail": str(exc)},
    )

    # --- Request logging middleware ---


@app.middleware("http")
async def log_requests(
    request: Request,
    call_next: Callable,  # type: ignore[type-arg]
) -> Response:
    """Log every request with timing, method, path, and status."""
    # Use inbound trace header if present, otherwise generate a new ID
    request_id = (
        request.headers.get("x-request-id")
        or request.headers.get("x-cloud-trace-context", "").split("/")[0]
        or uuid4().hex[:12]
    )
    # Set context var so all loggers within this request include request_id
    token = request_id_var.set(request_id)
    request.state.request_id = request_id

    start = time.monotonic()

    try:
        response: Response = await call_next(request)
    finally:
        user_id_var.set(None)
        request_id_var.reset(token)

    elapsed_ms = round((time.monotonic() - start) * 1000, 1)
    response.headers["X-Request-ID"] = request_id

    logger.info(
        "%s %s %s %.1fms",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
        extra={
            "method": request.method,
            "path": request.url.path,
            "status": response.status_code,
            "duration_ms": elapsed_ms,
            "client_ip": request.client.host if request.client else None,
        },
    )

    return response


app.include_router(push_send_router)

# Type the cookie kwargs properly to avoid mypy complaints
COOKIE_KW: dict[str, Any] = {
    "httponly": True,
    "samesite": "lax",
    "secure": settings.SECURE_COOKIES,
    "domain": settings.COOKIE_DOMAIN,
}


router.include_router(health_router)


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
    # Not HTTP-only on purpose: the frontend reads this cookie to send its
    # value back as the CSRF header, which is the whole of how the check
    # works. It holds no session and is useless without the other two.
    # nosemgrep: py.cookie.script-can-read-it
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


@router.post("/auth/login", response_model=LoginOut)
@limiter.limit("5/minute")
def login(
    request: Request,
    data: LoginIn,
    response: Response,
    db: Session = DEP_GET_SESSION,
) -> LoginOut:
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
        HTTPException: 400 if credentials invalid, the account is
            deactivated, 2FA required, or TOTP code invalid.
    """

    user = db.scalar(
        select(User).where(User.username == data.username.strip())
    )

    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(400, "Invalid credentials")

    # A deactivated account answers exactly as a wrong password does, so
    # the reply says nothing about whether the account exists. Checked
    # after the password, so both replies take the same time, and before
    # the verification step, so no email goes to a closed account.
    if not user.is_active:
        raise HTTPException(400, "Invalid credentials")

    if not user.email_verified:
        token = create_email_verify_token(user.email)
        verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
        send_email(
            to=user.email,
            **send_args(_verification_email(user, verify_url, welcome=False)),
        )
        raise HTTPException(
            status_code=403,
            detail={
                "message": "Email not verified",
                "error_code": "email_not_verified",
                "email": user.email,
            },
        )

    if getattr(user, "is_totp_enabled", False):
        if not data.totp_code:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Two-factor required",
                    "error_code": "two_factor_required",
                },
            )
        if not use_totp_code(db, user, data.totp_code):
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Invalid two-factor code",
                    "error_code": "invalid_totp",
                },
            )

    # The password is in hand and has verified, so a hash made under
    # weaker parameters than today's is made again now. The session
    # dependency commits it with the login.
    if password_needs_rehash(user.password_hash):
        user.password_hash = hash_password(data.password)
        db.add(user)

    roles = [r.name for r in user.roles]
    access = create_access_token(user.username, user.token_version)
    refresh = create_refresh_token(user.username, user.token_version)
    xsrf = make_csrf(user.username)
    set_auth_cookies(response, access, refresh, xsrf)

    return LoginOut(
        detail="ok",
        user={"username": user.username, "roles": roles},
    )


router.include_router(teaching_public_router)


@router.post("/auth/register", response_model=DetailResponse)
@limiter.limit("3/minute")
def register(
    request: Request,
    payload: RegisterIn,
    db: Session = DEP_GET_SESSION,
) -> DetailResponse:
    """User Registration.

    Creates a new user account with username, email, and password. Performs
    validation checks for required fields, password minimum length, and uniqueness
    constraints. The password is hashed with Argon2 before storage. Users are
    created without any roles by default and must be assigned roles by an
    administrator.

    Only available when clinical services are disabled (teaching environments).
    Clinical environments require admin-managed onboarding.

    Validation Rules:
    - Username and email must not be empty after stripping whitespace
    - Password must be at least 8 characters long
    - Username must be unique across all users
    - Email must be unique across all users

    **No verification email, no account, and no email without one.**
    The account is committed first and the email sent second, so a link
    never goes out for an account that failed to save. If the email then
    cannot be sent, the account is removed again. An account whose
    verification link never arrived cannot be recovered by the person
    who made it: the address is taken, so registering again is refused
    as a duplicate, and only somebody with database access can undo it.
    Removing it leaves the address free and the person able to try
    again.

    Args:
        payload: Registration data (username, email, password).
        db: Database session for user creation.

    Returns:
        dict: Success response with {"detail": "created"}.

    Raises:
        HTTPException: 403 if clinical services are enabled.
        UserAdminError: 400 for whatever ``register_account`` refuses.
            See :mod:`app.users.register` for each. A username or an
            address that is taken gets one answer, which does not say
            which.
        HTTPException: 400 if this environment may not email the address.
        HTTPException: 429 if that address has had its hour's allowance.
        HTTPException: 502 if the verification email could not be sent,
            in which case no account was created.
    """
    if settings.CLINICAL_SERVICES_ENABLED:
        raise HTTPException(
            status_code=403,
            detail="Self-registration is not available in this environment",
        )

    user = register_account(
        db,
        Registration(
            username=payload.username,
            email=payload.email,
            password=payload.password,
            full_name=payload.full_name,
            org_unit_id=payload.org_unit_id,
            site_id=payload.site_id,
            marketing_opt_out=payload.marketing_opt_out,
            teaching_module_id=payload.teaching_module_id,
            clinical_lead_email=payload.clinical_lead_email,
        ),
    )

    # The account is saved before the mail goes. Sending first left a
    # gap: the mail could go and the commit after it fail, and somebody
    # then held a verification link to an account that did not exist.
    # Now a commit that fails raises here, before anything is sent, and
    # the session dependency rolls the registration back.
    #
    # This commit is deliberate, where a route normally leaves it to the
    # dependency: it is what makes the account durable before the mail.
    user_id = user.id
    db.commit()

    # A mail that cannot be sent still abandons the whole registration,
    # as it always has. An account nobody can verify is worse than no
    # account: the address is taken, so registering again is refused as
    # a duplicate, and the only way out is somebody editing the database.
    # The account is by now saved, so it is removed again, which leaves
    # the person able to simply try again.
    token = create_email_verify_token(user.email)
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"

    try:
        send_email(
            to=user.email,
            **send_args(_verification_email(user, verify_url, welcome=True)),
        )
    except EmailRateLimitError:
        # The address has had its hour's allowance, which on this route
        # means somebody registering the same address repeatedly.
        logger.warning("registration mail not sent: address rate limited")
        _take_back_registration(db, user_id)
        raise HTTPException(
            status_code=429,
            detail=(
                "Too many attempts for that email address. Try again " "later."
            ),
        ) from None
    except EmailNotAllowedError:
        # Only reachable where EMAIL_ALLOWED_RECIPIENTS is set, which is
        # a development machine.
        logger.warning("registration mail not sent: recipient not allowed")
        _take_back_registration(db, user_id)
        raise HTTPException(
            status_code=400,
            detail=(
                "This environment may only email approved addresses. "
                "Nothing has been saved."
            ),
        ) from None
    except Exception:
        # Unreachable, refused, timed out. The account is removed again,
        # so the address stays free.
        logger.exception("registration mail could not be sent")
        _take_back_registration(db, user_id)
        raise HTTPException(
            status_code=502,
            detail=(
                "We could not send your verification email, so the "
                "account has not been created. Please try again."
            ),
        ) from None

    return DetailResponse(detail="created")


def _take_back_registration(db: Session, user_id: int) -> None:
    """Remove the account whose verification email could not be sent.

    Never raises. The caller is about to answer for the email that
    failed, and that answer stands whatever happens here. If the account
    cannot be removed it is left as it is, saved and unverified, which
    is the state the resend route exists for: the person can ask for the
    email again. It is logged so somebody can look.

    Args:
        db: Core database session. Committed here, so the removal lasts
            through the rollback that follows the caller's refusal.
        user_id: The account ``register_account`` returned.
    """
    try:
        undo_registration(db, user_id)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception(
            "registration could not be undone for user %s", user_id
        )


@router.post("/auth/verify-email", response_model=DetailResponse)
@limiter.limit("10/minute")
def verify_email(
    request: Request,
    data: VerifyEmailIn,
    db: Session = DEP_GET_SESSION,
) -> DetailResponse:
    """Verify a user's email address using a signed token.

    Validates the token from the email link and marks the user's email
    as verified. Returns a generic error for invalid/expired tokens.

    Args:
        data: Payload with the verification token.
        db: Database session for user update.

    Returns:
        dict: ``{"detail": "verified"}`` on success.

    Raises:
        HTTPException: 400 if the token is invalid or expired.
    """
    email = verify_email_verify_token(data.token)

    if not email:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    user = db.scalar(select(User).where(User.email == email))

    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    if user.email_verified:
        return DetailResponse(detail="verified")

    user.email_verified = True
    # They may be on the mailing list of people with no account. Now
    # the address is proven theirs, one record of them is kept.
    fold_into_account(db, user)

    return DetailResponse(detail="verified")


@router.post("/auth/resend-verification", response_model=DetailResponse)
@limiter.limit("1/minute")
def resend_verification(
    request: Request,
    data: ResendVerificationIn,
    db: Session = DEP_GET_SESSION,
) -> DetailResponse:
    """Resend the email verification link.

    Looks up the user by email and sends a new verification token.
    Always returns success to prevent account enumeration.

    Args:
        data: Payload with the user's email address.
        db: Database session for user lookup.

    Returns:
        dict: Always returns ``{"detail": "ok"}``.
    """
    email = normalise_email(data.email)
    user = db.scalar(select(User).where(User.email == email))

    if user and not user.email_verified:
        token = create_email_verify_token(email)
        verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
        send_email(
            to=email,
            **send_args(_verification_email(user, verify_url, welcome=False)),
        )

        # Always return ok to prevent account enumeration
    return DetailResponse(detail="ok")


def _send_forgot_password_email(to: str, rendered: RenderedEmail) -> None:
    """Send one of the forgot password emails, and never fail the request.

    Whatever becomes of the email, the route answers the same, so a send
    that is refused or fails cannot show whether the address has an
    account. A failure is logged, without the address, and the person can
    ask again.
    """
    try:
        send_email(to=to, **send_args(rendered))
    except EmailRateLimitError:
        logger.warning("forgot password mail not sent: address rate limited")
    except EmailNotAllowedError:
        logger.warning("forgot password mail not sent: recipient not allowed")
    except EmailSendError:
        logger.exception("forgot password mail could not be sent")


@router.post("/auth/forgot-password", response_model=DetailResponse)
@limiter.limit("3/minute")
def forgot_password(
    request: Request,
    data: ForgotPasswordIn,
    db: Session = DEP_GET_SESSION,
) -> DetailResponse:
    """Request a password reset email.

    Always returns the same success response, whatever the address, so the
    page never shows who has an account. The email says what is true,
    since only the address's owner reads it, as the OWASP Forgot Password
    Cheat Sheet advises:

    - an active account with a confirmed address is sent a reset link;
    - one whose address is not confirmed yet is sent a link that confirms
      it and sets the password, rather than a reset that would leave them
      refused at login as unconfirmed;
    - an address with no account is told so, with a link to register;
    - a deactivated account is sent nothing. It is treated as unknown,
      and a "register" email would invite a second account.

    The reset link contains a time-limited signed token (default 30 min).

    Args:
        data: Payload with the user's email address.
        db: Database session for user lookup.

    Returns:
        dict: Always returns ``{"detail": "ok"}`` to prevent enumeration.
    """
    email = normalise_email(data.email)
    user = db.scalar(select(User).where(User.email == email))

    if user is None:
        _send_forgot_password_email(
            email,
            render_email(
                "no_account.html.j2",
                "quill",
                {
                    "email": email,
                    "register_url": f"{settings.FRONTEND_URL}/register",
                },
            ),
        )

        return DetailResponse(detail="ok")

    # A deactivated account is treated as an unknown address would have
    # been before: no email, and the same reply.
    if not user.is_active:
        return DetailResponse(detail="ok")

    token = create_password_reset_token(email, user.token_version)
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    template = "password_reset.html.j2"

    # `confirm=1` is what makes the page say "Set your password".
    if not user.email_verified:
        reset_url = f"{reset_url}&confirm=1"
        template = "confirm_and_set_password.html.j2"

    _send_forgot_password_email(
        email,
        render_email(
            template,
            "quill",
            {
                **account_email_values(user),
                "reset_url": reset_url,
                "ttl_minutes": settings.PASSWORD_RESET_TTL_MIN,
            },
        ),
    )

    return DetailResponse(detail="ok")


@router.post("/auth/reset-password", response_model=DetailResponse)
@limiter.limit("5/minute")
def reset_password(
    request: Request,
    data: ResetPasswordIn,
    db: Session = DEP_GET_SESSION,
) -> DetailResponse:
    """Reset a user's password using a reset token.

    Verifies the token from the email link, validates the new password,
    and updates the user's password hash.

    Args:
        data: Payload with the reset token and new password.
        db: Database session for user update.

    Returns:
        dict: ``{"detail": "Password reset successfully"}`` on success.

    Raises:
        HTTPException: 400 if the token is invalid/expired or
            the new password does not meet requirements.
    """
    claims = verify_password_reset_token(data.token)

    if not claims:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired reset link",
        )
    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="New password must be at least 8 characters",
        )

    user = db.scalar(select(User).where(User.email == claims.email))

    # A link sent before the account was deactivated is refused as an
    # expired one would be. So is one already used: the reset below
    # moves token_version on, and the link names the old one.
    if not user or not user.is_active:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired reset link",
        )
    if claims.token_version != user.token_version:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired reset link",
        )

    user.password_hash = hash_password(data.new_password)
    user.token_version += 1  # Invalidate all existing sessions
    # The link was emailed to this address and followed, which proves the
    # address is theirs as the verification link does. So a reset confirms
    # it, and nobody is refused at login as unconfirmed straight after.
    user.email_verified = True
    db.add(user)

    # Somebody whose account was made for them never saw a registration
    # form, so the invite's page asks the marketing question and the
    # answer arrives here. It is the same opt-out as registration: left
    # unticked, they are sent news. An ordinary reset sends nothing and
    # changes nothing. The link came by email, so the address is theirs.
    if data.marketing_opt_out is not None:
        set_marketing_preference(
            db,
            user,
            wants=not data.marketing_opt_out,
            source="invite",
            wording_version=MARKETING_WORDING_VERSION,
            first_answer=True,
        )

    return DetailResponse(detail="Password reset successfully")


router.include_router(users_router)


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
@limiter.limit("5/minute")
def totp_setup(
    request: Request,
    current_user: User = DEP_REQUIRE_CSRF,
    db: Session = DEP_GET_SESSION,
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
        current_user: Currently authenticated user from JWT.
        db: Database session for updating user.

    Returns:
        TotpSetupOut: Object containing provision_uri for QR code.

    Args:
        u (User): Current authenticated user (injected).
        db (Session): Database session.

    Returns:
        TotpSetupOut: Provisioning URI encoded with issuer and account name.
    """
    if not getattr(current_user, "totp_secret", None):
        current_user.totp_secret = generate_totp_secret()

    db.add(current_user)
    issuer = getattr(settings, "PROJECT_NAME", "Quill")
    uri = totp_provisioning_uri(
        current_user.totp_secret or "",
        current_user.username,
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

    model_config = {"extra": "forbid"}

    code: str = Field(max_length=MAX_TOTP_CODE)


@router.post("/auth/totp/verify", response_model=DetailResponse)
@limiter.limit("5/minute")
def totp_verify(
    request: Request,
    payload: TotpVerifyIn,
    current_user: User = DEP_REQUIRE_CSRF,
    db: Session = DEP_GET_SESSION,
) -> DetailResponse:
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
        current_user: Currently authenticated user from JWT.
        db: Database session for updating user.

    Returns:
        dict: Success response with {"detail": "enabled"}.

    Raises:
        HTTPException: 400 if:
            - No TOTP secret exists (must call /auth/totp/setup first)
            - TOTP code is invalid or expired
    """
    if not getattr(current_user, "totp_secret", None):
        raise HTTPException(
            status_code=400,
            detail={
                "message": "No TOTP secret set",
                "error_code": "no_totp_secret",
            },
        )
    if not use_totp_code(db, current_user, payload.code):
        raise HTTPException(
            status_code=400,
            detail={"message": "Invalid code", "error_code": "invalid_totp"},
        )

    current_user.is_totp_enabled = True
    db.add(current_user)

    return DetailResponse(detail="enabled")


@router.post("/auth/totp/disable", response_model=DetailResponse)
@limiter.limit("5/minute")
def totp_disable(
    request: Request,
    data: TotpDisableIn,
    current_user: User = DEP_REQUIRE_CSRF,
    db: Session = DEP_GET_SESSION,
) -> DetailResponse:
    """Disable Two-Factor Authentication.

    Disables TOTP two-factor authentication for the current user and clears
    their TOTP secret. Future logins will only require username and password.
    Requires CSRF token and password re-entry for security.

    Security Note:
        Password re-entry prevents an attacker with a stolen session from
        silently disabling 2FA. CSRF protection adds a second layer.

    Args:
        data: Payload containing the user's current password.
        current_user: Currently authenticated user (with CSRF validation).
        db: Database session for updating user.

    Returns:
        dict: Success response with {"detail": "disabled"}.

    Raises:
        HTTPException: 400 if password is incorrect.
    """
    if not verify_password(data.password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect password")

    current_user.is_totp_enabled = False
    current_user.totp_secret = None
    current_user.totp_last_step = None
    db.add(current_user)

    return DetailResponse(detail="disabled")


@router.post("/auth/change-password", response_model=DetailResponse)
def change_password(
    data: ChangePasswordIn,
    response: Response,
    current_user: User = DEP_REQUIRE_CSRF,
    db: Session = DEP_GET_SESSION,
) -> DetailResponse:
    """Change the current user's password.

    Verifies the current password, validates the new password meets
    minimum requirements, then updates the hash. Requires CSRF token.
    Re-issues auth cookies so the current session remains valid.

    Args:
        data: Current and new password payload.
        response: FastAPI response for setting new auth cookies.
        current_user: Currently authenticated user (with CSRF validation).
        db: Database session for updating user.

    Returns:
        dict: Success response with {"detail": "Password changed"}.

    Raises:
        HTTPException: 400 if current password is wrong or new password
            does not meet requirements.
    """
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=400, detail="Current password is incorrect"
        )
    if verify_password(data.new_password, current_user.password_hash):
        raise HTTPException(
            status_code=400,
            detail="New password must be different from current password",
        )
    if len(data.new_password) < 8:
        raise HTTPException(
            status_code=400,
            detail="New password must be at least 8 characters",
        )

    current_user.password_hash = hash_password(data.new_password)
    current_user.token_version += 1  # Invalidate all existing sessions
    db.add(current_user)
    db.commit()

    # Re-issue cookies so the current session stays authenticated
    access = create_access_token(
        current_user.username, current_user.token_version
    )
    refresh = create_refresh_token(
        current_user.username, current_user.token_version
    )
    xsrf = make_csrf(current_user.username)
    set_auth_cookies(response, access, refresh, xsrf)

    return DetailResponse(detail="Password changed")


@router.post("/auth/logout", response_model=DetailResponse)
def logout(response: Response, _u: User = DEP_REQUIRE_CSRF) -> DetailResponse:
    """User Logout.

    Logs out the current user by clearing all authentication cookies (access_token,
    refresh_token, XSRF-TOKEN). The user will need to login again to access
    protected endpoints. Tokens from this session remain valid until expiration
    but password changes invalidate all sessions via token_version.

    Args:
        response: FastAPI response object for clearing cookies.
        _u: Currently authenticated user (validates auth before logout).

    Returns:
        DetailResponse: Success response.
    """
    clear_auth_cookies(response)

    return DetailResponse(detail="ok")


@router.get("/auth/me", response_model=MeOut)
def me(
    current_user: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
) -> MeOut:
    """Get Current User Profile.

    Returns the authenticated user's profile information including username,
    email, assigned roles, system permissions, TOTP status, and enabled
    features from the union of the user's organisations.

    Args:
        current_user: Currently authenticated user from JWT.
        db: Database session.

    Returns:
        dict: User profile with keys:
            - id: User's database ID
            - username: User's username
            - email: User's email address
            - roles: List of assigned role names
            - totp_enabled: Whether 2FA is active
            - enabled_features: Features enabled on any of the user's orgs
            - competencies: Resolved CBAC competency IDs
    """
    # Resolve features from every organisation a membership reaches:
    # the ones they belong to directly, and the one accountable for any
    # ward or clinic they belong to. One walk up answers both, because
    # an organisation's own row is its own root.
    member_org_unit_ids = list(
        cast(
            Sequence[int],
            db.execute(
                select(org_unit_member.c.org_unit_id).where(
                    org_unit_member.c.user_id == current_user.id
                )
            )
            .scalars()
            .all(),
        )
    )
    user_org_unit_ids = feature_holder_ids_of(db, member_org_unit_ids)
    enabled_features: list[str] = []

    if user_org_unit_ids:
        features = (
            db.execute(
                select(OrgUnitFeature.feature_key)
                .where(OrgUnitFeature.org_unit_id.in_(user_org_unit_ids))
                .distinct()
            )
            .scalars()
            .all()
        )
        enabled_features = list(features)

    grant_scope = scope_for(current_user)
    owns_passport = (
        db.scalar(
            select(Passport.id).where(Passport.user_id == current_user.id)
        )
        is not None
    )

    return MeOut(
        owns_passport=owns_passport,
        id=current_user.id,
        username=current_user.username,
        name=current_user.full_name,
        email=current_user.email,
        marketing_emails=current_user.marketing_emails,
        roles=[r.name for r in current_user.roles],
        platform_role=current_user.platform_role,
        fhir_patient_id=current_user.fhir_patient_id,
        totp_enabled=current_user.is_totp_enabled,
        enabled_features=enabled_features,
        clinical_services_enabled=settings.CLINICAL_SERVICES_ENABLED,
        competencies=current_user.get_final_competencies(),
        may_grant=(
            sorted(grant_scope.competencies)
            if grant_scope.competencies is not None
            else None
        ),
        may_assign_professions=(
            sorted(grant_scope.professions)
            if grant_scope.professions is not None
            else None
        ),
    )


@router.patch("/auth/profile", response_model=DetailResponse)
def update_profile(
    data: UpdateProfileIn,
    current_user: User = DEP_REQUIRE_CSRF,
    db: Session = DEP_GET_SESSION,
) -> DetailResponse:
    """Update the current user's profile.

    Allows updating full_name and email. If email is changed,
    email_verified is reset to False. Username cannot be changed.

    Args:
        data: Profile update payload (full_name, email - both optional).
        current_user: Currently authenticated user (with CSRF validation).
        db: Database session for updating user.

    Returns:
        dict: Success response with {"detail": "Profile updated"}.

    Raises:
        HTTPException: 400 if no fields provided or email already taken.
    """
    if data.full_name is None and data.email is None:
        raise HTTPException(status_code=400, detail="No fields to update")

    if data.full_name is not None:
        current_user.full_name = data.full_name.strip()

    if data.email is not None:
        new_email = normalise_email(data.email)
        if new_email != (current_user.email or "").strip().lower():
            existing = db.execute(
                select(User.id).where(
                    User.email == new_email, User.id != current_user.id
                )
            ).scalar_one_or_none()
            if existing:
                raise HTTPException(
                    status_code=400,
                    detail="Email address is already in use",
                )
            current_user.email = new_email
            current_user.email_verified = False

    db.add(current_user)

    return DetailResponse(detail="Profile updated")


@router.post("/auth/refresh", response_model=RefreshOut)
def refresh(
    response: Response, request: Request, db: Session = DEP_GET_SESSION
) -> RefreshOut:
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
        claims = decode_refresh_token(tok)
    except Exception as e:
        raise HTTPException(401, "Bad refresh token") from e

    user = db.scalar(select(User).where(User.username == claims.username))

    if not user or not user.is_active:
        raise HTTPException(401, "Inactive user")
        # Reject refresh tokens minted before a password change
    if claims.token_version != user.token_version:
        raise HTTPException(401, "Session invalidated")

    new_access = create_access_token(user.username, user.token_version)
    new_refresh = create_refresh_token(
        user.username, user.token_version
    )  # rotate
    xsrf = make_csrf(user.username)
    set_auth_cookies(response, new_access, new_refresh, xsrf)

    return RefreshOut(detail="refreshed")


router.include_router(patients_router)


router.include_router(cbac_router)


# ==========================================================================
# EXTERNAL ACCESS (invite / accept / revoke)
# ==========================================================================


@router.post("/accept-invite", response_model=AcceptInviteOut)
def accept_invite(
    body: AcceptInviteIn,
    db: Session = DEP_GET_SESSION,
) -> AcceptInviteOut:
    """Accept an invite - register or grant access to existing user.

    If the email matches an existing user, access is granted
    immediately. Otherwise a new user is created with the fields
    supplied in the request body.

    Args:
        body: Invite token and optional registration fields.
        db: Database session.

    Returns:
        dict: Status and redirect information.

    Raises:
        UserAdminError: 400, 422 or 409 for whatever
            ``accept_external_invite`` refuses.
    """
    accepted = accept_external_invite(
        db, body.token, username=body.username, password=body.password
    )

    return AcceptInviteOut(
        status="registered" if accepted.registered else "access_granted",
        user_id=accepted.user.id,
    )


router.include_router(messaging_router)


from app.features.teaching.router import teaching_router  # noqa: E402

router.include_router(org_units_router)
router.include_router(teaching_router)

from app.features.teaching.door import door_router  # noqa: E402

router.include_router(door_router)

from app.features.passport.router import (  # noqa: E402
    passport_public_router,
    passport_router,
)

router.include_router(passport_router)

# Accepting an assessor invitation cannot sit behind the feature gate:
# the person accepting has no account, no organisation and therefore no
# membership for `requires_feature` to resolve through. The signed,
# expiring token is what stands in for it.
router.include_router(passport_public_router)


router.include_router(teaching_ci_router)

app.include_router(router)

# --- Conditional static file serving for local dev ---
if settings.TEACHING_QUESTION_BANK_PATH and not settings.TEACHING_GCS_BUCKET:
    from app.features.teaching.local_media import mount_local_media_routes

    mount_local_media_routes(app, settings.TEACHING_QUESTION_BANK_PATH)
