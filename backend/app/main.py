"""
main.py

Entry point for the Quill Medical FastAPI application.

This module configures the API, dependencies, authentication,
and patient record routes. All endpoints are exposed under the
`/api` prefix. In development, Swagger UI and ReDoc documentation
are also served under `/api/docs` and `/api/redoc`.
"""

from typing import Any, cast

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
    str(getattr(settings, "BACKEND_ENV", "development"))
    .lower()
    .startswith("dev")
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


COOKIE_KW = dict(
    httponly=True,
    samesite="lax",
    secure=settings.SECURE_COOKIES,
    domain=settings.COOKIE_DOMAIN,
)


def set_auth_cookies(response: Response, access: str, refresh: str, xsrf: str):
    """Set authentication cookies for access, refresh, and CSRF tokens.

    Args:
        response (Response): The outgoing FastAPI response object.
        access (str): Encoded access token (short-lived).
        refresh (str): Encoded refresh token (long-lived).
        xsrf (str): Cross-site request forgery token.
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


def clear_auth_cookies(response: Response):
    """Clear authentication cookies from the client.

    Args:
        response (Response): The outgoing FastAPI response object.
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


def current_user(request: Request, db: Session = DEP_GET_SESSION) -> User:
    """Get the currently authenticated user from cookies.

    Args:
        request (Request): Incoming FastAPI request.
        db (Session): Active SQLAlchemy session.

    Returns:
        User: The authenticated and active user.

    Raises:
        HTTPException: If the user is not authenticated or inactive.
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


def require_roles(*need: str):
    """Create a dependency that enforces required roles on a route.

    Args:
        *need (str): Role names that the caller must possess.

    Returns:
        Callable: A dependency for injection into route `dependencies=[...]`.

    Raises:
        HTTPException: 403 if the user lacks required roles.
    """

    def dep(request: Request, _u: User = DEP_CURRENT_USER):
        have = set(getattr(request.state, "roles", []))
        if not set(need).issubset(have):
            raise HTTPException(403, "Forbidden")
        return _u

    return dep


def require_csrf(request: Request, u: User = DEP_CURRENT_USER):
    """Validate CSRF by comparing header and cookie and checking the signature.

    Args:
        request (Request): Incoming request carrying the header and cookie.
        u (User): Current authenticated user.

    Returns:
        User: The validated user (pass-through).

    Raises:
        HTTPException: 403 on CSRF failure.
    """
    header = request.headers.get("x-csrf-token")
    cookie = request.cookies.get("XSRF-TOKEN")
    if (
        not header
        or not cookie
        or header != cookie
        or not verify_csrf(cookie, cast(str, u.username))
    ):
        raise HTTPException(403, "CSRF failed")
    return u


DEP_REQUIRE_ROLES_CLINICIAN = Depends(require_roles("Clinician"))
DEP_REQUIRE_CSRF = Depends(require_csrf)


@router.post("/auth/login")
def login(
    data: LoginIn, response: Response, db: Session = DEP_GET_SESSION
) -> dict:
    """Authenticate a user and set auth cookies.

    Validates username/password, optionally verifies a time-based one-time code
    when two-factor is enabled, then issues access/refresh/CSRF cookies.

    Args:
        data (LoginIn): Login payload including username, password, and optional TOTP.
        response (Response): Outgoing response used to set cookies.
        db (Session): Database session.

    Returns:
        dict: Minimal result and the caller's username/roles.

    Raises:
        HTTPException: 400 for invalid credentials or TOTP; 401 if token decoding fails.
    """

    user = db.scalar(
        select(User).where(User.username == data.username.strip())
    )

    if not user or not verify_password(
        data.password, cast(str, user.password_hash)
    ):
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
        if not verify_totp_code(
            cast(str, user.totp_secret or ""), data.totp_code
        ):
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Invalid two-factor code",
                    "error_code": "invalid_totp",
                },
            )
    roles = [r.name for r in user.roles]
    access = create_access_token(cast(str, user.username), roles)
    refresh = create_refresh_token(cast(str, user.username))
    xsrf = make_csrf(cast(str, user.username))
    set_auth_cookies(response, access, refresh, xsrf)
    return {
        "detail": "ok",
        "user": {"username": user.username, "roles": roles},
    }


@router.post("/auth/register")
def register(payload: RegisterIn, db: Session = DEP_GET_SESSION):
    """Register a new user with username, email, and password.

    Performs minimal validation and uniqueness checks, then stores a hashed
    password.

    Args:
        payload (RegisterIn): Registration data.
        db (Session): Database session.

    Returns:
        dict: Confirmation payload.

    Raises:
        HTTPException: 400 if fields are missing/short or username/email
                        already exists.
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
    """Output model containing a provisioning URI for authenticator apps."""

    provision_uri: str


@router.post("/auth/totp/setup", response_model=TotpSetupOut)
def totp_setup(u: User = DEP_CURRENT_USER, db: Session = DEP_GET_SESSION):
    """Create (if missing) a TOTP secret and return a provisioning URI.

    The frontend should render the URI as a QR code for an authenticator app.

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
        cast(str, u.totp_secret or ""),
        cast(str, u.username),
        issuer=issuer,
    )
    return {"provision_uri": uri}


class TotpVerifyIn(BaseModel):
    """Input model for verifying a TOTP code during setup."""

    code: str


@router.post("/auth/totp/verify")
def totp_verify(
    payload: TotpVerifyIn,
    u: User = DEP_CURRENT_USER,
    db: Session = DEP_GET_SESSION,
):
    """Verify a TOTP code and enable two-factor authentication for the user.

    Args:
        payload (TotpVerifyIn): The six-digit code from the authenticator app.
        u (User): Current authenticated user.
        db (Session): Database session.

    Returns:
        dict: Confirmation payload.

    Raises:
        HTTPException: 400 if no secret exists or code is invalid.
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
        cast(str, u.totp_secret or ""),
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
def totp_disable(u: User = DEP_REQUIRE_CSRF, db: Session = DEP_GET_SESSION):
    """Disable TOTP for the current user.

    CSRF protection is required.

    Args:
        u (User): Current authenticated user (CSRF-checked).
        db (Session): Database session.

    Returns:
        dict: Confirmation payload.
    """
    u.is_totp_enabled = False
    u.totp_secret = None
    db.add(u)
    db.commit()
    return {"detail": "disabled"}


@router.post("/auth/logout")
def logout(response: Response, _u: User = DEP_CURRENT_USER):
    """Log out the current user by clearing auth cookies.

    Args:
        response (Response): Outgoing response used to clear cookies.
        _u (User): Current authenticated user (unused; enforces auth).

    Returns:
        dict: Confirmation payload.
    """
    clear_auth_cookies(response)
    return {"detail": "ok"}


@router.get("/auth/me")
def me(u: User = DEP_CURRENT_USER):
    """Return a minimal profile for the current user.

    Args:
        u (User): Current authenticated user.

    Returns:
        dict: Basic identity fields and role names.
    """
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "roles": [r.name for r in u.roles],
    }


@router.post("/auth/refresh")
def refresh(
    response: Response, request: Request, db: Session = DEP_GET_SESSION
):
    """Rotate refresh token and issue a new access token.

    Reads the refresh token cookie, validates it, then sets new access/refresh/CSRF cookies.

    Args:
        response (Response): Outgoing response used to set cookies.
        request (Request): Incoming request (reads refresh cookie).
        db (Session): Database session.

    Returns:
        dict: Confirmation payload.

    Raises:
        HTTPException: 401 if the refresh token is missing/invalid or user is inactive.
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
    new_access = create_access_token(cast(str, user.username), roles)
    new_refresh = create_refresh_token(cast(str, user.username))  # rotate
    xsrf = make_csrf(cast(str, user.username))
    set_auth_cookies(response, new_access, new_refresh, xsrf)
    return {"detail": "refreshed"}


@router.post(
    "/patients",
    dependencies=[DEP_REQUIRE_ROLES_CLINICIAN, DEP_REQUIRE_CSRF],
)
def create_patient_record(patient_id: str):
    """Verify or create patient record in FHIR.

    Args:
        patient_id (str): Patient identifier.

    Returns:
        dict: Patient ID and status.

    Raises:
        HTTPException: 404 if patient not found; 500 on errors.
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
def list_patients(u: User = DEP_CURRENT_USER):
    """List all patients from FHIR server.

    Args:
        u (User): Current authenticated user.

    Returns:
        dict: Array of FHIR patient resources.
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
    patient_id: str, demographics: dict, u: User = DEP_CURRENT_USER
):
    """Update demographics for a patient in FHIR.

    Args:
        patient_id (str): Patient identifier.
        demographics (dict): Demographics fields to update.
        u (User): Current authenticated user.

    Returns:
        dict: Updated patient resource.

    Raises:
        HTTPException: 404 if patient not found; 500 on update errors.
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
def get_demographics(patient_id: str, u: User = DEP_CURRENT_USER):
    """Fetch demographics for a patient from FHIR.

    Args:
        patient_id (str): Patient identifier.
        u (User): Current authenticated user.

    Returns:
        dict: Patient demographics from FHIR.

    Raises:
        HTTPException: 404 if not found; 500 on read errors.
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
def write_letter(patient_id: str, letter: LetterIn):
    """Write and store a new letter in OpenEHR.

    Args:
        patient_id (str): Patient identifier.
        letter (LetterIn): Letter metadata and markdown body.

    Returns:
        dict: Composition UID and metadata.

    Raises:
        HTTPException: 500 on write errors.
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
    """Read a specific letter composition from OpenEHR.

    Args:
        patient_id (str): Patient identifier.
        composition_uid (str): OpenEHR composition UID.
        u (User): Current authenticated user.

    Returns:
        dict: Composition data including title and content.

    Raises:
        HTTPException: 404 if not found; 500 on read errors.
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
    """List all letters for a patient from OpenEHR.

    Args:
        patient_id (str): Patient identifier.
        u (User): Current authenticated user.

    Returns:
        dict: List of letter metadata.

    Raises:
        HTTPException: 500 on read errors.
    """
    try:
        letters = list_letters_for_patient(patient_id)
        return {"patient_id": patient_id, "letters": letters}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


# --- FHIR Endpoints ---


class FHIRPatientCreateIn(BaseModel):
    """Input model for creating a FHIR patient."""

    given_name: str
    family_name: str
    patient_id: str | None = None


@router.post("/patients")
def create_patient_in_fhir(
    data: FHIRPatientCreateIn, u: User = DEP_CURRENT_USER
) -> dict[str, Any]:
    """Create a new patient in FHIR server with first and last name.

    Args:
        data (FHIRPatientCreateIn): Patient name information.
        u (User): Current authenticated user.

    Returns:
        dict: Created FHIR Patient resource.

    Raises:
        HTTPException: 500 if FHIR creation fails.
    """
    try:
        patient = create_fhir_patient(
            data.given_name, data.family_name, data.patient_id
        )
        return patient
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to create FHIR patient: {e}"
        ) from e


app.include_router(router)
