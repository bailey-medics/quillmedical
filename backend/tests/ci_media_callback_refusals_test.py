"""The exact words the video job callbacks refuse a caller in.

``ci_transcode_complete_test.py`` pins the status of most of these.
These pin the words with it, through the real routes, so neither can
drift. The routes share one guard, ``require_job_identity``, and so one
set of refusals, so every test here runs against each. The guard's own
branches are covered in ``app/deps_job_identity_test.py``; here it is
enough that each route is behind it.

Three refusals are about the request and are answered by the route
itself. The fourth, an upload that is not there, is about the content
and comes from ``app.features.teaching.ci_media``.
"""

from collections.abc import Callable
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import settings
from app.features.teaching.models import ModuleMediaLink

TOKEN = "an-identity-token-for-tests"
AUDIENCE = "https://quill-backend-test-123.europe-west2.run.app"
TRANSCODE_JOB = "run-transcode@project.iam.gserviceaccount.com"

TRANSCODE = "/api/ci/teaching/transcode-complete"
CAPTION = "/api/ci/teaching/caption-complete"
NO_SPEECH = "/api/ci/teaching/no-speech"
POSTER = "/api/ci/teaching/poster-complete"

_IDS: dict[str, object] = {
    "org_id": 1,
    "module_id": "test-bank",
    "asset_id": "asset-1",
}

#: Each route with a well-formed report for it.
CALLBACKS = [
    pytest.param(
        TRANSCODE, {**_IDS, "outputs": ["asset-1-720p.mp4"]}, id="transcode"
    ),
    pytest.param(CAPTION, dict(_IDS), id="caption"),
    pytest.param(NO_SPEECH, dict(_IDS), id="no-speech"),
    pytest.param(
        POSTER, {**_IDS, "outputs": ["asset-1-poster.jpg"]}, id="poster"
    ),
]

each_callback = pytest.mark.parametrize(("endpoint", "body"), CALLBACKS)


def _verifier_returning(email: str) -> Callable[[str, str], dict[str, object]]:
    """Google's verifier stood in for: `TOKEN` is the one token it signs."""

    def verify(token: str, audience: str) -> dict[str, object]:
        assert audience == AUDIENCE

        if token != TOKEN:
            raise ValueError("Could not verify token signature.")

        return {"email": email, "email_verified": True}

    return verify


@pytest.fixture()
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
    """The audience and callers set, as Terraform arranges in teaching,
    and the verifier answering for the transcode job."""
    monkeypatch.setattr(settings, "TEACHING_JOB_CALLBACK_AUDIENCE", AUDIENCE)
    monkeypatch.setattr(
        settings, "TEACHING_JOB_CALLBACK_CALLERS", TRANSCODE_JOB
    )
    monkeypatch.setattr(
        "app.deps._verify_google_id_token", _verifier_returning(TRANSCODE_JOB)
    )


@pytest.fixture()
def upload(db_session: Session) -> ModuleMediaLink:
    """An upload whose jobs have not yet reported."""
    row = ModuleMediaLink(
        organisation_id=1,
        org_unit_id=1,
        question_bank_id="test-bank",
        media_key="lecture-01",
        asset_id="asset-1",
        original_filename="lecture.mp4",
        content_type="video/mp4",
        size_bytes=1024,
        uploaded_at=datetime.now(UTC),
    )
    db_session.add(row)
    db_session.commit()
    db_session.refresh(row)

    return row


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@each_callback
def test_with_nothing_configured_nobody_may_report(
    test_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    endpoint: str,
    body: dict[str, object],
) -> None:
    monkeypatch.setattr(settings, "TEACHING_JOB_CALLBACK_AUDIENCE", None)
    monkeypatch.setattr(settings, "TEACHING_JOB_CALLBACK_CALLERS", None)

    resp = test_client.post(endpoint, json=body, headers=_bearer("anything"))

    assert resp.status_code == 503
    assert resp.json() == {"detail": "Job callback not configured"}


@each_callback
def test_a_report_with_no_bearer_token_is_refused(
    test_client: TestClient,
    configured: None,
    endpoint: str,
    body: dict[str, object],
) -> None:
    resp = test_client.post(endpoint, json=body)

    assert resp.status_code == 401
    assert resp.json() == {"detail": "Missing Bearer token"}


@each_callback
def test_a_header_that_is_not_a_bearer_token_is_refused(
    test_client: TestClient,
    configured: None,
    endpoint: str,
    body: dict[str, object],
) -> None:
    resp = test_client.post(
        endpoint, json=body, headers={"Authorization": f"Basic {TOKEN}"}
    )

    assert resp.status_code == 401
    assert resp.json() == {"detail": "Missing Bearer token"}


@each_callback
def test_the_wrong_token_is_refused(
    test_client: TestClient,
    configured: None,
    endpoint: str,
    body: dict[str, object],
) -> None:
    resp = test_client.post(
        endpoint, json=body, headers=_bearer("wrong-token")
    )

    assert resp.status_code == 401
    assert resp.json() == {"detail": "Invalid token"}


@each_callback
def test_an_upload_that_is_not_there_is_refused(
    test_client: TestClient,
    configured: None,
    endpoint: str,
    body: dict[str, object],
) -> None:
    resp = test_client.post(endpoint, json=body, headers=_bearer(TOKEN))

    assert resp.status_code == 404
    assert resp.json() == {"detail": "No such media asset"}


@each_callback
def test_the_wrong_token_is_refused_before_the_upload_is_looked_for(
    test_client: TestClient,
    configured: None,
    endpoint: str,
    body: dict[str, object],
) -> None:
    """Both are wrong here: the token, and an upload that is not there."""
    resp = test_client.post(
        endpoint, json=body, headers=_bearer("wrong-token")
    )

    assert resp.status_code == 401


@each_callback
def test_the_wrong_token_writes_nothing(
    test_client: TestClient,
    configured: None,
    upload: ModuleMediaLink,
    db_session: Session,
    endpoint: str,
    body: dict[str, object],
) -> None:
    resp = test_client.post(
        endpoint, json=body, headers=_bearer("wrong-token")
    )

    db_session.refresh(upload)

    assert resp.status_code == 401
    assert upload.transcoded_at is None
    assert upload.has_captions is False
    assert upload.caption_started_at is None


@each_callback
def test_a_report_with_a_field_nobody_asked_for_is_refused_as_malformed(
    test_client: TestClient,
    configured: None,
    endpoint: str,
    body: dict[str, object],
) -> None:
    """Said once the caller has proved itself: the guard is a dependency,
    so it answers before the body is read, and a caller with nothing to
    show learns nothing about the shape of a report."""
    resp = test_client.post(
        endpoint, json={**body, "extra": "field"}, headers=_bearer(TOKEN)
    )

    assert resp.status_code == 422


@each_callback
def test_the_guard_answers_before_the_body_is_read(
    test_client: TestClient,
    configured: None,
    endpoint: str,
    body: dict[str, object],
) -> None:
    resp = test_client.post(endpoint, json={**body, "extra": "field"})

    assert resp.status_code == 401
    assert resp.json() == {"detail": "Missing Bearer token"}


def test_a_transcode_report_answers_with_the_flags_it_set(
    test_client: TestClient, configured: None, upload: ModuleMediaLink
) -> None:
    resp = test_client.post(
        TRANSCODE,
        json={
            **_IDS,
            "outputs": [
                "asset-1.vtt",
                "asset-1-poster.jpg",
                "asset-1-720p.mp4",
            ],
        },
        headers=_bearer(TOKEN),
    )

    assert resp.status_code == 200
    assert resp.json() == {
        "recorded": True,
        "flags": ["has_poster", "has_captions"],
    }


def test_a_caption_report_answers_that_it_was_recorded(
    test_client: TestClient, configured: None, upload: ModuleMediaLink
) -> None:
    resp = test_client.post(CAPTION, json=dict(_IDS), headers=_bearer(TOKEN))

    assert resp.status_code == 200
    assert resp.json() == {"recorded": True}


# --- Which identities are listed ---


@each_callback
def test_a_listed_job_identity_reaches_the_route(
    test_client: TestClient,
    configured: None,
    upload: ModuleMediaLink,
    endpoint: str,
    body: dict[str, object],
) -> None:
    resp = test_client.post(endpoint, json=body, headers=_bearer(TOKEN))

    assert resp.status_code == 200


@each_callback
def test_an_unlisted_job_identity_is_refused(
    test_client: TestClient,
    configured: None,
    monkeypatch: pytest.MonkeyPatch,
    endpoint: str,
    body: dict[str, object],
) -> None:
    monkeypatch.setattr(
        "app.deps._verify_google_id_token",
        _verifier_returning("somebody-else@project.iam.gserviceaccount.com"),
    )

    resp = test_client.post(endpoint, json=body, headers=_bearer(TOKEN))

    assert resp.status_code == 401
    assert resp.json() == {"detail": "Invalid token"}
