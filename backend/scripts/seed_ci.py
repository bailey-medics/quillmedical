#!/usr/bin/env python3
"""Seed CI database with test users for E2E tests.

Non-interactive – uses hardcoded test credentials suitable only for
ephemeral CI containers. NEVER use in production.

Usage (inside the backend container after migrations):
    python scripts/seed_ci.py
"""

from __future__ import annotations

import os
import sys
from datetime import UTC, datetime

sys.path.insert(0, "/app")

from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.cbac.grants import sync_competency_rows  # noqa: E402
from app.config import settings  # noqa: E402
from app.db import CoreSessionLocal  # noqa: E402
from app.features.teaching.access import give_place  # noqa: E402
from app.features.teaching.models import (  # noqa: E402
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.features.teaching.storage import (  # noqa: E402
    discover_local_banks,
    resolve_local_bank,
)
from app.features.teaching.sync import sync_question_bank  # noqa: E402
from app.models import (  # noqa: E402
    OrgUnit,
    OrgUnitFeature,
    PractisingCompetency,
    User,
)
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

        # Belonging is not enough to take a module: teaching asks for a
        # place too, the row a centre's door writes. Without it these two
        # would see no module and every teaching journey would fail.
        give_place(db, educator, org.id)
        give_place(db, two_factor, org.id)
        print("Gave educator and two-factor user a place for modules")

        # 5b. A user manager and two people for them to manage, for the
        # member practice journey in e2e/tests/member-practice.spec.ts.
        # One person per browser project, so chromium and webkit never
        # change the same member's competencies.
        seed_member_practice(db, org.id)

        db.commit()

        # 6. Open every teaching module mounted at /teaching-repos
        seed_teaching(db, org.id, admin.id)

        print("CI seed complete")
    except Exception as exc:
        db.rollback()
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


def _ensure_user(
    db: Session, username: str, base_profession: str | None = None
) -> User:
    """Return the user called *username*, creating them if missing.

    The password is the username followed by ``123``, as for every other
    CI user.
    """
    user = db.query(User).filter(User.username == username).first()
    if user is not None:
        return user
    user = User(
        username=username,
        email=f"{username}@ci.local",
        password_hash=hash_password(f"{username}123"),
        platform_role="standard",
        base_profession=base_profession,
        is_active=True,
        email_verified=True,
    )
    db.add(user)
    db.flush()
    print(f"Created {username} user")
    return user


def seed_member_practice(db: Session, org_unit_id: int) -> None:
    """Seed a user manager, and the members they manage, at one org_unit.

    ``usermanager`` is a ``teaching_admin`` given ``manage_users``,
    ``manage_staff_membership`` and ``manage_practising_competencies`` on
    top, which is what ``teaching_manager`` gave them before it was folded
    into ``teaching_admin``. It administers the org_unit through a
    ``practising_competency`` row carrying ``manage_users``, which is what
    makes it theirs to administer.
    """
    manager = _ensure_user(db, "usermanager", "teaching_admin")
    sync_competency_rows(
        manager,
        additional=[
            "manage_users",
            "manage_staff_membership",
            "manage_practising_competencies",
        ],
        removed=[],
        source="admin",
    )
    add_org_unit_member(db, org_unit_id, manager.id, "staff")
    administers = db.scalar(
        select(PractisingCompetency.id).where(
            PractisingCompetency.user_id == manager.id,
            PractisingCompetency.org_unit_id == org_unit_id,
            PractisingCompetency.competency == "manage_users",
        )
    )
    if administers is None:
        db.add(
            PractisingCompetency(
                user_id=manager.id,
                org_unit_id=org_unit_id,
                competency="manage_users",
            )
        )

    for username in ("practice_chromium", "practice_webkit"):
        member = _ensure_user(db, username)
        add_org_unit_member(db, org_unit_id, member.id, "staff")
    db.flush()
    print("Seeded the member practice journey")


def seed_teaching(db: Session, org_unit_id: int, admin_id: int) -> None:
    """Sync each mounted teaching module into the CI organisation, live.

    compose.ci.yml mounts the content that
    .github/scripts/ci/fetch-e2e-teaching.sh fetched, so the tests have a
    module to open. A synced module is
    closed and has no version promoted, so candidates see nothing until
    both are set, as an admin would through the bank's settings page.

    Raises:
        RuntimeError: If a module fails validation, so a content problem
            stops the run here rather than surfacing as an empty dashboard
            three steps later.
    """
    base_path = settings.TEACHING_QUESTION_BANK_PATH
    bank_ids = discover_local_banks(base_path) if base_path else []
    if not bank_ids:
        print("No teaching modules mounted; the dashboard will be empty")
        return

    for bank_id in bank_ids:
        bank_path = resolve_local_bank(base_path or "", bank_id)
        if bank_path is None:
            raise RuntimeError(f"Teaching module {bank_id} not found")

        # Commits itself. A re-run finds the same version already stored
        # and updates only its metadata, which is why the version promoted
        # below is read back from the table rather than from this result.
        validation, _record = sync_question_bank(
            bank_path, org_unit_id, admin_id, db
        )
        if not validation.is_valid:
            messages = "; ".join(e.message for e in validation.errors[:5])
            raise RuntimeError(f"Teaching module {bank_id}: {messages}")

        version = db.scalar(
            select(func.max(QuestionBankConfig.version)).where(
                QuestionBankConfig.org_unit_id == org_unit_id,
                QuestionBankConfig.question_bank_id == bank_id,
            )
        )
        if version is None:
            raise RuntimeError(f"Teaching module {bank_id} did not sync")

        status = db.scalar(
            select(QuestionBankOrgStatus).where(
                QuestionBankOrgStatus.org_unit_id == org_unit_id,
                QuestionBankOrgStatus.question_bank_id == bank_id,
            )
        )
        if status is None:
            status = QuestionBankOrgStatus(
                org_unit_id=org_unit_id, question_bank_id=bank_id
            )
            db.add(status)

        status.is_live = True
        # Going live needs one when the module emails a coordinator on a
        # pass. Emails are dry-run in CI, so nothing is sent to it.
        status.coordinator_email = "coordinator@ci.local"
        status.active_version = version
        status.active_version_set_by = admin_id
        status.active_version_set_at = datetime.now(UTC)
        db.commit()
        print(f"Opened teaching module {bank_id} at version {version}")


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
