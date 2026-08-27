"""Tests for POST /api/ci/teaching/sync (CI/CD service-token sync trigger)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import settings


class TestCiTeachingSync:
    def test_sync_token_not_configured(
        self, test_client: TestClient, monkeypatch
    ):
        monkeypatch.setattr(settings, "TEACHING_SYNC_TOKEN", None)

        resp = test_client.post("/api/ci/teaching/sync")
        assert resp.status_code == 503

    def test_missing_bearer_token(self, test_client: TestClient, monkeypatch):
        monkeypatch.setattr(
            settings, "TEACHING_SYNC_TOKEN", SecretStr("test-token")
        )

        resp = test_client.post("/api/ci/teaching/sync")
        assert resp.status_code == 401

    def test_invalid_token(self, test_client: TestClient, monkeypatch):
        monkeypatch.setattr(
            settings, "TEACHING_SYNC_TOKEN", SecretStr("test-token")
        )

        resp = test_client.post(
            "/api/ci/teaching/sync",
            headers={"Authorization": "Bearer wrong-token"},
        )
        assert resp.status_code == 401

    def test_no_banks_found(self, test_client: TestClient, monkeypatch):
        monkeypatch.setattr(
            settings, "TEACHING_SYNC_TOKEN", SecretStr("test-token")
        )
        monkeypatch.setattr(settings, "TEACHING_QUESTION_BANK_PATH", None)
        monkeypatch.setattr(settings, "TEACHING_GCS_BUCKET", None)

        resp = test_client.post(
            "/api/ci/teaching/sync",
            headers={"Authorization": "Bearer test-token"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data == {
            "synced": [],
            "errors": [],
            "message": "No banks found",
        }
