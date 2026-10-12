"""The fields that matter most have a limit on their length.

Every request body is capped as a whole by `app.body_limit`. This is the
finer rule on top: wherever a request model has a field for a password,
a username, a full name, an email address, a token or a one-time code,
that field says how long it may be. The limits are in
`app.schemas.limits`.

The test goes by the field's name, across every model a request body is
read into, so a new model with a `password` field is held to it without
being named here. A field that cannot have its limit yet is listed in
`NOT_YET` with the reason, and that list fails the build in both
directions: an entry whose field has since been given a limit, or has
gone, fails until the entry is taken out.
"""

from __future__ import annotations

from pydantic import BaseModel
from pydantic.fields import FieldInfo

from tests.request_models import name_of, request_models

# Field names that carry one of the values this rule is about.
LIMITED: frozenset[str] = frozenset(
    {
        "password",
        "current_password",
        "new_password",
        "username",
        "full_name",
        "email",
        "token",
        "totp_code",
        "code",
    }
)

# Fields that should have a limit and do not yet, and why. Empty since
# 12 October 2026, when the last eight were given theirs. It stays, with
# the test that checks it, so that the next exception has somewhere to
# be written down and cannot outlive its reason.
NOT_YET: dict[str, str] = {}

# The app has about thirty such fields. Far fewer means the walk has
# stopped finding them.
MIN_FIELDS = 20


def _holds_text(field: FieldInfo) -> bool:
    """Whether a field's value is, or may be, a string."""
    return "str" in repr(field.annotation)


def _has_limit(field: FieldInfo) -> bool:
    return any(
        getattr(part, "max_length", None) is not None
        for part in field.metadata
    )


def _fields() -> dict[str, FieldInfo]:
    """Every field this rule is about, by `module.Model.field`."""
    models, _ = request_models()
    found: dict[str, FieldInfo] = {}

    for model in models:
        for field_name, field in model.model_fields.items():
            if field_name in LIMITED and _holds_text(field):
                found[f"{name_of(model)}.{field_name}"] = field

    return found


def test_the_walk_finds_the_fields() -> None:
    assert len(_fields()) >= MIN_FIELDS


def test_every_such_field_has_a_limit() -> None:
    unbounded = sorted(
        name
        for name, field in _fields().items()
        if not _has_limit(field) and name not in NOT_YET
    )

    assert unbounded == [], (
        "These request fields have no limit on their length. Give each "
        "`Field(max_length=...)` from app.schemas.limits, or list it in "
        f"NOT_YET with the reason: {unbounded}"
    )


def test_every_listed_exception_still_needs_listing() -> None:
    fields = _fields()

    stale = sorted(
        name
        for name in NOT_YET
        if name not in fields or _has_limit(fields[name])
    )

    assert stale == [], (
        "These are listed in NOT_YET but now have a limit, or are no "
        f"longer request fields. Take them out: {stale}"
    )


def test_a_limit_given_through_a_type_is_seen() -> None:
    """A limit may be on the field or on the type it is made from."""
    from typing import Annotated

    from pydantic import Field

    Short = Annotated[str, Field(max_length=5)]

    class Model(BaseModel):
        on_the_field: str = Field(max_length=5)
        on_the_type: Short
        optional: str | None = Field(default=None, max_length=5)
        none: str

    fields = Model.model_fields

    assert _has_limit(fields["on_the_field"])
    assert _has_limit(fields["on_the_type"])
    assert _has_limit(fields["optional"])
    assert not _has_limit(fields["none"])


def test_a_value_over_its_limit_is_refused() -> None:
    """One real model, to show the limit does what the walk assumes."""
    import pytest
    from pydantic import ValidationError

    from app.schemas.auth import LoginIn
    from app.schemas.limits import MAX_PASSWORD

    LoginIn(username="ada", password="x" * MAX_PASSWORD)

    with pytest.raises(ValidationError, match="password"):
        LoginIn(username="ada", password="x" * (MAX_PASSWORD + 1))
