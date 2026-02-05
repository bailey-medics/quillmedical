#!/usr/bin/env python3
"""Create or update a user in the database with role assignment.

This module provides an interactive helper to add or update a user record
with optional role assignment in the backend database.

Example:

    $ python backend/scripts/create_user_with_role.py
    Username: alice
    Email: alice@example.com
    Password: ********
    Confirm password: ********
    Add role? (Clinician/none) [none]: Clinician
    Successfully created user: alice with role(s): Clinician

"""

from __future__ import annotations

import getpass
import os
import sys

proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)


def main() -> int:
    """Run the interactive create/update user flow with role assignment.

    Returns:
        int: Exit code (0 on success, non-zero on error).

    Exit codes:
        0: Success - user created or updated.
        1: Application import error or other internal failure.
        2: Database not migrated (users table does not exist).
        3: Passwords did not match.
        4: Interactive input aborted by user.
        5: Invalid role specified.
    """
    try:
        username = input("Username: ").strip()
        email = input("Email: ").strip()
    except (KeyboardInterrupt, EOFError):
        print("\nAborted.")
        return 4

    try:
        password = getpass.getpass(prompt="Password: ")
        confirm = getpass.getpass(prompt="Confirm password: ")
        if password != confirm:
            print("ERROR: passwords do not match", file=sys.stderr)
            return 3
    except (KeyboardInterrupt, EOFError):
        print("\nAborted.")
        return 4

    # Display available roles
    print("\nAvailable roles:")
    print("  1. System Administrator (system config, NO patient data access)")
    print("  2. Clinical Administrator")
    print("  3. Clinician")
    print("  4. Clinical Support Staff")
    print("  5. Patient")
    print("  6. Patient Advocate (for family/carers/solicitor)")
    print("  none. No role")

    try:
        role_input = input("\nSelect role (1-6 or name) [none]: ").strip()
    except (KeyboardInterrupt, EOFError):
        print("\nAborted.")
        return 4

    # Import app modules here; inside the container these should be available.
    try:
        from sqlalchemy import inspect

        from app.db import SessionLocal
        from app.models import Role, User
        from app.security import hash_password
    except Exception as exc:  # pragma: no cover - environment errors
        print(f"Failed to import app modules: {exc}", file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        # Check if database has been migrated
        if db.bind is None:
            print("ERROR: Database bind is None", file=sys.stderr)
            return 1
        inspector = inspect(db.bind)
        if "users" not in inspector.get_table_names():
            print(
                "ERROR: Database not initialised. Please run migrations first:",
                file=sys.stderr,
            )
            print(
                "  docker exec quill_backend sh -lc 'alembic upgrade head'",
                file=sys.stderr,
            )
            print("Or use: just migrate 'initial setup'", file=sys.stderr)
            return 2

    except Exception as exc:  # pragma: no cover - runtime DB errors
        print(f"Database connection error: {exc}", file=sys.stderr)
        return 1

    try:
        # Create or update user
        u = db.query(User).filter(User.username == username).first()
        if not u:
            u = User(
                username=username,
                email=email,
                password_hash=hash_password(password),
            )
            db.add(u)
            action = "created"
        else:
            u.email = email
            u.password_hash = hash_password(password)
            u.is_active = True
            u.is_totp_enabled = False
            action = "updated"

        # Handle role assignment
        role_names = []
        if role_input and role_input.lower() not in ("none", ""):
            # Clear existing roles
            u.roles.clear()

            # Map numeric input to role names
            role_map = {
                "1": "System Administrator",
                "2": "Clinical Administrator",
                "3": "Clinician",
                "4": "Clinical Support Staff",
                "5": "Patient",
                "6": "Patient Advocate",
            }

            # Resolve role name from input
            if role_input in role_map:
                role_name = role_map[role_input]
            else:
                role_name = role_input.strip()

            role = db.query(Role).filter(Role.name == role_name).first()
            if not role:
                print(
                    f"✗ Error: Role '{role_name}' does not exist.",
                    file=sys.stderr,
                )
                print(
                    "   Please run migrations first: just migrate 'add user roles'",
                    file=sys.stderr,
                )
                return 5
            u.roles.append(role)
            role_names.append(role_name)

        db.commit()

        if role_names:
            print(
                f"✓ Successfully {action} user: {username} with role(s): {', '.join(role_names)}"
            )
        else:
            print(
                f"✓ Successfully {action} user: {username} (no roles assigned)"
            )
        return 0
    except Exception as exc:  # pragma: no cover - runtime DB errors
        print(f"✗ Database error: {exc}", file=sys.stderr)
        db.rollback()
        return 1
    finally:
        try:
            db.close()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
