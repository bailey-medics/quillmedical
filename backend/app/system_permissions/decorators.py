# backend/app/system_permissions/decorators.py
"""System permission FastAPI dependencies.

Provides Depends() functions for protecting API endpoints based on
system permission levels.
"""

from collections.abc import Callable

from fastapi import HTTPException, Request

from app.models import User
from app.system_permissions.permissions import check_permission_level


def requires_staff() -> Callable[[Request, User], User]:
    """FastAPI dependency to require staff-level access or higher.

    Use in route decorators to protect endpoints requiring staff access.
    Staff, admin, and superadmin users can pass this check.

    Usage Example:
        from app.system_permissions import requires_staff
        from app.main import DEP_CURRENT_USER

        @router.get("/clinical/dashboard")
        async def dashboard(
            user: Annotated[User, Depends(requires_staff())]
        ):
            # User is guaranteed to have staff, admin, or superadmin permissions
            ...

    Returns:
        Callable: FastAPI dependency function that validates permission level

    Raises:
        HTTPException: 403 Forbidden if user lacks staff permission
    """
    from app.main import DEP_CURRENT_USER

    def check_staff(request: Request, user: User = DEP_CURRENT_USER) -> User:
        """Check if user has staff permission or higher."""
        if not check_permission_level(user.system_permissions, "staff"):
            raise HTTPException(
                status_code=403,
                detail="Forbidden: Staff access required",
            )
        return user

    return check_staff


def requires_admin() -> Callable[[Request, User], User]:
    """FastAPI dependency to require admin-level access or higher.

    Use in route decorators to protect endpoints requiring admin access.
    Admin and superadmin users can pass this check.

    Usage Example:
        from app.system_permissions import requires_admin
        from app.main import DEP_CURRENT_USER

        @router.post("/users/{user_id}/deactivate")
        async def deactivate_user(
            user_id: int,
            user: Annotated[User, Depends(requires_admin())]
        ):
            # User is guaranteed to have admin or superadmin permissions
            ...

    Returns:
        Callable: FastAPI dependency function that validates permission level

    Raises:
        HTTPException: 403 Forbidden if user lacks admin permission
    """
    from app.main import DEP_CURRENT_USER

    def check_admin(request: Request, user: User = DEP_CURRENT_USER) -> User:
        """Check if user has admin permission or higher."""
        if not check_permission_level(user.system_permissions, "admin"):
            raise HTTPException(
                status_code=403,
                detail="Forbidden: Admin access required",
            )
        return user

    return check_admin


def requires_superadmin() -> Callable[[Request, User], User]:
    """FastAPI dependency to require superadmin-level access.

    Use in route decorators to protect endpoints requiring superadmin access.
    Only superadmin users can pass this check.

    Usage Example:
        from app.system_permissions import requires_superadmin
        from app.main import DEP_CURRENT_USER

        @router.post("/system/config/update")
        async def update_system_config(
            config: SystemConfig,
            user: Annotated[User, Depends(requires_superadmin())]
        ):
            # User is guaranteed to have superadmin permissions
            ...

    Returns:
        Callable: FastAPI dependency function that validates permission level

    Raises:
        HTTPException: 403 Forbidden if user lacks superadmin permission
    """
    from app.main import DEP_CURRENT_USER

    def check_superadmin(
        request: Request, user: User = DEP_CURRENT_USER
    ) -> User:
        """Check if user has superadmin permission."""
        if not check_permission_level(user.system_permissions, "superadmin"):
            raise HTTPException(
                status_code=403,
                detail="Forbidden: Superadmin access required",
            )
        return user

    return check_superadmin
