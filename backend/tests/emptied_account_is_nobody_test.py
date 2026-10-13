"""An emptied account is shown as a deleted account, and found by nobody.

The rule crosses the model, the people routes, sign-in and messaging:
wherever the app says who did something it says "Deleted account", and
nothing lists, opens, searches for or signs in to the blank row.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.messaging import _message_out, participant_name
from app.models import (
    DELETED_ACCOUNT_NAME,
    Conversation,
    Message,
    User,
)
from app.org_units.detail import names_of
from app.security import hash_password
from app.users.emptying import empty_account, placeholder_username

PASSWORD = "Password123!"


def _emptied(db: Session, name: str = "ada") -> User:
    """Somebody whose closed account has been emptied."""
    user = User(
        username=name,
        email=f"{name}@example.com",
        full_name=f"{name.title()} Example",
        password_hash=hash_password(PASSWORD),
        email_verified=True,
        base_profession="consultant",
    )
    db.add(user)
    db.flush()
    user.is_active = False
    empty_account(db, user, now=datetime.now(UTC), archive=None)
    db.commit()

    return user


def _open(db: Session, name: str) -> User:
    user = User(
        username=name,
        email=f"{name}@example.com",
        full_name=f"{name.title()} Example",
        password_hash=hash_password(PASSWORD),
        email_verified=True,
        base_profession="consultant",
    )
    db.add(user)
    db.commit()

    return user


class TestTheNameShown:
    def test_an_emptied_account_is_a_deleted_account(
        self, db_session: Session
    ) -> None:
        user = _emptied(db_session)

        assert user.display_name == DELETED_ACCOUNT_NAME
        assert user.display_name == "Deleted account"

    def test_it_is_never_shown_as_its_placeholder(
        self, db_session: Session
    ) -> None:
        user = _emptied(db_session)

        assert "deleted-" not in user.display_name

    def test_an_open_account_is_its_name_or_its_username(
        self, db_session: Session
    ) -> None:
        named = _open(db_session, "bob")
        unnamed = _open(db_session, "cat")
        unnamed.full_name = None

        assert named.display_name == "Bob Example"
        assert unnamed.display_name == "cat"

    def test_a_list_of_names_says_deleted_account_too(
        self, db_session: Session
    ) -> None:
        """Who leads a place, who authorised a competency."""
        gone = _emptied(db_session)
        here = _open(db_session, "bob")

        assert names_of(db_session, {gone.id, here.id}) == {
            gone.id: "Deleted account",
            here.id: "Bob Example",
        }


class TestAMessageTheySent:
    def _message(self, db: Session, sender: User) -> Message:
        conversation = Conversation(
            fhir_conversation_id=f"conv-{sender.id}", patient_id="patient-1"
        )
        db.add(conversation)
        db.flush()
        message = Message(
            fhir_communication_id=f"comm-{sender.id}",
            conversation_id=conversation.id,
            sender_id=sender.id,
            body="Seen in clinic.",
        )
        db.add(message)
        db.commit()

        return message

    def test_it_stays_and_is_from_a_deleted_account(
        self, db_session: Session
    ) -> None:
        out = _message_out(self._message(db_session, _emptied(db_session)))

        assert out.body == "Seen in clinic."
        assert out.sender_display_name == "Deleted account"
        assert out.sender_deleted is True

    def test_nothing_in_it_says_who_they_were(
        self, db_session: Session
    ) -> None:
        out = _message_out(self._message(db_session, _emptied(db_session)))

        assert "ada" not in out.model_dump_json().lower()

    def test_an_ordinary_senders_message_is_as_it_was(
        self, db_session: Session
    ) -> None:
        out = _message_out(self._message(db_session, _open(db_session, "bob")))

        assert out.sender_display_name == "Bob Example"
        assert out.sender_deleted is False

    def test_a_conversations_summary_names_them_as_deleted(
        self, db_session: Session
    ) -> None:
        assert participant_name(_emptied(db_session)) == "Deleted account"
        assert participant_name(_open(db_session, "bob")) == "bob"


class TestNobodyFindsIt:
    def test_it_is_not_in_the_list_of_users(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        gone = _emptied(db_session)
        here = _open(db_session, "bob")

        response = authenticated_superadmin_client.get("/api/users")

        assert response.status_code == 200
        ids = {row["id"] for row in response.json()["users"]}
        assert here.id in ids
        assert gone.id not in ids
        assert "deleted-" not in response.text

    def test_its_admin_page_is_not_found(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        gone = _emptied(db_session)

        response = authenticated_superadmin_client.get(f"/api/users/{gone.id}")

        assert response.status_code == 404
        assert response.json() == {"detail": "User not found"}

    def test_it_cannot_be_opened_again(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        gone = _emptied(db_session)

        response = authenticated_superadmin_client.post(
            f"/api/users/{gone.id}/reactivate"
        )

        assert response.status_code == 404
        db_session.expire_all()
        assert gone.is_active is False

    def test_it_cannot_be_sent_an_invite(
        self, authenticated_superadmin_client: TestClient, db_session: Session
    ) -> None:
        gone = _emptied(db_session)

        response = authenticated_superadmin_client.post(
            f"/api/users/{gone.id}/send-invite"
        )

        assert response.status_code == 404


class TestNobodySignsInToIt:
    def test_the_old_username_and_password_are_refused(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        _emptied(db_session)

        response = test_client.post(
            "/api/auth/login",
            json={"username": "ada", "password": PASSWORD},
        )

        assert response.status_code == 400

    def test_the_placeholder_username_is_refused(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        gone = _emptied(db_session)

        response = test_client.post(
            "/api/auth/login",
            json={
                "username": placeholder_username(gone.id),
                "password": PASSWORD,
            },
        )

        assert response.status_code == 400

    def test_a_password_reset_for_the_old_address_finds_nobody(
        self, test_client: TestClient, db_session: Session
    ) -> None:
        """It answers as it does for any address it does not know."""
        _emptied(db_session)

        unknown = test_client.post(
            "/api/auth/forgot-password",
            json={"email": "nobody@example.com"},
        )
        emptied = test_client.post(
            "/api/auth/forgot-password", json={"email": "ada@example.com"}
        )

        assert unknown.status_code == 200
        assert emptied.status_code == 200
        assert emptied.json() == unknown.json()
