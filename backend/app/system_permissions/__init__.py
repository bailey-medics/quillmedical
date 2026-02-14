# backend/app/system_permissions/__init__.py
"""System permissions module.

Provides administrative access control orthogonal to clinical competencies.
System permissions control feature access and administrative capabilities,
while CBAC (competencies) control clinical operations.

Permission Levels:
    - patient: Own records only, public users
    - staff: Clinical application access
    - admin: User management, patient admin, audit logs
    - superadmin: System configuration, database access, break-glass
"""

from app.system_permissions.decorators import (
    requires_admin,
    requires_staff,
    requires_superadmin,
)
from app.system_permissions.permissions import (
    PERMISSION_ADMIN,
    PERMISSION_LEVELS,
    PERMISSION_PATIENT,
    PERMISSION_STAFF,
    PERMISSION_SUPERADMIN,
    SystemPermission,
    check_permission_level,
)

__all__ = [
    "PERMISSION_LEVELS",
    "PERMISSION_PATIENT",
    "PERMISSION_STAFF",
    "PERMISSION_ADMIN",
    "PERMISSION_SUPERADMIN",
    "SystemPermission",
    "check_permission_level",
    "requires_staff",
    "requires_admin",
    "requires_superadmin",
]
