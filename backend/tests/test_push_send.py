"""Tests for push send functionality."""

from unittest.mock import patch

from fastapi.testclient import TestClient
from pywebpush import WebPushException

from app.push import SUBSCRIPTIONS


class TestPushSend:
    """Test push notification sending endpoint."""

    def test_send_test_no_subscribers(self, test_client: TestClient):
        """Test send-test with no subscribers."""
        # Clear subscriptions
        SUBSCRIPTIONS.clear()

        response = test_client.post("/api/push/send-test")

        assert response.status_code == 400
        assert "No subscribers" in response.json()["detail"]

    @patch("app.push_send.webpush")
    def test_send_test_success(self, mock_webpush, test_client: TestClient):
        """Test successful push notification send."""
        # Clear and add a subscription
        SUBSCRIPTIONS.clear()
        SUBSCRIPTIONS.append(
            {
                "endpoint": "https://push.example.com/test",
                "keys": {"p256dh": "key1", "auth": "auth1"},
            }
        )

        mock_webpush.return_value = None  # Success

        response = test_client.post("/api/push/send-test")

        assert response.status_code == 200
        data = response.json()
        assert data["sent"] is True
        assert len(data["removed"]) == 0
        mock_webpush.assert_called_once()

    @patch("app.push_send.webpush")
    def test_send_test_removes_failed_subscriptions(
        self, mock_webpush, test_client: TestClient
    ):
        """Test that failed subscriptions are removed."""
        # Clear and add subscriptions
        SUBSCRIPTIONS.clear()
        SUBSCRIPTIONS.append(
            {
                "endpoint": "https://push.example.com/fail",
                "keys": {"p256dh": "key1", "auth": "auth1"},
            }
        )
        SUBSCRIPTIONS.append(
            {
                "endpoint": "https://push.example.com/success",
                "keys": {"p256dh": "key2", "auth": "auth2"},
            }
        )

        # First call fails, second succeeds
        mock_webpush.side_effect = [WebPushException("Gone"), None]

        response = test_client.post("/api/push/send-test")

        assert response.status_code == 200
        data = response.json()
        assert data["sent"] is True
        assert len(data["removed"]) == 1
        assert "https://push.example.com/fail" in data["removed"]
        # Failed subscription should be removed from list
        assert len(SUBSCRIPTIONS) == 1
        assert SUBSCRIPTIONS[0]["endpoint"] == "https://push.example.com/success"

    @patch("app.push_send.webpush")
    def test_send_test_multiple_subscribers(
        self, mock_webpush, test_client: TestClient
    ):
        """Test sending to multiple subscribers."""
        # Clear and add multiple subscriptions
        SUBSCRIPTIONS.clear()
        for i in range(3):
            SUBSCRIPTIONS.append(
                {
                    "endpoint": f"https://push.example.com/sub{i}",
                    "keys": {"p256dh": f"key{i}", "auth": f"auth{i}"},
                }
            )

        mock_webpush.return_value = None  # All succeed

        response = test_client.post("/api/push/send-test")

        assert response.status_code == 200
        data = response.json()
        assert data["sent"] is True
        assert len(data["removed"]) == 0
        # Should have called webpush 3 times
        assert mock_webpush.call_count == 3
