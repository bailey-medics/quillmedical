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

import pytest
from pydantic import BaseModel, ValidationError

from tests.request_models import collect, name_of, request_models

# Models that take fields they do not name, and why each does. Empty,
# and meant to stay so. The push subscription was here, as a shape the
# browser sets; the frontend now picks out the fields it sends.
ALLOWS_EXTRA: dict[str, str] = {}

# The app has 78 request models, read by 78 routes. Far fewer means the
# walk has stopped finding them, and a walk that finds nothing passes.
MIN_MODELS = 60
MIN_ROUTES_WITH_A_BODY = 60


def _forbids_extra(model: type[BaseModel]) -> bool:
    return model.model_config.get("extra") == "forbid"


def test_the_walk_finds_the_request_models() -> None:
    models, routes_with_a_body = request_models()

    assert len(models) >= MIN_MODELS
    assert routes_with_a_body >= MIN_ROUTES_WITH_A_BODY


def test_every_request_model_forbids_extra_fields() -> None:
    models, _ = request_models()

    loose = sorted(
        name_of(model)
        for model in models
        if not _forbids_extra(model) and name_of(model) not in ALLOWS_EXTRA
    )

    assert loose == [], (
        "These request models take fields they do not name. Give each "
        '`model_config = ConfigDict(extra="forbid")`, or list it in '
        f"ALLOWS_EXTRA with the reason: {loose}"
    )


def test_every_listed_exception_still_needs_listing() -> None:
    models, _ = request_models()
    by_name = {name_of(model): model for model in models}

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

    collect(Outer, found)

    assert found == {Outer, Middle, Inner}


def test_a_route_refuses_a_field_its_model_does_not_name() -> None:
    """One real model, to show the setting does what the walk assumes."""
    from app.features.teaching.schemas import StartAssessmentIn

    StartAssessmentIn.model_validate({"question_bank_id": "bank-1"})

    with pytest.raises(ValidationError, match="is_admin"):
        StartAssessmentIn.model_validate(
            {"question_bank_id": "bank-1", "is_admin": True}
        )
