"""How large a request body may be, and the middleware that enforces it.

Almost every request to this API is a small piece of JSON, so the limit
is small: one megabyte. A request model with a text field that has no
length of its own is still bounded by this, which is the cheapest
protection there is against a caller sending a book as a name.

A few routes take a file, and each is listed here with a limit of its
own. They are named by method and by the path the route is written
with, and `body_limit_test.py` checks that every one is a route the app
really serves, so a route that is renamed cannot quietly lose its limit
and fall back to one megabyte.

The limit is enforced twice, because one check is not enough. The
`Content-Length` header is read first, which refuses an honest oversize
request before any of it is read. Then the bytes are counted as they
arrive, which stops a request that left the header out, as a chunked
one does, or that lied in it.
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

MEGABYTE = 1024 * 1024

#: Any request not named below.
DEFAULT_LIMIT = 1 * MEGABYTE

#: Routes that take more, by method and the path they are written with.
LARGER: dict[tuple[str, str], int] = {
    # One piece of passport evidence. The route itself stops a file at
    # 8 MB by counting what it reads; this leaves room on top for the
    # multipart framing, so a file a little over is answered by the
    # route, which knows it is evidence, and not here.
    ("POST", "/api/passport/{passport_id}/evidence"): 10 * MEGABYTE,
    # A mailing list as a spreadsheet file, which the importer stops at
    # 2 MB. Sent once to be checked and once to be imported.
    ("POST", "/api/newsletter/mailing-list/check"): 3 * MEGABYTE,
    ("POST", "/api/newsletter/mailing-list/import"): 3 * MEGABYTE,
    # A whole lecture, on a developer's machine only. The route refuses
    # outright wherever a media bucket is configured, since the browser
    # then uploads straight to the bucket, and it streams to disk in
    # chunks. A ceiling is still set, so a runaway upload cannot fill a
    # disk.
    (
        "PUT",
        "/api/teaching/admin/modules/{module_id}/media/{asset_id}/content",
    ): 2048
    * MEGABYTE,
}


def _pattern(path: str) -> re.Pattern[str]:
    """A route's path as a pattern: `{name}` stands for one path part."""
    parts = re.split(r"\{[^}]+\}", path)

    return re.compile("^" + "[^/]+".join(map(re.escape, parts)) + "/?$")


_LARGER_PATTERNS: list[tuple[str, re.Pattern[str], int]] = [
    (method, _pattern(path), limit) for (method, path), limit in LARGER.items()
]


def limit_for(method: str, path: str) -> int:
    """The most bytes a request to this method and path may carry."""
    for larger_method, pattern, limit in _LARGER_PATTERNS:
        if method == larger_method and pattern.match(path):
            return limit

    return DEFAULT_LIMIT


Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
App = Callable[[Scope, Receive, Send], Awaitable[None]]


class BodyLimitMiddleware:
    """Refuses a request whose body is over the limit for its route.

    Written against ASGI itself and not as an `@app.middleware("http")`
    function, because only here can the body be counted as it arrives.
    """

    def __init__(self, app: App) -> None:
        self.app = app

    async def __call__(
        self, scope: Scope, receive: Receive, send: Send
    ) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        limit = limit_for(scope["method"], scope["path"])
        declared = _declared_length(scope)

        if declared is not None and declared > limit:
            await _refuse(send)
            return

        received = 0
        started = False
        refused = False

        async def counting_receive() -> Message:
            nonlocal received, refused

            if refused:
                return {"type": "http.disconnect"}

            message = await receive()

            if message["type"] == "http.request":
                received += len(message.get("body", b""))

                if received > limit:
                    # Answer now, and tell the app the caller has gone.
                    # Raising here would not do: a route reading JSON
                    # catches whatever its body throws and answers 400.
                    refused = True

                    if not started:
                        await _refuse(send)

                    return {"type": "http.disconnect"}

            return message

        async def noting_send(message: Message) -> None:
            nonlocal started

            if refused:
                return

            if message["type"] == "http.response.start":
                started = True

            await send(message)

        try:
            await self.app(scope, counting_receive, noting_send)
        except Exception:
            # The app was told the caller had gone and may well object.
            # The caller has its answer already.
            if not refused:
                raise


def _declared_length(scope: Scope) -> int | None:
    """What `Content-Length` says, or None when it is absent or not a
    number. A header that is not a number is left for the server to
    refuse; the count of bytes still applies."""
    for name, value in scope.get("headers", []):
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None

    return None


async def _refuse(send: Send) -> None:
    """Answer 413, in plain text as this limit always has."""
    body = b"Request body too large"

    await send(
        {
            "type": "http.response.start",
            "status": 413,
            "headers": [
                (b"content-type", b"text/plain; charset=utf-8"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})
