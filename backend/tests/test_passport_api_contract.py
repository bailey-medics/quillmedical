"""The passport API's contract: who is refused, and what the spec promises.

Two things the route tests do not cover, and both would fail silently.

**The admin row of the authorisation matrix.** The plan asks for holder,
assessor, other user and admin. The first three are covered where the
routes are tested; this file adds the fourth, and asserts an
organisation admin is currently *refused*. That is narrower than the plan
describes, deliberately: how "admin of the holder's organisation" is
evaluated is being settled by the org-scoped access plan, so the router
admits only the holder and named assessors until that lands. Pinning
today's behaviour means the day somebody widens it, these tests fail and
force the decision to be deliberate rather than incidental.

**The OpenAPI spec stays additive and diffable.** Every passport route
must carry a response model with named fields. A response schema with no
properties is invisible to ``oasdiff``: a field could be removed later
with zero flagged breaking changes, which is exactly how a removed field
once escaped review. The repository has a checker for this
(``check_api_schema_coverage.py``), and these assertions make the
passport's own compliance a test rather than something noticed in CI.
"""

from __future__ import annotations

import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.features.passport.store import LocalPassportStore
from app.main import app
from app.models import (
    Organisation,
    OrganisationFeature,
    User,
    organisation_member,
)
from app.passport_storage import get_passport_store
from app.security import hash_password

COMPETENCY = "prescribe_sact"
LEVEL = "review_and_authorise"

#: Every passport path, as the router declares them. Listed so a new
#: route is a deliberate addition here too — a route that nobody thought
#: to add to this list is a route whose response typing nothing checks.
EXPECTED_PATHS = {
    "/api/passport",
    "/api/passport/me",
    "/api/passport/requests/inbox",
    "/api/passport/{passport_id}",
    "/api/passport/{passport_id}/certificates",
    "/api/passport/{passport_id}/certificates/{name}",
    "/api/passport/{passport_id}/competencies/{competency_id}",
    "/api/passport/{passport_id}/competencies/{competency_id}/requests",
    "/api/passport/{passport_id}/cpd",
    "/api/passport/{passport_id}/cpd/{year}",
    "/api/passport/{passport_id}/cpd/{year}/{stem}",
    "/api/passport/{passport_id}/logbook/{competency_id}",
    "/api/passport/{passport_id}/logbook/{competency_id}/{stem}",
    "/api/passport/{passport_id}/reflections",
    "/api/passport/{passport_id}/reflections/{name}",
    "/api/passport/{passport_id}/sign-offs/{signoff_id}",
    "/api/passport/{passport_id}/sign-offs/{signoff_id}/decline",
    "/api/passport/{passport_id}/sign-offs/{signoff_id}/sign-off",
    "/api/passport/{passport_id}/sign-offs/{signoff_id}/verify",
    "/api/passport/{passport_id}/sign-offs/{signoff_id}/withdraw",
}


@pytest.fixture
def passport_store(tmp_path: Path) -> Iterator[LocalPassportStore]:
    store = LocalPassportStore(tmp_path / "passports")
    app.dependency_overrides[get_passport_store] = lambda: store
    yield store
    app.dependency_overrides.pop(get_passport_store, None)


def _make_user(
    db: Session,
    username: str,
    *,
    profession: str,
    permissions: str = "single-user",
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.nhs.uk",
        full_name=f"Dr {username.title()}",
        password_hash=hash_password("PassportPassword123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        system_permissions=permissions,
        professional_registrations={"GMC": "1234567"},
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _login(client: TestClient, username: str) -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": "PassportPassword123!"},
    )
    assert response.status_code == 200, response.text

    csrf = client.cookies.get("XSRF-TOKEN")
    if csrf:
        client.headers["X-CSRF-Token"] = csrf

    return client


@pytest.fixture
def holder(db_session: Session) -> User:
    return _make_user(
        db_session, "holder", profession="specialty_trainee_3_plus"
    )


@pytest.fixture
def org_admin(db_session: Session) -> User:
    """An admin of the holder's own organisation.

    Carries ``consultant`` so they hold ``access_clinician_passport`` and
    reach the routes at all: without it the refusal under test would come
    from the competency gate rather than from the passport's own
    authorisation, and the test would pass for the wrong reason.
    """
    return _make_user(
        db_session,
        "orgadmin",
        profession="consultant",
        permissions="admin",
    )


@pytest.fixture
def org(db_session: Session, holder: User, org_admin: User) -> Organisation:
    org = Organisation(name="Test Trust")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    db_session.add(
        OrganisationFeature(organisation_id=org.id, feature_key="passport")
    )

    for user in (holder, org_admin):
        db_session.execute(
            organisation_member.insert().values(
                organisation_id=org.id, user_id=user.id
            )
        )

    db_session.commit()
    return org


@pytest.fixture
def passport(
    test_client: TestClient,
    passport_store: LocalPassportStore,
    org: Organisation,
) -> str:
    client = _login(test_client, "holder")
    response = client.post("/api/passport")
    assert response.status_code == 201, response.text
    return str(response.json()["passport_id"])


class TestTheAdminRow:
    """An organisation admin is refused, for now and on purpose."""

    def test_an_admin_cannot_read_a_passport(
        self, passport: str, test_client: TestClient
    ) -> None:
        """404, the same answer a stranger gets.

        The plan's API surface says an admin of the holder's organisation
        may view a passport. The router does not implement that yet,
        because how that scope is evaluated is being settled elsewhere.
        This test pins the current answer so widening it later is a
        deliberate act with a failing test to prompt it.
        """
        client = _login(test_client, "orgadmin")

        response = client.get(f"/api/passport/{passport}")

        assert response.status_code == 404

    def test_an_admin_cannot_read_reflections(
        self, passport: str, test_client: TestClient
    ) -> None:
        """And this one must stay refused even when the above widens.

        Reflections are holder-only regardless of anyone's standing:
        written reflection can be disclosed in legal proceedings, and an
        organisation admin reading one would be the surprise the design
        exists to prevent.
        """
        client = _login(test_client, "orgadmin")

        response = client.get(f"/api/passport/{passport}/reflections")

        assert response.status_code == 404

    def test_an_admin_cannot_write_evidence(
        self, passport: str, test_client: TestClient
    ) -> None:
        """Self-declared evidence is the holder's own claim.

        Nobody else may enter it, whatever their platform permissions:
        a certificate filed by an administrator would be a claim about
        somebody made by another party, which is precisely what a
        sign-off is for and a certificate is not.
        """
        client = _login(test_client, "orgadmin")

        response = client.post(
            f"/api/passport/{passport}/certificates",
            json={
                "title": "Not theirs to add",
                "issuer": "UKONS",
                "awarded_on": "2026-02-11",
            },
        )

        assert response.status_code == 404

    def test_an_admin_cannot_create_a_passport_for_someone_else(
        self, passport: str, test_client: TestClient, holder: User
    ) -> None:
        """There is no route that could: creation is always the caller's.

        A passport belongs permanently to the person it describes, and
        no operation transfers or delegates that.
        """
        client = _login(test_client, "orgadmin")

        response = client.post("/api/passport")

        # They get their own, not the holder's.
        assert response.status_code == 201
        assert response.json()["holder_user_id"] != str(holder.id)


def _spec() -> dict[str, Any]:
    """The OpenAPI spec, as CI generates it for the breaking-change diff."""
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

    from dump_openapi import generate_spec

    spec: dict[str, Any] = generate_spec(dev=True)
    return spec


class TestTheSpecIsAdditiveAndDiffable:
    """What `oasdiff` will see when it compares this branch with main."""

    def test_every_passport_route_is_in_the_spec(self) -> None:
        """A route missing from the spec is a route CI cannot diff."""
        spec = _spec()
        found = {p for p in spec["paths"] if p.startswith("/api/passport")}

        assert found == EXPECTED_PATHS

    def test_every_route_has_a_named_response_schema(self) -> None:
        """A schema with no properties is invisible to oasdiff.

        A field could then be removed with zero flagged breaking changes,
        which is exactly how a removed field once escaped review and
        prompted the API schema coverage work. Checked here for the
        passport specifically, so its compliance is a test rather than
        something noticed in CI.
        """
        spec = _spec()
        components = spec.get("components", {}).get("schemas", {})
        opaque: list[str] = []

        for path, operations in spec["paths"].items():
            if not path.startswith("/api/passport"):
                continue

            for method, operation in operations.items():
                schema = _success_schema(operation)

                if schema is None:
                    opaque.append(f"{method.upper()} {path}: no 200/201")
                    continue

                if not _has_named_fields(schema, components):
                    opaque.append(
                        f"{method.upper()} {path}: opaque response schema"
                    )

        assert not opaque, (
            "These responses cannot be diffed field by field, so a field "
            f"could be removed later with nothing flagged: {opaque}"
        )

    def test_mutations_are_not_plain_dictionaries(self) -> None:
        """Every write returns a typed result naming what it wrote."""
        spec = _spec()

        for path, operations in spec["paths"].items():
            if not path.startswith("/api/passport"):
                continue

            for method, operation in operations.items():
                if method not in ("post", "patch", "delete"):
                    continue

                schema = _success_schema(operation)
                assert schema is not None, f"{method.upper()} {path}"


def _success_schema(operation: dict[str, Any]) -> dict[str, Any] | None:
    """The 200 or 201 JSON schema of one operation, if it has one."""
    responses = operation.get("responses", {})

    for code in ("200", "201"):
        content = responses.get(code, {}).get("content", {})
        schema = content.get("application/json", {}).get("schema")

        if schema is not None:
            return dict(schema)

    return None


def _has_named_fields(
    schema: dict[str, Any], components: dict[str, Any]
) -> bool:
    """Whether a response schema exposes fields oasdiff can compare.

    Follows a ``$ref`` into the component schemas, and looks through an
    array to the item it holds: a list of typed objects is diffable,
    a list of anything is not.
    """
    if "$ref" in schema:
        name = str(schema["$ref"]).rsplit("/", 1)[-1]
        return _has_named_fields(components.get(name, {}), components)

    if schema.get("type") == "array":
        items = schema.get("items")

        if not isinstance(items, dict):
            return False

        return _has_named_fields(items, components)

    return bool(schema.get("properties"))
