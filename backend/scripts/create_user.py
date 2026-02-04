#!/usr/bin/env python3
"""Create or update a user in the database.

This module provides an interactive helper to add or update a user record
in the backend database. It prompts for username, email and password, then
persists the user using the application's SQLAlchemy session.

+The script is intended to be executed inside the development backend
container where the application package is importable. For example:

```
docker exec -it quill_backend sh -lc \
    "cd /app && python ./scripts/create_user.py"
```

Example:

    $ python backend/scripts/create_user.py
    Username: alice
    Email: alice@example.com
    Password: ********
    Confirm password: ********
    Successfully created user: alice

"""

from __future__ import annotations

import getpass
import os
import sys

proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)


def main() -> int:
    """Run the interactive create/update user flow.

    The function prompts the user for the required fields and writes the
    user to the database. It returns an exit code suitable for use as a
    process return value:

    Returns:
        int: Exit code (0 on success, non-zero on error).

    Exit codes:
        0: Success - user created or updated.
        1: Application import error or other internal failure.
        2: Database not migrated (users table does not exist).
        3: Passwords did not match.
        4: Interactive input aborted by user.
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

    # Import app modules here; inside the container these should be available.
    try:
        from sqlalchemy import inspect

        from app.db import SessionLocal
        from app.models import User
        from app.security import hash_password
    except Exception as exc:  # pragma: no cover - environment errors
        print(f"Failed to import app modules: {exc}", file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        # Check if database has been migrated by verifying the users table exists
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
        db.commit()
        print(f"Successfully {action} user: {username}")
        return 0
    except Exception as exc:  # pragma: no cover - runtime DB errors
        print(f"Database error: {exc}", file=sys.stderr)
        return 1
    finally:
        try:
            db.close()
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
