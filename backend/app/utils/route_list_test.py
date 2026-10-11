"""Tests for walking every route an app serves."""

from __future__ import annotations

from fastapi import APIRouter, Depends, FastAPI

from app.utils.route_list import dependency_calls, served_routes


def _guard() -> None:
    return None


def _inner_guard() -> None:
    return None


def _nested_app() -> FastAPI:
    """An app whose routes sit one and two includes deep."""
    app = FastAPI()
    outer = APIRouter(prefix="/api")
    inner = APIRouter(prefix="/things")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @outer.get("/top")
    def top() -> dict[str, str]:
        return {}

    @inner.post("/make", dependencies=[Depends(_inner_guard)])
    def make() -> dict[str, str]:
        return {}

    outer.include_router(inner, dependencies=[Depends(_guard)])
    app.include_router(outer)

    return app


def _by_path(app: FastAPI) -> dict[str, frozenset[str]]:
    return {route.path: route.methods for route in served_routes(app)}


def test_a_route_on_the_app_itself_is_found() -> None:
    assert _by_path(_nested_app())["/health"] == frozenset({"GET"})


def test_a_route_in_an_included_router_is_found_with_its_prefix() -> None:
    assert _by_path(_nested_app())["/api/top"] == frozenset({"GET"})


def test_a_route_two_includes_deep_is_found_with_both_prefixes() -> None:
    assert _by_path(_nested_app())["/api/things/make"] == frozenset({"POST"})


def test_the_docs_pages_are_left_out() -> None:
    paths = _by_path(_nested_app())

    assert "/openapi.json" not in paths
    assert "/docs" not in paths


def test_the_endpoint_is_the_function_that_was_decorated() -> None:
    by_path = {route.path: route for route in served_routes(_nested_app())}

    assert by_path["/api/things/make"].endpoint.__name__ == "make"


def test_a_dependency_on_the_route_is_seen() -> None:
    by_path = {route.path: route for route in served_routes(_nested_app())}
    calls = set(dependency_calls(by_path["/api/things/make"].dependant))

    assert _inner_guard in calls


def test_a_dependency_given_to_include_router_is_seen() -> None:
    """A guard on the include is as real as one on the route."""
    by_path = {route.path: route for route in served_routes(_nested_app())}
    calls = set(dependency_calls(by_path["/api/things/make"].dependant))

    assert _guard in calls


def test_a_route_outside_the_guarded_include_does_not_carry_it() -> None:
    by_path = {route.path: route for route in served_routes(_nested_app())}
    calls = set(dependency_calls(by_path["/api/top"].dependant))

    assert _guard not in calls


def test_a_router_can_be_walked_without_an_app() -> None:
    router = APIRouter(prefix="/r")

    @router.get("/one")
    def one() -> dict[str, str]:
        return {}

    assert [route.path for route in served_routes(router)] == ["/r/one"]


def test_the_real_app_serves_well_over_a_hundred_routes() -> None:
    """The floor: walking the real app and finding a handful is the
    fault this module exists for, and it passes every other test."""
    from app.main import app

    routes = list(served_routes(app))

    assert len(routes) > 100
    assert any(route.path == "/api/auth/me" for route in routes)
