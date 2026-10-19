"""A clinical lead made before their site still hears of its passes.

The guide "Create a clinical lead" has a teaching admin make the lead's
account at the organisation, because the site does not exist yet, then
add the site and name the lead on it. That is three steps through three
routes, and the certificate email reads only the last: whoever holds the
clinical lead post at the delegate's site. This walks the guide's steps
through the API, as the add-user and add-site pages do, and then checks
who is emailed when a delegate passes.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi import BackgroundTasks
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.teaching.models import (
    Assessment,
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.features.teaching.router import _maybe_enqueue_certificate_emails
from app.models import OrgUnit, User
from app.organisations import add_org_unit_member
from app.security import hash_password

PASSWORD = "Coordinator123!"
BANK_ID = "test-bank"
LEAD_EMAIL = "hannah.price@example.test"


def _user(db: Session, username: str, profession: str, unit: OrgUnit) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    db.add(user)
    db.flush()
    add_org_unit_member(db, unit.id, user.id, "staff")
    db.commit()
    db.refresh(user)

    return user


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    org = OrgUnit(name="Teaching Trust", type="organisation")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    return org


@pytest.fixture
def client(
    test_client: TestClient, db_session: Session, trust: OrgUnit
) -> TestClient:
    """Signed in as a teaching admin at the trust."""
    coordinator = _user(db_session, "coordinator", "teaching_admin", trust)

    response = test_client.post(
        "/api/auth/login",
        json={"username": coordinator.username, "password": PASSWORD},
    )
    assert response.status_code == 200
    csrf = test_client.cookies.get("XSRF-TOKEN")

    if csrf:
        test_client.headers["X-CSRF-Token"] = csrf

    return test_client


def _create_the_lead_at_the_trust(
    client: TestClient, db: Session, trust: OrgUnit
) -> User:
    """Step one of the guide: the add-user form, organisation chosen."""
    response = client.post(
        "/api/users",
        json={
            "name": "Dr Hannah Price",
            "username": "hannah.price",
            "email": LEAD_EMAIL,
            "password": "a-first-password",
            "base_profession": "teaching_clinical_lead",
            "org_unit_ids": [trust.id],
        },
    )
    assert response.status_code in (200, 201), response.text

    lead = db.scalar(select(User).where(User.username == "hannah.price"))
    assert lead is not None

    return lead


def _add_a_site_led_by(
    client: TestClient, trust: OrgUnit, lead: User, name: str
) -> int:
    """Step two: the add-site page, with the lead chosen.

    The page makes the site, adds the lead to it as staff, then names
    them, in that order, because the post is refused to a non-member.
    """
    created = client.post(
        "/api/org-units",
        json={"name": name, "type": "site", "parent_id": trust.id},
    )
    assert created.status_code == 200, created.text
    site_id = int(created.json()["id"])

    added = client.post(
        f"/api/org-units/{site_id}/members",
        json={"user_id": lead.id, "capacity": "staff"},
    )
    assert added.status_code in (200, 201), added.text

    named = client.put(
        f"/api/org-units/{site_id}/clinical-lead",
        json={"user_id": lead.id},
    )
    assert named.status_code == 200, named.text

    return site_id


def _a_pass_by(db: Session, trust: OrgUnit, delegate: User) -> list[str]:
    """A delegate passes a module the trust serves. Who is emailed?"""
    config_row = QuestionBankConfig(
        org_unit_id=trust.id,
        question_bank_id=BANK_ID,
        version=1,
        title="Test Bank",
        description="A bank.",
        type="uniform",
        config_yaml={
            "id": BANK_ID,
            "title": "Test Bank",
            "results": {"email_coordinator_on_pass": True},
            "coordinator_email": {
                "subject": "A candidate passed",
                "body": "For your records, {{recipient_name}}.",
                "attach_certificate": False,
            },
        },
        synced_by=delegate.id,
    )
    db.add(config_row)
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=trust.id,
            question_bank_id=BANK_ID,
            is_live=True,
            active_version=1,
        )
    )
    assessment = Assessment(
        user_id=delegate.id,
        org_unit_id=trust.id,
        question_bank_id=BANK_ID,
        bank_version=1,
        time_limit_minutes=60,
        total_items=3,
        is_passed=True,
        completed_at=datetime.now(UTC),
    )
    db.add(assessment)
    db.commit()

    tasks = BackgroundTasks()
    _maybe_enqueue_certificate_emails(
        background_tasks=tasks,
        assessment=assessment,
        config_row=config_row,
        user=delegate,
        db=db,
        criteria_results=[{"name": "Accuracy", "value": 0.9}],
    )

    return [task.kwargs["to"] for task in tasks.tasks]


def test_the_lead_is_emailed_when_a_delegate_at_their_site_passes(
    client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    lead = _create_the_lead_at_the_trust(client, db_session, trust)
    site_id = _add_a_site_led_by(client, trust, lead, "Riverside")
    site = db_session.get(OrgUnit, site_id)
    assert site is not None
    delegate = _user(db_session, "delegate", "teaching_delegate", site)

    sent_to = _a_pass_by(db_session, trust, delegate)

    assert sent_to == [LEAD_EMAIL]


def test_belonging_to_the_trust_does_not_make_them_every_sites_lead(
    client: TestClient, db_session: Session, trust: OrgUnit
) -> None:
    """Their own membership of the trust reaches no other site's passes."""
    lead = _create_the_lead_at_the_trust(client, db_session, trust)
    _add_a_site_led_by(client, trust, lead, "Riverside")
    other = OrgUnit(name="Hillside", type="site", parent_id=trust.id)
    db_session.add(other)
    db_session.commit()
    delegate = _user(db_session, "delegate", "teaching_delegate", other)

    sent_to = _a_pass_by(db_session, trust, delegate)

    assert LEAD_EMAIL not in sent_to
