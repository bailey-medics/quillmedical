#!/usr/bin/env python3
"""Add a role to an existing user."""

import sys
from pathlib import Path

# Add parent directory to path for imports
app_dir = Path(__file__).parent.parent / "app"
sys.path.insert(0, str(app_dir.parent))

# Imports must come after path manipulation
from app.db.auth_db import AuthSessionLocal  # noqa: E402
from app.models import Role, User  # noqa: E402


def add_role_to_user(username: str, role_name: str) -> int:
    """Add a role to an existing user.

    Returns:
        0 on success
        1 if user not found
        2 if role not found
        3 if user already has role
        4 on database error
    """
    db = AuthSessionLocal()
    try:
        # Find user
        user = db.query(User).filter(User.username == username).first()
        if not user:
            print(f"✗ User '{username}' not found")
            return 1

        # Find role
        role = db.query(Role).filter(Role.name == role_name).first()
        if not role:
            print(f"✗ Role '{role_name}' not found")
            print("\nAvailable roles:")
            available_roles = db.query(Role).all()
            for r in available_roles:
                print(f"  - {r.name}")
            return 2

        # Check if user already has role
        if role in user.roles:
            print(f"ℹ User '{username}' already has role '{role_name}'")
            return 3

        # Add role
        user.roles.append(role)
        db.commit()

        print(f"✓ Successfully added role '{role_name}' to user '{username}'")
        print("\nUser now has roles:")
        for r in user.roles:
            print(f"  - {r.name}")

        return 0

    except Exception as e:
        db.rollback()
        print(f"✗ Database error: {e}")
        return 4
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python add_role_to_user.py <username> <role_name>")
        print("\nExample: python add_role_to_user.py mark.bailey Clinician")
        sys.exit(5)

    username = sys.argv[1]
    role_name = sys.argv[2]

    sys.exit(add_role_to_user(username, role_name))
