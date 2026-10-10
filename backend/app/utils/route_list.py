"""Every route an app serves, however deeply its router was included.

`app.routes` used to be that list. Since FastAPI 0.141 it is not: a
router added with `include_router` is held as one entry, and its routes
are worked out when a request arrives. Walking `app.routes` then finds
the four documentation routes and nothing else, without an error, so
anything that checks "every route" checks none and passes.

`served_routes` asks FastAPI for the routes the way it resolves them
itself, so a check or a test built on it sees what a request would.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from typing import Any

from fastapi import FastAPI
from fastapi.dependencies.models import Dependant
from fastapi.routing import APIRoute, APIRouter, iter_route_contexts


@dataclass(frozen=True)
class ServedRoute:
    """One route as a request meets it.

    `path` carries every prefix it was included under, and `dependant`
    every dependency, those given to an `include_router` call as well as
    the route's own.
    """

    path: str
    methods: frozenset[str]
    endpoint: Callable[..., Any]
    dependant: Dependant
    route: APIRoute


def served_routes(app: FastAPI | APIRouter) -> Iterator[ServedRoute]:
    """Yield every API route of an app or a router.

    Routes that are not API routes, such as the OpenAPI document and the
    docs pages, are left out: they have no endpoint of ours to check.
    """
    for context in iter_route_contexts(app.routes):
        route = context.original_route

        if not isinstance(route, APIRoute):
            continue

        yield ServedRoute(
            path=context.path or route.path,
            methods=frozenset(context.methods or ()),
            endpoint=context.endpoint or route.endpoint,
            dependant=context.dependant,
            route=route,
        )


def dependency_calls(dependant: Dependant) -> Iterator[Callable[..., Any]]:
    """Yield every function a dependant calls, its dependencies' too."""
    for dependency in dependant.dependencies:
        if dependency.call is not None:
            yield dependency.call

        yield from dependency_calls(dependency)
