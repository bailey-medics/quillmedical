# backend/app/system_permissions/permissions.py
"""System permission types and validation.

Defines the permission levels and helper functions for checking
permission hierarchies.
"""

from typing import Literal

# System permission levels (ordered from lowest to highest)
PERMISSION_PATIENT = "patient"
PERMISSION_EXTERNAL_HCP = "external_hcp"
PERMISSION_PATIENT_ADVOCATE = "patient_advocate"
PERMISSION_STAFF = "staff"
PERMISSION_ADMIN = "admin"
PERMISSION_SUPERADMIN = "superadmin"

# Hierarchical levels — external_hcp and patient_advocate sit at the
# same tier as patient (lowest clinical access).
PERMISSION_LEVELS = [
    PERMISSION_PATIENT,
    PERMISSION_STAFF,
    PERMISSION_ADMIN,
    PERMISSION_SUPERADMIN,
]

# All valid permission values (includes non-hierarchical external types)
ALL_PERMISSIONS = [
    PERMISSION_PATIENT,
    PERMISSION_EXTERNAL_HCP,
    PERMISSION_PATIENT_ADVOCATE,
    PERMISSION_STAFF,
    PERMISSION_ADMIN,
    PERMISSION_SUPERADMIN,
]

# External user types that use per-patient access grants
EXTERNAL_PERMISSIONS = {PERMISSION_EXTERNAL_HCP, PERMISSION_PATIENT_ADVOCATE}

# Type alias for type hints
SystemPermission = Literal[
    "patient",
    "external_hcp",
    "patient_advocate",
    "staff",
    "admin",
    "superadmin",
]


def check_permission_level(
    user_permission: str, required_permission: str
) -> bool:
    """Check if user has sufficient permission level.

    Permission levels are hierarchical:
    - superadmin can do everything
    - admin can do everything staff and patient can do
    - staff can do everything patient can do
    - patient can only do patient-level operations

    external_hcp and patient_advocate are treated as patient-level
    for hierarchy checks (lowest clinical access).

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
        >>> check_permission_level("external_hcp", "patient")
        True
    """
    # Map external types to patient level for hierarchy checks
    mapped_user = (
        PERMISSION_PATIENT
        if user_permission in EXTERNAL_PERMISSIONS
        else user_permission
    )
    mapped_required = (
        PERMISSION_PATIENT
        if required_permission in EXTERNAL_PERMISSIONS
        else required_permission
    )

    if mapped_user not in PERMISSION_LEVELS:
        return False
    if mapped_required not in PERMISSION_LEVELS:
        return False

    user_level = PERMISSION_LEVELS.index(mapped_user)
    required_level = PERMISSION_LEVELS.index(mapped_required)

    return user_level >= required_level


def is_external_user(permission: str) -> bool:
    """Check if a permission level represents an external user type."""
    return permission in EXTERNAL_PERMISSIONS
