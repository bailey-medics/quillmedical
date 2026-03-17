"""Tests for rate limiting on authentication endpoints."""

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import limiter
from app.models import User


class TestLoginRateLimit:
    """Test rate limiting on /auth/login."""

    def test_login_within_limit(
        self, test_client: TestClient, test_user: User
    ) -> None:
        """Requests within the limit succeed normally."""
        for _ in range(5):
            resp = test_client.post(
                "/api/auth/login",
                json={
                    "username": "testuser",
                    "password": "TestPassword123!",
                },
            )
            assert resp.status_code == 200

    def test_login_exceeds_limit(
        self, test_client: TestClient, test_user: User
    ) -> None:
        """The 6th login attempt within a minute is rejected."""
        for _ in range(5):
            test_client.post(
                "/api/auth/login",
                json={
                    "username": "testuser",
                    "password": "TestPassword123!",
                },
            )
        resp = test_client.post(
            "/api/auth/login",
            json={
                "username": "testuser",
                "password": "TestPassword123!",
            },
        )
        assert resp.status_code == 429

    def test_login_rate_limit_applies_to_bad_credentials_too(
        self, test_client: TestClient, test_user: User
    ) -> None:
        """Rate limit counts failed attempts, not just successes."""
        for _ in range(5):
            test_client.post(
                "/api/auth/login",
                json={
                    "username": "testuser",
                    "password": "wrong",
                },
            )
        resp = test_client.post(
            "/api/auth/login",
            json={
                "username": "testuser",
                "password": "TestPassword123!",
            },
        )
        assert resp.status_code == 429


class TestRegisterRateLimit:
    """Test rate limiting on /auth/register."""

    def test_register_within_limit(self, test_client: TestClient) -> None:
        """Requests within the limit succeed normally."""
        for i in range(3):
            resp = test_client.post(
                "/api/auth/register",
                json={
                    "username": f"user{i}",
                    "email": f"user{i}@example.com",
                    "password": "SecurePassword123!",
                },
            )
            assert resp.status_code == 200

    def test_register_exceeds_limit(self, test_client: TestClient) -> None:
        """The 4th registration attempt within a minute is rejected."""
        for i in range(3):
            test_client.post(
                "/api/auth/register",
                json={
                    "username": f"user{i}",
                    "email": f"user{i}@example.com",
                    "password": "SecurePassword123!",
                },
            )
        resp = test_client.post(
            "/api/auth/register",
            json={
                "username": "extra",
                "email": "extra@example.com",
                "password": "SecurePassword123!",
            },
        )
        assert resp.status_code == 429


class TestRateLimitDisabledInTests:
    """Verify rate limits can be disabled for other test suites."""

    def test_limiter_can_be_disabled(
        self, test_client: TestClient, test_user: User
    ) -> None:
        """When limiter is disabled, no rate limits apply."""
        with patch.object(limiter, "enabled", False):
            for _ in range(10):
                resp = test_client.post(
                    "/api/auth/login",
                    json={
                        "username": "testuser",
                        "password": "TestPassword123!",
                    },
                )
                assert resp.status_code == 200
