"""Tests for `require_job_identity` in `app.deps`.

The route tests show each callback is behind the guard. These show
which requests the guard itself lets through, one condition at a time,
with the Google verifier stood in for: a real token needs the metadata
server, which a test has no business reaching.
"""

from __future__ import annotations

import time
from collections.abc import Callable
from pathlib import Path
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


def jwt_header(fields: dict[str, Any]) -> str:
    """A token's first part, as it is written."""
    import base64
    import json

    raw = json.dumps(fields).encode()

    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


# --- The end-to-end stack's own signing key ---
#
# In the test stack the token is signed with a key made for the run,
# not by Google. These sign real tokens with a key made here, so the
# signature, audience, expiry and issuer are all checked for real.


@pytest.fixture()
def test_key(
    identity_configured: None,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> Callable[..., str]:
    """Point the guard at a fresh public key; return a token signer."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from google.auth import crypt, jwt

    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = private.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public = tmp_path / "public.pem"
    public.write_bytes(
        private.public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )
    monkeypatch.setattr(
        settings, "TEACHING_JOB_CALLBACK_TEST_KEY_FILE", str(public)
    )
    signer = crypt.RSASigner.from_string(pem)

    def sign(**overrides: Any) -> str:
        now = int(time.time())
        payload: dict[str, Any] = {
            "iss": "https://accounts.google.com",
            "aud": AUDIENCE,
            "email": TRANSCODE_JOB,
            "email_verified": True,
            "iat": now,
            "exp": now + 300,
        }
        payload.update(overrides)
        token: bytes = jwt.encode(signer, payload)  # type: ignore[no-untyped-call]

        return token.decode()

    return sign


def test_a_token_signed_with_the_test_key_passes(
    test_key: Callable[..., str],
) -> None:
    caller = require_job_identity(_request(f"Bearer {test_key()}"))

    assert caller == TRANSCODE_JOB


def test_a_token_signed_with_another_key_is_refused(
    test_key: Callable[..., str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    other = tmp_path / "other.pem"
    other.write_bytes(
        rsa.generate_private_key(public_exponent=65537, key_size=2048)
        .public_key()
        .public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )
    token = test_key()
    monkeypatch.setattr(
        settings, "TEACHING_JOB_CALLBACK_TEST_KEY_FILE", str(other)
    )

    assert _refusal(f"Bearer {token}").status_code == 401


@pytest.mark.parametrize(
    "overrides",
    [
        {"aud": "https://somewhere-else.run.app"},
        {"iss": "https://example.com"},
        {"exp": 1_000},
        {"email": "someone@example.com"},
        {"email_verified": False},
    ],
    ids=["audience", "issuer", "expired", "unlisted", "unverified"],
)
def test_a_test_signed_token_is_checked_as_googles_are(
    test_key: Callable[..., str], overrides: dict[str, Any]
) -> None:
    assert _refusal(f"Bearer {test_key(**overrides)}").status_code == 401


def test_a_test_signed_token_naming_another_algorithm_is_refused(
    test_key: Callable[..., str],
) -> None:
    """Only RS256: the header is checked before the signature is."""
    header, claims, signature = test_key().split(".")
    other = jwt_header({"alg": "ES256", "typ": "JWT"})

    assert _refusal(f"Bearer {other}.{claims}.{signature}").status_code == 401
    assert header != other


def test_a_test_key_that_cannot_be_read_refuses_rather_than_raises(
    test_key: Callable[..., str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = test_key()
    monkeypatch.setattr(
        settings,
        "TEACHING_JOB_CALLBACK_TEST_KEY_FILE",
        str(tmp_path / "missing.pem"),
    )

    assert _refusal(f"Bearer {token}").status_code == 401
