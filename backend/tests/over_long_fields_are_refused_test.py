"""A value over its limit is refused, at the limit plus one.

``request_fields_have_limits_test.py`` checks that each field declares
a limit. These check what the limit does, for the fields that were the
last to be given one: the longest value allowed is taken, and
one character more is refused before any rule runs.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel, ValidationError

from app.features.teaching.public_router import ValidateClinicalLeadIn
from app.main import TotpVerifyIn
from app.schemas.limits import (
    MAX_EMAIL,
    MAX_FULL_NAME,
    MAX_PASSWORD,
    MAX_TOTP_CODE,
    MAX_USERNAME,
)
from app.schemas.users_admin import AdminUserCreateIn, AdminUserUpdateIn

# What each model needs besides the field under test.
NEW_USER: dict[str, Any] = {
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "password": "a-long-enough-password",
}

CASES: list[tuple[type[BaseModel], dict[str, Any], str, int]] = [
    (AdminUserCreateIn, NEW_USER, "name", MAX_FULL_NAME),
    (AdminUserCreateIn, NEW_USER, "username", MAX_USERNAME),
    (AdminUserCreateIn, NEW_USER, "email", MAX_EMAIL),
    (AdminUserCreateIn, NEW_USER, "password", MAX_PASSWORD),
    (AdminUserUpdateIn, {}, "name", MAX_FULL_NAME),
    (AdminUserUpdateIn, {}, "username", MAX_USERNAME),
    (AdminUserUpdateIn, {}, "email", MAX_EMAIL),
    (AdminUserUpdateIn, {}, "password", MAX_PASSWORD),
    (TotpVerifyIn, {}, "code", MAX_TOTP_CODE),
    (ValidateClinicalLeadIn, {"bank_id": "colonoscopy"}, "email", MAX_EMAIL),
]
EVERY_FIELD = pytest.mark.parametrize(
    "model,rest,field,limit",
    CASES,
    ids=[f"{model.__name__}.{field}" for model, _, field, _ in CASES],
)


@EVERY_FIELD
def test_the_longest_value_allowed_is_taken(
    model: type[BaseModel], rest: dict[str, Any], field: str, limit: int
) -> None:
    made = model(**{**rest, field: "a" * limit})

    assert len(getattr(made, field)) == limit


@EVERY_FIELD
def test_one_character_more_is_refused(
    model: type[BaseModel], rest: dict[str, Any], field: str, limit: int
) -> None:
    with pytest.raises(ValidationError) as refused:
        model(**{**rest, field: "a" * (limit + 1)})

    errors = refused.value.errors()

    assert [error["loc"] for error in errors] == [(field,)]
    assert errors[0]["type"] == "string_too_long"


def test_a_route_answers_422_and_names_the_field(
    test_client: TestClient,
) -> None:
    """Through a real route, the open one the registration page calls."""
    response = test_client.post(
        "/api/teaching/public/validate-clinical-lead",
        json={"email": "a" * (MAX_EMAIL + 1), "bank_id": "colonoscopy"},
    )

    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["body", "email"]
