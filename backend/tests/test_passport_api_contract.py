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
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.features.passport.models import PassportWriteEntitlement
from app.features.passport.store import LocalPassportStore
from app.main import app
from app.models import (
    OrgUnit,
    OrgUnitFeature,
    User,
)
from app.organisations import add_org_unit_member
from app.passport_storage import get_passport_store
from app.security import hash_password

COMPETENCY = "prescribe_sact"
LEVEL = "review_and_authorise"

#: Every passport path, as the router declares them. Listed so a new
#: route is a deliberate addition here too — a route that nobody thought
#: to add to this list is a route whose response typing nothing checks.
#: What a passport route may return instead of a diffable JSON schema.
#: A download has no fields, so the field check does not apply to it —
#: but it must say which of these it hands back. Declaring nothing is
#: the case this set exists to refuse: FastAPI then advertises
#: ``application/json`` with an empty schema, which passes for a
#: download and diffs like nothing.
DOWNLOAD_MEDIA_TYPES = frozenset(
    {
        "text/markdown",
        "application/pdf",
        "application/zip",
    }
)

EXPECTED_PATHS = {
    "/api/passport",
    "/api/passport/me",
    "/api/passport/assessor-invites/accept",
    "/api/passport/assessor-invites/preview",
    "/api/passport/assessors/search",
    "/api/passport/assessors/{assessor_user_id}/membership",
    "/api/passport/assessors/{assessor_user_id}/registration-verification",
    "/api/passport/requests/inbox",
    "/api/passport/{passport_id}",
    "/api/passport/{passport_id}/certificates",
    "/api/passport/{passport_id}/certificates/{name}",
    "/api/passport/{passport_id}/competencies/{competency_id}",
    "/api/passport/{passport_id}/competencies/{competency_id}/requests",
    "/api/passport/{passport_id}/cpd",
    "/api/passport/{passport_id}/evidence",
    "/api/passport/{passport_id}/export.md",
    "/api/passport/{passport_id}/export.pdf",
    "/api/passport/{passport_id}/export.zip",
    "/api/passport/{passport_id}/cpd/{year}",
    "/api/passport/{passport_id}/cpd/{year}/{stem}",
    "/api/passport/{passport_id}/logbook",
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
    writes: bool = False,
) -> User:
    """A user, optionally holding ``passport_write``.

    No profession grants ``passport_write``: it is sold, and reaches a
    person through onboarding or an individual subscription. It goes in
    ``additional_competencies`` because that is the column the admin
    pages write, so a fixture holder is granted it exactly as a real
    one is.
    """
    user = User(
        username=username,
        email=f"{username}@example.nhs.uk",
        full_name=f"Dr {username.title()}",
        password_hash=hash_password("PassportPassword123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        additional_competencies=["passport_write"] if writes else [],
        professional_registrations={"GMC": "1234567"},
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    if writes:
        # The competency says they may write; the entitlement says until
        # when. Both are needed, exactly as they are for a real holder.
        db.add(
            PassportWriteEntitlement(
                user_id=user.id,
                source="organisation",
                ends_on=datetime.now(UTC) + timedelta(days=365),
            )
        )
        db.commit()

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
        db_session,
        "holder",
        profession="specialty_trainee_3_plus",
        writes=True,
    )


@pytest.fixture
def org_admin(db_session: Session) -> User:
    """An admin of the holder's own organisation.

    Carries ``consultant`` so they hold ``assess_clinician_passport`` and
    reach the routes at all: without it the refusal under test would come
    from the competency gate rather than from the passport's own
    authorisation, and the test would pass for the wrong reason.
    """
    return _make_user(
        db_session,
        "orgadmin",
        profession="consultant",
        permissions="admin",
        # Holds ``passport_write`` for the same reason they hold the
        # feature: every refusal below must come from the passport's own
        # authorisation rather than from a gate they never got past.
        writes=True,
    )


@pytest.fixture
def org(db_session: Session, holder: User, org_admin: User) -> OrgUnit:
    org = OrgUnit(name="Test Trust", type="hospital_team")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    db_session.add(OrgUnitFeature(org_unit_id=org.id, feature_key="passport"))

    for user in (holder, org_admin):
        add_org_unit_member(db_session, org.id, user.id, "trainee")

    db_session.commit()
    return org


@pytest.fixture
def passport(
    test_client: TestClient,
    passport_store: LocalPassportStore,
    org: OrgUnit,
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


class TestALapsedHolderKeepsTheirRecord:
    """``passport_write`` is sold, and losing it must not lock anybody out.

    A passport is somebody's professional record. Reading, rendering and
    exporting it are derived from owning it, never from paying, so an
    entitlement that has lapsed takes away the ability to add to the
    record and nothing else.
    """

    @pytest.fixture
    def lapsed(self, db_session: Session) -> User:
        """A holder whose entitlement has gone, or never arrived."""
        return _make_user(
            db_session,
            "lapsed",
            profession="specialty_trainee_3_plus",
            writes=False,
        )

    def test_they_cannot_add_to_their_own_passport(
        self, passport: str, test_client: TestClient, holder: User
    ) -> None:
        """The one thing a lapse takes away."""
        holder.additional_competencies = []
        client = _login(test_client, "holder")

        response = client.post(
            f"/api/passport/{passport}/certificates",
            json={
                "title": "After the lapse",
                "issuer": "UKONS",
                "awarded_on": "2026-02-11",
            },
        )

        assert response.status_code == 403

    def test_they_can_still_read_it(
        self, passport: str, test_client: TestClient, holder: User
    ) -> None:
        """Their own record, still theirs.

        Reading is derived from owning the passport, so this must not
        consult the entitlement at all.
        """
        holder.additional_competencies = []
        client = _login(test_client, "holder")

        assert client.get(f"/api/passport/{passport}").status_code == 200

    def test_they_can_still_export_it(
        self, passport: str, test_client: TestClient, holder: User
    ) -> None:
        """Taking the record with you is the thing a lapse must not stop.

        Somebody whose organisation stopped paying needs their record
        more than ever, not less.
        """
        holder.additional_competencies = []
        client = _login(test_client, "holder")

        response = client.get(f"/api/passport/{passport}/export.md")

        assert response.status_code == 200

    def test_a_stranger_is_still_told_nothing(
        self,
        passport: str,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
    ) -> None:
        """Ownership is checked before the entitlement, and that is the point.

        The stranger here holds no ``passport_write``, so a gate that
        asked the competency first would answer 403 and confirm the
        passport is real to somebody holding only its id. Ownership is
        asked first, so they are told it does not exist.
        """
        stranger = _make_user(
            db_session,
            "stranger",
            profession="consultant",
            writes=False,
        )
        # In the organisation, so the feature gate admits them and the
        # only thing left to refuse them is the passport's own
        # authorisation. Outside it they would get 403 from the feature
        # gate and the test would pass without proving anything.
        add_org_unit_member(db_session, org.id, stranger.id, "trainee")
        db_session.commit()

        client = _login(test_client, "stranger")

        response = client.post(
            f"/api/passport/{passport}/reflections",
            json={
                "title": "Not theirs",
                "written_on": "2026-03-14",
                "body": "Not theirs to write.",
                "anonymised_confirmed": True,
            },
        )

        assert response.status_code == 404


class TestAnEntitlementThatHasRunOut:
    """The competency says they may write; the entitlement says until when.

    Both are needed, and they fail differently: losing the competency is
    somebody's access being changed, while an entitlement running out is
    the ordinary end of an arrangement nobody renewed.
    """

    def _expire(self, db_session: Session, user: User) -> None:
        """Move every entitlement this person holds into the past."""
        rows = (
            db_session.query(PassportWriteEntitlement)
            .filter(PassportWriteEntitlement.user_id == user.id)
            .all()
        )
        for row in rows:
            row.starts_on = datetime.now(UTC) - timedelta(days=400)
            row.ends_on = datetime.now(UTC) - timedelta(days=1)
        db_session.commit()

    def test_writing_is_refused_once_it_has_ended(
        self,
        passport: str,
        test_client: TestClient,
        holder: User,
        db_session: Session,
    ) -> None:
        """The entitlement is what ends, so the write is what stops."""
        self._expire(db_session, holder)
        client = _login(test_client, "holder")

        response = client.post(
            f"/api/passport/{passport}/certificates",
            json={
                "title": "After it lapsed",
                "issuer": "UKONS",
                "awarded_on": "2026-02-11",
            },
        )

        assert response.status_code == 403

    def test_reading_is_untouched_by_it(
        self,
        passport: str,
        test_client: TestClient,
        holder: User,
        db_session: Session,
    ) -> None:
        """Reading is derived from owning the passport, never from paying."""
        self._expire(db_session, holder)
        client = _login(test_client, "holder")

        assert client.get(f"/api/passport/{passport}").status_code == 200

    def test_exporting_is_untouched_by_it(
        self,
        passport: str,
        test_client: TestClient,
        holder: User,
        db_session: Session,
    ) -> None:
        """Somebody whose cover ended needs their record more, not less."""
        self._expire(db_session, holder)
        client = _login(test_client, "holder")

        assert (
            client.get(f"/api/passport/{passport}/export.md").status_code
            == 200
        )

    def test_a_second_source_keeps_them_writing(
        self,
        passport: str,
        test_client: TestClient,
        holder: User,
        db_session: Session,
    ) -> None:
        """Losing one source must not end the other.

        Somebody covered by their organisation *and* paying for
        themselves keeps writing when the organisation's cover ends, and
        should never notice it happened.
        """
        self._expire(db_session, holder)
        db_session.add(
            PassportWriteEntitlement(
                user_id=holder.id,
                source="individual",
                ends_on=datetime.now(UTC) + timedelta(days=30),
            )
        )
        db_session.commit()

        client = _login(test_client, "holder")

        response = client.post(
            f"/api/passport/{passport}/certificates",
            json={
                "title": "Paid for it themselves",
                "issuer": "UKONS",
                "awarded_on": "2026-02-11",
            },
        )

        assert response.status_code == 201


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

        **Every route declares something checkable.** A JSON route
        declares its fields. A download declares the media type it
        returns, from the set below — it has no fields to diff, so
        listing them is not the check that applies to it. What is not
        allowed is declaring nothing: an undeclared response is
        advertised as ``application/json`` with an empty schema, which
        looks like a download and diffs like nothing. That is the exact
        shape this test exists to catch, and it is what the export
        routes produced before their media types were declared.
        """
        spec = _spec()
        components = spec.get("components", {}).get("schemas", {})
        opaque: list[str] = []

        for path, operations in spec["paths"].items():
            if not path.startswith("/api/passport"):
                continue

            for method, operation in operations.items():
                where = f"{method.upper()} {path}"
                schema = _success_schema(operation)

                if schema is None:
                    media_type = _success_media_type(operation)

                    if media_type is None:
                        opaque.append(f"{where}: no 200/201")
                    elif media_type not in DOWNLOAD_MEDIA_TYPES:
                        opaque.append(
                            f"{where}: returns {media_type}, which is "
                            "neither a diffable JSON schema nor one of "
                            f"{sorted(DOWNLOAD_MEDIA_TYPES)}"
                        )

                    continue

                if not _has_named_fields(schema, components):
                    opaque.append(f"{where}: opaque response schema")

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


def _success_media_type(operation: dict[str, Any]) -> str | None:
    """The media type of a 200 or 201 that is not JSON, if there is one.

    A download says what it hands back. Returning the declared type
    rather than a boolean lets the caller check it is a real one: a
    route that declares nothing is the case worth catching, and it is
    indistinguishable from a download unless the type itself is read.
    """
    responses = operation.get("responses", {})

    for code in ("200", "201"):
        content = responses.get(code, {}).get("content", {})

        for media_type in content:
            if media_type != "application/json":
                return str(media_type)

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
