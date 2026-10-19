"""The scan job's callback, through the real route.

The guard is the one the video jobs' reports use, and its own branches
are covered in ``app/deps_job_identity_test.py``; here it is enough
that the route is behind it, and that each verdict does what the
recorder promises when it arrives over HTTP.
"""

from __future__ import annotations

from collections.abc import Callable
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import settings
from app.features.uploads.scan import request_scan, scan_state_for

TOKEN = "an-identity-token-for-tests"
AUDIENCE = "https://quill-backend-test-123.europe-west2.run.app"
SCAN_JOB = "run-scan@project.iam.gserviceaccount.com"

ENDPOINT = "/api/ci/uploads/scan-complete"
BUCKET = "passports-bucket"
KEY = "ab/cd/one/files/sha256/ab/cd/abcd1234"


def _verifier_returning(email: str) -> Callable[[str, str], dict[str, object]]:
    def verify(token: str, audience: str) -> dict[str, object]:
        assert audience == AUDIENCE

        if token != TOKEN:
            raise ValueError("Could not verify token signature.")

        return {"email": email, "email_verified": True}

    return verify


@pytest.fixture()
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "TEACHING_JOB_CALLBACK_AUDIENCE", AUDIENCE)
    monkeypatch.setattr(settings, "TEACHING_JOB_CALLBACK_CALLERS", SCAN_JOB)
    monkeypatch.setattr(
        "app.deps._verify_google_id_token", _verifier_returning(SCAN_JOB)
    )


@pytest.fixture()
def requested(db_session: Session) -> None:
    with patch("app.features.uploads.scan._start_job"):
        request_scan(db_session, BUCKET, KEY)
    db_session.commit()


def _post(client: TestClient, token: str | None = TOKEN, **overrides: object):
    body: dict[str, object] = {
        "bucket": BUCKET,
        "object_key": KEY,
        "verdict": "clean",
        "signature": None,
        "definitions": "ClamAV 1.0.7/27460/Tue Oct 14 08:00:00 2026",
    }
    body.update(overrides)
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    return client.post(ENDPOINT, json=body, headers=headers)


def test_with_nothing_configured_nobody_may_report(
    test_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "TEACHING_JOB_CALLBACK_AUDIENCE", None)

    assert _post(test_client).status_code == 503


def test_no_token_is_refused(test_client: TestClient, configured) -> None:
    assert _post(test_client, token=None).status_code == 401


def test_the_wrong_token_is_refused(
    test_client: TestClient, configured
) -> None:
    assert _post(test_client, token="wrong").status_code == 401


def test_a_caller_the_backend_was_not_told_about_is_refused(
    test_client: TestClient, configured, monkeypatch, requested, db_session
) -> None:
    monkeypatch.setattr(
        "app.deps._verify_google_id_token",
        _verifier_returning("run-other@project.iam.gserviceaccount.com"),
    )

    assert _post(test_client).status_code == 401
    assert scan_state_for(db_session, BUCKET, KEY) == "pending"


def test_a_clean_verdict_is_recorded(
    test_client: TestClient, configured, requested, db_session
) -> None:
    resp = _post(test_client)

    assert resp.status_code == 200, resp.text
    assert resp.json() == {"recorded": True, "verdict": "clean"}
    db_session.expire_all()
    assert scan_state_for(db_session, BUCKET, KEY) == "clean"


def test_an_infected_verdict_deletes_the_object(
    test_client: TestClient, configured, requested, db_session
) -> None:
    with patch("app.features.uploads.scan.delete_object") as deleted:
        resp = _post(
            test_client, verdict="infected", signature="Eicar-Signature"
        )

    assert resp.status_code == 200, resp.text
    deleted.assert_called_once_with(BUCKET, KEY)
    db_session.expire_all()
    assert scan_state_for(db_session, BUCKET, KEY) == "infected"


def test_a_failed_verdict_is_recorded(
    test_client: TestClient, configured, requested, db_session
) -> None:
    resp = _post(test_client, verdict="failed", signature="object not found")

    assert resp.status_code == 200, resp.text
    db_session.expire_all()
    assert scan_state_for(db_session, BUCKET, KEY) == "failed"


def test_a_verdict_nobody_asked_for_is_404(
    test_client: TestClient, configured
) -> None:
    resp = _post(test_client)

    assert resp.status_code == 404
    assert resp.json() == {"detail": "No scan was requested for that object"}


def test_a_verdict_outside_the_vocabulary_is_malformed(
    test_client: TestClient, configured, requested
) -> None:
    assert _post(test_client, verdict="suspicious").status_code == 422


def test_a_field_nobody_asked_for_is_malformed(
    test_client: TestClient, configured, requested
) -> None:
    assert _post(test_client, extra="field").status_code == 422
