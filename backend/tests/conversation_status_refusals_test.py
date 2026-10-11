"""What changing a conversation's status answers, through the real route.

The rule is in ``app.messaging.set_conversation_status`` and is tested
there. This drives ``PATCH /api/conversations/{conversation_id}``, to pin
what a caller is sent: the status and the ``detail`` the route gave when
the rule was written inside it. Only the status of the first refusal was
pinned before the rule moved, and nothing pinned the second.

Both refusals answer with a plain sentence as ``detail``. The other
conversation routes answer a refusal from ``app.messaging`` with a
message and an error code together; this route never did, and still
does not.
"""

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    Conversation,
    ConversationParticipant,
    Message,
    OrgUnit,
    User,
)
from app.organisations import add_org_unit_member
from app.security import hash_password

PATIENT = "patient-fhir-123"
NOT_FOUND = {"detail": "Conversation not found"}


@pytest.fixture
def csrf(authenticated_client: TestClient) -> dict[str, str]:
    """The header a changing request carries."""
    authenticated_client.get("/api/auth/me")
    token = authenticated_client.cookies.get("XSRF-TOKEN")
    assert token is not None

    return {"X-CSRF-Token": token}


@pytest.fixture
def hospital(db_session: Session, test_user: User) -> OrgUnit:
    """An organisation the caller is staff at."""
    org = OrgUnit(name="Status Hospital", type="hospital_team")
    db_session.add(org)
    db_session.flush()
    add_org_unit_member(db_session, org.id, test_user.id, "staff")
    db_session.commit()

    return org


@pytest.fixture
def colleague(db_session: Session, hospital: OrgUnit) -> User:
    user = User(
        username="colleague",
        email="colleague@example.test",
        password_hash=hash_password("Colleague123!"),
        is_active=True,
        email_verified=True,
        base_profession="registered_nurse",
    )
    db_session.add(user)
    db_session.flush()
    add_org_unit_member(db_session, hospital.id, user.id, "staff")
    db_session.commit()

    return user


def _conversation(
    db: Session, hospital: OrgUnit, *participants: User
) -> Conversation:
    conv = Conversation(
        fhir_conversation_id="thread-status",
        patient_id=PATIENT,
        status="active",
    )
    conv.places.append(hospital)
    db.add(conv)
    db.flush()

    for user in participants:
        db.add(
            ConversationParticipant(conversation_id=conv.id, user_id=user.id)
        )

    db.commit()

    return conv


def _status_of(db: Session, conversation_id: int) -> str:
    db.expire_all()
    conv = db.get(Conversation, conversation_id)
    assert conv is not None

    return conv.status


def test_a_conversation_that_does_not_exist_is_not_found(
    authenticated_client: TestClient, csrf: dict[str, str]
) -> None:
    response = authenticated_client.patch(
        "/api/conversations/99999", json={"status": "closed"}, headers=csrf
    )

    assert response.status_code == 404
    assert response.json() == NOT_FOUND


def test_somebody_not_taking_part_is_told_it_is_not_found(
    authenticated_client: TestClient,
    csrf: dict[str, str],
    db_session: Session,
    hospital: OrgUnit,
    colleague: User,
) -> None:
    """Even staff at its organisation, who may read it from outside."""
    conv = _conversation(db_session, hospital, colleague)

    reading = authenticated_client.get(f"/api/conversations/{conv.id}")
    response = authenticated_client.patch(
        f"/api/conversations/{conv.id}",
        json={"status": "closed"},
        headers=csrf,
    )

    assert reading.status_code == 200
    assert response.status_code == 404
    assert response.json() == NOT_FOUND
    assert _status_of(db_session, conv.id) == "active"


def test_a_status_outside_the_four_is_refused_before_anything_is_looked_up(
    authenticated_client: TestClient, csrf: dict[str, str]
) -> None:
    """The request model holds the list, so no conversation is needed."""
    response = authenticated_client.patch(
        "/api/conversations/99999", json={"status": "archived"}, headers=csrf
    )

    assert response.status_code == 422


def test_a_participant_changes_the_status_and_is_sent_the_summary(
    authenticated_client: TestClient,
    csrf: dict[str, str],
    db_session: Session,
    hospital: OrgUnit,
    test_user: User,
    colleague: User,
) -> None:
    conv = _conversation(db_session, hospital, test_user, colleague)
    db_session.add(
        Message(
            fhir_communication_id="seeded-status-1",
            conversation_id=conv.id,
            sender_id=colleague.id,
            body="Bloods are back",
            created_at=datetime(2026, 1, 5, 9, 0, tzinfo=UTC),
        )
    )
    db_session.commit()

    response = authenticated_client.patch(
        f"/api/conversations/{conv.id}",
        json={"status": "resolved"},
        headers=csrf,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == conv.id
    assert body["status"] == "resolved"
    assert body["unread_count"] == 1
    assert body["last_message_preview"] == "Bloods are back"
    assert {p["username"] for p in body["participants"]} == {
        "testuser",
        "colleague",
    }
    assert _status_of(db_session, conv.id) == "resolved"
