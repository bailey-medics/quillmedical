#!/usr/bin/env python3
"""Seed CI database with test users for E2E tests.

Non-interactive — uses hardcoded test credentials suitable only for
ephemeral CI containers. NEVER use in production.

Usage (inside the backend container after migrations):
    python scripts/seed_ci.py
"""

from __future__ import annotations

import sys

sys.path.insert(0, "/app")

from app.db import SessionLocal  # noqa: E402
from app.models import Organization, User  # noqa: E402
from app.security import hash_password  # noqa: E402


def seed() -> None:
    """Create test users and organisation for E2E."""
    db = SessionLocal()
    try:
        # 1. Create superadmin
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(
                username="admin",
                email="admin@ci.local",
                password_hash=hash_password("admin123"),
                system_permissions="superadmin",
                is_active=True,
            )
            db.add(admin)
            db.flush()
            print("Created admin user")
        else:
            print("Admin user already exists")

        # 2. Create educator (staff)
        educator = db.query(User).filter(User.username == "educator").first()
        if not educator:
            educator = User(
                username="educator",
                email="educator@ci.local",
                password_hash=hash_password("educator123"),
                system_permissions="staff",
                base_profession="educator",
                is_active=True,
            )
            db.add(educator)
            db.flush()
            print("Created educator user")
        else:
            print("Educator user already exists")

        # 3. Create teaching organisation
        org = (
            db.query(Organization)
            .filter(Organization.name == "CI Teaching Hospital")
            .first()
        )
        if not org:
            org = Organization(
                name="CI Teaching Hospital",
                type="teaching_establishment",
                location="CI",
                teaching_enabled=True,
            )
            db.add(org)
            db.flush()
            print("Created teaching organisation")
        else:
            print("Teaching organisation already exists")

        # 4. Add educator to organisation (staff)
        if educator not in org.staff_members:
            org.staff_members.append(educator)
            print("Added educator to organisation")

        db.commit()
        print("CI seed complete")
    except Exception as exc:
        db.rollback()
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    seed()
