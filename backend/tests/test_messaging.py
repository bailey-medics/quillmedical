"""Tests for messaging API endpoints and CQRS service."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    Message,
    User,
)
from app.security import hash_password

# ---------------------------------------------------------------------------
# Additional fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def second_user(db_session: Session) -> User:
    """Create a second test user with staff permissions."""
    user = User(
        username="seconduser",
        email="second@example.com",
        password_hash=hash_password("SecondPassword123!"),
        is_active=True,
        system_permissions="staff",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def patient_user(db_session: Session) -> User:
    """Create a test user with patient permissions."""
    user = User(
        username="patientuser",
        email="patient@example.com",
        password_hash=hash_password("PatientPassword123!"),
        is_active=True,
        system_permissions="patient",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def csrf_token(authenticated_client: TestClient) -> str:
    """Get a CSRF token from an authenticated client."""
    authenticated_client.get("/api/auth/me")
    token = authenticated_client.cookies.get("XSRF-TOKEN")
    assert token is not None
    return token


FHIR_PATCH_TARGET = "app.messaging.create_fhir_communication"
PATIENT_ID = "patient-fhir-123"


def _fhir_response(comm_id: str = "fhir-comm-1") -> dict:
    """Build a minimal FHIR Communication response."""
    return {"resourceType": "Communication", "id": comm_id}


# ---------------------------------------------------------------------------
# Conversation creation
# ---------------------------------------------------------------------------


class TestCreateConversation:
    """Test POST /api/conversations."""

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_create_conversation(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
    ):
        """Create a basic conversation."""
        resp = authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "subject": "Test conversation",
                "initial_message": "Hello, this is the first message.",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["patient_id"] == PATIENT_ID
        assert data["subject"] == "Test conversation"
        assert data["status"] == "new"
        assert len(data["messages"]) == 1
        assert data["messages"][0]["body"] == (
            "Hello, this is the first message."
        )
        assert len(data["participants"]) == 1

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_create_conversation_with_participants(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
        second_user: User,
    ):
        """Create a conversation with additional participants."""
        resp = authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Hello team.",
                "participant_ids": [second_user.id],
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["participants"]) == 2

    def test_create_conversation_requires_auth(self, test_client: TestClient):
        """Unauthenticated users cannot create conversations."""
        resp = test_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Hello.",
            },
        )
        assert resp.status_code == 401

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_create_conversation_requires_csrf(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
    ):
        """CSRF token is required for POST."""
        resp = authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Hello.",
            },
        )
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# List conversations
# ---------------------------------------------------------------------------


class TestListConversations:
    """Test GET /api/conversations."""

    def test_list_empty(self, authenticated_client: TestClient):
        """List returns empty when no conversations exist."""
        resp = authenticated_client.get("/api/conversations")
        assert resp.status_code == 200
        assert resp.json()["conversations"] == []

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_list_own_conversations(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
    ):
        """User sees their own conversations."""
        authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Msg 1",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        resp = authenticated_client.get("/api/conversations")
        assert resp.status_code == 200
        convs = resp.json()["conversations"]
        assert len(convs) == 1

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_filter_by_patient(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
    ):
        """Filter conversations by patient_id."""
        authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Msg",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        resp = authenticated_client.get(
            f"/api/conversations?patient_id={PATIENT_ID}"
        )
        assert len(resp.json()["conversations"]) == 1

        resp = authenticated_client.get(
            "/api/conversations?patient_id=other-patient"
        )
        assert len(resp.json()["conversations"]) == 0


# ---------------------------------------------------------------------------
# Get conversation detail
# ---------------------------------------------------------------------------


class TestGetConversation:
    """Test GET /api/conversations/{id}."""

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_get_conversation(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
    ):
        """Get a conversation with all messages."""
        create_resp = authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Hello",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        conv_id = create_resp.json()["id"]

        resp = authenticated_client.get(f"/api/conversations/{conv_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == conv_id
        assert len(data["messages"]) == 1

    def test_get_nonexistent(self, authenticated_client: TestClient):
        """404 for nonexistent conversation."""
        resp = authenticated_client.get("/api/conversations/99999")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Send message
# ---------------------------------------------------------------------------


class TestSendMessage:
    """Test POST /api/conversations/{id}/messages."""

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response("fhir-reply-1"))
    def test_send_message(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
        db_session: Session,
    ):
        """Send a message in an existing conversation."""
        # Create a conversation first (patch separately for unique FHIR IDs)
        with patch(
            FHIR_PATCH_TARGET, return_value=_fhir_response("fhir-init-1")
        ):
            create_resp = authenticated_client.post(
                "/api/conversations",
                json={
                    "patient_id": PATIENT_ID,
                    "initial_message": "First",
                },
                headers={"X-CSRF-Token": csrf_token},
            )
        conv_id = create_resp.json()["id"]

        resp = authenticated_client.post(
            f"/api/conversations/{conv_id}/messages",
            json={"body": "Reply message"},
            headers={"X-CSRF-Token": csrf_token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["body"] == "Reply message"
        assert data["is_amendment"] is False

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response("fhir-amend-1"))
    def test_send_amendment(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
    ):
        """Send an amendment to an own message."""
        with patch(
            FHIR_PATCH_TARGET, return_value=_fhir_response("fhir-init-2")
        ):
            create_resp = authenticated_client.post(
                "/api/conversations",
                json={
                    "patient_id": PATIENT_ID,
                    "initial_message": "Original message",
                },
                headers={"X-CSRF-Token": csrf_token},
            )
        conv_id = create_resp.json()["id"]
        original_msg_id = create_resp.json()["messages"][0]["id"]

        resp = authenticated_client.post(
            f"/api/conversations/{conv_id}/messages",
            json={
                "body": "Corrected message",
                "amends_id": original_msg_id,
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_amendment"] is True
        assert data["amends_id"] == original_msg_id

    def test_send_message_nonexistent_conversation(
        self, authenticated_client: TestClient, csrf_token: str
    ):
        """404 for nonexistent conversation."""
        resp = authenticated_client.post(
            "/api/conversations/99999/messages",
            json={"body": "Hello"},
            headers={"X-CSRF-Token": csrf_token},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Update conversation status
# ---------------------------------------------------------------------------


class TestUpdateConversationStatus:
    """Test PATCH /api/conversations/{id}."""

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_update_status(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
    ):
        """Update conversation status to closed."""
        create_resp = authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Msg",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        conv_id = create_resp.json()["id"]

        resp = authenticated_client.patch(
            f"/api/conversations/{conv_id}",
            json={"status": "closed"},
            headers={"X-CSRF-Token": csrf_token},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "closed"

    def test_update_nonexistent(
        self, authenticated_client: TestClient, csrf_token: str
    ):
        """404 for nonexistent conversation."""
        resp = authenticated_client.patch(
            "/api/conversations/99999",
            json={"status": "closed"},
            headers={"X-CSRF-Token": csrf_token},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Participants
# ---------------------------------------------------------------------------


class TestParticipants:
    """Test participant endpoints."""

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_add_participant(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
        second_user: User,
    ):
        """Add a participant to a conversation."""
        create_resp = authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Msg",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        conv_id = create_resp.json()["id"]

        resp = authenticated_client.post(
            f"/api/conversations/{conv_id}/participants",
            json={"user_id": second_user.id},
            headers={"X-CSRF-Token": csrf_token},
        )
        assert resp.status_code == 200
        assert resp.json()["user_id"] == second_user.id

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_list_participants(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
    ):
        """List participants in a conversation."""
        create_resp = authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Msg",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        conv_id = create_resp.json()["id"]

        resp = authenticated_client.get(
            f"/api/conversations/{conv_id}/participants"
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_add_participant_nonexistent_conversation(
        self,
        authenticated_client: TestClient,
        csrf_token: str,
        second_user: User,
    ):
        """404 for nonexistent conversation."""
        resp = authenticated_client.post(
            "/api/conversations/99999/participants",
            json={"user_id": second_user.id},
            headers={"X-CSRF-Token": csrf_token},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Mark as read
# ---------------------------------------------------------------------------


class TestMarkRead:
    """Test POST /api/conversations/{id}/read."""

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_mark_read(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
    ):
        """Mark a conversation as read."""
        create_resp = authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Msg",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        conv_id = create_resp.json()["id"]

        resp = authenticated_client.post(
            f"/api/conversations/{conv_id}/read",
            headers={"X-CSRF-Token": csrf_token},
        )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_mark_read_nonexistent(
        self, authenticated_client: TestClient, csrf_token: str
    ):
        """404 for nonexistent conversation."""
        resp = authenticated_client.post(
            "/api/conversations/99999/read",
            headers={"X-CSRF-Token": csrf_token},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Unread count
# ---------------------------------------------------------------------------


class TestUnreadCount:
    """Test that unread_count is calculated correctly."""

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_unread_after_new_message(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
        db_session: Session,
        test_user: User,
        second_user: User,
    ):
        """Unread count reflects messages from others."""
        # Create conversation with second_user as a participant
        create_resp = authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Hello",
                "participant_ids": [second_user.id],
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        conv_id = create_resp.json()["id"]

        # Directly add a message from second_user in the DB
        # (simulating them sending via their session)
        msg = Message(
            fhir_communication_id="fhir-other-msg-1",
            conversation_id=conv_id,
            sender_id=second_user.id,
            body="A reply from second user",
        )
        db_session.add(msg)
        db_session.commit()

        # List conversations — should show 1 unread
        resp = authenticated_client.get("/api/conversations")
        convs = resp.json()["conversations"]
        assert len(convs) == 1
        assert convs[0]["unread_count"] == 1


# ---------------------------------------------------------------------------
# Include patient as participant flag
# ---------------------------------------------------------------------------


class TestIncludePatientAsParticipant:
    """Test include_patient_as_participant flag on create."""

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_default_false(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
    ):
        """Flag defaults to false when not provided."""
        resp = authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Hello",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        assert resp.status_code == 200
        assert resp.json()["include_patient_as_participant"] is False

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_set_true(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
    ):
        """Flag can be set to true on creation."""
        resp = authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Hello",
                "include_patient_as_participant": True,
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        assert resp.status_code == 200
        assert resp.json()["include_patient_as_participant"] is True

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_persisted_in_detail(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
    ):
        """Flag is persisted and returned in detail view."""
        create_resp = authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Hello",
                "include_patient_as_participant": True,
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        conv_id = create_resp.json()["id"]

        detail = authenticated_client.get(f"/api/conversations/{conv_id}")
        assert detail.status_code == 200
        assert detail.json()["include_patient_as_participant"] is True


# ---------------------------------------------------------------------------
# Access control: non-participant reads
# ---------------------------------------------------------------------------


class TestNonParticipantAccess:
    """Test that non-participants can view conversations."""

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_non_participant_can_read_detail(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
        second_user: User,
        db_session: Session,
    ):
        """A non-participant can view conversation detail."""
        # Create conversation as test_user (no second_user participant)
        create_resp = authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Private-ish message",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        conv_id = create_resp.json()["id"]

        # Log in as second_user
        authenticated_client.post(
            "/api/auth/login",
            json={
                "username": "seconduser",
                "password": "SecondPassword123!",
            },
        )

        resp = authenticated_client.get(f"/api/conversations/{conv_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_participant"] is False
        assert data["can_write"] is False

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_participant_flags_true_for_member(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
    ):
        """A participant gets is_participant=True, can_write=True."""
        create_resp = authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "My message",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        conv_id = create_resp.json()["id"]

        resp = authenticated_client.get(f"/api/conversations/{conv_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_participant"] is True
        assert data["can_write"] is True


# ---------------------------------------------------------------------------
# Patient conversations list
# ---------------------------------------------------------------------------


class TestPatientConversations:
    """Test GET /api/patients/{patient_id}/conversations."""

    def test_empty_list(self, authenticated_client: TestClient):
        """Returns empty when no conversations exist for patient."""
        resp = authenticated_client.get(
            f"/api/patients/{PATIENT_ID}/conversations"
        )
        assert resp.status_code == 200
        assert resp.json()["conversations"] == []

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_returns_all_conversations(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
        second_user: User,
        db_session: Session,
    ):
        """Returns all conversations for a patient."""
        # Create conversation as test_user
        authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Msg from user 1",
            },
            headers={"X-CSRF-Token": csrf_token},
        )

        resp = authenticated_client.get(
            f"/api/patients/{PATIENT_ID}/conversations"
        )
        assert resp.status_code == 200
        convs = resp.json()["conversations"]
        assert len(convs) == 1

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_non_participant_sees_conversations(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
        second_user: User,
        db_session: Session,
    ):
        """Non-participant can list patient conversations."""
        # Create conversation as test_user
        authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Msg",
            },
            headers={"X-CSRF-Token": csrf_token},
        )

        # Log in as second_user (not a participant)
        authenticated_client.post(
            "/api/auth/login",
            json={
                "username": "seconduser",
                "password": "SecondPassword123!",
            },
        )

        resp = authenticated_client.get(
            f"/api/patients/{PATIENT_ID}/conversations"
        )
        assert resp.status_code == 200
        convs = resp.json()["conversations"]
        assert len(convs) == 1
        assert convs[0]["is_participant"] is False
        assert convs[0]["can_write"] is False

    def test_requires_auth(self, test_client: TestClient):
        """Unauthenticated users cannot list patient conversations."""
        resp = test_client.get(f"/api/patients/{PATIENT_ID}/conversations")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Join conversation
# ---------------------------------------------------------------------------


class TestJoinConversation:
    """Test POST /api/conversations/{id}/join."""

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_staff_can_join(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
        second_user: User,
        db_session: Session,
    ):
        """Staff user can self-join a conversation."""
        # Create conversation as test_user
        create_resp = authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Hello",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        conv_id = create_resp.json()["id"]

        # Log in as second_user (staff by default)
        authenticated_client.post(
            "/api/auth/login",
            json={
                "username": "seconduser",
                "password": "SecondPassword123!",
            },
        )
        authenticated_client.get("/api/auth/me")
        token = authenticated_client.cookies.get("XSRF-TOKEN")

        resp = authenticated_client.post(
            f"/api/conversations/{conv_id}/join",
            headers={"X-CSRF-Token": token},
        )
        assert resp.status_code == 200
        assert resp.json()["user_id"] == second_user.id
        assert resp.json()["role"] == "participant"

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_patient_cannot_join(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
        patient_user: User,
    ):
        """Patient user cannot self-join a conversation."""
        # Create conversation as test_user
        create_resp = authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Hello",
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        conv_id = create_resp.json()["id"]

        # Log in as patient on the same client
        authenticated_client.post(
            "/api/auth/login",
            json={
                "username": "patientuser",
                "password": "PatientPassword123!",
            },
        )
        authenticated_client.get("/api/auth/me")
        token = authenticated_client.cookies.get("XSRF-TOKEN")

        # Try to join as patient
        resp = authenticated_client.post(
            f"/api/conversations/{conv_id}/join",
            headers={"X-CSRF-Token": token},
        )
        assert resp.status_code == 403

    @patch(FHIR_PATCH_TARGET, return_value=_fhir_response())
    def test_join_idempotent(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        csrf_token: str,
        second_user: User,
    ):
        """Joining a conversation you're already in returns existing."""
        create_resp = authenticated_client.post(
            "/api/conversations",
            json={
                "patient_id": PATIENT_ID,
                "initial_message": "Hello",
                "participant_ids": [second_user.id],
            },
            headers={"X-CSRF-Token": csrf_token},
        )
        conv_id = create_resp.json()["id"]

        # Log in as second_user (staff, already a participant)
        authenticated_client.post(
            "/api/auth/login",
            json={
                "username": "seconduser",
                "password": "SecondPassword123!",
            },
        )
        authenticated_client.get("/api/auth/me")
        token = authenticated_client.cookies.get("XSRF-TOKEN")

        resp = authenticated_client.post(
            f"/api/conversations/{conv_id}/join",
            headers={"X-CSRF-Token": token},
        )
        assert resp.status_code == 200
        assert resp.json()["role"] == "participant"

    def test_join_nonexistent(
        self,
        authenticated_client: TestClient,
        csrf_token: str,
        second_user: User,
    ):
        """404 for nonexistent conversation."""
        # Log in as staff user (test_user defaults to patient)
        authenticated_client.post(
            "/api/auth/login",
            json={
                "username": "seconduser",
                "password": "SecondPassword123!",
            },
        )
        authenticated_client.get("/api/auth/me")
        token = authenticated_client.cookies.get("XSRF-TOKEN")

        resp = authenticated_client.post(
            "/api/conversations/99999/join",
            headers={"X-CSRF-Token": token},
        )
        assert resp.status_code == 404

    def test_join_requires_auth(self, test_client: TestClient):
        """Unauthenticated users cannot join conversations."""
        resp = test_client.post("/api/conversations/1/join")
        assert resp.status_code == 401
