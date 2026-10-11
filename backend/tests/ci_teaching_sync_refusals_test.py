"""The exact words the deploy pipeline's sync refuses a caller in.

``ci_teaching_sync_test.py`` pins the status of each. These pin the
words with it, through the real route, so neither can drift. All three
are about the request and are answered by the route itself, before any
bank is looked for.
"""

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import settings

ENDPOINT = "/api/ci/teaching/sync"


def test_with_no_token_configured_nobody_may_sync(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "TEACHING_SYNC_TOKEN", None)

    resp = test_client.post(
        ENDPOINT, headers={"Authorization": "Bearer anything"}
    )

    assert resp.status_code == 503
    assert resp.json() == {"detail": "Sync token not configured"}


def test_a_request_with_no_bearer_token_is_refused(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        settings, "TEACHING_SYNC_TOKEN", SecretStr("test-token")
    )

    resp = test_client.post(ENDPOINT)

    assert resp.status_code == 401
    assert resp.json() == {"detail": "Missing Bearer token"}


def test_a_header_that_is_not_a_bearer_token_is_refused(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        settings, "TEACHING_SYNC_TOKEN", SecretStr("test-token")
    )

    resp = test_client.post(
        ENDPOINT, headers={"Authorization": "Basic test-token"}
    )

    assert resp.status_code == 401
    assert resp.json() == {"detail": "Missing Bearer token"}


def test_the_wrong_token_is_refused(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        settings, "TEACHING_SYNC_TOKEN", SecretStr("test-token")
    )

    resp = test_client.post(
        ENDPOINT, headers={"Authorization": "Bearer wrong-token"}
    )

    assert resp.status_code == 401
    assert resp.json() == {"detail": "Invalid token"}


def test_the_wrong_token_is_refused_before_any_bank_is_looked_for(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    looked: list[str] = []

    def look(bucket: str) -> list[str]:
        looked.append(bucket)

        return []

    monkeypatch.setattr(
        settings, "TEACHING_SYNC_TOKEN", SecretStr("test-token")
    )
    monkeypatch.setattr(settings, "TEACHING_GCS_BUCKET", "a-bucket")
    monkeypatch.setattr(
        "app.features.teaching.ci_sync.list_banks_in_gcs", look
    )

    resp = test_client.post(
        ENDPOINT, headers={"Authorization": "Bearer wrong-token"}
    )

    assert resp.status_code == 401
    assert looked == []


def test_banks_with_no_organisation_to_hold_them_are_not_a_failure(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        settings, "TEACHING_SYNC_TOKEN", SecretStr("test-token")
    )
    monkeypatch.setattr(settings, "TEACHING_QUESTION_BANK_PATH", None)
    monkeypatch.setattr(settings, "TEACHING_GCS_BUCKET", "a-bucket")
    monkeypatch.setattr(
        "app.features.teaching.ci_sync.list_banks_in_gcs",
        lambda bucket: ["a-bank"],
    )

    resp = test_client.post(
        ENDPOINT, headers={"Authorization": "Bearer test-token"}
    )

    assert resp.status_code == 200
    assert resp.json() == {
        "synced": [],
        "errors": [],
        "message": "No organisation to sync into",
    }
