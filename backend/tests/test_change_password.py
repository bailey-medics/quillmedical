"""Tests for the POST /api/auth/change-password endpoint."""

from starlette.testclient import TestClient

from app.models import User
from app.security import verify_password


class TestChangePassword:
    """Tests for the change-password endpoint."""

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

    def test_change_password_success(
        self, test_client: TestClient, test_user: User
    ) -> None:
        """Changing password with correct current password succeeds."""
        csrf = self._login_and_get_csrf(
            test_client, "testuser", "TestPassword123!"
        )
        resp = test_client.post(
            "/api/auth/change-password",
            json={
                "current_password": "TestPassword123!",
                "new_password": "NewSecurePassword456!",
            },
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 200
        assert resp.json()["detail"] == "Password changed"

    def test_new_password_is_hashed(
        self,
        test_client: TestClient,
        test_user: User,
        db_session: "Session",  # type: ignore[name-defined]  # noqa: F821
    ) -> None:
        """After changing, the new password hash is stored correctly."""
        csrf = self._login_and_get_csrf(
            test_client, "testuser", "TestPassword123!"
        )
        test_client.post(
            "/api/auth/change-password",
            json={
                "current_password": "TestPassword123!",
                "new_password": "NewSecurePassword456!",
            },
            headers={"X-CSRF-Token": csrf},
        )
        db_session.refresh(test_user)
        assert verify_password(
            "NewSecurePassword456!", test_user.password_hash
        )

    def test_wrong_current_password(
        self, test_client: TestClient, test_user: User
    ) -> None:
        """Providing an incorrect current password returns 400."""
        csrf = self._login_and_get_csrf(
            test_client, "testuser", "TestPassword123!"
        )
        resp = test_client.post(
            "/api/auth/change-password",
            json={
                "current_password": "WrongPassword!",
                "new_password": "NewSecurePassword456!",
            },
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 400
        assert "incorrect" in resp.json()["detail"].lower()

    def test_new_password_too_short(
        self, test_client: TestClient, test_user: User
    ) -> None:
        """A new password shorter than 8 characters is rejected."""
        csrf = self._login_and_get_csrf(
            test_client, "testuser", "TestPassword123!"
        )
        resp = test_client.post(
            "/api/auth/change-password",
            json={
                "current_password": "TestPassword123!",
                "new_password": "short",
            },
            headers={"X-CSRF-Token": csrf},
        )
        assert resp.status_code == 400
        assert "8 characters" in resp.json()["detail"]

    def test_unauthenticated_request(self, test_client: TestClient) -> None:
        """Unauthenticated requests are rejected with 401."""
        resp = test_client.post(
            "/api/auth/change-password",
            json={
                "current_password": "TestPassword123!",
                "new_password": "NewSecurePassword456!",
            },
        )
        assert resp.status_code == 401

    def test_missing_csrf_token(
        self, test_client: TestClient, test_user: User
    ) -> None:
        """Authenticated request without CSRF token is rejected."""
        self._login_and_get_csrf(test_client, "testuser", "TestPassword123!")
        resp = test_client.post(
            "/api/auth/change-password",
            json={
                "current_password": "TestPassword123!",
                "new_password": "NewSecurePassword456!",
            },
            # No X-CSRF-Token header
        )
        assert resp.status_code == 403
