#!/usr/bin/env python3
"""Non-interactive admin CLI for Cloud Run Job execution.

This script provides administrative operations (user creation, permission
updates, role assignment) driven entirely by environment variables, making
it suitable for execution as a Cloud Run Job where interactive prompts are
not available.

Environment Variables:
    ADMIN_ACTION:     Required.  One of: create-superadmin, add-role,
                      verify-email, run-migrations,
                      check-competency-seeding, delete-passport.
    ADMIN_USERNAME:   Required.  Target username.
    ADMIN_EMAIL:      Required for create-superadmin.
    ADMIN_PASSWORD:   Required for create-superadmin.
    ADMIN_ROLE:       Required for add-role (e.g. "System Administrator").
    CONFIRM:          delete-passport only. The passport id, pasted back
                      from a dry run. Without it the action only reports.

    delete-passport also reads PASSPORT_DELETABLE_USER_IDS, a
    comma-separated list of user ids set in Terraform, and
    PASSPORT_ARCHIVE_GCS_BUCKET. See delete_passport().

    run-migrations takes no ADMIN_* variables — it runs `alembic upgrade
    head` against the standard CORE_DB_* connection settings, as a
    pre-deploy step run once against the shared database before the new
    app revision is created (see docs/docs/backend/alembic-migration-safety.md).

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

    from app.cbac.base_professions import (
        SUPERADMIN_PROFESSION,
        get_profession_base_competencies,
    )
    from app.cbac.grants import sync_competency_rows
    from app.db.core_db import CoreSessionLocal
    from app.models import Role, User
    from app.security import hash_password

    db = CoreSessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        is_new = user is None
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

        user.platform_role = "superadmin"
        user.email_verified = True

        # Operating Quill grants its competencies through a profession,
        # like every other role, rather than by a rank check inside each
        # gate — `/admin` now asks for `manage_users`, not for a
        # permission level. This used to set `consultant`, which is both
        # too much and too little: a pile of clinical competencies an
        # operator has no business holding, and not the one the gates
        # actually ask for.
        if is_new:
            user.base_profession = SUPERADMIN_PROFESSION
            # Seeds the profession's competencies as rows. Nobody is
            # signed in to be named as granting them.
            sync_competency_rows(
                user, additional=[], removed=[], source="bootstrap"
            )
        else:
            # An existing user keeps the profession they practise under —
            # overwriting it would strip a clinician's clinical
            # competencies — so the operator ones are added alongside.
            granted = set(user.additional_competency_ids)
            granted.update(
                get_profession_base_competencies(SUPERADMIN_PROFESSION)
            )
            # Nobody is signed in to be named as granting them.
            sync_competency_rows(
                user,
                additional=sorted(granted),
                removed=user.removed_competency_ids,
                source="bootstrap",
            )

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


def add_role() -> int:
    """Add a role to an existing user."""
    env = _require_env("ADMIN_USERNAME", "ADMIN_ROLE")
    username = env["ADMIN_USERNAME"]
    role_name = env["ADMIN_ROLE"]

    from app.db.core_db import CoreSessionLocal
    from app.models import Role, User

    db = CoreSessionLocal()
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


def verify_email() -> int:
    """Mark an existing user's email as verified."""
    env = _require_env("ADMIN_USERNAME")
    username = env["ADMIN_USERNAME"]

    from app.db.core_db import CoreSessionLocal
    from app.models import User

    db = CoreSessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user:
            print(f"✗ User '{username}' not found", file=sys.stderr)
            return 1

        if user.email_verified:
            print(f"ℹ User '{username}' email is already verified")
            return 0

        user.email_verified = True
        db.commit()
        print(f"✓ Marked '{username}' email as verified")
        return 0

    except Exception as exc:
        db.rollback()
        print(f"✗ Database error: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()


def run_migrations() -> int:
    """Apply all pending Alembic migrations (`alembic upgrade head`).

    Run as the pre-deploy step against the shared core database, before the
    new app revision is created — see
    docs/docs/backend/alembic-migration-safety.md.
    """
    from alembic.config import Config

    from alembic import command

    config_path = os.path.join(proj_root, "alembic.ini")
    cfg = Config(config_path)
    try:
        command.upgrade(cfg, "head")
        print("✓ Migrations applied successfully")
        return 0
    except Exception as exc:
        print(f"✗ Migration failed: {exc}", file=sys.stderr)
        return 1


def smoke_test() -> int:
    """Check a URL returns 200, from inside the VPC.

    Exists so the deploy can health-check a revision that is not reachable
    from a GitHub runner. A Cloud Run service set to
    INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER accepts same-project VPC
    traffic, so this job can reach a tagged revision's URL while the
    public internet cannot, provided the job's `vpc_egress` is
    ALL_TRAFFIC rather than the default.

    Environment:
        SMOKE_URL:      Required. The URL to check.
        SMOKE_RETRIES:  Attempts before giving up (default 5).
        SMOKE_INTERVAL: Seconds between attempts (default 10).
    """
    import time
    import urllib.error
    import urllib.request

    env = _require_env("SMOKE_URL")
    url = env["SMOKE_URL"]
    retries = int(os.environ.get("SMOKE_RETRIES", "5"))
    interval = float(os.environ.get("SMOKE_INTERVAL", "10"))

    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(url, timeout=10) as response:
                status = response.status
        except urllib.error.HTTPError as exc:
            status = exc.code
        except Exception as exc:
            # Connection refused, DNS failure, timeout. Worth retrying:
            # a revision that has just been created may not be serving yet.
            print(f"Attempt {attempt}/{retries}: {type(exc).__name__}: {exc}")
            status = None

        if status == 200:
            print(f"✓ Health check passed: {url}")
            return 0

        if status is not None:
            print(f"Attempt {attempt}/{retries}: got {status}")

        if attempt < retries:
            time.sleep(interval)

    print(
        f"✗ Health check failed after {retries} attempts: {url}",
        file=sys.stderr,
    )
    return 1


def check_competency_seeding() -> int:
    """List users who hold a competency only through their profession.

    The check to run before the resolver stops reading the profession's
    template: anybody listed would lose those competencies when it does.
    Prints user ids and competency ids only, never names. Exits 1 when
    anybody is listed, so a job run fails visibly.
    """
    from app.cbac.audit import unseeded_profession_competencies
    from app.db.core_db import CoreSessionLocal

    db = CoreSessionLocal()
    try:
        found = unseeded_profession_competencies(db)
    except Exception as exc:
        print(f"✗ Database error: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()

    if not found:
        print("✓ Every user's profession competencies are rows")
        return 0

    print(
        f"✗ {len(found)} user(s) hold competencies only through their "
        "profession:",
        file=sys.stderr,
    )
    for user_id, competency_ids in sorted(found.items()):
        print(
            f"  user {user_id}: {', '.join(competency_ids)}", file=sys.stderr
        )
    return 1


def _deletable_user_ids() -> set[int]:
    """The holders whose passports may be deleted, from Terraform.

    Unset or empty means nobody. An entry that is not a whole number is
    refused rather than skipped, so a typo in Terraform stops the command
    instead of quietly narrowing the list.
    """
    raw = os.environ.get("PASSPORT_DELETABLE_USER_IDS", "").strip()
    if not raw:
        return set()
    ids: set[int] = set()
    for part in raw.split(","):
        part = part.strip()
        if not part.isdigit():
            raise ValueError(
                f"PASSPORT_DELETABLE_USER_IDS holds {part!r}, which is not "
                "a user id."
            )
        ids.add(int(part))
    return ids


def _passport_counts(passport_id: str) -> dict[str, int]:
    """How many of each record a passport holds, for the dry run."""
    from pathlib import PurePosixPath

    from app.features.passport import paths
    from app.passport_storage import get_passport_store

    store = get_passport_store()

    def entries(folder: PurePosixPath) -> int:
        return len(store.list_dir(passport_id, folder))

    def nested(folder: PurePosixPath) -> int:
        return sum(entries(sub) for sub in store.list_dir(passport_id, folder))

    return {
        "sign-offs": entries(paths.SIGN_OFFS),
        "logbook entries": nested(paths.LOGBOOK),
        "certificates": entries(paths.CERTIFICATES),
        "CPD entries": nested(paths.CPD),
        "reflections": entries(paths.REFLECTIONS),
    }


def delete_passport() -> int:
    """Delete one test holder's passport, archiving it for 30 days.

    For testing on teaching, where a holder needs to start again. Never
    reachable from the web application, and guarded four ways:

    - **Only holders named in Terraform.** ``PASSPORT_DELETABLE_USER_IDS``
      lists user ids, so adding somebody is a reviewed change to
      ``infra/``. Unset means nobody.
    - **A dry run first.** Without ``CONFIRM`` it reports what it would
      delete and stops. With it, ``CONFIRM`` must equal the passport id.
    - **One passport per run**, named by its holder's username.
    - **Archived, not destroyed.** The repository and evidence are copied
      to the archive bucket, which clears itself after 30 days, before
      anything is removed.

    See Phases 6 to 9 of docs/docs/plans/2026-09-26-passport-specialties-plan.md.
    """
    env = _require_env("ADMIN_USERNAME")
    username = env["ADMIN_USERNAME"]
    confirm = os.environ.get("CONFIRM", "").strip()

    from datetime import UTC, datetime

    from sqlalchemy import delete, func, select

    from app.db.core_db import CoreSessionLocal
    from app.features.passport.models import (
        Passport,
        PassportAssessorInvite,
        PassportSignOffRequest,
    )
    from app.models import User
    from app.passport_storage import archive_passport

    try:
        deletable = _deletable_user_ids()
    except ValueError as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return 1

    db = CoreSessionLocal()
    try:
        user = db.scalar(select(User).where(User.username == username))
        if user is None:
            print(f"✗ User '{username}' not found", file=sys.stderr)
            return 1

        passport = db.scalar(
            select(Passport).where(Passport.user_id == user.id)
        )
        if passport is None:
            print(
                f"✗ '{username}' (user {user.id}) has no passport",
                file=sys.stderr,
            )
            return 1

        listed = user.id in deletable
        open_requests = db.scalar(
            select(func.count())
            .select_from(PassportSignOffRequest)
            .where(
                PassportSignOffRequest.passport_id == passport.id,
                PassportSignOffRequest.status == "open",
            )
        )

        if not confirm:
            print(f"Holder:   {username} (user {user.id})")
            print(f"Passport: {passport.id}")
            for label, count in _passport_counts(passport.id).items():
                print(f"  {count:4d} {label}")
            print(f"  {open_requests or 0:4d} open sign-off requests")
            print(
                "Deletable: "
                + (
                    "yes"
                    if listed
                    else "no, not in PASSPORT_DELETABLE_USER_IDS"
                )
            )
            print(
                "Nothing was changed. To delete it, run again with "
                f"CONFIRM={passport.id}"
            )
            return 0

        if not listed:
            print(
                f"✗ '{username}' (user {user.id}) is not in "
                "PASSPORT_DELETABLE_USER_IDS. Holders are added in "
                "Terraform, in infra/.",
                file=sys.stderr,
            )
            return 1

        if confirm != passport.id:
            print(
                f"✗ CONFIRM does not match '{username}''s passport. Nothing "
                "was changed.",
                file=sys.stderr,
            )
            return 1

        # The rows go in the same transaction the archive runs inside, and
        # are committed only once the archive has succeeded, so a failed
        # archive leaves both the files and the rows where they were. The
        # requests and invitations are deleted by name rather than left to
        # the foreign keys' cascade, so the command does not depend on the
        # database enforcing it.
        passport_id = passport.id
        for model in (PassportSignOffRequest, PassportAssessorInvite):
            db.execute(delete(model).where(model.passport_id == passport_id))
        db.delete(passport)
        db.flush()

        day = datetime.now(UTC).date()
        moved = archive_passport(
            passport_id,
            day,
            archive_bucket=os.environ.get("PASSPORT_ARCHIVE_GCS_BUCKET"),
            archive_root=os.environ.get("PASSPORT_ARCHIVE_LOCAL_ROOT"),
        )

        try:
            db.commit()
        except Exception as exc:
            # The one gap copy-then-remove cannot close: the files have
            # moved and the row has not. Said plainly, with where to find
            # them, rather than as "nothing was deleted".
            db.rollback()
            print(
                f"✗ The passport was archived under deleted/{day} but its "
                f"row could not be removed: {exc}. Copy it back to "
                "restore it.",
                file=sys.stderr,
            )
            return 1

        print(
            f"✓ Deleted {username}'s passport {passport_id}: {len(moved)} "
            "objects archived for 30 days"
        )
        return 0

    except Exception as exc:
        db.rollback()
        print(f"✗ Nothing was deleted: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()


ACTIONS: dict[str, tuple[Callable[[], int], str]] = {
    "check-competency-seeding": (
        check_competency_seeding,
        "List users who would lose a competency when only rows count",
    ),
    "create-superadmin": (
        create_superadmin,
        "Create user with superadmin permissions",
    ),
    "add-role": (
        add_role,
        "Add a role to an existing user",
    ),
    "verify-email": (
        verify_email,
        "Mark a user's email as verified",
    ),
    "run-migrations": (
        run_migrations,
        "Apply all pending Alembic migrations (alembic upgrade head)",
    ),
    "delete-passport": (
        delete_passport,
        "Delete a test holder's passport, archived for 30 days",
    ),
    "smoke-test": (
        smoke_test,
        "Check SMOKE_URL returns 200, from inside the VPC",
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
