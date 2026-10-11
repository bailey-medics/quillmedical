"""Tests for the limit on the size of a request body.

Three layers. `limit_for` alone, which is a lookup. The middleware over
a hand-built ASGI app, where a request can be made to lie about its
length, which no test client will do. And the real app, to show the
middleware is in place and that every route given a larger limit is a
route the app serves.
"""

from __future__ import annotations

from collections.abc import Iterator, MutableMapping
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.body_limit import (
    DEFAULT_LIMIT,
    LARGER,
    MEGABYTE,
    BodyLimitMiddleware,
    limit_for,
)
from app.main import app
from app.utils.route_list import served_routes

EVIDENCE = "/api/passport/12/evidence"
MEDIA = "/api/teaching/admin/modules/a-module/media/abc123/content"


class TestLimitFor:
    def test_an_ordinary_request_gets_one_megabyte(self) -> None:
        assert DEFAULT_LIMIT == MEGABYTE
        assert limit_for("POST", "/api/auth/login") == MEGABYTE

    @pytest.mark.parametrize(
        "method,path,megabytes",
        [
            ("POST", EVIDENCE, 10),
            ("POST", "/api/newsletter/mailing-list/check", 3),
            ("POST", "/api/newsletter/mailing-list/import", 3),
            ("PUT", MEDIA, 2048),
        ],
    )
    def test_a_route_that_takes_a_file_gets_its_own(
        self, method: str, path: str, megabytes: int
    ) -> None:
        assert limit_for(method, path) == megabytes * MEGABYTE

    def test_a_trailing_slash_does_not_lose_the_limit(self) -> None:
        assert limit_for("POST", EVIDENCE + "/") == 10 * MEGABYTE

    @pytest.mark.parametrize(
        "method,path",
        [
            # Another method on the same path.
            ("GET", EVIDENCE),
            ("POST", MEDIA),
            # A neighbour of a larger route, and a path that only ends
            # or starts like one.
            ("POST", "/api/teaching/admin/modules/a-module/media/upload-url"),
            ("POST", "/api/passport/12/evidence/34"),
            ("POST", "/api/passport/12/34/evidence"),
            ("POST", "/elsewhere/api/passport/12/evidence"),
            ("PUT", MEDIA + "/extra"),
            ("PUT", "/api/teaching/admin/modules/a/b/media/abc123/content"),
        ],
    )
    def test_nothing_else_does(self, method: str, path: str) -> None:
        assert limit_for(method, path) == DEFAULT_LIMIT


async def _swallow(scope: Any, receive: Any, send: Any) -> None:
    """An app that reads its whole body and says how long it was."""
    total = 0

    while True:
        message = await receive()
        total += len(message.get("body", b""))
        if not message.get("more_body"):
            break

    body = str(total).encode()

    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": body})


async def _call(
    *,
    chunks: list[bytes],
    declared: str | None,
    method: str = "POST",
    path: str = "/api/anything",
) -> tuple[int, bytes]:
    """Send a request through the middleware by hand: its body in
    chunks, and whatever `Content-Length` it claims, true or not."""
    headers = []

    if declared is not None:
        headers.append((b"content-length", declared.encode()))

    scope = {
        "type": "http",
        "method": method,
        "path": path,
        "headers": headers,
    }
    pending: Iterator[bytes] = iter(chunks)
    sent: list[MutableMapping[str, Any]] = []

    async def receive() -> dict[str, Any]:
        chunk = next(pending, None)

        if chunk is None:
            return {"type": "http.request", "body": b"", "more_body": False}

        return {"type": "http.request", "body": chunk, "more_body": True}

    async def send(message: MutableMapping[str, Any]) -> None:
        sent.append(message)

    await BodyLimitMiddleware(_swallow)(scope, receive, send)

    status = next(m["status"] for m in sent if "status" in m)
    body = b"".join(m.get("body", b"") for m in sent)

    return status, body


HALF = b"x" * (MEGABYTE // 2)


class TestTheMiddleware:
    @pytest.mark.anyio
    async def test_a_body_at_the_limit_goes_through(self) -> None:
        status, body = await _call(chunks=[HALF, HALF], declared=str(MEGABYTE))

        assert status == 200
        assert body == str(MEGABYTE).encode()

    @pytest.mark.anyio
    async def test_a_body_that_says_it_is_too_big_is_refused_unread(
        self,
    ) -> None:
        status, body = await _call(chunks=[], declared=str(MEGABYTE + 1))

        assert status == 413
        assert body == b"Request body too large"

    @pytest.mark.anyio
    async def test_a_body_with_no_length_is_stopped_by_counting(self) -> None:
        """A chunked request sends no `Content-Length` at all."""
        status, _ = await _call(chunks=[HALF, HALF, b"x"], declared=None)

        assert status == 413

    @pytest.mark.anyio
    async def test_a_body_that_lies_about_its_length_is_stopped(self) -> None:
        status, _ = await _call(chunks=[HALF, HALF, HALF], declared="10")

        assert status == 413

    @pytest.mark.anyio
    async def test_a_length_that_is_not_a_number_does_not_lift_the_limit(
        self,
    ) -> None:
        status, _ = await _call(chunks=[HALF, HALF, HALF], declared="lots")

        assert status == 413

    @pytest.mark.anyio
    async def test_a_larger_route_takes_what_an_ordinary_one_refuses(
        self,
    ) -> None:
        chunks = [HALF] * 6

        ordinary, _ = await _call(chunks=list(chunks), declared=None)
        evidence, _ = await _call(
            chunks=list(chunks), declared=None, path=EVIDENCE
        )

        assert ordinary == 413
        assert evidence == 200

    @pytest.mark.anyio
    async def test_a_larger_route_still_has_a_ceiling(self) -> None:
        status, _ = await _call(
            chunks=[], declared=str(11 * MEGABYTE), path=EVIDENCE
        )

        assert status == 413

    @pytest.mark.anyio
    async def test_what_is_not_http_is_left_alone(self) -> None:
        seen: list[str] = []

        async def inner(scope: Any, receive: Any, send: Any) -> None:
            seen.append(scope["type"])

        await BodyLimitMiddleware(inner)({"type": "lifespan"}, None, None)  # type: ignore[arg-type]

        assert seen == ["lifespan"]


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


class TestTheRealApp:
    def test_an_oversized_request_is_refused(
        self, test_client: TestClient
    ) -> None:
        response = test_client.post(
            "/api/auth/login",
            content=b"x",
            headers={"Content-Length": str(MEGABYTE + 1)},
        )

        assert response.status_code == 413

    def test_an_oversized_body_is_refused_whatever_it_claims(
        self, test_client: TestClient
    ) -> None:
        """Sent in pieces, so there is no `Content-Length` to read."""

        def pieces() -> Iterator[bytes]:
            for _ in range(3):
                yield HALF

        response = test_client.post("/api/auth/login", content=pieces())

        assert response.status_code == 413

    def test_an_ordinary_request_is_not(self, test_client: TestClient) -> None:
        response = test_client.post(
            "/api/auth/login",
            json={"username": "nobody", "password": "wrong"},
        )

        assert response.status_code != 413

    def test_the_media_upload_takes_a_lecture(
        self, test_client: TestClient
    ) -> None:
        """Past the size check. What it fails on afterwards, a session
        or a missing module, is not this middleware's business."""
        response = test_client.put(
            MEDIA,
            content=b"x",
            headers={
                "Content-Length": str(50 * MEGABYTE),
                "Content-Type": "video/mp4",
            },
        )

        assert response.status_code != 413

    def test_the_media_upload_still_has_a_ceiling(
        self, test_client: TestClient
    ) -> None:
        response = test_client.put(
            MEDIA,
            content=b"x",
            headers={
                "Content-Length": str(3 * 1024 * MEGABYTE),
                "Content-Type": "video/mp4",
            },
        )

        assert response.status_code == 413

    def test_every_larger_limit_belongs_to_a_route_the_app_serves(
        self,
    ) -> None:
        """A route that is renamed must not quietly fall back to one
        megabyte, and a limit must not outlive its route."""
        served = {
            (method, route.path)
            for route in served_routes(app)
            for method in route.methods
        }

        missing = sorted(key for key in LARGER if key not in served)

        assert missing == []

    def test_every_route_that_takes_a_file_has_a_larger_limit(self) -> None:
        """The other direction: a new upload route with no entry would
        be capped at one megabyte and look broken."""
        from fastapi import UploadFile

        takes_a_file = {
            (method, route.path)
            for route in served_routes(app)
            for method in route.methods
            for param in route.dependant.body_params
            if param.field_info.annotation is UploadFile
        }

        assert takes_a_file
        assert sorted(takes_a_file - set(LARGER)) == []
