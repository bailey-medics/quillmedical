#!/usr/bin/env python3
"""Non-interactive admin CLI for Cloud Run Job execution.

This script provides administrative operations (user creation, permission
updates, role assignment) driven entirely by environment variables, making
it suitable for execution as a Cloud Run Job where interactive prompts are
not available.

Environment Variables:
    ADMIN_ACTION:     Required.  One of: create-superadmin, update-permissions,
                      add-role.
    ADMIN_USERNAME:   Required.  Target username.
    ADMIN_EMAIL:      Required for create-superadmin.
    ADMIN_PASSWORD:   Required for create-superadmin.
    ADMIN_PERMISSION: Required for update-permissions (patient|staff|admin|superadmin).
    ADMIN_ROLE:       Required for add-role (e.g. "System Administrator").

Usage (Cloud Run Job):
    gcloud run jobs execute quill-admin-staging \\
      --region europe-west2 \\
      --update-env-vars \\
        ADMIN_ACTION=create-superadmin,\\
        ADMIN_USERNAME=mark,\\
        ADMIN_EMAIL=mark@example.com,\\
        ADMIN_PASSWORD=SecurePass123 \\
      --wait

Usage (local dev container):
    ADMIN_ACTION=create-superadmin \\
    ADMIN_USERNAME=mark \\
    ADMIN_EMAIL=mark@example.com \\
    ADMIN_PASSWORD=password \\
    python scripts/admin_cli.py
"""

from __future__ import annotations

import os
import sys
from collections.abc import Callable
from typing import NoReturn

proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)


def _require_env(*names: str) -> dict[str, str]:
    """Read required environment variables, exiting on any missing."""
    values: dict[str, str] = {}
    missing: list[str] = []
    for name in names:
        val = os.environ.get(name, "").strip()
        if not val:
            missing.append(name)
        else:
            values[name] = val
    if missing:
        print(
            f"ERROR: Missing required environment variable(s): "
            f"{', '.join(missing)}",
            file=sys.stderr,
        )
        sys.exit(1)
    return values


def create_superadmin() -> int:
    """Create a user and grant superadmin + System Administrator role."""
    env = _require_env("ADMIN_USERNAME", "ADMIN_EMAIL", "ADMIN_PASSWORD")
    username = env["ADMIN_USERNAME"]
    email = env["ADMIN_EMAIL"]
    password = env["ADMIN_PASSWORD"]

    from app.db.auth_db import AuthSessionLocal
    from app.models import Role, User
    from app.security import hash_password

    db = AuthSessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if user:
            user.email = email
            user.password_hash = hash_password(password)
            print(f"Updated existing user: {username}")
        else:
            user = User(
                username=username,
                email=email,
                password_hash=hash_password(password),
            )
            db.add(user)
            db.flush()
            print(f"Created new user: {username}")

        # Set superadmin permissions and consultant base profession
        user.system_permissions = "superadmin"
        user.base_profession = "consultant"

        # Add System Administrator role if it exists and not already assigned
        role = (
            db.query(Role).filter(Role.name == "System Administrator").first()
        )
        if role and role not in user.roles:
            user.roles.append(role)
            print("Assigned role: System Administrator")
        elif not role:
            print(
                "WARNING: 'System Administrator' role not found in database "
                "(roles may not be seeded yet)",
                file=sys.stderr,
            )

        db.commit()
        print(f"✓ User '{username}' is now a superadmin")
        return 0

    except Exception as exc:
        db.rollback()
        print(f"✗ Database error: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()


def update_permissions() -> int:
    """Update system_permissions for an existing user."""
    env = _require_env("ADMIN_USERNAME", "ADMIN_PERMISSION")
    username = env["ADMIN_USERNAME"]
    permission = env["ADMIN_PERMISSION"]

    from app.db.auth_db import AuthSessionLocal
    from app.models import User
    from app.system_permissions import PERMISSION_LEVELS

    if permission not in PERMISSION_LEVELS:
        print(
            f"ERROR: Invalid permission '{permission}'. "
            f"Valid: {', '.join(PERMISSION_LEVELS)}",
            file=sys.stderr,
        )
        return 1

    db = AuthSessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            print(f"✗ User '{username}' not found", file=sys.stderr)
            return 1

        old = user.system_permissions
        user.system_permissions = permission
        db.commit()
        print(f"✓ Updated '{username}' permissions: {old} → {permission}")
        return 0

    except Exception as exc:
        db.rollback()
        print(f"✗ Database error: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()


def add_role() -> int:
    """Add a role to an existing user."""
    env = _require_env("ADMIN_USERNAME", "ADMIN_ROLE")
    username = env["ADMIN_USERNAME"]
    role_name = env["ADMIN_ROLE"]

    from app.db.auth_db import AuthSessionLocal
    from app.models import Role, User

    db = AuthSessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            print(f"✗ User '{username}' not found", file=sys.stderr)
            return 1

        role = db.query(Role).filter(Role.name == role_name).first()
        if not role:
            available = [r.name for r in db.query(Role).all()]
            print(
                f"✗ Role '{role_name}' not found. "
                f"Available: {', '.join(available)}",
                file=sys.stderr,
            )
            return 1

        if role in user.roles:
            print(f"ℹ User '{username}' already has role '{role_name}'")
            return 0

        user.roles.append(role)
        db.commit()
        print(f"✓ Added role '{role_name}' to user '{username}'")
        return 0

    except Exception as exc:
        db.rollback()
        print(f"✗ Database error: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()


ACTIONS: dict[str, tuple[Callable[[], int], str]] = {
    "create-superadmin": (
        create_superadmin,
        "Create user with superadmin permissions",
    ),
    "update-permissions": (
        update_permissions,
        "Update system_permissions for a user",
    ),
    "add-role": (
        add_role,
        "Add a role to an existing user",
    ),
}


def main() -> NoReturn:
    """Dispatch to the requested admin action."""
    action = os.environ.get("ADMIN_ACTION", "").strip()

    if not action:
        print("ERROR: ADMIN_ACTION environment variable is required")
        print("\nAvailable actions:")
        for name, (_, desc) in ACTIONS.items():
            print(f"  {name:25s} {desc}")
        sys.exit(1)

    if action not in ACTIONS:
        print(f"ERROR: Unknown action '{action}'")
        print("\nAvailable actions:")
        for name, (_, desc) in ACTIONS.items():
            print(f"  {name:25s} {desc}")
        sys.exit(1)

    handler, _ = ACTIONS[action]
    sys.exit(handler())


if __name__ == "__main__":
    main()
