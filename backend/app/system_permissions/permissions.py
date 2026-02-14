# backend/app/system_permissions/permissions.py
"""System permission types and validation.

Defines the four permission levels and helper functions for checking
permission hierarchies.
"""

from typing import Literal

# System permission levels (ordered from lowest to highest)
PERMISSION_PATIENT = "patient"
PERMISSION_STAFF = "staff"
PERMISSION_ADMIN = "admin"
PERMISSION_SUPERADMIN = "superadmin"

PERMISSION_LEVELS = [
    PERMISSION_PATIENT,
    PERMISSION_STAFF,
    PERMISSION_ADMIN,
    PERMISSION_SUPERADMIN,
]

# Type alias for type hints
SystemPermission = Literal["patient", "staff", "admin", "superadmin"]


def check_permission_level(
    user_permission: str, required_permission: str
) -> bool:
    """Check if user has sufficient permission level.

    Permission levels are hierarchical:
    - superadmin can do everything
    - admin can do everything staff and patient can do
    - staff can do everything patient can do
    - patient can only do patient-level operations

    Args:
        user_permission: The user's current permission level
        required_permission: The minimum permission level required

    Returns:
        bool: True if user has sufficient permission, False otherwise

    Examples:
        >>> check_permission_level("superadmin", "staff")
        True
        >>> check_permission_level("staff", "admin")
        False
        >>> check_permission_level("admin", "staff")
        True
    """
    if user_permission not in PERMISSION_LEVELS:
        return False
    if required_permission not in PERMISSION_LEVELS:
        return False

    user_level = PERMISSION_LEVELS.index(user_permission)
    required_level = PERMISSION_LEVELS.index(required_permission)

    return user_level >= required_level
