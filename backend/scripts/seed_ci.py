#!/usr/bin/env python3
"""Seed CI database with test users for E2E tests.

Non-interactive — uses hardcoded test credentials suitable only for
ephemeral CI containers. NEVER use in production.

Usage (inside the backend container after migrations):
    python scripts/seed_ci.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, "/app")

from app.db import CoreSessionLocal  # noqa: E402
from app.models import OrgUnit, OrgUnitFeature, User  # noqa: E402
from app.organisations import add_org_unit_member  # noqa: E402
from app.security import hash_password  # noqa: E402

# Base32 of RFC 4226's test key "12345678901234567890". Public, and only
# ever seeded into the throwaway CI database; see the BACKEND_ENV guard.
# cspell:disable-next-line
CI_TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"


def seed() -> None:
    """Create test users and organisation for E2E."""
    db = CoreSessionLocal()
    try:
        # 1. Create superadmin
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(
                username="admin",
                email="admin@ci.local",
                password_hash=hash_password("admin123"),
                platform_role="superadmin",
                is_active=True,
                email_verified=True,
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
                platform_role="standard",
                base_profession="teaching_admin",
                is_active=True,
                email_verified=True,
            )
            db.add(educator)
            db.flush()
            print("Created educator user")
        else:
            print("Educator user already exists")

            # 2b. A user with two-factor authentication on, for the
        # keyboard-only login journey in e2e/tests/keyboard.spec.ts. The
        # secret is RFC 4226's published example, not a real one; the
        # test derives the current code from it.
        two_factor = (
            db.query(User).filter(User.username == "twofactor").first()
        )
        if not two_factor:
            two_factor = User(
                username="twofactor",
                email="twofactor@ci.local",
                password_hash=hash_password("twofactor123"),
                platform_role="standard",
                base_profession="teaching_admin",
                is_active=True,
                email_verified=True,
                totp_secret=CI_TOTP_SECRET,
                is_totp_enabled=True,
            )
            db.add(two_factor)
            db.flush()
            print("Created two-factor user")
        else:
            print("Two-factor user already exists")

            # 3. Create teaching organisation
        org = (
            db.query(OrgUnit)
            .filter(OrgUnit.name == "CI Teaching Hospital")
            .first()
        )
        if not org:
            org = OrgUnit(
                name="CI Teaching Hospital",
                type="teaching_establishment",
                location="CI",
            )
            db.add(org)
            db.flush()
            print("Created teaching organisation")
        else:
            print("Teaching organisation already exists")

            # 4. Enable teaching feature for organisation
        # Features hang off the organisation's own row in the tree, which
        # the model creates alongside the organisation itself.
        feat = (
            db.query(OrgUnitFeature)
            .filter(
                OrgUnitFeature.org_unit_id == org.id,
                OrgUnitFeature.feature_key == "teaching",
            )
            .first()
        )
        if not feat:
            feat = OrgUnitFeature(
                org_unit_id=org.id,
                feature_key="teaching",
                enabled_by=admin.id,
            )
            db.add(feat)
            db.flush()
            print("Enabled teaching feature")

        # 5. Add educator to organisation (staff)
        # Membership is one table keyed on the place now, so this goes
        # through the writer rather than a relationship on the place.
        # It is idempotent, which is why there is no membership check.
        add_org_unit_member(db, org.id, educator.id, "staff")
        print("Added educator to organisation")
        add_org_unit_member(db, org.id, two_factor.id, "staff")
        print("Added two-factor user to organisation")

        db.commit()
        print("CI seed complete")
    except Exception as exc:
        db.rollback()
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    # Fail-safe: refuse to run outside a testing environment so hardcoded
    # credentials can never be seeded into a real database.
    if os.environ.get("BACKEND_ENV") != "testing":
        print(
            "Refusing to seed: BACKEND_ENV is not 'testing'",
            file=sys.stderr,
        )
        sys.exit(1)
    seed()
