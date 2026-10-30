"""Tests for the PATCH /api/auth/profile endpoint.

A new email is held as pending until a link sent to it is followed, so
the tests of changing the address check ``pending_email``, the two
emails sent, and the link, rather than ``email`` changing at once.
"""

from typing import Any

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app import main
from app.models import User
from app.security import create_email_change_token


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Each email the route tries to send, as it was asked to."""
    emails: list[dict[str, Any]] = []

    def _record(**kwargs: Any) -> None:
        emails.append(kwargs)

    monkeypatch.setattr(main, "send_email", _record)

    return emails


class TestUpdateProfile:
    """Tests for the profile update endpoint."""

    def _login_and_get_csrf(
        self, client: TestClient, username: str, password: str
    ) -> str:
        """Log in and return the CSRF token."""
        resp = client.post(
            "/api/auth/login",
            json={"username": username, "password": password},
        )
        assert resp.status_code == 200

        return client.cookies.get("XSRF-TOKEN", "")

    def test_update_full_name(
        self, test_client: TestClient, test_user: User, db_session: Session
    ) -> None:
        """Updating full_name succeeds."""
        csrf = self._login_and_get_csrf(
            test_client, "testuser", "TestPassword123!"
        )
        resp = test_client.patch(
            "/api/auth/profile",
            json={"full_name": "Dr Alice Smith"},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200
        assert resp.json()["detail"] == "Profile updated"
        db_session.refresh(test_user)
        assert test_user.full_name == "Dr Alice Smith"

    def test_update_email_holds_it_until_confirmed(
        self,
        test_client: TestClient,
        test_user: User,
        db_session: Session,
        sent: list[dict[str, Any]],
    ) -> None:
        """Changed on purpose: the address used to change at once. Now
        it waits, so a reset still goes to the address already proven,
        and the current address is told."""
        csrf = self._login_and_get_csrf(
            test_client, "testuser", "TestPassword123!"
        )
        resp = test_client.patch(
            "/api/auth/profile",
            json={"email": "newemail@example.com"},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200
        assert resp.json()["detail"] == "Check your new email"
        db_session.refresh(test_user)
        assert test_user.email == "test@example.com"
        assert test_user.email_verified is True
        assert test_user.pending_email == "newemail@example.com"
        assert [email["to"] for email in sent] == [
            "newemail@example.com",
            "test@example.com",
        ]
        assert "verify-email?token=" in sent[0]["text_body"]
        assert "newemail@example.com" in sent[1]["text_body"]

    def test_update_same_email_keeps_verified(
        self, test_client: TestClient, test_user: User, db_session: Session
    ) -> None:
        """Submitting the same email does not reset email_verified."""
        csrf = self._login_and_get_csrf(
            test_client, "testuser", "TestPassword123!"
        )
        resp = test_client.patch(
            "/api/auth/profile",
            json={"email": "test@example.com"},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200
        db_session.refresh(test_user)
        assert test_user.email_verified is True

    def test_update_both_fields(
        self,
        test_client: TestClient,
        test_user: User,
        db_session: Session,
        sent: list[dict[str, Any]],
    ) -> None:
        """The name changes at once; the address waits."""
        csrf = self._login_and_get_csrf(
            test_client, "testuser", "TestPassword123!"
        )
        resp = test_client.patch(
            "/api/auth/profile",
            json={
                "full_name": "Dr Bob Jones",
                "email": "bob@example.com",
            },
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200
        db_session.refresh(test_user)
        assert test_user.full_name == "Dr Bob Jones"
        assert test_user.email == "test@example.com"
        assert test_user.pending_email == "bob@example.com"

    def test_no_fields_returns_400(
        self, test_client: TestClient, test_user: User
    ) -> None:
        """Sending no fields returns 400."""
        csrf = self._login_and_get_csrf(
            test_client, "testuser", "TestPassword123!"
        )
        resp = test_client.patch(
            "/api/auth/profile",
            json={},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 400
        assert "No fields to update" in resp.json()["detail"]

    def test_duplicate_email_returns_400(
        self,
        test_client: TestClient,
        test_user: User,
        db_session: Session,
    ) -> None:
        """Using an email already taken by another user returns 400."""
        from app.security import hash_password

        other = User(
            username="other-user",
            email="taken@example.com",
            password_hash=hash_password("OtherPassword123!"),
            is_active=True,
        )
        db_session.add(other)
        db_session.commit()

        csrf = self._login_and_get_csrf(
            test_client, "testuser", "TestPassword123!"
        )
        resp = test_client.patch(
            "/api/auth/profile",
            json={"email": "taken@example.com"},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 400
        assert "already in use" in resp.json()["detail"]

    def test_unauthenticated_returns_401(
        self, test_client: TestClient
    ) -> None:
        """Unauthenticated request returns 401."""
        resp = test_client.patch(
            "/api/auth/profile",
            json={"full_name": "Hacker"},
        )
        assert resp.status_code == 401

    def test_strips_whitespace_from_full_name(
        self, test_client: TestClient, test_user: User, db_session: Session
    ) -> None:
        """Leading/trailing whitespace is stripped from full_name."""
        csrf = self._login_and_get_csrf(
            test_client, "testuser", "TestPassword123!"
        )
        resp = test_client.patch(
            "/api/auth/profile",
            json={"full_name": "  Dr Alice Smith  "},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200
        db_session.refresh(test_user)
        assert test_user.full_name == "Dr Alice Smith"

    def test_rejects_extra_fields(
        self, test_client: TestClient, test_user: User
    ) -> None:
        """Extra fields are rejected (extra='forbid')."""
        csrf = self._login_and_get_csrf(
            test_client, "testuser", "TestPassword123!"
        )
        resp = test_client.patch(
            "/api/auth/profile",
            json={"full_name": "Dr Alice", "username": "hacked"},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 422


class TestTheCurrentPassword:
    def _login(self, client: TestClient) -> str:
        client.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "TestPassword123!"},
        )

        return client.cookies.get("XSRF-TOKEN", "")

    def test_a_wrong_current_password_is_refused(
        self,
        test_client: TestClient,
        test_user: User,
        db_session: Session,
        sent: list[dict[str, Any]],
    ) -> None:
        csrf = self._login(test_client)
        resp = test_client.patch(
            "/api/auth/profile",
            json={"email": "new@example.com", "current_password": "wrong"},
            headers={"X-CSRF-Token": csrf},
        )

        assert resp.status_code == 400
        assert resp.json()["detail"] == "Current password is incorrect"
        db_session.refresh(test_user)
        assert test_user.pending_email is None
        assert sent == []

    def test_the_right_current_password_is_accepted(
        self,
        test_client: TestClient,
        test_user: User,
        db_session: Session,
        sent: list[dict[str, Any]],
    ) -> None:
        csrf = self._login(test_client)
        resp = test_client.patch(
            "/api/auth/profile",
            json={
                "email": "new@example.com",
                "current_password": "TestPassword123!",
            },
            headers={"X-CSRF-Token": csrf},
        )

        assert resp.status_code == 200
        db_session.refresh(test_user)
        assert test_user.pending_email == "new@example.com"

    def test_a_name_change_does_not_need_it(
        self, test_client: TestClient, test_user: User
    ) -> None:
        csrf = self._login(test_client)
        resp = test_client.patch(
            "/api/auth/profile",
            json={"full_name": "Dr Alice", "current_password": "wrong"},
            headers={"X-CSRF-Token": csrf},
        )

        assert resp.status_code == 200


class TestConfirmingTheNewAddress:
    def _ask_for(self, db: Session, user: User, email: str) -> str:
        user.pending_email = email
        db.commit()

        return create_email_change_token(user.id, email, user.token_version)

    def test_the_link_moves_the_account_and_ends_its_sessions(
        self, test_client: TestClient, test_user: User, db_session: Session
    ) -> None:
        token = self._ask_for(db_session, test_user, "new@example.com")
        version = test_user.token_version

        resp = test_client.post(
            "/api/auth/verify-email", json={"token": token}
        )

        assert resp.status_code == 200
        db_session.refresh(test_user)
        assert test_user.email == "new@example.com"
        assert test_user.email_verified is True
        assert test_user.pending_email is None
        assert test_user.token_version == version + 1

    def test_the_link_works_once(
        self, test_client: TestClient, test_user: User, db_session: Session
    ) -> None:
        token = self._ask_for(db_session, test_user, "new@example.com")

        test_client.post("/api/auth/verify-email", json={"token": token})
        again = test_client.post(
            "/api/auth/verify-email", json={"token": token}
        )

        assert again.status_code == 400

    def test_an_older_link_stops_once_another_change_is_asked(
        self, test_client: TestClient, test_user: User, db_session: Session
    ) -> None:
        older = self._ask_for(db_session, test_user, "first@example.com")
        self._ask_for(db_session, test_user, "second@example.com")

        resp = test_client.post(
            "/api/auth/verify-email", json={"token": older}
        )

        assert resp.status_code == 400
        db_session.refresh(test_user)
        assert test_user.email == "test@example.com"

    def test_a_link_from_before_a_password_change_stops(
        self, test_client: TestClient, test_user: User, db_session: Session
    ) -> None:
        token = self._ask_for(db_session, test_user, "new@example.com")
        test_user.token_version += 1
        db_session.commit()

        resp = test_client.post(
            "/api/auth/verify-email", json={"token": token}
        )

        assert resp.status_code == 400

    def test_an_address_taken_meanwhile_is_refused(
        self, test_client: TestClient, test_user: User, db_session: Session
    ) -> None:
        from app.security import hash_password

        token = self._ask_for(db_session, test_user, "new@example.com")
        db_session.add(
            User(
                username="quicker",
                email="new@example.com",
                password_hash=hash_password("OtherPassword123!"),
                is_active=True,
            )
        )
        db_session.commit()

        resp = test_client.post(
            "/api/auth/verify-email", json={"token": token}
        )

        assert resp.status_code == 400
        db_session.refresh(test_user)
        assert test_user.email == "test@example.com"

    def test_a_verification_link_is_not_a_change_link(
        self, test_client: TestClient, test_user: User, db_session: Session
    ) -> None:
        """Their own salts, so one kind of link cannot pass as the other."""
        from app.security import (
            create_email_verify_token,
            verify_email_change_token,
        )

        assert (
            verify_email_change_token(create_email_verify_token("a@b.co"))
            is None
        )
