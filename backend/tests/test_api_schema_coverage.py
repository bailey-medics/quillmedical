"""Tests for the API schema coverage checker.

Covers schema-opacity detection (including recursive `$ref` resolution),
marker scanning against synthetic route files, and the combined
marker-vs-schema check — including that the permanent marker is verified
against the function's actual return type, not just trusted.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from scripts.check_api_schema_coverage import (
    GRANDFATHERED_MARKER,
    PERMANENT_ALLOWED_RETURN_TYPES,
    PERMANENT_MARKER,
    RouteInfo,
    _index_file,
    check_route_coverage,
    is_opaque_schema,
)

# ---------------------------------------------------------------------------
# is_opaque_schema
# ---------------------------------------------------------------------------


def test_typed_object_with_properties_is_not_opaque() -> None:
    schema = {"type": "object", "properties": {"name": {"type": "string"}}}
    assert is_opaque_schema(schema, {}) is False


def test_bare_object_with_no_properties_is_opaque() -> None:
    assert is_opaque_schema({"type": "object"}, {}) is True


def test_dict_str_x_with_additional_properties_is_opaque() -> None:
    # dict[str, X] renders as additionalProperties with no `properties` key
    # — still arbitrary keys, still opaque per-field even though typed.
    schema = {
        "type": "object",
        "additionalProperties": {"type": "string"},
    }
    assert is_opaque_schema(schema, {}) is True


def test_none_schema_is_opaque() -> None:
    assert is_opaque_schema(None, {}) is True


def test_empty_schema_is_opaque() -> None:
    assert is_opaque_schema({}, {}) is True


def test_primitive_schema_is_not_opaque() -> None:
    assert is_opaque_schema({"type": "string"}, {}) is False
    assert is_opaque_schema({"type": "integer"}, {}) is False
    assert is_opaque_schema({"type": "boolean"}, {}) is False


def test_bare_array_of_untyped_objects_is_opaque() -> None:
    schema = {"type": "array", "items": {"type": "object"}}
    assert is_opaque_schema(schema, {}) is True


def test_array_of_typed_objects_is_not_opaque() -> None:
    schema = {
        "type": "array",
        "items": {
            "type": "object",
            "properties": {"id": {"type": "string"}},
        },
    }
    assert is_opaque_schema(schema, {}) is False


def test_ref_to_typed_model_is_not_opaque() -> None:
    schema = {"$ref": "#/components/schemas/Foo"}
    schemas = {
        "Foo": {"type": "object", "properties": {"id": {"type": "string"}}}
    }
    assert is_opaque_schema(schema, schemas) is False


def test_ref_to_opaque_model_is_opaque() -> None:
    schema = {"$ref": "#/components/schemas/Foo"}
    schemas = {"Foo": {"type": "object"}}
    assert is_opaque_schema(schema, schemas) is True


def test_ref_inside_array_items_is_resolved() -> None:
    # $ref reappears at a nested depth (items) — must be resolved there
    # too, not just once up front.
    schema = {"type": "array", "items": {"$ref": "#/components/schemas/Foo"}}
    schemas = {"Foo": {"type": "object"}}
    assert is_opaque_schema(schema, schemas) is True


def test_optional_wrapped_typed_model_is_not_opaque() -> None:
    # SomeModel | None
    schema = {
        "anyOf": [
            {"$ref": "#/components/schemas/Foo"},
            {"type": "null"},
        ]
    }
    schemas = {
        "Foo": {"type": "object", "properties": {"id": {"type": "string"}}}
    }
    assert is_opaque_schema(schema, schemas) is False


def test_optional_wrapped_opaque_dict_is_opaque() -> None:
    # dict[str, Any] | None — the opaque branch still makes the field
    # impossible to diff.
    schema = {
        "anyOf": [
            {"type": "object"},
            {"type": "null"},
        ]
    }
    assert is_opaque_schema(schema, {}) is True


def test_ref_inside_union_branch_is_resolved() -> None:
    schema = {
        "anyOf": [
            {"$ref": "#/components/schemas/Foo"},
            {"type": "null"},
        ]
    }
    schemas = {"Foo": {"type": "object"}}  # opaque
    assert is_opaque_schema(schema, schemas) is True


# ---------------------------------------------------------------------------
# Marker scanning (_index_file)
# ---------------------------------------------------------------------------


def _write_route_file(
    tmp_path: Path,
    *,
    marker: str | None = None,
    method: str = "get",
    func_name: str = "handler",
    return_annotation: str = "",
    router_name: str = "router",
) -> Path:
    marker_line = f"{marker}\n" if marker else ""
    annotation = f" -> {return_annotation}" if return_annotation else ""
    source = (
        "from fastapi import APIRouter\n\n"
        f"{router_name} = APIRouter()\n\n\n"
        f"{marker_line}"
        f'@{router_name}.{method}("/x")\n'
        f"def {func_name}(){annotation}:\n"
        "    return {}\n"
    )
    path = tmp_path / "routes.py"
    path.write_text(source)
    return path


def test_index_file_finds_route_with_no_marker(tmp_path: Path) -> None:
    path = _write_route_file(tmp_path, func_name="foo")
    index = _index_file(path)
    assert index["foo"].marker is None


def test_index_file_finds_grandfathered_marker(tmp_path: Path) -> None:
    path = _write_route_file(
        tmp_path, marker=GRANDFATHERED_MARKER, func_name="foo"
    )
    index = _index_file(path)
    assert index["foo"].marker == GRANDFATHERED_MARKER


def test_index_file_finds_permanent_marker(tmp_path: Path) -> None:
    path = _write_route_file(
        tmp_path, marker=PERMANENT_MARKER, func_name="foo"
    )
    index = _index_file(path)
    assert index["foo"].marker == PERMANENT_MARKER


def test_index_file_rejects_marker_with_trailing_text(tmp_path: Path) -> None:
    """The marker line must match exactly — no appended reason or other
    trailing text. A marker is a fixed, static line, not a per-route
    customisable comment."""
    path = _write_route_file(
        tmp_path,
        marker=f"{PERMANENT_MARKER}  # serves raw bytes",
        func_name="foo",
    )
    index = _index_file(path)
    assert index["foo"].marker is None


def test_index_file_captures_return_type(tmp_path: Path) -> None:
    path = _write_route_file(
        tmp_path, func_name="foo", return_annotation="FileResponse"
    )
    index = _index_file(path)
    assert index["foo"].return_type == "FileResponse"


def test_index_file_strips_dotted_and_generic_return_types(
    tmp_path: Path,
) -> None:
    path = _write_route_file(
        tmp_path, func_name="foo", return_annotation="dict[str, Any]"
    )
    index = _index_file(path)
    assert index["foo"].return_type == "dict"


def test_index_file_works_with_non_default_router_name(
    tmp_path: Path,
) -> None:
    # Mirrors real route files, e.g. `teaching_router` instead of `router`.
    path = _write_route_file(
        tmp_path, router_name="teaching_router", func_name="foo"
    )
    index = _index_file(path)
    assert "foo" in index


def test_index_file_ignores_non_route_functions(tmp_path: Path) -> None:
    source = "def not_a_route():\n    return None\n"
    path = tmp_path / "helpers.py"
    path.write_text(source)
    assert _index_file(path) == {}


# ---------------------------------------------------------------------------
# check_route_coverage
# ---------------------------------------------------------------------------


def _spec(
    *, path: str = "/x", method: str = "get", schema: dict[str, Any] | None
) -> dict[str, Any]:
    responses: dict[str, Any] = {"200": {}}
    if schema is not None:
        responses["200"]["content"] = {"application/json": {"schema": schema}}
    return {
        "paths": {path: {method: {"responses": responses}}},
        "components": {"schemas": {}},
    }


def _route(
    *, marker: str | None = None, return_type: str | None = None
) -> RouteInfo:
    return RouteInfo(
        method="get",
        path="/x",
        file=Path("routes.py"),
        line=1,
        marker=marker,
        return_type=return_type,
    )


def test_typed_route_passes() -> None:
    schema = {"type": "object", "properties": {"id": {"type": "string"}}}
    problems = check_route_coverage(_route(), _spec(schema=schema))
    assert problems == []


def test_opaque_route_with_no_marker_fails() -> None:
    schema = {"type": "object"}
    problems = check_route_coverage(_route(), _spec(schema=schema))
    assert len(problems) == 1
    assert "no field-level shape" in problems[0].message


def test_opaque_route_with_grandfathered_marker_passes() -> None:
    schema = {"type": "object"}
    route = _route(marker=GRANDFATHERED_MARKER)
    problems = check_route_coverage(route, _spec(schema=schema))
    assert problems == []


def test_permanent_marker_passes_for_each_recognised_response_class() -> None:
    # A bug that only recognises FileResponse (the one class actually
    # used in this codebase today) and silently mishandles the other
    # four would pass a test suite that only ever exercises FileResponse
    # — so every recognised class gets its own case here.
    schema = {"type": "object"}
    for return_type in sorted(PERMANENT_ALLOWED_RETURN_TYPES):
        route = _route(marker=PERMANENT_MARKER, return_type=return_type)
        problems = check_route_coverage(route, _spec(schema=schema))
        assert problems == [], f"expected pass for {return_type}"


def test_permanent_marker_fails_for_unrecognised_return_type() -> None:
    schema = {"type": "object"}
    route = _route(marker=PERMANENT_MARKER, return_type="dict")
    problems = check_route_coverage(route, _spec(schema=schema))
    assert len(problems) == 1
    assert "not a recognised non-JSON response class" in problems[0].message


def test_permanent_marker_fails_when_return_type_unannotated() -> None:
    schema = {"type": "object"}
    route = _route(marker=PERMANENT_MARKER, return_type=None)
    problems = check_route_coverage(route, _spec(schema=schema))
    assert len(problems) == 1
    assert "unannotated" in problems[0].message
