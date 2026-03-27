#!/usr/bin/env python3
"""Create a superadmin user in the local development database.

This is a convenience wrapper around `create_user.py` that also sets the
user's ``system_permissions`` to ``superadmin``.  It is intended for
local development setup only.

Usage (inside the backend container):

    docker exec -it quill_backend sh -lc \
        "cd /app && python ./scripts/create_superuser.py"

Or via the Justfile:

    just csu
"""

from __future__ import annotations

import getpass
import os
import sys

proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)


def main() -> int:
    """Run the interactive create-superuser flow.

    Returns:
        int: Exit code (0 on success, non-zero on error).
    """
    try:
        username = input("Username: ").strip()
        email = input("Email: ").strip()
    except (KeyboardInterrupt, EOFError):
        print("Aborted.")
        return 4

    try:
        password = getpass.getpass(prompt="Password: ")
        confirm = getpass.getpass(prompt="Confirm password: ")
        if password != confirm:
            print("ERROR: passwords do not match", file=sys.stderr)
            return 3
    except (KeyboardInterrupt, EOFError):
        print("Aborted.")
        return 4

    try:
        from sqlalchemy import inspect

        from app.db import SessionLocal
        from app.models import User
        from app.security import hash_password
    except Exception as exc:
        print(f"Failed to import app modules: {exc}", file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        if db.bind is None:
            print("ERROR: Database bind is None", file=sys.stderr)
            return 1
        inspector = inspect(db.bind)
        if "users" not in inspector.get_table_names():
            print(
                "ERROR: Database not initialised. Run migrations first:",
                file=sys.stderr,
            )
            print(
                "  docker exec quill_backend sh -lc 'alembic upgrade head'",
                file=sys.stderr,
            )
            return 2
    except Exception as exc:
        print(f"Database connection error: {exc}", file=sys.stderr)
        return 1

    try:
        u = db.query(User).filter(User.username == username).first()
        if not u:
            u = User(
                username=username,
                email=email,
                password_hash=hash_password(password),
                system_permissions="superadmin",
            )
            db.add(u)
            action = "created"
        else:
            u.email = email
            u.password_hash = hash_password(password)
            u.system_permissions = "superadmin"
            u.is_active = True
            u.is_totp_enabled = False
            action = "updated"
        db.commit()
        print(f"Successfully {action} superadmin user: {username}")
        return 0
    except Exception as exc:
        print(f"Database error: {exc}", file=sys.stderr)
        return 1
    finally:
        try:
            db.close()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
