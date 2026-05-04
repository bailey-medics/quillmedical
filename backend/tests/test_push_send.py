"""Tests for push send functionality."""

from unittest.mock import patch

from fastapi.testclient import TestClient
from pywebpush import WebPushException
from sqlalchemy.orm import Session

from app.models import PushSubscription, User


class TestPushSend:
    """Test push notification sending endpoint."""

    def test_send_test_no_subscribers(self, test_client: TestClient):
        """Test send-test with no subscribers."""
        response = test_client.post("/api/push/send-test")

        assert response.status_code == 400
        assert "No subscribers" in response.json()["detail"]

    @patch("app.push_send.webpush")
    def test_send_test_success(
        self,
        mock_webpush,
        test_client: TestClient,
        test_user: User,
        db_session: Session,
    ):
        """Test successful push notification send."""
        db_session.add(
            PushSubscription(
                user_id=test_user.id,
                endpoint="https://push.example.com/test",
                keys_p256dh="key1",
                keys_auth="auth1",
            )
        )
        db_session.commit()

        mock_webpush.return_value = None  # Success

        response = test_client.post("/api/push/send-test")

        assert response.status_code == 200
        data = response.json()
        assert data["sent"] is True
        assert len(data["removed"]) == 0
        mock_webpush.assert_called_once()

    @patch("app.push_send.webpush")
    def test_send_test_removes_failed_subscriptions(
        self,
        mock_webpush,
        test_client: TestClient,
        test_user: User,
        db_session: Session,
    ):
        """Test that failed subscriptions are removed from DB."""
        db_session.add(
            PushSubscription(
                user_id=test_user.id,
                endpoint="https://push.example.com/fail",
                keys_p256dh="key1",
                keys_auth="auth1",
            )
        )
        db_session.add(
            PushSubscription(
                user_id=test_user.id,
                endpoint="https://push.example.com/success",
                keys_p256dh="key2",
                keys_auth="auth2",
            )
        )
        db_session.commit()

        # First call fails, second succeeds
        mock_webpush.side_effect = [WebPushException("Gone"), None]

        response = test_client.post("/api/push/send-test")

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
        test_client: TestClient,
        test_user: User,
        db_session: Session,
    ):
        """Test sending to multiple subscribers."""
        for i in range(3):
            db_session.add(
                PushSubscription(
                    user_id=test_user.id,
                    endpoint=f"https://push.example.com/sub{i}",
                    keys_p256dh=f"key{i}",
                    keys_auth=f"auth{i}",
                )
            )
        db_session.commit()

        mock_webpush.return_value = None  # All succeed

        response = test_client.post("/api/push/send-test")

        assert response.status_code == 200
        data = response.json()
        assert data["sent"] is True
        assert len(data["removed"]) == 0
        # Should have called webpush 3 times
        assert mock_webpush.call_count == 3
