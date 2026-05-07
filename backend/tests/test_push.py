"""Tests for push notification subscription endpoints."""

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import PushSubscription, User


class TestPushSubscription:
    """Test push notification subscription endpoint."""

    def test_subscribe_requires_auth(self, test_client: TestClient):
        """Test push subscription requires authentication."""
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
        self,
        authenticated_client: TestClient,
        test_user: User,
        db_session: Session,
    ):
        """Test successful push subscription."""
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

        # Verify persisted in DB
        sub = db_session.query(PushSubscription).first()
        assert sub is not None
        assert sub.endpoint == "https://push.example.com/123"
        assert sub.user_id == test_user.id
        assert sub.keys_p256dh == "test_p256dh_key"  # gitleaks:allow
        assert sub.keys_auth == "test_auth_key"

    def test_subscribe_duplicate_endpoint(
        self,
        authenticated_client: TestClient,
        test_user: User,
        db_session: Session,
    ):
        """Test subscribing with same endpoint doesn't create duplicate."""
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

        # Verify only one row in DB
        count = db_session.query(PushSubscription).count()
        assert count == 1

    def test_subscribe_updates_keys_on_duplicate(
        self,
        authenticated_client: TestClient,
        test_user: User,
        db_session: Session,
    ):
        """Test subscribing with same endpoint updates keys."""
        authenticated_client.post(
            "/api/push/subscribe",
            json={
                "endpoint": "https://push.example.com/789",
                "keys": {
                    "p256dh": "old_p256dh",
                    "auth": "old_auth",
                },
            },
        )

        # Subscribe again with new keys
        authenticated_client.post(
            "/api/push/subscribe",
            json={
                "endpoint": "https://push.example.com/789",
                "keys": {
                    "p256dh": "new_p256dh",
                    "auth": "new_auth",
                },
            },
        )

        sub = db_session.query(PushSubscription).first()
        assert sub is not None
        assert sub.keys_p256dh == "new_p256dh"  # gitleaks:allow
        assert sub.keys_auth == "new_auth"

    def test_subscribe_multiple_endpoints(
        self,
        authenticated_client: TestClient,
        test_user: User,
        db_session: Session,
    ):
        """Test subscribing multiple different endpoints."""
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

        # Should have 3 subscriptions in DB
        count = db_session.query(PushSubscription).count()
        assert count == 3

    def test_subscribe_with_expiration(
        self,
        authenticated_client: TestClient,
        test_user: User,
    ):
        """Test subscription with expiration time."""
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
