#!/usr/bin/env python3
"""Create test user for development."""

import os
import sys

proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if proj_root not in sys.path:
    sys.path.insert(0, proj_root)

from app.db import SessionLocal  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402


def main():
    """Create test user."""
    username = "test"
    email = "test@example.com"
    password = "testpass123"

    db = SessionLocal()
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
        print(f"✓ {action.capitalize()} user: {username}")
        print(f"  Email: {email}")
        print(f"  Password: {password}")
        return 0
    except Exception as exc:
        print(f"✗ Database error: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
