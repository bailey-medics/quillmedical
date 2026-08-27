"""Static coverage check for API response schema typedness.

Imports the FastAPI app to generate the real OpenAPI spec (same as
``dump_openapi.py``), then walks every route's response schema for its
success status code and flags any that ``oasdiff`` cannot meaningfully
diff by field:

- A bare ``{"type": "object"}`` with no ``properties``
- ``dict[str, X]`` for a concrete ``X`` (renders as ``additionalProperties``
  with no ``properties`` — still arbitrary keys, still opaque per-field)
- A bare top-level array of untyped objects
- An ``Optional``/union-wrapped opaque return (``anyOf`` with an opaque
  non-null branch)
- No schema, or an empty schema

Two inline marker comments (mirroring ``DESTRUCTIVE_MARKER`` in
``check_migrations.py``), placed on the line immediately above a route's
topmost decorator:

    # api-schema-check: allow-opaque-grandfathered
    # api-schema-check: allow-opaque-permanent

``allow-opaque-grandfathered`` marks a pre-existing opaque route awaiting
retrofit (see docs/docs/plans/2026-08-25-api-schema-coverage-plan.md) —
removed once the route is given a typed Pydantic response model.
``allow-opaque-permanent`` marks a route that genuinely never returns
JSON (e.g. a binary ``FileResponse``). It is not just trusted: the
function's return annotation must actually be one of a small explicit
set of non-JSON Starlette/FastAPI response classes, or the check fails
even though the marker is present.

Run with::

    python backend/scripts/check_api_schema_coverage.py --all --dev
"""

from __future__ import annotations

import argparse
import ast
import inspect
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Make imports robust regardless of current working directory or how this
# script is invoked (pre-commit runs it as a bare script, not a package) —
# ensure the backend dir is on sys.path before importing the `scripts`
# package, mirroring dump_openapi.py's own bootstrap.
_HERE = Path(__file__).resolve()
_BACKEND_DIR = _HERE.parents[1]
sys.path.insert(0, str(_BACKEND_DIR))

from scripts.dump_openapi import import_app  # noqa: E402

GRANDFATHERED_MARKER = "# api-schema-check: allow-opaque-grandfathered"
PERMANENT_MARKER = "# api-schema-check: allow-opaque-permanent"

HTTP_METHODS: frozenset[str] = frozenset(
    {"get", "post", "put", "patch", "delete"}
)

# Non-JSON response classes recognised as legitimately opaque under the
# permanent marker. Matched against the *last dotted component* of the
# function's return annotation, so both `FileResponse` and
# `starlette.responses.FileResponse` match.
PERMANENT_ALLOWED_RETURN_TYPES: frozenset[str] = frozenset(
    {
        "FileResponse",
        "StreamingResponse",
        "PlainTextResponse",
        "RedirectResponse",
        "Response",
    }
)

DEFAULT_APP_DIR = _BACKEND_DIR / "app"

SEVERITY_ERROR = "error"


@dataclass(frozen=True)
class Problem:
    """A single check failure."""

    severity: str
    message: str
    path: Path | None = None
    line: int | None = None


@dataclass(frozen=True)
class RouteInfo:
    """A single (method, path) route, cross-referenced with its source."""

    method: str
    path: str
    file: Path
    line: int
    marker: str | None
    return_type: str | None


@dataclass(frozen=True)
class _FunctionEntry:
    """What the AST scan found for one route-decorated function."""

    line: int
    marker: str | None
    return_type: str | None


# ---------------------------------------------------------------------------
# Schema opacity
# ---------------------------------------------------------------------------


def _resolve_schema(
    schema: dict[str, Any] | None, schemas: dict[str, Any]
) -> dict[str, Any]:
    """Resolve a `$ref` to its target schema; pass through otherwise."""
    seen: set[str] = set()
    while isinstance(schema, dict) and "$ref" in schema:
        ref = schema["$ref"]
        if ref in seen:
            break  # defensive: cyclic $ref, treat remainder as unresolved
        seen.add(ref)
        name = ref.rsplit("/", 1)[-1]
        schema = schemas.get(name, {})
    return schema or {}


def is_opaque_schema(
    schema: dict[str, Any] | None, schemas: dict[str, Any]
) -> bool:
    """Return True if `oasdiff` cannot meaningfully diff `schema` by field.

    `$ref` is resolved as the first step of every call (not once up
    front) since it can reappear at any depth: an array's `items` can
    itself be a `$ref`, and a branch of `anyOf`/`oneOf` can be a `$ref`.
    """
    if not schema:
        return True
    schema = _resolve_schema(schema, schemas)
    if not schema:
        return True

    if "anyOf" in schema or "oneOf" in schema:
        branches = schema.get("anyOf") or schema.get("oneOf") or []
        for branch in branches:
            resolved = _resolve_schema(branch, schemas)
            if resolved.get("type") == "null":
                continue
            if is_opaque_schema(branch, schemas):
                return True
        return False

    if schema.get("type") == "array":
        return is_opaque_schema(schema.get("items"), schemas)

    if "properties" in schema:
        return False

    if schema.get("type") == "object" or schema.get("type") is None:
        # A bare object, a dict[str, X] (additionalProperties with no
        # properties), or a schema with no type info at all (Any).
        return True

    # A primitive (string/integer/boolean/number) or enum — trivially
    # diffable as a whole; no field-level shape is needed.
    return False


def _success_response_schema(
    operation: dict[str, Any],
) -> dict[str, Any] | None:
    """Return the response schema for `operation`'s success status code."""
    responses = operation.get("responses", {})
    for code in sorted(code for code in responses if code.startswith("2")):
        content = responses[code].get("content", {})
        json_content = content.get("application/json")
        if json_content and "schema" in json_content:
            return json_content["schema"]  # type: ignore[no-any-return]
    return None


# ---------------------------------------------------------------------------
# Route <-> source cross-referencing
# ---------------------------------------------------------------------------


def _decorator_is_http_route(decorator: ast.expr) -> bool:
    """Return True if `decorator` is `<name>.<verb>(...)` for a route verb."""
    func = decorator.func if isinstance(decorator, ast.Call) else decorator
    return isinstance(func, ast.Attribute) and func.attr in HTTP_METHODS


def _marker_above(lines: list[str], lineno: int) -> str | None:
    """Return the marker on the line immediately above 1-indexed `lineno`.

    Requires an exact match against the marker constant — no appended
    reason text or other trailing content. A marker is a fixed, static
    line, not a per-route customisable comment; allowing a suffix would
    invite exactly that impression without the checker ever reading it.
    """
    if lineno < 2:
        return None
    above = lines[lineno - 2].strip()
    if above == GRANDFATHERED_MARKER:
        return GRANDFATHERED_MARKER
    if above == PERMANENT_MARKER:
        return PERMANENT_MARKER
    return None


def _return_type_name(
    node: ast.FunctionDef | ast.AsyncFunctionDef,
) -> str | None:
    """Return the bare class name of the function's return annotation.

    Strips generic subscripts/unions down to the first component (e.g.
    `FileResponse` from `FileResponse`, `dict` from `dict[str, Any]`) and
    the dotted-path prefix (e.g. `FileResponse` from
    `starlette.responses.FileResponse`).
    """
    if node.returns is None:
        return None
    try:
        source = ast.unparse(node.returns)
    except Exception:
        return None
    for sep in ("[", " ", "|", ","):
        idx = source.find(sep)
        if idx != -1:
            source = source[:idx]
    return source.rsplit(".", 1)[-1] or None


def _index_file(path: Path) -> dict[str, _FunctionEntry]:
    """Parse `path` and index every HTTP-route-decorated function by name."""
    source = path.read_text(encoding="utf-8")
    lines = source.splitlines()
    tree = ast.parse(source, filename=str(path))
    index: dict[str, _FunctionEntry] = {}
    for node in ast.walk(tree):
        if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        if not node.decorator_list:
            continue
        if not any(_decorator_is_http_route(d) for d in node.decorator_list):
            continue
        topmost = node.decorator_list[0]
        index[node.name] = _FunctionEntry(
            line=topmost.lineno,
            marker=_marker_above(lines, topmost.lineno),
            return_type=_return_type_name(node),
        )
    return index


def collect_routes(
    app: Any, app_dir: Path
) -> tuple[list[RouteInfo], list[Problem]]:
    """Cross-reference the running app's routes with source decorators."""
    problems: list[Problem] = []
    file_indexes: dict[Path, dict[str, _FunctionEntry]] = {}
    routes: list[RouteInfo] = []

    for route in app.routes:
        endpoint = getattr(route, "endpoint", None)
        path = getattr(route, "path", None)
        methods = {m.lower() for m in (getattr(route, "methods", None) or ())}
        methods &= HTTP_METHODS
        if endpoint is None or path is None or not methods:
            continue

        # Decorators like slowapi's @limiter.limit(...) wrap the endpoint
        # in a function defined inside the decorator's own package —
        # unwrap (a no-op for undecorated functions) to reach the real
        # route function and its true source location.
        endpoint = inspect.unwrap(endpoint)

        try:
            source_file_str = inspect.getsourcefile(endpoint)
        except TypeError:
            source_file_str = None
        if not source_file_str:
            continue
        source_file = Path(source_file_str).resolve()
        try:
            source_file.relative_to(app_dir)
        except ValueError:
            continue  # not one of our own route files

        if source_file not in file_indexes:
            file_indexes[source_file] = _index_file(source_file)
        entry = file_indexes[source_file].get(endpoint.__name__)
        if entry is None:
            problems.append(
                Problem(
                    SEVERITY_ERROR,
                    "could not locate a route decorator for function "
                    f"'{endpoint.__name__}' ({path}); marker scanning "
                    "cannot verify this route",
                    source_file,
                )
            )
            continue

        for method in methods:
            routes.append(
                RouteInfo(
                    method=method,
                    path=path,
                    file=source_file,
                    line=entry.line,
                    marker=entry.marker,
                    return_type=entry.return_type,
                )
            )
    return routes, problems


# ---------------------------------------------------------------------------
# Combined check
# ---------------------------------------------------------------------------


def check_route_coverage(
    route: RouteInfo, spec: dict[str, Any]
) -> list[Problem]:
    """Check one route's marker against its actual schema/return type."""
    schemas = spec.get("components", {}).get("schemas", {})
    operation = spec.get("paths", {}).get(route.path, {}).get(route.method)
    if operation is None:
        return []  # route came from this same app; should not happen

    if route.marker == PERMANENT_MARKER:
        if route.return_type not in PERMANENT_ALLOWED_RETURN_TYPES:
            allowed = ", ".join(sorted(PERMANENT_ALLOWED_RETURN_TYPES))
            return [
                Problem(
                    SEVERITY_ERROR,
                    f"{route.method.upper()} {route.path}: permanent marker "
                    "present but the function's return type "
                    f"({route.return_type or 'unannotated'}) is not a "
                    f"recognised non-JSON response class ({allowed})",
                    route.file,
                    route.line,
                )
            ]
        return []

    schema = _success_response_schema(operation)
    if not is_opaque_schema(schema, schemas):
        return []

    if route.marker == GRANDFATHERED_MARKER:
        return []

    return [
        Problem(
            SEVERITY_ERROR,
            f"{route.method.upper()} {route.path}: response schema has no "
            "field-level shape for oasdiff to diff; add a Pydantic "
            f"response_model, or mark with '{GRANDFATHERED_MARKER}' "
            f"(temporary) or '{PERMANENT_MARKER}' (genuinely non-JSON)",
            route.file,
            route.line,
        )
    ]


def check_all(app: Any, app_dir: Path) -> list[Problem]:
    """Run the coverage check across every route in `app`."""
    spec: dict[str, Any] = app.openapi()
    routes, problems = collect_routes(app, app_dir)
    for route in routes:
        problems.extend(check_route_coverage(route, spec))
    return problems


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _format(problem: Problem) -> str:
    location = ""
    if problem.path is not None:
        location = str(problem.path)
        if problem.line is not None:
            location += f":{problem.line}"
        location += ": "
    return f"{problem.severity.upper()}: {location}{problem.message}"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Static coverage check for API response schema "
        "typedness."
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Check every route in the app (default).",
    )
    parser.add_argument(
        "--dev",
        action="store_true",
        help=(
            "Allow dev fallback values for JWT_SECRET, DATABASE_URL, "
            "and EHRBASE credentials so the app can be imported locally."
        ),
    )
    parser.add_argument(
        "--app-dir",
        type=Path,
        default=DEFAULT_APP_DIR,
        help="Path to the backend/app directory.",
    )
    args = parser.parse_args(argv)

    app = import_app(dev=args.dev)

    problems = check_all(app, args.app_dir.resolve())

    for problem in problems:
        print(_format(problem), file=sys.stderr)
    if problems:
        print(
            f"\n{len(problems)} API schema coverage error(s) found.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
