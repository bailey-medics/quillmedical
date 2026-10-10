"""Tests for `require_csrf` in `app.deps`.

The route tests show a route refuses a request with no token. These show
which requests the check itself lets through, one condition at a time.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.deps import require_csrf
from app.models import User
from app.security import make_csrf


def _user(username: str = "alice") -> User:
    return cast(User, SimpleNamespace(username=username))


def _request(*, header: str | None, cookie: str | None) -> Request:
    headers: list[tuple[bytes, bytes]] = []

    if header is not None:
        headers.append((b"x-csrf-token", header.encode()))
    if cookie is not None:
        headers.append((b"cookie", f"XSRF-TOKEN={cookie}".encode()))

    scope: dict[str, Any] = {"type": "http", "headers": headers}

    return Request(scope)


def test_a_matching_header_and_cookie_signed_for_the_user_passes() -> None:
    user = _user()
    token = make_csrf(user.username)

    assert require_csrf(_request(header=token, cookie=token), user) is user


def test_no_header_is_refused() -> None:
    token = make_csrf("alice")

    with pytest.raises(HTTPException) as refused:
        require_csrf(_request(header=None, cookie=token), _user())

    assert refused.value.status_code == 403


def test_no_cookie_is_refused() -> None:
    token = make_csrf("alice")

    with pytest.raises(HTTPException) as refused:
        require_csrf(_request(header=token, cookie=None), _user())

    assert refused.value.status_code == 403


def test_a_header_that_differs_from_the_cookie_is_refused() -> None:
    """What another site can manage: the browser sends the cookie, and
    the header is a guess."""
    token = make_csrf("alice")

    with pytest.raises(HTTPException) as refused:
        require_csrf(_request(header="a-guess", cookie=token), _user())

    assert refused.value.status_code == 403


def test_a_token_signed_for_somebody_else_is_refused() -> None:
    """Both halves match, but the token is another user's."""
    token = make_csrf("mallory")

    with pytest.raises(HTTPException) as refused:
        require_csrf(_request(header=token, cookie=token), _user("alice"))

    assert refused.value.status_code == 403


def test_a_token_nobody_signed_is_refused() -> None:
    with pytest.raises(HTTPException) as refused:
        require_csrf(_request(header="made-up", cookie="made-up"), _user())

    assert refused.value.status_code == 403
