#!/usr/bin/env python3
"""Seed the people and results the in-app guides' screenshots show.

Run after ``seed_ci.py``, by ``just guide-screenshots`` and by
``.github/workflows/guide-screenshots.yml``, and by nothing else. The
end-to-end tests never run it: they count on what ``seed_ci.py`` holds,
and a page of invented delegates would change what several of them see.

Everything here is made up, and has to stay made up. The screenshots are
published to a public bucket, so a real name, address or result added to
this file is published with them. See
``docs/docs/plans/2026-10-05-in-app-guides-plan.md``.

It seeds one teaching establishment with a site beneath it, and at them:

- an operator who can open Admin,
- a teaching admin,
- a clinical lead in post at the site, whose email address the joining
  guide's registration step is given,
- six delegates with between them every result the All delegates page can
  show, and
- one delegate with no attempts, for the specs that take a module,
- a clinician with a passport that has something in each of its parts,
  another with none yet, an assessor and a passport admin, and
- a safety officer, at the same organisation with safety switched on.

Non-interactive, with hardcoded credentials suitable only for a throwaway
database: the password of each account is its username followed by
``123``, as in ``seed_ci.py``. NEVER use in production.

Usage (inside the backend container, after ``seed_ci.py``):
    python scripts/seed_guides.py
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

sys.path.insert(0, "/app")

from sqlalchemy import func, select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.cbac.positions import set_clinical_lead  # noqa: E402
from app.db import CoreSessionLocal  # noqa: E402
from app.features.passport import (  # noqa: E402
    cover,
    frameworks,
    ids,
    records,
    service,
)
from app.features.passport.commits import Actor  # noqa: E402
from app.features.passport.models import (  # noqa: E402
    Passport,
    PassportSignOffRequest,
)
from app.features.passport.schemas import (  # noqa: E402
    Certificate,
    CpdEntry,
    LogbookEntry,
    Reflection,
)
from app.features.teaching.access import admit, give_place  # noqa: E402
from app.features.teaching.models import (  # noqa: E402
    Assessment,
    AssessmentAnswer,
    QuestionBankConfig,
    QuestionBankItem,
    QuestionBankOrgStatus,
)
from app.features.teaching.scoring import (  # noqa: E402
    evaluate_pass_criteria,
    score_answer_variable,
)
from app.models import OrgUnit, OrgUnitFeature, User  # noqa: E402
from app.organisations import add_org_unit_member  # noqa: E402
from app.passport_storage import get_passport_store  # noqa: E402
from app.security import hash_password  # noqa: E402
from scripts.seed_ci import seed_teaching  # noqa: E402

ORGANISATION = "Northfield Endoscopy Academy"
SITE = "Northfield General Hospital"

OPERATOR = "guide_operator"
TEACHING_ADMIN = "guide_admin"
CLINICAL_LEAD = "guide_lead"
#: Uses the safety cases. Those are a mock-up whose cases live in the
#: browser, so this account is all the safety guides need seeded.
SAFETY_OFFICER = "guide_safety"
#: Holds a passport with something in each of its parts.
PASSPORT_HOLDER = "guide_holder"
#: Has no passport yet, for the picture of starting one.
PASSPORT_STARTER = "guide_starter"
#: Named on the holder's sign-off requests: one signed, one still waiting.
PASSPORT_ASSESSOR = "guide_assessor"
PASSPORT_ADMIN = "guide_passport_admin"
#: Takes a module in the specs, so starts with no attempts of their own.
LEARNER = "guide_learner"


@dataclass(frozen=True)
class Delegate:
    """One invented delegate, and the attempts they have made.

    ``attempts`` is how many of the questions each attempt got right,
    oldest first. ``None`` is an attempt begun and not finished.
    """

    username: str
    full_name: str
    attempts: tuple[int | None, ...]


# Between them, every state the All delegates page can show: a pass at the
# first attempt, a pass at the second (so "1st pass rate" is not 100%), a
# fail, and an attempt left unfinished. The last has an account and has
# opened nothing, so the page does not list them at all.
DELEGATES: tuple[Delegate, ...] = (
    Delegate("guide_delegate_1", "Aisha Rahman", (4,)),
    Delegate("guide_delegate_2", "Ben Carter", (3,)),
    Delegate("guide_delegate_3", "Chloe Evans", (2, 4)),
    Delegate("guide_delegate_4", "Daniel Osborne", (2,)),
    Delegate("guide_delegate_5", "Emma Hughes", (None,)),
    Delegate("guide_delegate_6", "Frank Haddad", ()),
)

# A fixed moment, so "Date" on the page reads the same from run to run
# and a retaken screenshot differs only when the screen does.
FIRST_ATTEMPT = datetime(2026, 9, 14, 9, 30, tzinfo=UTC)


def _user(
    db: Session,
    username: str,
    full_name: str,
    base_profession: str,
    *,
    platform_role: str = "standard",
) -> User:
    """Return the account called *username*, creating it if missing.

    The profession goes to the constructor, which is what writes its
    competencies as rows; assigning it afterwards leaves a patient's.
    """
    user = db.scalar(select(User).where(User.username == username))

    if user is not None:
        return user

    user = User(
        username=username,
        full_name=full_name,
        email=f"{username}@northfield.example",
        password_hash=hash_password(f"{username}123"),
        platform_role=platform_role,
        base_profession=base_profession,
        is_active=True,
        email_verified=True,
    )
    db.add(user)
    db.flush()
    print(f"Created {username}")

    return user


def _org_unit(
    db: Session, name: str, type_: str, parent_id: int | None = None
) -> OrgUnit:
    """Return the org unit called *name*, creating it if missing."""
    unit = db.scalar(select(OrgUnit).where(OrgUnit.name == name))

    if unit is not None:
        return unit

    unit = OrgUnit(name=name, type=type_, parent_id=parent_id)
    db.add(unit)
    db.flush()
    print(f"Created {name}")

    return unit


def _served_modules(db: Session, org_unit_id: int) -> dict[str, int]:
    """Each module the organisation serves, with the version it serves."""
    rows = db.execute(
        select(
            QuestionBankOrgStatus.question_bank_id,
            QuestionBankOrgStatus.active_version,
        ).where(QuestionBankOrgStatus.org_unit_id == org_unit_id)
    ).all()

    return {
        bank_id: version for bank_id, version in rows if version is not None
    }


def _seed_attempt(
    db: Session,
    user: User,
    *,
    org_unit_id: int,
    bank_id: str,
    version: int,
    correct: int | None,
    started_at: datetime,
) -> None:
    """Write one attempt, scored as the application would score it.

    Rows are written directly, not through the routes that sit an exam:
    those choose questions at random, refuse an answer after the time
    limit and stamp the moment of finishing, so nothing they made could
    be dated or repeated. The scoring itself is the application's own,
    from ``app.features.teaching.scoring``, so the figures on the result
    page are the ones a real attempt with these answers would show.

    Args:
        db: Database session.
        user: Whose attempt it is.
        org_unit_id: The organisation the module is served by.
        bank_id: The module.
        version: The version of it they sat.
        correct: How many questions they got right, or None for an
            attempt begun and not finished.
        started_at: When they began.
    """
    config = db.scalar(
        select(QuestionBankConfig.config_yaml).where(
            QuestionBankConfig.org_unit_id == org_unit_id,
            QuestionBankConfig.question_bank_id == bank_id,
            QuestionBankConfig.version == version,
        )
    )

    if config is None:
        raise RuntimeError(f"No config for {bank_id} version {version}")

    items = db.scalars(
        select(QuestionBankItem)
        .where(
            QuestionBankItem.org_unit_id == org_unit_id,
            QuestionBankItem.question_bank_id == bank_id,
            QuestionBankItem.bank_version == version,
            QuestionBankItem.status == "published",
        )
        .order_by(QuestionBankItem.id)
    ).all()
    chosen = items[: config["assessment"]["items_per_attempt"]]

    assessment = Assessment(
        user_id=user.id,
        org_unit_id=org_unit_id,
        question_bank_id=bank_id,
        bank_version=version,
        started_at=started_at,
        time_limit_minutes=config["assessment"]["time_limit_minutes"],
        total_items=len(chosen),
    )
    db.add(assessment)
    db.flush()

    scored: list[dict[str, object]] = []

    for order, item in enumerate(chosen, start=1):
        answer = AssessmentAnswer(
            assessment_id=assessment.id, item_id=item.id, display_order=order
        )
        db.add(answer)
        db.flush()

        # Unfinished: the first question answered, the rest never reached.
        if correct is None and order > 1:
            continue

        right = correct is None or order <= correct
        option = (
            item.correct_option_id
            if right
            else next(
                o["id"]
                for o in item.options or []
                if o["id"] != item.correct_option_id
            )
        )
        is_correct, tags = score_answer_variable(
            option or "", item.options or [], item.correct_option_id or ""
        )
        answer.selected_option = option
        answer.is_correct = is_correct
        answer.answered_at = started_at + timedelta(minutes=order)
        answer.set_tags(tags)
        scored.append(
            {
                "selected_option": option,
                "is_correct": is_correct,
                "resolved_tags": sorted(tags),
            }
        )

    if correct is None:
        return

    criteria = evaluate_pass_criteria(
        config.get("pass_criteria", []), scored, assessment.total_items
    )
    assessment.completed_at = started_at + timedelta(minutes=len(chosen) + 1)
    assessment.is_passed = all(c["passed"] for c in criteria)
    assessment.score_breakdown = {
        "criteria": criteria,
        "overall_passed": assessment.is_passed,
    }
    prefix = config.get("results", {}).get("exam_ref_prefix", "")

    if prefix:
        assessment.exam_ref = f"{prefix}{assessment.id}"


def _actor(user: User) -> Actor:
    """Who a passport's commit is made by, as the passport's routes say."""
    return Actor(
        name=user.full_name or user.username,
        role=user.base_profession,
        email=user.email,
        registrations=tuple(
            f"{r.authority} {r.number}" for r in user.current_registrations
        ),
    )


def seed_passport(db: Session, org_unit_id: int, operator: User) -> None:
    """Give one invented clinician a passport with something in each part.

    A passport is a row and a git repository, and every page reads the
    repository, so this makes both, through the functions the passport's
    own routes call: ``service`` and ``records`` in
    ``app.features.passport``. Every moment is pinned, so a date on a
    page is the same from run to run.

    Args:
        db: Database session.
        org_unit_id: The organisation the passport's people belong to.
        operator: Named as having switched the passport on.
    """
    store = get_passport_store()

    # The passport itself, and the organisation's cover, which is what
    # gives its staff the right to write to theirs.
    for key in ("passport", cover.COVER_FEATURE):
        on = db.scalar(
            select(OrgUnitFeature.id).where(
                OrgUnitFeature.org_unit_id == org_unit_id,
                OrgUnitFeature.feature_key == key,
            )
        )
        if on is None:
            db.add(
                OrgUnitFeature(
                    org_unit_id=org_unit_id,
                    feature_key=key,
                    enabled_by=operator.id,
                )
            )
    db.flush()

    holder = _user(
        db, PASSPORT_HOLDER, "Dr Maya Collins", "specialty_trainee_3_plus"
    )
    starter = _user(
        db, PASSPORT_STARTER, "Dr Owen Price", "specialty_trainee_3_plus"
    )
    assessor = _user(db, PASSPORT_ASSESSOR, "Dr Helen Marsh", "consultant")
    admin = _user(db, PASSPORT_ADMIN, "Alex Turner", "passport_admin")

    for person in (holder, starter, assessor, admin):
        add_org_unit_member(db, org_unit_id, person.id, "staff")
    cover.switch_on(db, org_unit_id, operator)
    db.flush()

    if db.scalar(select(Passport.id).where(Passport.user_id == holder.id)):
        print("Passport already seeded")
        return

    made = datetime(2026, 9, 1, 9, 0, tzinfo=UTC)
    passport_id = ids.new_passport_id()
    commit = service.create_passport(
        store,
        passport_id,
        _actor(holder),
        user_id=str(holder.id),
        registrations=[],
        # A passport offers the competencies in its holder's frameworks
        # and no others, so the guides' holder works to the general one,
        # which holds everything seeded below.
        frameworks=frameworks.framework_refs(["clinical"]),
        now=made,
    )
    row = Passport(id=passport_id, user_id=holder.id, head_commit=commit)
    db.add(row)
    db.flush()

    _, row.head_commit = records.add_logbook_entry(
        store,
        passport_id,
        _actor(holder),
        "perform_lumbar_puncture",
        LogbookEntry(
            performed_on=date(2026, 9, 18),
            setting="Acute medical unit",
            supervision="supervised",
            supervisor="Dr Helen Marsh",
            indication="Suspected subarachnoid haemorrhage",
            outcome="Successful at first pass",
        ),
        now=made + timedelta(days=17),
    )

    _, row.head_commit = records.add_cpd_entry(
        store,
        passport_id,
        _actor(holder),
        CpdEntry(
            activity_on=date(2026, 9, 10),
            title="Regional acute medicine teaching day",
            activity_type="teaching day",
            points=6,
        ),
        now=made + timedelta(days=9),
    )

    _, row.head_commit = records.add_reflection(
        store,
        passport_id,
        _actor(holder),
        Reflection(
            title="Consent when time is short",
            written_on=date(2026, 9, 20),
        ),
        "I rushed the explanation because the unit was busy, and the "
        "consent conversation took longer for it. Next time I will ask a "
        "colleague to hold my bleep for ten minutes first.",
        now=made + timedelta(days=19),
    )

    _, row.head_commit = records.add_certificate(
        store,
        passport_id,
        _actor(holder),
        Certificate(
            id=service.next_id(made + timedelta(days=2)),
            title="Advanced Life Support",
            issuer="Northfield Resuscitation Training",
            awarded_on=date(2026, 3, 4),
            expires_on=date(2030, 3, 4),
        ),
        now=made + timedelta(days=2),
    )
    db.flush()

    def ask(competency_id: str, observed_on: date, asked: datetime) -> str:
        name, row.head_commit = service.request_sign_off(
            store,
            passport_id,
            _actor(holder),
            competency_id=competency_id,
            observed_on=observed_on,
            comments="My third supervised procedure this month.",
            now=asked,
        )
        db.add(
            PassportSignOffRequest(
                passport_id=passport_id,
                signoff_id=name,
                competency_id=competency_id,
                assessor_email=assessor.email,
                assessor_user_id=None,
                status="open",
            )
        )
        db.flush()

        return name

    # One left waiting, so the assessor has something in their inbox, and
    # one signed, so the holder has a finished sign-off to show.
    ask(
        "perform_lumbar_puncture", date(2026, 9, 18), made + timedelta(days=18)
    )
    to_sign = ask(
        "perform_chest_drain", date(2026, 9, 12), made + timedelta(days=12)
    )

    signed_at = made + timedelta(days=14)
    row.head_commit = service.sign_off(
        store,
        passport_id,
        _actor(assessor),
        name=to_sign,
        assessor_user_id=str(assessor.id),
        holder_user_id=str(holder.id),
        meaning="directly observed",
        declaration_confirmed=True,
        assessment="Competent and safe throughout.",
        registrations=[],
        now=signed_at,
    )
    request = db.scalar(
        select(PassportSignOffRequest).where(
            PassportSignOffRequest.passport_id == passport_id,
            PassportSignOffRequest.signoff_id == to_sign,
        )
    )

    if request is not None:
        request.status = "signed_off"
        request.resolved_at = signed_at
        request.assessor_user_id = assessor.id
    db.commit()
    print("Seeded a passport")


def seed() -> None:
    """Create the guides' organisation, its people and their results."""
    db = CoreSessionLocal()

    try:
        operator = _user(
            db,
            OPERATOR,
            "Morgan Reid",
            "superadmin_profession",
            platform_role="superadmin",
        )

        organisation = _org_unit(db, ORGANISATION, "teaching_establishment")
        site = _org_unit(db, SITE, "site", parent_id=organisation.id)

        has_teaching = db.scalar(
            select(OrgUnitFeature.id).where(
                OrgUnitFeature.org_unit_id == organisation.id,
                OrgUnitFeature.feature_key == "teaching",
            )
        )
        if has_teaching is None:
            db.add(
                OrgUnitFeature(
                    org_unit_id=organisation.id,
                    feature_key="teaching",
                    enabled_by=operator.id,
                )
            )

        has_safety = db.scalar(
            select(OrgUnitFeature.id).where(
                OrgUnitFeature.org_unit_id == organisation.id,
                OrgUnitFeature.feature_key == "safety",
            )
        )
        if has_safety is None:
            db.add(
                OrgUnitFeature(
                    org_unit_id=organisation.id,
                    feature_key="safety",
                    enabled_by=operator.id,
                )
            )
        officer = _user(db, SAFETY_OFFICER, "Jo Fletcher", "safety_officer")
        add_org_unit_member(db, organisation.id, officer.id, "staff")

        # The teaching admin belongs to the organisation itself, which is
        # what the All delegates page asks of whoever opens it.
        admin = _user(db, TEACHING_ADMIN, "Priya Shah", "teaching_admin")
        add_org_unit_member(db, organisation.id, admin.id, "staff")
        give_place(db, admin, organisation.id)

        # A post is held where somebody belongs, so the lead joins the
        # site before being appointed to it, as the route requires.
        lead = _user(
            db, CLINICAL_LEAD, "Dr Thomas Kowalski", "teaching_clinical_lead"
        )
        add_org_unit_member(db, site.id, lead.id, "staff")
        set_clinical_lead(db, site, lead, appointed_by=operator)
        db.commit()

        # Sync the mounted modules into this organisation and open them,
        # as seed_ci.py does for its own. Commits as it goes.
        seed_teaching(db, organisation.id, operator.id)
        modules = _served_modules(db, organisation.id)
        if not modules:
            print("No teaching modules mounted; nothing to enrol on")
            return

        # Open each to registration, which is what puts it in the list on
        # the public registration page and lets the clinical lead's email
        # address be accepted there.
        for status in db.scalars(
            select(QuestionBankOrgStatus).where(
                QuestionBankOrgStatus.org_unit_id == organisation.id
            )
        ):
            status.site_registration = True

        # Delegates arrive as registration would bring them: a trainee of
        # the organisation and of the site, with a place at the site and
        # an enrolment on each module.
        people = [
            _user(db, d.username, d.full_name, "teaching_delegate")
            for d in DELEGATES
        ]
        learner = _user(db, LEARNER, "Sam Sample", "teaching_delegate")
        for person in [*people, learner]:
            add_org_unit_member(db, organisation.id, person.id, "trainee")
            add_org_unit_member(db, site.id, person.id, "trainee")
            admit(
                db,
                person,
                org_unit_id=site.id,
                module_ids=list(modules),
                admitted_by=admin.id,
                source="script",
            )
        db.flush()

        for bank_id, version in modules.items():
            already = db.scalar(
                select(func.count())
                .select_from(Assessment)
                .where(
                    Assessment.org_unit_id == organisation.id,
                    Assessment.question_bank_id == bank_id,
                )
            )
            if already:
                print(f"Attempts at {bank_id} already seeded")
                continue

            # A day apart, and each person's attempts a week apart, so
            # the newest attempt is never in doubt.
            for day, (delegate, person) in enumerate(
                zip(DELEGATES, people, strict=True)
            ):
                for week, correct in enumerate(delegate.attempts):
                    _seed_attempt(
                        db,
                        person,
                        org_unit_id=organisation.id,
                        bank_id=bank_id,
                        version=version,
                        correct=correct,
                        started_at=FIRST_ATTEMPT
                        + timedelta(days=day, weeks=week),
                    )
            print(f"Seeded attempts at {bank_id}")

        db.commit()

        seed_passport(db, organisation.id, operator)
        print("Guide seed complete")
    except Exception:
        db.rollback()
        raise
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
