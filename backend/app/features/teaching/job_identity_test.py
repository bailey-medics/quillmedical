"""Tests for `mint_identity_token`, the job's side of `require_job_identity`."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs, urlparse

import pytest

from app.features.teaching.job_identity import (
    METADATA_IDENTITY_URL,
    mint_identity_token,
)

AUDIENCE = "https://quill-backend-test-123.europe-west2.run.app"


def _stub_metadata(
    body: bytes = b"signed-token", side_effect: Exception | None = None
) -> tuple[Any, dict[str, Any]]:
    """Patch `urlopen` to play the metadata server, and expose the request."""
    captured: dict[str, Any] = {}

    def _fake(request: Any, timeout: float | None = None) -> Any:
        captured["url"] = request.full_url
        captured["headers"] = {k.lower(): v for k, v in request.header_items()}
        captured["timeout"] = timeout

        if side_effect is not None:
            raise side_effect

        response = MagicMock()
        response.read.return_value = body
        response.__enter__ = lambda s: s
        response.__exit__ = lambda *a: False

        return response

    return patch("urllib.request.urlopen", side_effect=_fake), captured


def test_asks_the_metadata_server_for_the_audience() -> None:
    stub, captured = _stub_metadata()

    with stub:
        token = mint_identity_token(AUDIENCE)

    assert token == "signed-token"
    assert captured["url"].startswith(METADATA_IDENTITY_URL + "?")
    assert parse_qs(urlparse(captured["url"]).query) == {
        "audience": [AUDIENCE]
    }
    assert captured["headers"]["metadata-flavor"] == "Google"


def test_the_token_is_stripped_of_the_newline_the_server_may_add() -> None:
    stub, _ = _stub_metadata(body=b"signed-token\n")

    with stub:
        assert mint_identity_token(AUDIENCE) == "signed-token"


@pytest.mark.parametrize(
    "exc",
    [
        OSError("no route to host"),
        TimeoutError("timed out"),
        ValueError("bad status line"),
    ],
    ids=["unreachable", "timeout", "garbled"],
)
def test_an_unreachable_server_gives_none_and_says_why(
    exc: Exception, capsys: pytest.CaptureFixture[str]
) -> None:
    # A laptop, or a test: there is no metadata server, and the job must
    # carry on rather than crash after an hour of work.
    stub, _ = _stub_metadata(side_effect=exc)

    with stub:
        assert mint_identity_token(AUDIENCE) is None

    assert "could not mint an identity token" in capsys.readouterr().err


def test_an_empty_answer_gives_none(
    capsys: pytest.CaptureFixture[str],
) -> None:
    stub, _ = _stub_metadata(body=b"  \n")

    with stub:
        assert mint_identity_token(AUDIENCE) is None

    assert "empty token" in capsys.readouterr().err


def test_a_bounded_timeout_is_set() -> None:
    # Without one a stalled metadata server holds the job open for as
    # long as the job's own timeout allows.
    stub, captured = _stub_metadata()

    with stub:
        mint_identity_token(AUDIENCE)

    assert isinstance(captured["timeout"], int | float)
    assert 0 < captured["timeout"] <= 30
