"""Tests for the PATCH /api/auth/profile endpoint."""

from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.models import User


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

    def test_update_email(
        self, test_client: TestClient, test_user: User, db_session: Session
    ) -> None:
        """Updating email succeeds and resets email_verified."""
        csrf = self._login_and_get_csrf(
            test_client, "testuser", "TestPassword123!"
        )
        resp = test_client.patch(
            "/api/auth/profile",
            json={"email": "newemail@example.com"},
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200
        db_session.refresh(test_user)
        assert test_user.email == "newemail@example.com"
        assert test_user.email_verified is False

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
        self, test_client: TestClient, test_user: User, db_session: Session
    ) -> None:
        """Updating both full_name and email succeeds."""
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
        assert test_user.email == "bob@example.com"
        assert test_user.email_verified is False

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
