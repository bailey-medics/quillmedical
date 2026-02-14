#!/usr/bin/env python3
"""Update system_permissions for an existing user."""

import sys
from pathlib import Path

# Add parent directory to path for imports
app_dir = Path(__file__).parent.parent / "app"
sys.path.insert(0, str(app_dir.parent))

# Imports must come after path manipulation
from app.db.auth_db import AuthSessionLocal  # noqa: E402
from app.models import User  # noqa: E402
from app.system_permissions import PERMISSION_LEVELS  # noqa: E402


def update_system_permissions(username: str, permission_level: str) -> int:
    """Update system_permissions for an existing user.

    Args:
        username: Username of the user to update
        permission_level: New permission level (patient, staff, admin, superadmin)

    Returns:
        0 on success
        1 if user not found
        2 if invalid permission level
        3 on database error
    """
    # Validate permission level
    if permission_level not in PERMISSION_LEVELS:
        print(f"✗ Invalid permission level '{permission_level}'")
        print("\nValid permission levels:")
        for level in PERMISSION_LEVELS:
            print(f"  - {level}")
        return 2

    db = AuthSessionLocal()
    try:
        # Find user
        user = db.query(User).filter(User.username == username).first()
        if not user:
            print(f"✗ User '{username}' not found")
            return 1

        # Store old permission for reporting
        old_permission = user.system_permissions

        # Update permission
        user.system_permissions = permission_level
        db.commit()

        print(
            f"✓ Successfully updated system_permissions for user '{username}'"
        )
        print(f"  Old permission: {old_permission}")
        print(f"  New permission: {permission_level}")

        return 0

    except Exception as e:
        db.rollback()
        print(f"✗ Database error: {e}")
        return 3
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(
            "Usage: python update_system_permissions.py <username> <permission_level>"
        )
        print("\nPermission levels:")
        print("  - patient: Own records only")
        print("  - staff: Clinical application access")
        print("  - admin: User management, patient admin, audit logs")
        print(
            "  - superadmin: System configuration, database access, break-glass"
        )
        print(
            "\nExample: python update_system_permissions.py mark.bailey superadmin"
        )
        sys.exit(4)

    username = sys.argv[1]
    permission_level = sys.argv[2]

    sys.exit(update_system_permissions(username, permission_level))
