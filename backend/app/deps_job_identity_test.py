"""Tests for `require_job_identity` in `app.deps`.

The route tests show each callback is behind the guard. These show
which requests the guard itself lets through, one condition at a time,
with the Google verifier stood in for: a real token needs the metadata
server, which a test has no business reaching.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from fastapi import HTTPException
from google.auth.exceptions import TransportError
from starlette.requests import Request

from app.config import settings
from app.deps import require_job_identity

AUDIENCE = "https://quill-backend-test-123.europe-west2.run.app"
TRANSCODE_JOB = "run-transcode@project.iam.gserviceaccount.com"
CAPTION_JOB = "run-caption@project.iam.gserviceaccount.com"

Verifier = Callable[[str, str], dict[str, Any]]


def _request(authorization: str | None) -> Request:
    headers: list[tuple[bytes, bytes]] = []

    if authorization is not None:
        headers.append((b"authorization", authorization.encode()))

    scope: dict[str, Any] = {"type": "http", "headers": headers}

    return Request(scope)


def _claims(**overrides: Any) -> Verifier:
    """A verifier that accepts any token and answers these claims."""
    claims: dict[str, Any] = {
        "email": TRANSCODE_JOB,
        "email_verified": True,
    }
    claims.update(overrides)

    def verify(token: str, audience: str) -> dict[str, Any]:
        assert audience == AUDIENCE

        return dict(claims)

    return verify


def _raising(exc: Exception) -> Verifier:
    def verify(token: str, audience: str) -> dict[str, Any]:
        raise exc

    return verify


def _never_called(token: str, audience: str) -> dict[str, Any]:
    raise AssertionError("the verifier should not have been consulted")


@pytest.fixture()
def nothing_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "TEACHING_JOB_CALLBACK_AUDIENCE", None)
    monkeypatch.setattr(settings, "TEACHING_JOB_CALLBACK_CALLERS", None)


@pytest.fixture()
def identity_configured(
    nothing_configured: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "TEACHING_JOB_CALLBACK_AUDIENCE", AUDIENCE)
    monkeypatch.setattr(
        settings,
        "TEACHING_JOB_CALLBACK_CALLERS",
        f"{TRANSCODE_JOB}, {CAPTION_JOB}",
    )


@pytest.fixture()
def verifier(monkeypatch: pytest.MonkeyPatch) -> Callable[[Verifier], None]:
    def install(fake: Verifier) -> None:
        monkeypatch.setattr("app.deps._verify_google_id_token", fake)

    return install


def _refusal(authorization: str | None) -> HTTPException:
    with pytest.raises(HTTPException) as caught:
        require_job_identity(_request(authorization))

    return caught.value


# --- Nothing configured: development ---


def test_with_nothing_configured_every_caller_gets_503(
    nothing_configured: None, verifier: Callable[[Verifier], None]
) -> None:
    verifier(_claims())

    exc = _refusal("Bearer a-token")

    assert exc.status_code == 503
    assert exc.detail == "Job callback not configured"


def test_an_audience_with_no_callers_is_not_configured(
    nothing_configured: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "TEACHING_JOB_CALLBACK_AUDIENCE", AUDIENCE)

    assert _refusal("Bearer anything").status_code == 503


def test_callers_with_no_audience_are_not_configured(
    nothing_configured: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        settings, "TEACHING_JOB_CALLBACK_CALLERS", TRANSCODE_JOB
    )

    assert _refusal("Bearer anything").status_code == 503


# --- The header itself ---


def test_no_authorization_header_is_refused(
    identity_configured: None,
) -> None:
    exc = _refusal(None)

    assert exc.status_code == 401
    assert exc.detail == "Missing Bearer token"


def test_a_header_that_is_not_bearer_is_refused(
    identity_configured: None,
) -> None:
    exc = _refusal("Basic a-token")

    assert exc.status_code == 401
    assert exc.detail == "Missing Bearer token"


# --- The job's identity ---


def test_a_verified_listed_caller_passes_and_is_named(
    identity_configured: None, verifier: Callable[[Verifier], None]
) -> None:
    verifier(_claims(email=CAPTION_JOB))

    assert require_job_identity(_request("Bearer a-token")) == CAPTION_JOB


def test_callers_match_whatever_case_the_token_uses(
    identity_configured: None, verifier: Callable[[Verifier], None]
) -> None:
    # The settings list is lower-cased on parse; the claim is compared
    # as given. Google issues these lower case, so this pins that a
    # mixed-case claim is not quietly let through either.
    verifier(_claims(email=CAPTION_JOB.upper()))

    assert _refusal("Bearer a-token").status_code == 401


def test_an_unlisted_caller_is_refused(
    identity_configured: None, verifier: Callable[[Verifier], None]
) -> None:
    verifier(_claims(email="someone-else@project.iam.gserviceaccount.com"))

    exc = _refusal("Bearer a-token")

    assert exc.status_code == 401
    assert exc.detail == "Invalid token"


def test_an_unverified_email_is_refused(
    identity_configured: None, verifier: Callable[[Verifier], None]
) -> None:
    verifier(_claims(email_verified=False))

    assert _refusal("Bearer a-token").status_code == 401


def test_a_token_with_no_email_claim_is_refused(
    identity_configured: None, verifier: Callable[[Verifier], None]
) -> None:
    verifier(_claims(email=None))

    assert _refusal("Bearer a-token").status_code == 401


def test_a_token_google_will_not_verify_is_refused(
    identity_configured: None, verifier: Callable[[Verifier], None]
) -> None:
    verifier(_raising(ValueError("Token has wrong audience")))

    exc = _refusal("Bearer a-token")

    assert exc.status_code == 401
    assert exc.detail == "Invalid token"


def test_google_being_unreachable_refuses_rather_than_raises(
    identity_configured: None, verifier: Callable[[Verifier], None]
) -> None:
    verifier(_raising(TransportError("could not fetch certificates")))

    assert _refusal("Bearer a-token").status_code == 401
