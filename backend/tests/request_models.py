"""Every model a request body is read into, for tests that check them all.

Walks the routes the app serves, not the modules the models are written
in, so a model counts when a request can reach it and not otherwise.
"""

from __future__ import annotations

from typing import Any, get_args

from pydantic import BaseModel

from app.main import app
from app.utils.route_list import served_routes


def name_of(model: type[BaseModel]) -> str:
    return f"{model.__module__}.{model.__qualname__}"


def collect(annotation: Any, found: set[type[BaseModel]]) -> None:
    """Add every model in a type to `found`, and those inside them.

    A type may be a model, or hold one: `list[Model]`, `Model | None`.
    A model's own fields are followed the same way, since a field that
    is itself a model is read from the same request.
    """
    if isinstance(annotation, type) and issubclass(annotation, BaseModel):
        model: type[BaseModel] = annotation

        if model in found:
            return

        found.add(model)

        for field in model.model_fields.values():
            collect(field.annotation, found)

        return

    for inner in get_args(annotation):
        collect(inner, found)


def request_models() -> tuple[set[type[BaseModel]], int]:
    """Every model a request body is read into, and how many routes
    read one."""
    found: set[type[BaseModel]] = set()
    routes_with_a_body = 0

    for served in served_routes(app):
        body_params = served.dependant.body_params

        if body_params:
            routes_with_a_body += 1

        for param in body_params:
            collect(param.field_info.annotation, found)

    return found, routes_with_a_body
