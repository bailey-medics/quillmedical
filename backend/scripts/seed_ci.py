#!/usr/bin/env python3
"""Seed CI database with test users for E2E tests.

Non-interactive - uses hardcoded test credentials suitable only for
ephemeral CI containers. NEVER use in production.

Usage (inside the backend container after migrations):
    python scripts/seed_ci.py
"""

from __future__ import annotations

import os
import shutil
import sys
from datetime import UTC, datetime, timedelta

sys.path.insert(0, "/app")

from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.cbac.grants import sync_competency_rows  # noqa: E402
from app.cbac.positions import set_clinical_lead  # noqa: E402
from app.config import settings  # noqa: E402
from app.db import CoreSessionLocal  # noqa: E402
from app.features.teaching.access import (  # noqa: E402
    enrol_everyone_with_a_place,
    give_place,
)
from app.features.teaching.media import (  # noqa: E402
    caption_is_configured,
    get_referenced_media_keys,
    transcode_is_configured,
)
from app.features.teaching.media_uploads import (  # noqa: E402
    link_upload,
    local_upload_file,
    new_upload_target,
)
from app.features.teaching.models import (  # noqa: E402
    Assessment,
    ModuleMediaLink,
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.features.teaching.storage import (  # noqa: E402
    discover_local_banks,
    resolve_local_bank,
    resolve_module_dir,
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
CI_TOTP_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"  # nosec B105


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
                # What an operator is given in a real deployment: the
                # platform role alone opens no admin page.
                base_profession="superadmin_profession",
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
        seed_two_factor_per_browser(db, org.id)
        print("Added two-factor user to organisation")

        # Belonging is not enough to take a module: teaching asks for a
        # place too, the row a centre's door writes. Without it these two
        # would see no module and every teaching journey would fail.
        give_place(db, educator, org.id)
        give_place(db, two_factor, org.id)
        print("Gave educator and two-factor user a place for modules")

        # 5a. Somebody to sit the exam in each browser project, for
        # e2e/tests/teaching-journeys.spec.ts. Starting an exam hands
        # back the attempt somebody already has open, so two browsers
        # sitting as one person would be handed each other's paper.
        for username in ("exam_chromium", "exam_webkit"):
            sitter = _ensure_user(db, username, "teaching_admin")
            add_org_unit_member(db, org.id, sitter.id, "staff")
            give_place(db, sitter, org.id)
        print("Seeded somebody to sit the exam in each browser")

        # 5b. A user manager and two people for them to manage, for the
        # member practice journey in e2e/tests/member-practice.spec.ts.
        # One person per browser project, so chromium and webkit never
        # change the same member's competencies.
        seed_member_practice(db, org.id)

        # 5c. A site inside the teaching organisation, and an organisation
        # the teaching admin does not belong to, for the journeys in
        # e2e/tests/teaching-admin/.
        seed_teaching_admin_places(db, org.id, educator)
        seed_clinical_lead(db, admin)
        seed_out_of_time_learners(db)

        # 5d. The rest of the world the teaching journeys run in: a
        # second site here, and a second teaching organisation with two
        # sites, each site with its own clinical lead, so the leak tests
        # in e2e/tests/leaks/ can see what crosses a site or an
        # organisation.
        second = seed_teaching_world(db, org.id, admin)

        # 5e. A passport place and a safety place, each with somebody's
        # data in it, that nobody in teaching may reach, for
        # e2e/tests/leaks/other-features.spec.ts. The passport place has
        # its passport admin too, for the journeys in e2e/tests/passport/.
        seed_other_feature_places(db, admin)

        db.commit()

        # 5f. Somebody who operates Quill and runs teaching, to fill in a
        # module's video at an organisation they do not belong to.
        seed_operator(db, org.id)

        # 6. Open every teaching module mounted at /teaching-repos, at
        # both teaching organisations. The second gets no video: the
        # journey in e2e/tests/teaching-admin/video-gate.gate.spec.ts
        # uploads it, and checks the module is hidden until then.
        seed_teaching(db, org.id, admin.id)
        seed_teaching(db, second.id, admin.id, with_videos=False)

        # 7. A delegate with a result, for the teaching admin's list of
        # delegates in e2e/tests/teaching-admin/
        seed_delegate_result(db, org.id)

        # 8. An attempt whose time has run out, for e2e/tests/edges/
        seed_out_of_time_attempts(db, org.id)

        print("CI seed complete")
    except Exception as exc:
        db.rollback()
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


def seed_two_factor_per_browser(db: Session, org_unit_id: int) -> None:
    """Seed a two-factor user for each browser project.

    For the keyboard-only login journey. Each two-factor code is used once
    (``app.users.totp.use_totp_code``), so the two browsers signing in as
    one person in the same 30 seconds would have the second refused.
    """
    for username in ("twofactor_chromium", "twofactor_webkit"):
        user = _ensure_user(db, username, "teaching_admin")
        user.totp_secret = CI_TOTP_SECRET
        user.is_totp_enabled = True
        add_org_unit_member(db, org_unit_id, user.id, "staff")
        give_place(db, user, org_unit_id)
    db.flush()


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


def _ensure_org_unit(
    db: Session, name: str, unit_type: str, parent_id: int | None
) -> OrgUnit:
    """Return the org_unit called *name*, creating it if missing."""
    unit = db.query(OrgUnit).filter(OrgUnit.name == name).first()

    if unit is not None:
        return unit

    unit = OrgUnit(
        name=name, type=unit_type, parent_id=parent_id, location="CI"
    )
    db.add(unit)
    db.flush()
    print(f"Created {name}")

    return unit


def seed_teaching_admin_places(
    db: Session, org_unit_id: int, teaching_admin: User
) -> None:
    """Seed the places the teaching admin journeys act on and are refused.

    ``CI Teaching Centre`` is a site inside the teaching organisation,
    with the teaching admin (``educator``) a member there too. It is the
    site whose page the journeys edit and add staff to.

    ``CI Other Hospital`` and its ``CI Other Centre`` are a second tree
    the teaching admin belongs nowhere in. A teaching admin must not be
    able to move anybody into it, and the journeys check they cannot.
    """
    centre = _ensure_org_unit(db, "CI Teaching Centre", "site", org_unit_id)
    add_org_unit_member(db, centre.id, teaching_admin.id, "staff")

    other = _ensure_org_unit(
        db, "CI Other Hospital", "teaching_establishment", None
    )
    _ensure_org_unit(db, "CI Other Centre", "site", other.id)
    db.flush()
    print("Seeded the teaching admin's places")


def seed_clinical_lead(db: Session, appointed_by: User) -> None:
    """Seed the clinical lead a delegate names when they register.

    ``ci_lead`` holds the clinical lead post at ``CI Teaching Centre``, so
    a delegate registering for a module the organisation serves can give
    ``ci_lead@ci.local`` and join that site. A post is held where somebody
    belongs, so the lead joins the site before being appointed to it.
    """
    site = db.query(OrgUnit).filter(OrgUnit.name == "CI Teaching Centre").one()
    lead = _ensure_user(db, "ci_lead", "teaching_clinical_lead")
    add_org_unit_member(db, site.id, lead.id, "staff")
    set_clinical_lead(db, site, lead, appointed_by=appointed_by)
    db.flush()
    print("Seeded the clinical lead of CI Teaching Centre")


#: The second teaching organisation, and its teaching admin.
SECOND_ORGANISATION = "CI Second Hospital"
SECOND_TEACHING_ADMIN = "educator_second"

#: The sites of the world besides ``CI Teaching Centre``, each with the
#: organisation it is in and the username of its clinical lead.
WORLD_SITES = (
    ("CI Teaching Annexe", "CI Teaching Hospital", "ci_annexe_lead"),
    ("CI Second Centre", SECOND_ORGANISATION, "ci_second_lead"),
    ("CI Second Annexe", SECOND_ORGANISATION, "ci_second_annexe_lead"),
)


def seed_teaching_world(
    db: Session, organisation_id: int, appointed_by: User
) -> OrgUnit:
    """Seed the second site, and the second teaching organisation.

    With ``CI Teaching Centre`` this makes two teaching organisations of
    two sites each, every site with a clinical lead of its own, and the
    second organisation with a teaching admin of its own. ``CI Other
    Hospital``, which runs no teaching, stays as the place nobody may
    move a delegate to.

    Returns:
        The second teaching organisation, for ``seed_teaching`` to open
        the modules at.
    """
    second = _ensure_org_unit(
        db, SECOND_ORGANISATION, "teaching_establishment", None
    )
    teaching_on = db.scalar(
        select(OrgUnitFeature.id).where(
            OrgUnitFeature.org_unit_id == second.id,
            OrgUnitFeature.feature_key == "teaching",
        )
    )

    if teaching_on is None:
        db.add(
            OrgUnitFeature(
                org_unit_id=second.id,
                feature_key="teaching",
                enabled_by=appointed_by.id,
            )
        )

    admin = _ensure_user(db, SECOND_TEACHING_ADMIN, "teaching_admin")
    add_org_unit_member(db, second.id, admin.id, "staff")
    give_place(db, admin, second.id)

    parents = {
        "CI Teaching Hospital": organisation_id,
        SECOND_ORGANISATION: second.id,
    }

    for site_name, organisation, lead_name in WORLD_SITES:
        site = _ensure_org_unit(db, site_name, "site", parents[organisation])
        lead = _ensure_user(db, lead_name, "teaching_clinical_lead")
        add_org_unit_member(db, site.id, lead.id, "staff")
        set_clinical_lead(db, site, lead, appointed_by=appointed_by)

    db.flush()
    print("Seeded the second site and the second teaching organisation")

    return second


#: The places that run passport and safety, not teaching: each its
#: organisation, its site, the feature it runs, and the member there with
#: their base profession.
OTHER_FEATURE_PLACES = (
    (
        "CI Passport Hospital",
        "CI Passport Centre",
        "passport",
        "ci_passport",
        "passport_delegate",
    ),
    (
        "CI Safety Hospital",
        "CI Safety Centre",
        "safety",
        "ci_safety",
        "safety_officer",
    ),
)


def seed_other_feature_places(db: Session, enabled_by: User) -> None:
    """Seed a passport place and a safety place nobody in teaching reaches.

    Each is an organisation with a site, its feature on, and a member at
    the site with something of theirs there: the passport member holds a
    passport, and the safety member the clinical safety officer post. So
    a refusal to a teaching admin or delegate protects a record rather
    than an empty place.
    """
    from app.cbac.positions import appoint
    from app.features.passport import ids, service
    from app.features.passport.commits import Actor
    from app.features.passport.models import Passport
    from app.models import Position
    from app.passport_storage import get_passport_store

    for (
        organisation,
        site_name,
        feature,
        member_name,
        profession,
    ) in OTHER_FEATURE_PLACES:
        org = _ensure_org_unit(db, organisation, "organisation", None)
        site = _ensure_org_unit(db, site_name, "site", org.id)
        feature_on = db.scalar(
            select(OrgUnitFeature.id).where(
                OrgUnitFeature.org_unit_id == org.id,
                OrgUnitFeature.feature_key == feature,
            )
        )

        if feature_on is None:
            db.add(
                OrgUnitFeature(
                    org_unit_id=org.id,
                    feature_key=feature,
                    enabled_by=enabled_by.id,
                )
            )

        member = _ensure_user(db, member_name, profession)
        add_org_unit_member(db, site.id, member.id, "staff")
        db.flush()

        if feature == "passport":
            held = db.scalar(
                select(Passport.id).where(Passport.user_id == member.id)
            )
            if held is None:
                passport_id = ids.new_passport_id()
                commit = service.create_passport(
                    get_passport_store(),
                    passport_id,
                    Actor(
                        name=member.username,
                        role=member.base_profession or "",
                        email=member.email,
                    ),
                    user_id=str(member.id),
                )
                db.add(
                    Passport(
                        id=passport_id, user_id=member.id, head_commit=commit
                    )
                )
        else:
            post = db.scalar(
                select(Position).where(
                    Position.org_unit_id == site.id,
                    Position.kind == "clinical_safety_officer",
                )
            )
            if post is None:
                post = Position(
                    org_unit_id=site.id,
                    kind="clinical_safety_officer",
                    title="Clinical safety officer",
                )
                db.add(post)
                db.flush()
                appoint(db, post, member, appointed_by=enabled_by)

    seed_passport_admin(db, enabled_by)

    db.flush()
    print("Seeded the passport and safety places")


#: The passport admin of "CI Passport Hospital", who makes every holder
#: and assessor the passport journeys act on. Never the operator: a
#: superadmin should do the least setting up there is, and the journeys
#: then run through the passport admin's own limits. See Phase 6 of
#: docs/docs/plans/2026-10-31-passport-landing-views-plan.md.
PASSPORT_ADMIN = "ci_passport_admin"


#: A second passport organisation, with its own site, passport admin and
#: member, so the leak tests can see that running the passport at one
#: trust shows nothing of another.
SECOND_PASSPORT_PLACE = (
    "CI Second Passport Hospital",
    "CI Second Passport Centre",
    "ci_second_passport_admin",
    "ci_second_passport",
)


def seed_passport_admin(db: Session, enabled_by: User) -> None:
    """Seed the passport admin of each passport organisation.

    Each is a member of the organisation itself, so the people they may
    make reach everything beneath it: a scoped manager administers the
    organisations they belong to and the places under them. The second
    organisation also gets a member at its site, for a passport admin of
    the first to be refused.
    """
    organisation = _ensure_org_unit(
        db, OTHER_FEATURE_PLACES[0][0], "organisation", None
    )
    admin = _ensure_user(db, PASSPORT_ADMIN, "passport_admin")
    add_org_unit_member(db, organisation.id, admin.id, "staff")

    name, site_name, second_admin, member_name = SECOND_PASSPORT_PLACE
    second = _ensure_org_unit(db, name, "organisation", None)
    site = _ensure_org_unit(db, site_name, "site", second.id)
    feature_on = db.scalar(
        select(OrgUnitFeature.id).where(
            OrgUnitFeature.org_unit_id == second.id,
            OrgUnitFeature.feature_key == "passport",
        )
    )

    if feature_on is None:
        db.add(
            OrgUnitFeature(
                org_unit_id=second.id,
                feature_key="passport",
                enabled_by=enabled_by.id,
            )
        )

    add_org_unit_member(
        db,
        second.id,
        _ensure_user(db, second_admin, "passport_admin").id,
        "staff",
    )
    add_org_unit_member(
        db,
        site.id,
        _ensure_user(db, member_name, "passport_delegate").id,
        "staff",
    )


#: The learners whose attempt has run out of time, one per browser project,
#: so neither browser finishes the other's.
OUT_OF_TIME = ("out_of_time_chromium", "out_of_time_webkit")


def seed_out_of_time_learners(db: Session) -> None:
    """Seed the learners ``seed_out_of_time_attempts`` gives an attempt.

    Made before the modules are opened, so ``seed_teaching`` enrols them
    with everybody else who has a place.
    """
    site = db.query(OrgUnit).filter(OrgUnit.name == "CI Teaching Centre").one()

    for username in OUT_OF_TIME:
        learner = _ensure_user(db, username, "teaching_delegate")
        add_org_unit_member(db, site.id, learner.id, "staff")
        # Their place is the site they belong to: a place is counted
        # only where somebody is a member.
        give_place(db, learner, site.id)
    db.flush()


def seed_out_of_time_attempts(db: Session, org_unit_id: int) -> None:
    """Give each out-of-time learner an attempt whose time has run out.

    Begun as a learner would begin it, with the first question answered
    right, then dated eleven minutes back, past the module's ten-minute
    limit. Waiting that long in a test would stretch the run, and moving
    the browser's clock would not move the server's, which is the clock
    that counts. Left alone when they already have an attempt: a re-run
    of the seed must not add another.
    """
    from app.features.teaching.attempts import (
        bank_to_sit,
        begin_attempt,
        record_answer,
    )

    status = db.scalar(
        select(QuestionBankOrgStatus)
        .where(
            QuestionBankOrgStatus.org_unit_id == org_unit_id,
            QuestionBankOrgStatus.is_live.is_(True),
        )
        .order_by(QuestionBankOrgStatus.question_bank_id)
    )

    if status is None:
        print("No module open; no out-of-time attempt seeded")
        return

    for username in OUT_OF_TIME:
        learner = db.query(User).filter(User.username == username).one()
        already = db.scalar(
            select(Assessment.id).where(Assessment.user_id == learner.id)
        )
        if already is not None:
            continue

        bank = bank_to_sit(
            db,
            learner.id,
            organisation_ids=[org_unit_id],
            bank_id=status.question_bank_id,
        )
        begun = begin_attempt(db, learner.id, bank)
        first = begun.first_answer
        if first is not None and first.item.correct_option_id is not None:
            record_answer(db, begun.assessment, first.item.correct_option_id)

        begun.assessment.started_at = datetime.now(UTC) - timedelta(minutes=11)
        db.flush()

    db.commit()
    print("Seeded an out-of-time attempt for each browser")


#: Operates Quill and runs teaching: the person who uploads a module's
#: video for an organisation, in e2e/tests/teaching-admin/.
OPERATOR = "ci_operator"


def seed_operator(db: Session, organisation_id: int) -> None:
    """Seed somebody who operates Quill and runs teaching.

    A superadmin with the teaching admin's competencies, so they may
    manage a module's videos at every organisation holding it. A member
    of the first teaching organisation as well, because every teaching
    route asks that the caller belong to an organisation with teaching
    on. They upload for the second, which they do not belong to.
    """
    operator = _ensure_user(db, OPERATOR, "teaching_admin")
    operator.platform_role = "superadmin"
    add_org_unit_member(db, organisation_id, operator.id, "staff")
    db.flush()
    print("Seeded the operator")


def seed_teaching(
    db: Session,
    org_unit_id: int,
    admin_id: int,
    *,
    with_videos: bool = True,
) -> None:
    """Sync each mounted teaching module into the CI organisation, live.

    compose.ci.yml mounts the content that
    .github/scripts/ci/fetch-e2e-teaching.sh fetched, so the tests have a
    module to open. A synced module is
    closed and has no version promoted, so candidates see nothing until
    both are set, as an admin would through the bank's settings page.

    Each module's videos are uploaded too (``seed_videos``), because a
    module whose content names a video is hidden from learners until it
    has been. Unless *with_videos* is false, which leaves the module
    hidden there for a test to upload the video itself.

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
        # Open to registration, which puts it on the public register page
        # and lets its clinical lead's address be accepted there.
        status.site_registration = True
        # Going live needs one when the module emails a coordinator on a
        # pass. Emails are dry-run in CI, so nothing is sent to it.
        status.coordinator_email = "coordinator@ci.local"
        status.active_version = version
        status.active_version_set_by = admin_id
        status.active_version_set_at = datetime.now(UTC)
        db.flush()
        if with_videos:
            seed_videos(db, org_unit_id, bank_id, admin_id)
        # Every module needs an enrolment, so the people already given a
        # place are enrolled on each one as it opens.
        enrolled = enrol_everyone_with_a_place(
            db,
            org_unit_id=org_unit_id,
            question_bank_id=bank_id,
            source="script",
        )
        db.commit()
        print(f"Opened teaching module {bank_id} at version {version}")
        print(f"Enrolled {len(enrolled)} on {bank_id}")


def seed_videos(
    db: Session, org_unit_id: int, bank_id: str, admin_id: int
) -> None:
    """Upload each video a module's content names, for one organisation.

    A module whose content names a video is hidden from learners until
    the organisation has uploaded it, so every journey through the
    module needs this. The video is the content's own
    ``learning/{ref}.mp4``, uploaded through the code the admin page's
    upload uses: an upload address from ``new_upload_target``, the bytes
    to ``local_upload_file``, then ``link_upload``.

    Where a transcode or caption job is configured, the gate asks for
    its work too, so what the job would write or report is recorded
    here: the 720p rendition, and, the content's videos being silent,
    that the caption job found no speech.

    A reference already linked is left alone, so a re-run uploads
    nothing new.

    Raises:
        RuntimeError: If the content names a video it does not carry.
    """
    base_path = settings.TEACHING_QUESTION_BANK_PATH or ""
    module_dir = resolve_module_dir(base_path, bank_id)

    if module_dir is None:
        return

    for ref in get_referenced_media_keys(bank_id):
        linked = db.scalar(
            select(ModuleMediaLink.id).where(
                ModuleMediaLink.org_unit_id == org_unit_id,
                ModuleMediaLink.question_bank_id == bank_id,
                ModuleMediaLink.media_key == ref,
            )
        )

        if linked is not None:
            continue

        source = module_dir / "learning" / f"{ref}.mp4"

        if not source.is_file():
            raise RuntimeError(
                f"Teaching module {bank_id} names video {ref} but has no "
                f"learning/{ref}.mp4"
            )

        target = new_upload_target(db, org_unit_id)
        stored = local_upload_file(
            base_path,
            bank_id,
            target.asset_id,
            "video/mp4",
        )
        shutil.copyfile(source, stored)

        link = link_upload(
            db,
            user_id=admin_id,
            org_unit_id=org_unit_id,
            module_id=bank_id,
            media_key=ref,
            asset_id=target.asset_id,
            original_filename=source.name,
            content_type="video/mp4",
            size_bytes=source.stat().st_size,
        )

        # What the transcode job writes: the rendition the player asks
        # for once a video is transcoded.
        if transcode_is_configured():
            shutil.copyfile(
                source, stored.with_name(f"{target.asset_id}-720p.mp4")
            )
            link.transcoded_at = datetime.now(UTC)

        # What the caption job writes, and a person having read it.
        # What the caption job reports for a video with nothing to
        # caption. The content's videos are silent: `lungs-video.mp4`
        # has no audio track, so the job finds no speech, and no person
        # is asked to read captions that cannot exist.
        if caption_is_configured():
            link.no_speech_found_at = datetime.now(UTC)

        db.flush()
        print(f"Uploaded video {ref} of {bank_id} for org_unit {org_unit_id}")


def seed_delegate_result(db: Session, org_unit_id: int) -> None:
    """Seed a delegate at the teaching site who has passed a module.

    ``results_delegate`` sat the first open module yesterday and passed,
    so the teaching admin's list of delegates has a row to show, with a
    result and a date, before any test has sat an assessment. Nothing is
    seeded when no module is open.
    """
    status = db.scalar(
        select(QuestionBankOrgStatus)
        .where(
            QuestionBankOrgStatus.org_unit_id == org_unit_id,
            QuestionBankOrgStatus.is_live.is_(True),
        )
        .order_by(QuestionBankOrgStatus.question_bank_id)
    )

    if status is None or status.active_version is None:
        print("No module open; no delegate result seeded")
        return

    delegate = _ensure_user(db, "results_delegate", "teaching_delegate")
    centre = _ensure_org_unit(db, "CI Teaching Centre", "site", org_unit_id)
    add_org_unit_member(db, centre.id, delegate.id, "staff")
    already = db.scalar(
        select(Assessment.id).where(Assessment.user_id == delegate.id)
    )

    if already is None:
        sat = datetime.now(UTC) - timedelta(days=1)
        db.add(
            Assessment(
                user_id=delegate.id,
                org_unit_id=org_unit_id,
                question_bank_id=status.question_bank_id,
                bank_version=status.active_version,
                time_limit_minutes=60,
                total_items=10,
                is_passed=True,
                started_at=sat,
                completed_at=sat + timedelta(minutes=20),
            )
        )

    db.commit()
    print(f"Seeded a passed result on {status.question_bank_id}")


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
