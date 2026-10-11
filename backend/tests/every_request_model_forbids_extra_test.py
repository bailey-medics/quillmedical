"""Every request body refuses a field it does not name.

A Pydantic model ignores a field it has no place for, unless told
otherwise. So a caller can send `is_admin: true` to a route whose model
has no such field and be told nothing is wrong. That is harmless until
the day the model is handed whole to something that does read it, and
it hides a client that has drifted from the API: a field renamed on one
side only is dropped in silence, and the save appears to work.

So this walks every route the app serves, collects the models a request
body is read into, and those nested inside them, and checks each one is
set to forbid extra fields. A model that must take whatever it is sent
is named in `ALLOWS_EXTRA`, with the reason.

`ALLOWS_EXTRA` fails the build in both directions. A new model that
does not forbid fails until it does or is listed, and an entry whose
model has since been tightened, renamed or removed fails until the
entry is taken out.
"""

from __future__ import annotations

from typing import Any, get_args

import pytest
from pydantic import BaseModel, ValidationError

from app.main import app
from app.utils.route_list import served_routes

# Models that take fields they do not name, and why each does.
ALLOWS_EXTRA: dict[str, str] = {
    "app.push.PushSubscriptionIn": (
        "The body is the browser's own PushSubscription, a shape the "
        "web standard sets and a browser may add to. Refusing a new "
        "field would stop notifications being turned on in that browser."
    ),
    "app.push.PushKeys": (
        "The keys inside the browser's PushSubscription, as above."
    ),
}

# The app has 78 request models, read by 78 routes. Far fewer means the
# walk has stopped finding them, and a walk that finds nothing passes.
MIN_MODELS = 60
MIN_ROUTES_WITH_A_BODY = 60


def _name(model: type[BaseModel]) -> str:
    return f"{model.__module__}.{model.__qualname__}"


def _collect(annotation: Any, found: set[type[BaseModel]]) -> None:
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
            _collect(field.annotation, found)

        return

    for inner in get_args(annotation):
        _collect(inner, found)


def _request_models() -> tuple[set[type[BaseModel]], int]:
    """Every model a request body is read into, and how many routes
    read one."""
    found: set[type[BaseModel]] = set()
    routes_with_a_body = 0

    for served in served_routes(app):
        body_params = served.dependant.body_params

        if body_params:
            routes_with_a_body += 1

        for param in body_params:
            _collect(param.field_info.annotation, found)

    return found, routes_with_a_body


def _forbids_extra(model: type[BaseModel]) -> bool:
    return model.model_config.get("extra") == "forbid"


def test_the_walk_finds_the_request_models() -> None:
    models, routes_with_a_body = _request_models()

    assert len(models) >= MIN_MODELS
    assert routes_with_a_body >= MIN_ROUTES_WITH_A_BODY


def test_every_request_model_forbids_extra_fields() -> None:
    models, _ = _request_models()

    loose = sorted(
        _name(model)
        for model in models
        if not _forbids_extra(model) and _name(model) not in ALLOWS_EXTRA
    )

    assert loose == [], (
        "These request models take fields they do not name. Give each "
        '`model_config = ConfigDict(extra="forbid")`, or list it in '
        f"ALLOWS_EXTRA with the reason: {loose}"
    )


def test_every_listed_exception_still_needs_listing() -> None:
    models, _ = _request_models()
    by_name = {_name(model): model for model in models}

    stale = sorted(
        name
        for name in ALLOWS_EXTRA
        if name not in by_name or _forbids_extra(by_name[name])
    )

    assert stale == [], (
        "These are listed in ALLOWS_EXTRA but are no longer request "
        f"models that allow extra fields. Take them out: {stale}"
    )


def test_every_listed_exception_says_why() -> None:
    assert all(reason.strip() for reason in ALLOWS_EXTRA.values())


def test_the_collector_follows_nested_and_optional_models() -> None:
    """The walk is only as good as this: a model inside a list or an
    optional, or inside another model, is still read from the request."""

    class Inner(BaseModel):
        value: int

    class Middle(BaseModel):
        inner: Inner | None = None

    class Outer(BaseModel):
        middles: list[Middle]

    found: set[type[BaseModel]] = set()

    _collect(Outer, found)

    assert found == {Outer, Middle, Inner}


def test_a_route_refuses_a_field_its_model_does_not_name() -> None:
    """One real model, to show the setting does what the walk assumes."""
    from app.features.teaching.schemas import StartAssessmentIn

    StartAssessmentIn.model_validate({"question_bank_id": "bank-1"})

    with pytest.raises(ValidationError, match="is_admin"):
        StartAssessmentIn.model_validate(
            {"question_bank_id": "bank-1", "is_admin": True}
        )
