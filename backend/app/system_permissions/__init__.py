# backend/app/system_permissions/__init__.py
"""System permissions module.

Provides administrative access control orthogonal to clinical competencies.
System permissions control platform management authority,
while CBAC (competencies) control all data access and clinical operations.

Permission Levels:
    - single-user: Own profile/settings only, no system management
    - staff: Staff dashboards, team visibility
    - admin: User/org management (scoped to own orgs)
    - superadmin: Global platform management
"""

from app.system_permissions.decorators import (
    requires_admin,
    requires_staff,
    requires_superadmin,
)
from app.system_permissions.permissions import (
    PERMISSION_ADMIN,
    PERMISSION_LEVELS,
    PERMISSION_SINGLE_USER,
    PERMISSION_STAFF,
    PERMISSION_SUPERADMIN,
    SystemPermission,
    check_permission_level,
)

__all__ = [
    "PERMISSION_LEVELS",
    "PERMISSION_SINGLE_USER",
    "PERMISSION_STAFF",
    "PERMISSION_ADMIN",
    "PERMISSION_SUPERADMIN",
    "SystemPermission",
    "check_permission_level",
    "requires_staff",
    "requires_admin",
    "requires_superadmin",
]
