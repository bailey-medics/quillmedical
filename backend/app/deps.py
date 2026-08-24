"""Shared FastAPI dependencies.

Extracted from main.py to allow reuse in sub-routers (push, push_send)
without circular imports. Also holds the CBAC competency-check
dependencies (previously app/cbac/decorators.py) for the same reason —
a competency dependency needs the User model, and centralising here
keeps that a one-way import rather than a cycle back into app.cbac.
"""

from collections.abc import Callable
from functools import wraps
from typing import Any

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_core_db
from app.log_context import user_id_var
from app.models import User
from app.security import decode_token

DEP_GET_SESSION = Depends(get_core_db)


def get_current_user(request: Request, db: Session = DEP_GET_SESSION) -> User:
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


DEP_CURRENT_USER = Depends(get_current_user)


def require_staff(current_user: User = DEP_CURRENT_USER) -> User:
    """Require staff, admin, or superadmin system permissions.

    Raises:
        HTTPException: 403 if user lacks staff permissions.
    """
    if current_user.system_permissions not in ("staff", "admin", "superadmin"):
        raise HTTPException(403, "Staff access required")
    return current_user


DEP_REQUIRE_STAFF = Depends(require_staff)


def require_admin(current_user: User = DEP_CURRENT_USER) -> User:
    """Require admin or superadmin system permissions.

    Raises:
        HTTPException: 403 if user lacks admin permissions.
    """
    if current_user.system_permissions not in ("admin", "superadmin"):
        raise HTTPException(403, "Admin access required")
    return current_user


DEP_REQUIRE_ADMIN = Depends(require_admin)


def require_superadmin(current_user: User = DEP_CURRENT_USER) -> User:
    """Require superadmin system permissions.

    Raises:
        HTTPException: 403 if user lacks superadmin permissions.
    """
    if current_user.system_permissions != "superadmin":
        raise HTTPException(403, "Superadmin access required")
    return current_user


DEP_REQUIRE_SUPERADMIN = Depends(require_superadmin)


def has_competency(competency: str) -> Callable[[Request, User], User]:
    """FastAPI dependency to check if current user has a competency.

    Creates a FastAPI dependency that verifies the authenticated user
    possesses a specific clinical competency. Use in route decorators
    to protect endpoints requiring specific capabilities.

    Usage Example:
        from app.deps import has_competency, DEP_CURRENT_USER

        @router.post("/prescriptions/controlled")
        async def prescribe(
            user: Annotated[User, Depends(has_competency("prescribe_controlled_schedule_2"))]
        ):
            # User is guaranteed to have prescribe_controlled_schedule_2 competency
            ...

    Args:
        competency: Competency ID required (e.g., "prescribe_controlled_schedule_2")

    Returns:
        Callable: FastAPI dependency function that validates competency

    Raises:
        HTTPException: 403 Forbidden if user lacks the competency
    """

    def check_competency(
        request: Request, user: User = DEP_CURRENT_USER
    ) -> User:
        """Check if user has the required competency."""
        final_competencies = user.get_final_competencies()

        if competency not in final_competencies:
            # TODO: Add audit logging here when audit system is implemented
            # audit_log(
            #     user_id=user.id,
            #     action="competency_check_failed",
            #     competency=competency,
            # )
            raise HTTPException(
                status_code=403,
                detail=f"Forbidden: User lacks required competency '{competency}'",
            )

        # TODO: Add audit logging here when audit system is implemented
        # audit_log(
        #     user_id=user.id,
        #     action="competency_check_success",
        #     competency=competency,
        # )

        return user

    return check_competency


def requires_competency_decorator(competency: str) -> Callable[..., Any]:
    """Legacy decorator style (prefer FastAPI Depends above).

    Decorator that wraps a route handler to check if the authenticated
    user has a required competency. This is a legacy decorator style;
    new code should use the has_competency() dependency instead.

    Usage Example (legacy):
        @router.post("/prescriptions/controlled")
        @requires_competency_decorator("prescribe_controlled_schedule_2")
        async def prescribe(user: User = DEP_CURRENT_USER):
            ...

    Recommended modern usage:
        @router.post("/prescriptions/controlled")
        async def prescribe(
            user: Annotated[User, Depends(has_competency("prescribe_controlled_schedule_2"))]
        ):
            ...

    Args:
        competency: Competency ID required

    Returns:
        Callable: Decorator function
    """

    def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            # Extract user from kwargs (assuming user: User = DEP_CURRENT_USER in signature)
            user = kwargs.get("user")
            if not user or not isinstance(user, User):
                raise HTTPException(
                    status_code=401, detail="Authentication required"
                )

            final_competencies = user.get_final_competencies()

            if competency not in final_competencies:
                # TODO: Add audit logging here when audit system is implemented
                raise HTTPException(
                    status_code=403,
                    detail=f"Forbidden: User lacks required competency '{competency}'",
                )

            # TODO: Audit logging for high-risk competencies
            return await func(*args, **kwargs)

        return wrapper

    return decorator


def requires_any_competency(
    *competencies: str,
) -> Callable[[Request, User], User]:
    """Require at least one of the specified competencies.

    Creates a FastAPI dependency that verifies the authenticated user
    possesses at least ONE of the specified competencies. Useful for
    routes that can be accessed by multiple types of professionals.

    Usage Example:
        @router.post("/certify-fitness")
        async def certify_fitness(
            user: Annotated[User, Depends(requires_any_competency(
                "certify_fitness_to_work",
                "certify_fitness_to_drive"
            ))]
        ):
            # User has at least one certification competency
            ...

    Args:
        *competencies: One or more competency IDs (user needs at least one)

    Returns:
        Callable: FastAPI dependency function that validates competencies

    Raises:
        HTTPException: 403 Forbidden if user lacks all specified competencies
    """

    def check_any_competency(
        request: Request, user: User = DEP_CURRENT_USER
    ) -> User:
        """Check if user has any of the required competencies."""
        final_competencies = user.get_final_competencies()

        if not any(comp in final_competencies for comp in competencies):
            # TODO: Audit logging
            raise HTTPException(
                status_code=403,
                detail=f"Forbidden: User lacks required competencies (needs one of: {', '.join(competencies)})",
            )

        return user

    return check_any_competency
