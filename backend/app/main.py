import json
from datetime import datetime
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_session
from app.models import User

# hashing helpers are available if you add a register route later
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_totp_secret,
    make_csrf,
    totp_provisioning_uri,
    verify_csrf,
    verify_password,
    verify_totp_code,
)
from app.security import hash_password

app = FastAPI(title="Quill API")

# ---------- Cookie helpers ----------

COOKIE_KW = dict(
    httponly=True,
    samesite="lax",
    secure=settings.SECURE_COOKIES,
    domain=settings.COOKIE_DOMAIN,
)


def set_auth_cookies(resp: Response, access: str, refresh: str, xsrf: str):
    resp.set_cookie("access_token", access, path="/", **COOKIE_KW)
    # scope refresh to its endpoint path (optional hardening)
    resp.set_cookie(
        "refresh_token", refresh, path="/api/auth/refresh", **COOKIE_KW
    )
    # CSRF cookie is readable by JS so SPA can echo back in header
    resp.set_cookie(
        "XSRF-TOKEN",
        xsrf,
        path="/",
        httponly=False,
        samesite="lax",
        secure=settings.SECURE_COOKIES,
        domain=settings.COOKIE_DOMAIN,
    )


def clear_auth_cookies(resp: Response):
    resp.delete_cookie("access_token", path="/", domain=settings.COOKIE_DOMAIN)
    resp.delete_cookie(
        "refresh_token",
        path="/api/auth/refresh",
        domain=settings.COOKIE_DOMAIN,
    )
    resp.delete_cookie("XSRF-TOKEN", path="/", domain=settings.COOKIE_DOMAIN)


# ---------- Auth dependencies ----------


def current_user(request: Request, db: Session = Depends(get_session)) -> User:
    tok = request.cookies.get("access_token")
    if not tok:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = decode_token(tok)
    except Exception:
        raise HTTPException(401, "Invalid token")
    sub = payload.get("sub")
    user = db.scalar(select(User).where(User.username == sub))
    if not user or not user.is_active:
        raise HTTPException(401, "Inactive user")
    # stash roles on request for role checks
    request.state.roles = [r.name for r in user.roles]
    return user


def require_roles(*need: str):
    def dep(request: Request, _u: User = Depends(current_user)):
        have = set(getattr(request.state, "roles", []))
        if not set(need).issubset(have):
            raise HTTPException(403, "Forbidden")
        return _u

    return dep


def require_csrf(request: Request, u: User = Depends(current_user)):
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


# ---------- Auth routes (new) ----------


class LoginIn(BaseModel):
    username: str
    password: str
    totp_code: str | None = None


class RegisterIn(BaseModel):
    username: str
    email: str
    password: str


@app.post("/api/auth/login")
def login(
    data: LoginIn, response: Response, db: Session = Depends(get_session)
):
    user = db.scalar(
        select(User).where(User.username == data.username.strip())
    )
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(400, "Invalid credentials")
    # If user has TOTP enabled, require totp_code
    if getattr(user, "is_totp_enabled", False):
        if not data.totp_code:
            # Signal to the client that two-factor is required
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Two-factor required",
                    "error_code": "two_factor_required",
                },
            )
        if not verify_totp_code(user.totp_secret or "", data.totp_code):
            # Explicit invalid TOTP
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


@app.post("/api/auth/register")
def register(payload: RegisterIn, db: Session = Depends(get_session)):
    """Create a new user account. This is intentionally simple for the
    development environment: it validates uniqueness of username/email and
    stores a hashed password. Returns a minimal success response.
    """
    username = payload.username.strip()
    email = payload.email.strip()
    if not username or not email or not payload.password:
        raise HTTPException(status_code=400, detail="Missing fields")
    # Basic password length check
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Password too short")
    # Check uniqueness
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


# ---------- TOTP management endpoints ----------
class TotpSetupOut(BaseModel):
    provision_uri: str


@app.post("/api/auth/totp/setup", response_model=TotpSetupOut)
def totp_setup(
    u: User = Depends(current_user), db: Session = Depends(get_session)
):
    """Return a provisioning URI for the user's current (or new) secret.
    The frontend should render this as a QR code. This endpoint is protected.
    """
    # ensure user has a secret; we'll generate one server-side if missing
    if not getattr(u, "totp_secret", None):
        u.totp_secret = generate_totp_secret()
    # Persist the secret immediately so callers (and other sessions)
    # will see the secret without relying on session autoflush semantics.
    db.add(u)
    db.commit()
    issuer = getattr(settings, "PROJECT_NAME", "Quill")
    uri = totp_provisioning_uri(u.totp_secret, u.username, issuer=issuer)
    return {"provision_uri": uri}


class TotpVerifyIn(BaseModel):
    code: str


@app.post("/api/auth/totp/verify")
def totp_verify(
    payload: TotpVerifyIn,
    u: User = Depends(current_user),
    db: Session = Depends(get_session),
):
    """Verify a code and enable TOTP for the current user when valid."""
    if not getattr(u, "totp_secret", None):
        raise HTTPException(
            status_code=400,
            detail={
                "message": "No TOTP secret set",
                "error_code": "no_totp_secret",
            },
        )
    if not verify_totp_code(u.totp_secret, payload.code):
        raise HTTPException(
            status_code=400,
            detail={"message": "Invalid code", "error_code": "invalid_totp"},
        )
    u.is_totp_enabled = True
    db.add(u)
    db.commit()
    return {"detail": "enabled"}


@app.post("/api/auth/totp/disable")
def totp_disable(
    u: User = Depends(require_csrf), db: Session = Depends(get_session)
):
    """Disable TOTP for current user (requires CSRF)."""
    u.is_totp_enabled = False
    u.totp_secret = None
    db.add(u)
    db.commit()
    return {"detail": "disabled"}


@app.post("/api/auth/logout")
def logout(response: Response, _u: User = Depends(current_user)):
    clear_auth_cookies(response)
    return {"detail": "ok"}


@app.get("/api/auth/me")
def me(u: User = Depends(current_user)):
    return {
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "roles": [r.name for r in u.roles],
    }


@app.post("/api/auth/refresh")
def refresh(
    response: Response, request: Request, db: Session = Depends(get_session)
):
    tok = request.cookies.get("refresh_token")
    if not tok:
        raise HTTPException(401, "No refresh token")
    try:
        payload = decode_token(tok)
        if payload.get("type") != "refresh":
            raise ValueError("not refresh")
    except Exception:
        raise HTTPException(401, "Bad refresh token")
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


# ---------- Your existing file-based patient API ----------

# where compose mounts ./patient_data -> /patient_data
PATIENT_DATA_ROOT = Path("/patient_data")


def patient_repo_name(patient_id: str) -> str:
    """Return a safe repo folder name for a patient id."""
    safe = "".join(
        ch if (ch.isalnum() or ch in "-_") else "-" for ch in patient_id
    )
    return f"patient-{safe}"


def ensure_repo_exists(repo: str, private: bool = False) -> None:
    """Create repo folder if missing."""
    repo_path = PATIENT_DATA_ROOT / repo
    repo_path.mkdir(parents=True, exist_ok=True)


def write_file(
    repo: str,
    path: str,
    content: str,
    commit_message: str = "",
    author_name: str | None = None,
    author_email: str | None = None,
) -> dict:
    """Write content to a file under the repo. Returns basic path info."""
    file_path = PATIENT_DATA_ROOT / repo / path
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding="utf-8")
    return {"path": str(file_path)}


def read_file(repo: str, path: str) -> str | None:
    """Return file content or None if missing."""
    file_path = PATIENT_DATA_ROOT / repo / path
    if not file_path.exists():
        return None
    return file_path.read_text(encoding="utf-8")


class PatientCreate(BaseModel):
    patient_id: str = Field(description="Non-PII ID (e.g. UUID v4)")


# WRITE: protected (role + CSRF)
@app.post(
    "/api/patients",
    dependencies=[Depends(require_roles("Clinician")), Depends(require_csrf)],
)
def create_patient_repo(payload: PatientCreate):
    repo = patient_repo_name(payload.patient_id)
    try:
        ensure_repo_exists(repo, private=True)
        ts = datetime.utcnow().strftime("%Y-%m-%dT%H%M%SZ")
        readme = (
            f"# Patient Repository: {repo}\n\n"
            "Folders:\n"
            "- `demographics/` – non-clinical demographics JSON\n"
            "- `letters/` – correspondence in Markdown/PDF\n\n"
            f"*Initialized {ts} UTC*\n"
        )
        write_file(
            repo,
            "README.md",
            readme,
            "chore: add patient README",
        )
        return {"repo": repo, "initialized": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# READ: protected - require authenticated user
@app.get("/api/patients")
def list_patients(u: User = Depends(current_user)):
    """Return all patient repos and any demographics if present."""
    try:
        patients = []
        if PATIENT_DATA_ROOT.exists():
            for entry in sorted(PATIENT_DATA_ROOT.iterdir()):
                if entry.is_dir() and entry.name.startswith("patient-"):
                    demo_content = read_file(
                        entry.name, "demographics/profile.json"
                    )
                    demo = None
                    if demo_content:
                        try:
                            demo = json.loads(demo_content)
                        except Exception:
                            demo = {"raw": demo_content}
                    patients.append({"repo": entry.name, "demographics": demo})
        return {"patients": patients}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class Demographics(BaseModel):
    given_name: str | None = None
    family_name: str | None = None
    date_of_birth: str | None = None  # ISO date
    sex: str | None = None
    address: dict | None = None
    contact: dict | None = None
    meta: dict | None = None


# WRITE: protected (role + CSRF)
@app.put(
    "/api/patients/{patient_id}/demographics",
    dependencies=[Depends(require_roles("Clinician")), Depends(require_csrf)],
)
def upsert_demographics(patient_id: str, demographics: Demographics):
    repo = patient_repo_name(patient_id)
    try:
        ensure_repo_exists(repo)
        ts = datetime.utcnow().strftime("%Y-%m-%dT%H%M%SZ")
        path = "demographics/profile.json"
        content = json.dumps(
            {"updated_at_utc": ts, **demographics.model_dump()}, indent=2
        )
        write_file(repo, path, content, "feat: upsert demographics")
        return {"repo": repo, "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# READ: protected - require authenticated user
@app.get("/api/patients/{patient_id}/demographics")
def get_demographics(patient_id: str, u: User = Depends(current_user)):
    repo = patient_repo_name(patient_id)
    try:
        content = read_file(repo, "demographics/profile.json")
        if content is None:
            raise HTTPException(
                status_code=404, detail="No demographics found"
            )
        return {"repo": repo, "content": content}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -------- Letters --------


class LetterIn(BaseModel):
    title: str
    body: str
    author_name: str | None = None
    author_email: str | None = None


# WRITE: protected (role + CSRF)
@app.post(
    "/api/patients/{patient_id}/letters",
    dependencies=[Depends(require_roles("Clinician")), Depends(require_csrf)],
)
def write_letter(patient_id: str, letter: LetterIn):
    repo = patient_repo_name(patient_id)
    ts = datetime.utcnow().strftime("%Y-%m-%dT%H%M%SZ")
    slug = "".join(
        ch if (ch.isalnum() or ch in "-_") else "-"
        for ch in letter.title.lower()
    ).strip("-")
    filename = f"letters/{ts}-{slug or 'letter'}.md"
    md = f"# {letter.title}\n\n{letter.body}\n\n*Written at {ts} UTC*"
    try:
        ensure_repo_exists(repo)
        write_file(
            repo,
            filename,
            md,
            f"feat: add letter '{letter.title}'",
            letter.author_name,
            letter.author_email,
        )
        return {"repo": repo, "path": filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# READ: protected - require authenticated user
@app.get("/api/patients/{patient_id}/letters/{name}")
def read_letter(patient_id: str, name: str, u: User = Depends(current_user)):
    repo = patient_repo_name(patient_id)
    path = (
        f"letters/{name}.md" if not name.endswith(".md") else f"letters/{name}"
    )
    try:
        content = read_file(repo, path)
        if content is None:
            raise HTTPException(status_code=404, detail="Letter not found")
        return {"repo": repo, "path": path, "content": content}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
