"""A teaching delegate is refused every route that is not theirs to use.

`every_route_is_guarded_test.py` checks each route asks who is calling.
This asks the next question: once a delegate is the one calling, are they
turned away? It walks every route the app serves and calls each as a
teaching delegate who is a real learner, enrolled on a module at their
site, with every id in the path belonging to somebody else: another
delegate's attempt and account, a teaching admin, a piece of another
delegate's feedback, a place. Each must answer 403 or 404.

Two lists say where that does not hold, and both fail in both directions,
as `PUBLIC` does:

- `THEIRS` - routes a delegate may call, for their own account, modules
  and attempts. None takes somebody else's id. A new route a delegate can
  call fails the walk until it is listed here with the reason, and an
  entry for a route that has gone, or that now refuses them, fails until
  it is taken out.
- `NOT_YET_REFUSED` - routes a delegate gets past today that are not
  theirs, found when this walk was first written. Each is a finding to
  settle, not a permission. One that starts refusing fails until it is
  taken out, so the list cannot outlive the gap.

A 422 counts as getting through: the request was validated, so every
guard in front of the route had already let the delegate pass.

Phase 12 of docs/docs/plans/2026-10-15-teaching-e2e-coverage-plan.md.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.features.teaching.access import give_place
from app.features.teaching.enrolment import enrol
from app.features.teaching.models import (
    Assessment,
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.main import app
from app.models import Feedback, OrgUnit, OrgUnitFeature, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from app.utils.route_list import served_routes
from tests.every_route_is_guarded_test import PUBLIC, SERVICE_CALLER, _asks

RouteKey = tuple[str, str]

PASSWORD = "Password123!"
BANK = "polyps"
DELEGATE = "delegate"

#: What a refusal is. Anything else means the delegate got through.
REFUSED = frozenset({403, 404})

# Routes a delegate may call, and why. None of them takes another
# person's id, so being let through is being let at their own.
THEIRS: dict[RouteKey, str] = {
    ("GET", "/api/auth/me"): "who they are signed in as",
    ("PATCH", "/api/auth/profile"): "their own name and address",
    ("POST", "/api/auth/change-password"): "their own password",
    ("POST", "/api/auth/logout"): "signing themselves out",
    ("POST", "/api/auth/totp/setup"): "turning on their own two-factor",
    ("POST", "/api/auth/totp/verify"): "confirming their own two-factor",
    ("POST", "/api/auth/totp/disable"): "turning off their own two-factor",
    ("GET", "/api/cbac/my-competencies"): "what they themselves hold",
    ("POST", "/api/feedback"): "sending feedback",
    ("GET", "/api/feedback/mine"): "the feedback they sent",
    ("POST", "/api/feedback/mine/seen"): "marking replies to it read",
    ("GET", "/api/inbox"): "what is waiting on them",
    ("GET", "/api/inbox/items"): "the same, item by item",
    ("PUT", "/api/marketing/preference"): "their own choice about news",
    ("POST", "/api/push/subscribe"): "notifications to their own browser",
    ("GET", "/api/teaching/modules"): "the modules they are enrolled on",
    ("GET", "/api/teaching/question-banks"): (
        "the banks of the modules they may take"
    ),
    ("GET", "/api/teaching/question-banks/{bank_id}"): (
        "one of those, which is served at their own organisation"
    ),
    ("POST", "/api/teaching/modules/{module_id}/video-access"): (
        "watching a lecture in a module they are enrolled on"
    ),
    ("POST", "/api/teaching/assessments"): "starting their own attempt",
    ("GET", "/api/teaching/assessments/history"): "their own attempts",
}

# Routes a delegate gets past that are not theirs, found on 2026-10-16.
# Recorded in the plan for a decision; each is to be refused, or moved to
# THEIRS with its reason.
NOT_YET_REFUSED: dict[RouteKey, str] = {
    ("GET", "/api/patients"): "clinical services gate only",
    ("POST", "/api/patients"): "clinical services gate only",
    ("GET", "/api/patients/{patient_id}"): (
        "clinical services gate only; any signed-in user may read any "
        "patient's demographics by id"
    ),
    ("PATCH", "/api/patients/{patient_id}"): "clinical services gate only",
    ("GET", "/api/patients/{patient_id}/demographics"): (
        "clinical services gate only"
    ),
    ("GET", "/api/patients/{patient_id}/letters"): (
        "clinical services gate only"
    ),
    ("GET", "/api/patients/{patient_id}/letters/{composition_uid}"): (
        "clinical services gate only"
    ),
    ("GET", "/api/patients/{patient_id}/metadata"): (
        "clinical services gate only"
    ),
    ("GET", "/api/patients/{patient_id}/shared-organisations"): (
        "clinical services gate only"
    ),
    ("GET", "/api/patients/{patient_id}/conversations"): (
        "clinical services gate only"
    ),
    ("POST", "/api/patients/{patient_id}/invite-external"): (
        "clinical services gate only"
    ),
    ("GET", "/api/conversations"): "messaging, for patients and staff",
    ("POST", "/api/conversations"): "messaging, for patients and staff",
    ("PATCH", "/api/conversations/{conversation_id}"): (
        "messaging; refusal, if any, is after the body is read"
    ),
    ("POST", "/api/conversations/{conversation_id}/messages"): (
        "messaging; refusal, if any, is after the body is read"
    ),
    ("POST", "/api/conversations/{conversation_id}/participants"): (
        "messaging; refusal, if any, is after the body is read"
    ),
}

#: A body that passes validation, for the routes that check whose record
#: it is only once the body is read. Sent anywhere else, an empty one.
BODIES: dict[RouteKey, dict[str, str]] = {
    ("POST", "/api/teaching/assessments/{assessment_id}/answer"): {
        "selected_option": "a"
    },
    ("PUT", "/api/teaching/assessments/{assessment_id}/answer/{answer_id}"): {
        "selected_option": "a"
    },
}


def _person(db: Session, name: str, profession: str, unit: OrgUnit) -> User:
    user = User(
        username=name,
        email=f"{name}@test.local",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    db.add(user)
    db.flush()
    add_org_unit_member(db, unit.id, user.id, "staff")

    return user


@pytest.fixture
def path_values(db_session: Session) -> dict[str, str]:
    """The world the delegate is in, as values for each path parameter.

    The delegate and another delegate are learners at one site, enrolled
    on a live module. The other has sat it and sent feedback. A teaching
    admin belongs to the organisation. Every id handed back is somebody
    else's, or a place: none is the delegate's own.
    """
    org = OrgUnit(name="Trust", type="teaching_establishment")
    db_session.add(org)
    db_session.flush()
    site = OrgUnit(name="Site", type="site", parent_id=org.id)
    db_session.add(site)
    db_session.flush()

    me = _person(db_session, DELEGATE, "teaching_delegate", site)
    other = _person(db_session, "other", "teaching_delegate", site)
    admin = _person(db_session, "admin", "teaching_admin", org)

    db_session.add(
        OrgUnitFeature(
            org_unit_id=org.id, feature_key="teaching", enabled_by=admin.id
        )
    )
    db_session.add(
        QuestionBankConfig(
            org_unit_id=org.id,
            question_bank_id=BANK,
            version=1,
            title="Polyps",
            description="A bank.",
            type="uniform",
            config_yaml={},
            synced_by=admin.id,
        )
    )
    db_session.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=BANK,
            is_live=True,
            active_version=1,
        )
    )
    db_session.flush()

    for learner in (me, other):
        give_place(db_session, learner, site.id)
        enrol(
            db_session,
            user_id=learner.id,
            org_unit_id=org.id,
            question_bank_id=BANK,
            source="admin",
        )

    theirs = Assessment(
        user_id=other.id,
        org_unit_id=org.id,
        question_bank_id=BANK,
        bank_version=1,
        time_limit_minutes=60,
        total_items=3,
        is_passed=True,
        completed_at=datetime.now(UTC),
    )
    feedback = Feedback(
        user_id=other.id,
        message="It would not load.",
        route="/teaching",
        release="test",
        viewport="1280x800",
        user_agent="test",
    )
    db_session.add_all([theirs, feedback])
    db_session.commit()

    return {
        "user_id": str(other.id),
        "assessor_user_id": str(admin.id),
        "unit_id": str(site.id),
        "org_unit_id": str(org.id),
        "assessment_id": str(theirs.id),
        "feedback_id": str(feedback.id),
        "module_id": BANK,
        "bank_id": BANK,
    }


def _signed_in_as_the_delegate(client: TestClient) -> None:
    """Sign the delegate in afresh, so no earlier call's effect lingers."""
    client.cookies.clear()
    resp = client.post(
        "/api/auth/login", json={"username": DELEGATE, "password": PASSWORD}
    )
    assert resp.status_code == 200, resp.text

    client.headers["X-CSRF-Token"] = client.cookies["XSRF-TOKEN"]


def _answered(
    client: TestClient, values: dict[str, str]
) -> dict[RouteKey, int]:
    """Call every signed-in route as the delegate; what each answered."""
    answers: dict[RouteKey, int] = {}

    for route in served_routes(app):
        # A route that asks for a service's identity, a Cloud Run job's
        # token, has no notion of a person at all: a delegate's session
        # is nothing to it, and what it answers says nothing about how
        # a delegate is kept to their own. Skipped as PUBLIC is.
        if _asks(route) & SERVICE_CALLER:
            continue

        for method in sorted(route.methods):
            key = (method, route.path)
            if key in PUBLIC:
                continue

            path = re.sub(
                r"{(\w+)(?::\w+)?}",
                lambda match: values.get(match.group(1), "1"),
                route.path,
            )
            body = BODIES.get(key, {}) if method != "GET" else None

            _signed_in_as_the_delegate(client)
            answers[key] = client.request(method, path, json=body).status_code

    return answers


@pytest.fixture
def answers(
    test_client: TestClient, path_values: dict[str, str]
) -> dict[RouteKey, int]:
    return _answered(test_client, path_values)


def _let_through(answers: dict[RouteKey, int]) -> set[RouteKey]:
    return {key for key, status in answers.items() if status not in REFUSED}


def test_the_walk_calls_well_over_a_hundred_routes(
    answers: dict[RouteKey, int],
) -> None:
    assert len(answers) > 150


def test_every_route_not_theirs_refuses_a_delegate(
    answers: dict[RouteKey, int],
) -> None:
    """Refuse the delegate at the guard, or list it in THEIRS with why."""
    unexpected = _let_through(answers) - set(THEIRS) - set(NOT_YET_REFUSED)

    assert {key: answers[key] for key in sorted(unexpected)} == {}


def test_every_route_listed_as_theirs_lets_them_through(
    answers: dict[RouteKey, int],
) -> None:
    """An entry for a route that has gone, or now refuses them, is a
    standing permission for whatever takes that path next."""
    assert set(THEIRS) - _let_through(answers) == set()


def test_every_gap_listed_is_still_a_gap(
    answers: dict[RouteKey, int],
) -> None:
    """A route here that now refuses a delegate: take it off the list."""
    assert set(NOT_YET_REFUSED) - _let_through(answers) == set()


def test_no_route_is_both_theirs_and_a_gap() -> None:
    assert set(THEIRS) & set(NOT_YET_REFUSED) == set()


def test_every_entry_says_why() -> None:
    entries = {**THEIRS, **NOT_YET_REFUSED}

    assert [key for key, why in entries.items() if not why.strip()] == []
