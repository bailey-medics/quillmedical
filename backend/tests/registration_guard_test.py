"""Tests for registration guard when clinical services are enabled."""

import pytest
from fastapi.testclient import TestClient

from app.config import settings


class TestRegistrationGuard:
    """Test that self-registration is blocked in clinical environments."""

    @pytest.fixture(autouse=True)
    def _enable_clinical(self, monkeypatch: pytest.MonkeyPatch):
        """Enable clinical services for all tests in this class."""
        monkeypatch.setattr(settings, "CLINICAL_SERVICES_ENABLED", True)

    def test_register_returns_403_when_clinical_enabled(
        self, test_client: TestClient
    ) -> None:
        """Self-registration is forbidden in clinical environments."""
        response = test_client.post(
            "/api/auth/register",
            json={
                "username": "newuser",
                "email": "new@example.com",
                "password": "SecurePassword123!",
            },
        )
        assert response.status_code == 403
        assert "not available" in response.json()["detail"]

    def test_register_succeeds_when_clinical_disabled(
        self, test_client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Self-registration works in teaching environments."""
        monkeypatch.setattr(settings, "CLINICAL_SERVICES_ENABLED", False)
        response = test_client.post(
            "/api/auth/register",
            json={
                "username": "teaching-user",
                "email": "teaching@example.com",
                "password": "SecurePassword123!",
            },
        )
        assert response.status_code == 200
        assert response.json() == {"detail": "created"}
