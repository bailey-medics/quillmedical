"""Every way a file gets in is either scanned for malware or says why not.

Every upload is scanned before it is served (Phase 4 of
``docs/docs/plans/2026-10-18-upload-safety-plan.md``). That only holds
while every new way in remembers to ask for the scan, and a route that
forgot would work, pass its tests and read like its neighbours. So this
looks for the ways in, and fails until each is accounted for.

Two walks, because a file can arrive two ways:

* **A route that takes one in**: a body parameter that is an
  ``UploadFile``, an endpoint that reads the raw request body, or one
  that hands out a URL a browser uploads to. Each is listed in
  ``UPLOADS``.
* **Code that writes to a bucket**, wherever its bytes came from: a file
  could arrive inside a JSON body and never look like an upload to the
  first walk. Each call site is listed in ``BUCKET_WRITES``.

Both lists fail in both directions, as ``PUBLIC`` does in
``every_route_is_guarded_test.py``: a new way in fails until it is
listed, and a listed one that has gone fails until it is taken out, so
neither list can drift from the code. Each reason says which: ``scanned:``
and how, or ``exempt:`` / ``not an upload:`` and why.
"""

from __future__ import annotations

import ast
import inspect
import textwrap
from collections.abc import Callable
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Request, UploadFile

from app.main import app
from app.utils.route_list import ServedRoute, served_routes

RouteKey = tuple[str, str]

APP = Path(__file__).resolve().parent.parent / "app"

#: Every route that takes a file in, and how it is dealt with.
UPLOADS: dict[RouteKey, str] = {
    ("POST", "/api/passport/{passport_id}/evidence"): (
        "scanned: upload_evidence asks for the scan once the blob is "
        "stored, and the attachment is held back until it is clean"
    ),
    ("POST", "/api/teaching/admin/modules/{module_id}/media/upload-url"): (
        "scanned: the browser uploads to the source bucket on this URL; "
        "link_upload asks for the scan, and only a clean verdict starts "
        "the transcode. An upload never linked is never served, and the "
        "bucket's lifecycle rule deletes it"
    ),
    (
        "PUT",
        "/api/teaching/admin/modules/{module_id}/media/{asset_id}/content",
    ): (
        "exempt: development only. It refuses wherever a bucket is "
        "configured, and development has no scan job"
    ),
    ("POST", "/api/newsletter/mailing-list/check"): (
        "exempt: a CSV read in memory and parsed as text; nothing is "
        "stored, served or handed to anyone"
    ),
    ("POST", "/api/newsletter/mailing-list/import"): (
        "exempt: a CSV read in memory and parsed as text; only the "
        "contacts parsed from it are kept, as rows"
    ),
}

#: Every call that writes to a bucket, keyed by ``module:function``
#: (the enclosing function) and the call's name.
BUCKET_WRITES: dict[tuple[str, str], str] = {
    ("app.features.passport.router:upload_evidence", "put"): (
        "scanned: the one caller of the blob store's put, and it asks "
        "for the scan straight after"
    ),
    ("app.features.passport.gcs_store:put", "upload_from_string"): (
        "scanned: the blob store's own write, reached only through "
        "upload_evidence above"
    ),
    ("app.features.passport.gcs_store:_upload", "upload_from_string"): (
        "not an upload: the passport's git bundle, which this backend "
        "builds from the records; no file a person sent is in it as such"
    ),
    (
        "app.features.teaching.router:create_media_upload_url",
        "create_resumable_upload_url",
    ): (
        "scanned: the URL a browser uploads a lecture to; link_upload "
        "asks for the scan before anything reads the file"
    ),
    (
        "app.features.teaching.storage:write_caption_object",
        "upload_from_string",
    ): (
        "not an upload: WebVTT text typed into the caption editor and "
        "checked to begin WEBVTT, sent as JSON rather than as a file"
    ),
}

#: What, read off a request, means the raw body is being taken.
_RAW_BODY = frozenset({"stream", "body", "form"})

#: Functions that hand a browser somewhere to upload to.
_UPLOAD_URLS = frozenset({"create_resumable_upload_url"})

#: Calls that write bytes to a bucket.
_WRITES = frozenset(
    {
        "upload_from_string",
        "upload_from_filename",
        "upload_from_file",
        "create_resumable_upload_url",
    }
)


def _takes_an_upload_file(route: ServedRoute) -> bool:
    for field in route.dependant.body_params:
        annotation = getattr(field.field_info, "annotation", None)
        if annotation is not None and "UploadFile" in repr(annotation):
            return True

    return False


def _calls_in(function: Callable[..., Any]) -> list[ast.Call]:
    try:
        source = textwrap.dedent(inspect.getsource(function))
    except OSError, TypeError:
        return []

    return [
        node
        for node in ast.walk(ast.parse(source))
        if isinstance(node, ast.Call)
    ]


def _call_name(call: ast.Call) -> str | None:
    if isinstance(call.func, ast.Name):
        return call.func.id

    if isinstance(call.func, ast.Attribute):
        return call.func.attr

    return None


def _reads_a_file(function: Callable[..., Any]) -> bool:
    for call in _calls_in(function):
        func = call.func

        if (
            isinstance(func, ast.Attribute)
            and func.attr in _RAW_BODY
            and isinstance(func.value, ast.Name)
            and func.value.id == "request"
        ):
            return True

        if _call_name(call) in _UPLOAD_URLS:
            return True

    return False


def takes_a_file(route: ServedRoute) -> bool:
    """Whether a route lets a file in, by any of the three ways."""
    return _takes_an_upload_file(route) or _reads_a_file(route.endpoint)


def _routes_taking_files(target: FastAPI) -> set[RouteKey]:
    found: set[RouteKey] = set()

    for route in served_routes(target):
        if takes_a_file(route):
            found.update((method, route.path) for method in route.methods)

    return found


def bucket_writes_in(tree: ast.AST, module: str) -> set[tuple[str, str]]:
    """Each call writing to a bucket, as (``module:function``, call)."""
    found: set[tuple[str, str]] = set()

    def visit(node: ast.AST, enclosing: str) -> None:
        for child in ast.iter_child_nodes(node):
            name = enclosing

            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                name = child.name

            if isinstance(child, ast.Call):
                called = _call_name(child)
                is_put = (
                    called == "put"
                    and isinstance(child.func, ast.Attribute)
                    and isinstance(child.func.value, ast.Name)
                    and child.func.value.id == "blobs"
                )
                if called in _WRITES or is_put:
                    found.add((f"{module}:{enclosing}", str(called)))

            visit(child, name)

    visit(tree, "<module>")

    return found


def _bucket_writes() -> set[tuple[str, str]]:
    found: set[tuple[str, str]] = set()

    for path in sorted(APP.rglob("*.py")):
        if path.name.endswith("_test.py"):
            continue

        module = ".".join(path.relative_to(APP.parent).with_suffix("").parts)
        found |= bucket_writes_in(ast.parse(path.read_text()), module)

    return found


class TestTheWalksCanFail:
    """A walk that found nothing would pass every test below."""

    def test_the_route_walk_sees_the_app(self) -> None:
        assert len(list(served_routes(app))) > 100

    def test_the_route_walk_finds_the_known_uploads(self) -> None:
        assert len(_routes_taking_files(app)) >= 4

    def test_an_unlisted_upload_route_is_caught(self) -> None:
        planted = FastAPI()

        @planted.post("/planted")
        async def planted_upload(file: UploadFile) -> None:
            return None

        @planted.put("/planted-raw")
        async def planted_raw(request: Request) -> None:
            async for _chunk in request.stream():
                pass

        @planted.get("/not-an-upload")
        def not_an_upload() -> None:
            return None

        assert _routes_taking_files(planted) == {
            ("POST", "/planted"),
            ("PUT", "/planted-raw"),
        }

    def test_the_bucket_walk_finds_the_known_writes(self) -> None:
        assert len(_bucket_writes()) >= 4

    def test_an_unlisted_bucket_write_is_caught(self) -> None:
        tree = ast.parse(textwrap.dedent("""
                def save(bucket, data, blobs):
                    bucket.blob("x").upload_from_string(data)
                    blobs.put("p", data)
                    other.put("p", data)
                """))

        assert bucket_writes_in(tree, "planted") == {
            ("planted:save", "upload_from_string"),
            ("planted:save", "put"),
        }


class TestEveryUploadRouteIsAccountedFor:
    def test_no_upload_route_is_unlisted(self) -> None:
        """A new route that takes a file: ask for the scan, then list
        it here as scanned, or list it as exempt and say why."""
        assert _routes_taking_files(app) - set(UPLOADS) == set()

    def test_no_listed_route_has_gone(self) -> None:
        assert set(UPLOADS) - _routes_taking_files(app) == set()

    def test_every_entry_says_scanned_or_exempt(self) -> None:
        assert [
            key
            for key, why in UPLOADS.items()
            if not why.startswith(("scanned: ", "exempt: "))
        ] == []


class TestEveryBucketWriteIsAccountedFor:
    def test_no_bucket_write_is_unlisted(self) -> None:
        """New code that writes to a bucket: if what it writes came from
        a person, it is scanned before it is served; list it here and
        say which."""
        assert _bucket_writes() - set(BUCKET_WRITES) == set()

    def test_no_listed_write_has_gone(self) -> None:
        assert set(BUCKET_WRITES) - _bucket_writes() == set()

    def test_every_entry_says_scanned_or_not_an_upload(self) -> None:
        assert [
            key
            for key, why in BUCKET_WRITES.items()
            if not why.startswith(("scanned: ", "not an upload: "))
        ] == []
