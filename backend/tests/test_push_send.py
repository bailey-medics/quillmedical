"""Tests for push send functionality."""

from unittest.mock import patch

from fastapi.testclient import TestClient
from pywebpush import WebPushException
from sqlalchemy.orm import Session

from app.models import PushSubscription, User
from app.security import hash_password


class TestPushSend:
    """Test push notification sending endpoint."""

    def test_send_test_requires_auth(self, test_client: TestClient):
        """Test send-test rejects unauthenticated requests."""
        response = test_client.post("/api/push/send-test")
        assert response.status_code == 401

    def test_send_test_requires_an_operator(
        self, authenticated_client: TestClient
    ):
        """Test send-test rejects anyone who is not an operator."""
        response = authenticated_client.post("/api/push/send-test")
        assert response.status_code == 403

    def test_send_test_refuses_a_stale_admin(
        self, test_client: TestClient, db_session: Session
    ):
        """Says `admin` in the old column and `standard` in the new one.

        The route asks `platform_role`, so the old rank no longer opens
        it. This fails if the check reads `system_permissions` again.
        """
        user = User(
            username="staleadmin",
            email="staleadmin@example.test",
            password_hash=hash_password("Password123!"),
            is_active=True,
            email_verified=True,
            system_permissions="admin",
            platform_role="standard",
        )
        db_session.add(user)
        db_session.commit()

        resp = test_client.post(
            "/api/auth/login",
            json={"username": "staleadmin", "password": "Password123!"},
        )
        assert resp.status_code == 200

        response = test_client.post("/api/push/send-test")
        assert response.status_code == 403

    def test_send_test_no_subscribers(
        self, authenticated_superadmin_client: TestClient
    ):
        """Test send-test with no subscribers."""
        response = authenticated_superadmin_client.post("/api/push/send-test")

        assert response.status_code == 400
        assert "No subscribers" in response.json()["detail"]

    @patch("app.push_send.webpush")
    def test_send_test_success(
        self,
        mock_webpush,
        authenticated_superadmin_client: TestClient,
        test_superadmin: User,
        db_session: Session,
    ):
        """Test successful push notification send."""
        db_session.add(
            PushSubscription(
                user_id=test_superadmin.id,
                endpoint="https://push.example.com/test",
                keys_p256dh="key1",
                keys_auth="auth1",
            )
        )
        db_session.commit()

        mock_webpush.return_value = None  # Success

        response = authenticated_superadmin_client.post("/api/push/send-test")

        assert response.status_code == 200
        data = response.json()
        assert data["sent"] is True
        assert len(data["removed"]) == 0
        mock_webpush.assert_called_once()

    @patch("app.push_send.webpush")
    def test_send_test_removes_failed_subscriptions(
        self,
        mock_webpush,
        authenticated_superadmin_client: TestClient,
        test_superadmin: User,
        db_session: Session,
    ):
        """Test that failed subscriptions are removed from DB."""
        db_session.add(
            PushSubscription(
                user_id=test_superadmin.id,
                endpoint="https://push.example.com/fail",
                keys_p256dh="key1",
                keys_auth="auth1",
            )
        )
        db_session.add(
            PushSubscription(
                user_id=test_superadmin.id,
                endpoint="https://push.example.com/success",
                keys_p256dh="key2",
                keys_auth="auth2",
            )
        )
        db_session.commit()

        # First call fails, second succeeds
        mock_webpush.side_effect = [WebPushException("Gone"), None]

        response = authenticated_superadmin_client.post("/api/push/send-test")

        assert response.status_code == 200
        data = response.json()
        assert data["sent"] is True
        assert len(data["removed"]) == 1
        assert "https://push.example.com/fail" in data["removed"]
        # Failed subscription should be removed from DB
        remaining = db_session.query(PushSubscription).all()
        assert len(remaining) == 1
        assert remaining[0].endpoint == "https://push.example.com/success"

    @patch("app.push_send.webpush")
    def test_send_test_multiple_subscribers(
        self,
        mock_webpush,
        authenticated_superadmin_client: TestClient,
        test_superadmin: User,
        db_session: Session,
    ):
        """Test sending to multiple subscribers."""
        for i in range(3):
            db_session.add(
                PushSubscription(
                    user_id=test_superadmin.id,
                    endpoint=f"https://push.example.com/sub{i}",
                    keys_p256dh=f"key{i}",
                    keys_auth=f"auth{i}",
                )
            )
        db_session.commit()

        mock_webpush.return_value = None  # All succeed

        response = authenticated_superadmin_client.post("/api/push/send-test")

        assert response.status_code == 200
        data = response.json()
        assert data["sent"] is True
        assert len(data["removed"]) == 0
        # Should have called webpush 3 times
        assert mock_webpush.call_count == 3
