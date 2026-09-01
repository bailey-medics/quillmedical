"""Tests for POST /api/ci/teaching/sync (CI/CD service-token sync trigger)."""

from __future__ import annotations

import shutil
from pathlib import Path

from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import settings

_VALID_MODULE = (
    Path(__file__).parent / "fixtures" / "teaching_tooling" / ".valid-module"
)
#: The fixture's declared moduleId, which its directory name must match.
_VALID_MODULE_ID = "valid-module"


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


class TestRejectedBanksFailTheDeploy:
    """A rejected bank must make the response non-2xx.

    The content deploy calls this with curl. While it returned 200 with the
    errors in the body, a rejected bank was indistinguishable from a clean
    sync, which is how a malformed certificate block reached GCS unnoticed.
    """

    def _base_with(
        self, tmp_path: Path, *, good: bool = False, bad: bool = False
    ) -> str:
        """Build a modules-layout tree and return it as the base path."""
        modules = tmp_path / "repo" / "modules"
        modules.mkdir(parents=True)

        if good:
            # Named for the fixture's own moduleId — validation
            # requires the directory name to match it.
            shutil.copytree(_VALID_MODULE, modules / _VALID_MODULE_ID)
        if bad:
            broken = modules / "bad-bank"
            broken.mkdir()
            # Parses as YAML, but is not a module: validation rejects it.
            (broken / "module.yaml").write_text("moduleId: bad-bank\n")
            (broken / "assessment").mkdir()
            (broken / "assessment" / "config.yaml").write_text("{}\n")

        return str(tmp_path)

    def _sync(self, client: TestClient, monkeypatch, base: str):
        monkeypatch.setattr(
            settings, "TEACHING_SYNC_TOKEN", SecretStr("test-token")
        )
        monkeypatch.setattr(settings, "TEACHING_GCS_BUCKET", None)
        monkeypatch.setattr(settings, "TEACHING_QUESTION_BANK_PATH", base)
        return client.post(
            "/api/ci/teaching/sync",
            headers={"Authorization": "Bearer test-token"},
        )

    def test_a_rejected_bank_returns_422(
        self, test_client: TestClient, monkeypatch, tmp_path: Path
    ):
        base = self._base_with(tmp_path, bad=True)
        resp = self._sync(test_client, monkeypatch, base)

        assert resp.status_code == 422

    def test_the_body_survives_the_422(
        self, test_client: TestClient, monkeypatch, tmp_path: Path
    ):
        """The workflow uses curl --fail-with-body, so the body is what
        tells whoever broke it which bank failed and why."""
        base = self._base_with(tmp_path, bad=True)
        resp = self._sync(test_client, monkeypatch, base)

        data = resp.json()
        assert [e["bank_id"] for e in data["errors"]] == ["bad-bank"]
        assert data["errors"][0]["error"]
        assert "synced" in data

    def test_a_clean_sync_is_still_200(
        self, test_client: TestClient, monkeypatch, tmp_path: Path
    ):
        base = self._base_with(tmp_path, good=True)
        resp = self._sync(test_client, monkeypatch, base)

        assert resp.status_code == 200
        assert resp.json()["errors"] == []

    def test_a_partial_sync_still_fails(
        self, test_client: TestClient, monkeypatch, tmp_path: Path
    ):
        """One good bank does not excuse a rejected one.

        The deploy re-uploads every module, so a bank that cannot be
        validated is broken content in the bucket regardless of how many
        of its neighbours were fine.
        """
        base = self._base_with(tmp_path, good=True, bad=True)
        resp = self._sync(test_client, monkeypatch, base)

        assert resp.status_code == 422
        data = resp.json()
        assert [e["bank_id"] for e in data["errors"]] == ["bad-bank"]
        assert [s["bank_id"] for s in data["synced"]] == [_VALID_MODULE_ID]

    def test_no_banks_found_is_not_a_failure(
        self, test_client: TestClient, monkeypatch, tmp_path: Path
    ):
        """Nothing to sync is not the same as something rejected."""
        resp = self._sync(test_client, monkeypatch, str(tmp_path))

        assert resp.status_code == 200


class TestTheContractIsDocumented:
    def test_422_is_declared_with_the_same_body(self) -> None:
        """oasdiff can only police a response it can see fields on.

        Read from the app rather than /openapi.json, which the test
        settings do not expose.
        """
        from app.main import app

        spec = app.openapi()
        responses = spec["paths"]["/api/ci/teaching/sync"]["post"]["responses"]

        assert "422" in responses
        schema = responses["422"]["content"]["application/json"]["schema"]
        assert schema["$ref"].endswith("CiTeachingSyncOut")
