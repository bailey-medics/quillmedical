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

from app.cbac.scoped import can_practise_at
from app.config import settings
from app.db import get_core_db
from app.log_context import user_id_var
from app.models import User
from app.security import decode_token

DEP_GET_SESSION = Depends(get_core_db)


def require_clinical_services() -> None:
    """FastAPI dependency: raises 503 when FHIR/EHRbase are disabled.

    Here rather than in ``main`` so that a sub-router can depend on the
    *same* callable. A wrapper would be a different object, and the tests
    switch this gate off by overriding the object — so a wrapper would
    quietly stay on.
    """
    if not settings.CLINICAL_SERVICES_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Clinical services are not available in this deployment",
        )


DEP_REQUIRE_CLINICAL = Depends(require_clinical_services)


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


def get_optional_user(
    request: Request, db: Session = DEP_GET_SESSION
) -> User | None:
    """Return the authenticated user, or ``None`` when there is not one.

    The non-raising twin of :func:`get_current_user`, for routes that must
    serve signed-out callers but want to attribute the request when a valid
    session does happen to be present. Every failure path returns ``None``:
    a route using this has already decided that not being signed in is
    normal, so a missing, expired or invalidated token is not an error.

    Deliberately free of side effects, unlike :func:`get_current_user`, which
    sets the request roles and the logging context. A route that only wants to
    know who is calling should not quietly change how the rest of the request
    is logged.
    """
    tok = request.cookies.get("access_token")
    if not tok:
        return None
    try:
        payload = decode_token(tok)
    except Exception:
        return None
    user = db.scalar(select(User).where(User.username == payload.get("sub")))
    if not user or not user.is_active:
        return None
    if payload.get("tv", 0) != user.token_version:
        return None
    return user


DEP_OPTIONAL_USER = Depends(get_optional_user)


def require_operator(current_user: User = DEP_CURRENT_USER) -> User:
    """Require that the caller operates Quill itself.

    Its one consumer sends a test push notification to every subscribed
    client in the deployment, which is unbounded by any organisation —
    the platform question rather than an administrative act at an org_unit.
    See docs/docs/plans/2026-09-09-platform-role-plan.md.

    Raises:
        HTTPException: 403 if the caller is not an operator.
    """
    if current_user.platform_role != "superadmin":
        raise HTTPException(403, "Platform operator access required")
    return current_user


DEP_REQUIRE_OPERATOR = Depends(require_operator)


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


def has_competency_at(
    competency: str, place_param: str = "unit_id"
) -> Callable[..., User]:
    """FastAPI dependency: the competency, *and* authority to use it here.

    ``has_competency`` asks only what somebody is qualified for, which is
    their ceiling and true everywhere at once. This asks the second half:
    are they authorised to practise it at the org_unit this request is about?
    A row in ``practising_competency`` says they are, and
    ``can_practise_at`` requires both, so a lapsed qualification narrows
    every org_unit without a row being touched.

    Use it wherever the org_unit is named in the path. Where a route has no
    org_unit to scope to — a listing that *discovers* which org_units somebody
    may administer — scope the query instead, because there is no single
    org_unit to check.

    **Operators bypass the row check.** ``platform_role == "superadmin"``
    means operating Quill itself, which is true everywhere or nowhere, and
    an operator holds no rows anywhere; checking them would lock them out
    of the estate they are there to run. This mirrors
    ``places_administered_by``, which returns None for an operator to mean
    "all of them".

    Refusal is **404, not 403**, matching ``_require_visible`` in
    ``app.org_units.router`` and the frontend guards: a refusal must not
    confirm that an org_unit exists to somebody who may not see it. The
    competency is not named in the detail either, for the same reason.

    Usage Example:
        from app.deps import has_competency_at

        @router.post("/{unit_id}/rota")
        def write_rota(
            unit_id: int,
            user: Annotated[User, Depends(has_competency_at("manage_rota"))],
        ) -> RotaOut:
            ...

    Args:
        competency: Competency ID required (e.g. ``"manage_users"``).
        place_param: The path parameter naming the org_unit. Defaults to
            ``unit_id``, which is what the org-unit routes call it.

    Returns:
        Callable: FastAPI dependency function that validates both halves.

    Raises:
        HTTPException: 404 if the org_unit is not named, is not an org_unit, or
            the caller may not practise the competency there.
    """

    def check_competency_at(
        request: Request,
        user: User = DEP_CURRENT_USER,
        db: Session = DEP_GET_SESSION,
    ) -> User:
        """Check the caller may practise the competency at this org_unit."""
        if user.platform_role == "superadmin":
            return user

        raw = request.path_params.get(place_param)
        if raw is None:
            # A programming error, not a caller's: the route does not carry
            # the parameter this dependency was told to read. 500 rather
            # than 404, because answering "not found" would hide a
            # mis-wired route behind a plausible refusal.
            raise HTTPException(
                status_code=500,
                detail="Route is missing the place parameter.",
            )

        try:
            place_id = int(raw)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=404, detail="Place not found"
            ) from None

        if not can_practise_at(db, user, competency, org_unit_id=place_id):
            raise HTTPException(status_code=404, detail="Place not found")

        return user

    return check_competency_at


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
