"""Tests for push notification endpoints."""

from fastapi.testclient import TestClient

from app.models import User
from app.push import SUBSCRIPTIONS


class TestPushSubscription:
    """Test push notification subscription endpoint."""

    def test_subscribe_requires_auth(self, test_client: TestClient):
        """Test push subscription requires authentication."""
        SUBSCRIPTIONS.clear()
        response = test_client.post(
            "/api/push/subscribe",
            json={
                "endpoint": "https://push.example.com/123",
                "expirationTime": None,
                "keys": {
                    "p256dh": "test_p256dh_key",
                    "auth": "test_auth_key",
                },
            },
        )
        assert response.status_code == 401

    def test_subscribe_success(
        self, authenticated_client: TestClient, test_user: User
    ):
        """Test successful push subscription."""
        # Clear subscriptions
        SUBSCRIPTIONS.clear()

        response = authenticated_client.post(
            "/api/push/subscribe",
            json={
                "endpoint": "https://push.example.com/123",
                "expirationTime": None,
                "keys": {
                    "p256dh": "test_p256dh_key",
                    "auth": "test_auth_key",
                },
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["count"] == 1

    def test_subscribe_duplicate_endpoint(
        self, authenticated_client: TestClient, test_user: User
    ):
        """Test subscribing with same endpoint doesn't create duplicate."""
        # Clear subscriptions
        SUBSCRIPTIONS.clear()

        subscription = {
            "endpoint": "https://push.example.com/456",
            "expirationTime": None,
            "keys": {
                "p256dh": "test_p256dh_key",
                "auth": "test_auth_key",
            },
        }

        # Subscribe twice
        response1 = authenticated_client.post(
            "/api/push/subscribe", json=subscription
        )
        response2 = authenticated_client.post(
            "/api/push/subscribe", json=subscription
        )

        assert response1.status_code == 200
        assert response2.status_code == 200
        # Should only have one subscription
        assert response2.json()["count"] == 1

    def test_subscribe_multiple_endpoints(
        self, authenticated_client: TestClient, test_user: User
    ):
        """Test subscribing multiple different endpoints."""
        # Clear subscriptions
        SUBSCRIPTIONS.clear()

        # Subscribe with different endpoints
        for i in range(3):
            response = authenticated_client.post(
                "/api/push/subscribe",
                json={
                    "endpoint": f"https://push.example.com/{i}",
                    "expirationTime": None,
                    "keys": {
                        "p256dh": f"test_p256dh_key_{i}",
                        "auth": f"test_auth_key_{i}",
                    },
                },
            )
            assert response.status_code == 200

        # Should have 3 subscriptions
        assert len(SUBSCRIPTIONS) == 3

    def test_subscribe_with_expiration(
        self, authenticated_client: TestClient, test_user: User
    ):
        """Test subscription with expiration time."""
        # Clear subscriptions
        SUBSCRIPTIONS.clear()

        response = authenticated_client.post(
            "/api/push/subscribe",
            json={
                "endpoint": "https://push.example.com/exp",
                "expirationTime": 1234567890,
                "keys": {
                    "p256dh": "test_p256dh_key",
                    "auth": "test_auth_key",
                },
            },
        )

        assert response.status_code == 200
        assert response.json()["ok"] is True

    def test_subscribe_missing_fields(self, test_client: TestClient):
        """Test subscription with missing required fields."""
        response = test_client.post(
            "/api/push/subscribe",
            json={
                "endpoint": "https://push.example.com/missing",
                # Missing keys
            },
        )
        # Should return validation error
        assert response.status_code == 422


# Note: Testing /push/send-test requires actual VAPID configuration
# and would attempt to send real push notifications.
# These tests are better suited for integration testing with mocked push service.


class TestPushNotificationStorage:
    """Test push notification subscription storage."""

    def test_subscriptions_stored_in_memory(
        self, authenticated_client: TestClient, test_user: User
    ):
        """Test that subscriptions are stored in module-level list."""
        # Clear subscriptions
        SUBSCRIPTIONS.clear()

        subscription = {
            "endpoint": "https://push.example.com/storage",
            "expirationTime": None,
            "keys": {
                "p256dh": "test_key",
                "auth": "test_auth",
            },
        }

        authenticated_client.post("/api/push/subscribe", json=subscription)

        # Verify stored in SUBSCRIPTIONS
        assert len(SUBSCRIPTIONS) == 1
        assert (
            SUBSCRIPTIONS[0]["endpoint"] == "https://push.example.com/storage"
        )
