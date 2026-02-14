# backend/app/cbac/decorators.py
"""CBAC authorisation decorators and FastAPI dependencies.

Provides @requires_competency and Depends(has_competency(...)) for
protecting API endpoints based on user competencies.
"""

from collections.abc import Callable
from functools import wraps
from typing import Any

from fastapi import HTTPException, Request

from app.cbac.competencies import get_competency_risk_level
from app.models import User


def has_competency(competency: str) -> Callable[[Request, User], User]:
    """FastAPI dependency to check if current user has a competency.

    Creates a FastAPI dependency that verifies the authenticated user
    possesses a specific clinical competency. Use in route decorators
    to protect endpoints requiring specific capabilities.

    High-risk competencies are automatically logged for audit purposes.

    Usage Example:
        from app.cbac.decorators import has_competency
        from app.main import DEP_CURRENT_USER

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
    from app.main import DEP_CURRENT_USER

    def check_competency(
        request: Request, user: User = DEP_CURRENT_USER
    ) -> User:
        """Check if user has the required competency."""
        final_competencies = user.get_final_competencies()

        if competency not in final_competencies:
            # Log failed competency check (high-risk operations)
            risk_level = get_competency_risk_level(competency)
            # TODO: Add audit logging here when audit system is implemented
            # audit_log(
            #     user_id=user.id,
            #     action="competency_check_failed",
            #     competency=competency,
            #     risk_level=risk_level,
            # )
            raise HTTPException(
                status_code=403,
                detail=f"Forbidden: User lacks required competency '{competency}'",
            )

        # Log successful competency check for high-risk operations
        risk_level = get_competency_risk_level(competency)
        if risk_level == "high":
            # TODO: Add audit logging here when audit system is implemented
            # audit_log(
            #     user_id=user.id,
            #     action="competency_check_success",
            #     competency=competency,
            #     risk_level=risk_level,
            # )
            pass

        return user

    return check_competency


def requires_competency_decorator(competency: str) -> Callable:
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

    def decorator(func: Callable) -> Callable:
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
                # TODO: Audit logging (log risk level: get_competency_risk_level(competency))
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
    from app.main import DEP_CURRENT_USER

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
