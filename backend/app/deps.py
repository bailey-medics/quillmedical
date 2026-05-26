"""Shared FastAPI dependencies.

Extracted from main.py to allow reuse in sub-routers (push, push_send)
without circular imports.
"""

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.log_context import user_id_var
from app.models import User
from app.security import decode_token

DEP_GET_SESSION = Depends(get_session)


def current_user(request: Request, db: Session = DEP_GET_SESSION) -> User:
    """Extract and validate the authenticated user from JWT cookie.

    Raises:
        HTTPException: 401 if not authenticated, token invalid, or user
            inactive.
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
    if payload.get("tv", 0) != user.token_version:
        raise HTTPException(401, "Session invalidated")
    request.state.roles = [r.name for r in user.roles]
    user_id_var.set(str(user.id))
    return user


DEP_CURRENT_USER = Depends(current_user)


def require_admin(u: User = DEP_CURRENT_USER) -> User:
    """Require admin or superadmin system permissions.

    Raises:
        HTTPException: 403 if user lacks admin permissions.
    """
    if u.system_permissions not in ("admin", "superadmin"):
        raise HTTPException(403, "Admin access required")
    return u


DEP_REQUIRE_ADMIN = Depends(require_admin)
