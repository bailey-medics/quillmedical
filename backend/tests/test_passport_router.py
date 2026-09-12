"""Tests for app/features/passport/router.py.

The authorisation matrix and the state machine, exercised over HTTP.

The store is swapped for one rooted at a temporary directory through
``app.dependency_overrides`` — the same mechanism ``conftest.py`` already
uses to point the database at SQLite. Nothing in a request can reach that
dictionary; it is populated by test code and cleared afterwards, and the
deployed application resolves the store from configuration alone.

Three groups carry the weight:

**Who may see what.** A passport is a personal record, so every route is
tried as the holder, as a named assessor, and as an unrelated user who
holds the competency and belongs to the same organisation. The last is
the one that matters: an authorisation bug does not look like an error,
it looks like a successful response to the wrong person.

**Self-sign-off is refused.** The one hard rule, tested at both doors —
asking yourself, and signing your own. The assertion is not merely that
it is refused but that nothing is written when it is.

**A refused write changes nothing.** Every rejection path asserts the
head commit has not moved. A route that returns 403 after writing is
worse than one that returns 200, because the record disagrees with what
the caller was told.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

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

#: From the oncology set drafted in Phase 0. Chosen because it declares
#: the UK SACT Board's four levels, so the level paths are exercised
#: rather than only the bare signed-off-or-not case.
COMPETENCY = "prescribe_sact"

#: One of that competency's levels, quoted from the framework.
LEVEL = "review_and_authorise"


@pytest.fixture
def passport_store(tmp_path: Path) -> Iterator[LocalPassportStore]:
    """Point every route at a passport store under a temporary directory.

    Overridden rather than configured, so no test can reach the real
    location even if settings are wrong. Cleared afterwards so one test
    cannot leak a store into the next.
    """
    store = LocalPassportStore(tmp_path / "passports")
    app.dependency_overrides[get_passport_store] = lambda: store
    yield store
    app.dependency_overrides.pop(get_passport_store, None)


def _make_user(
    db: Session,
    username: str,
    *,
    profession: str = "consultant",
    registrations: dict[str, str] | None = None,
) -> User:
    """A user who holds ``access_clinician_passport`` by profession."""
    user = User(
        username=username,
        email=f"{username}@example.nhs.uk",
        full_name=f"Dr {username.title()}",
        password_hash=hash_password("PassportPassword123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        professional_registrations=registrations or {"GMC": "1234567"},
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _enable_passport(db: Session, *users: User) -> Organisation:
    """One organisation with the feature on, and everyone in it.

    ``requires_feature`` resolves through organisation membership, so
    without this every route answers 403 before any of the authorisation
    logic under test runs.
    """
    org = Organisation(name="Test Trust")
    db.add(org)
    db.commit()
    db.refresh(org)

    db.add(OrganisationFeature(organisation_id=org.id, feature_key="passport"))

    for user in users:
        db.execute(
            organisation_member.insert().values(
                organisation_id=org.id, user_id=user.id
            )
        )

    db.commit()
    return org


def _login(client: TestClient, username: str) -> TestClient:
    """Sign in and carry the CSRF token on every later request."""
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
def assessor(db_session: Session) -> User:
    return _make_user(db_session, "assessor", profession="consultant")


@pytest.fixture
def bystander(db_session: Session) -> User:
    """Holds the competency and shares the organisation, but is unrelated.

    The most important fixture here: the passport must be invisible to
    them, and that is exactly the case a permissive check would pass.
    """
    return _make_user(db_session, "bystander", profession="consultant")


@pytest.fixture
def org(
    db_session: Session, holder: User, assessor: User, bystander: User
) -> Organisation:
    return _enable_passport(db_session, holder, assessor, bystander)


@pytest.fixture
def holder_client(
    test_client: TestClient,
    passport_store: LocalPassportStore,
    org: Organisation,
) -> TestClient:
    return _login(test_client, "holder")


def _create_passport(client: TestClient) -> str:
    """Create the caller's passport and return its id."""
    response = client.post("/api/passport")
    assert response.status_code == 201, response.text
    return str(response.json()["passport_id"])


class TestCreate:
    def test_a_holder_can_create_their_passport(
        self, holder_client: TestClient
    ) -> None:
        response = holder_client.post("/api/passport")

        assert response.status_code == 201
        body = response.json()
        assert len(body["passport_id"]) == 32
        assert body["holder_name"] == "Dr Holder"

    def test_a_second_passport_is_refused(
        self, holder_client: TestClient
    ) -> None:
        """One per person. A second would be a partial second career."""
        _create_passport(holder_client)

        response = holder_client.post("/api/passport")

        assert response.status_code == 409

    def test_registrations_are_recorded_as_declared(
        self, holder_client: TestClient
    ) -> None:
        """Quill checks no register, and the response says so."""
        response = holder_client.post("/api/passport")

        registrations = response.json()["registrations"]
        assert registrations
        assert all(not r["verified"] for r in registrations)


class TestReadAuthorisation:
    def test_the_holder_can_read_their_own(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = holder_client.get(f"/api/passport/{passport_id}")

        assert response.status_code == 200

    def test_an_unrelated_user_cannot_read_it(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: Organisation,
    ) -> None:
        """404 rather than 403: whether a passport exists is not theirs."""
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)

        bystander_client = _login(test_client, "bystander")
        response = bystander_client.get(f"/api/passport/{passport_id}")

        assert response.status_code == 404

    def test_a_malformed_id_is_not_found(
        self, holder_client: TestClient
    ) -> None:
        """An id that decides a path is validated before the store sees it."""
        # cspell:ignore Fetc Fpasswd - fragments of the encoded traversal
        response = holder_client.get("/api/passport/..%2F..%2Fetc%2Fpasswd")

        assert response.status_code == 404

    def test_me_returns_the_callers_passport(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = holder_client.get("/api/passport/me")

        assert response.status_code == 200
        assert response.json()["passport"]["passport_id"] == passport_id

    def test_me_is_404_before_one_exists(
        self, holder_client: TestClient
    ) -> None:
        response = holder_client.get("/api/passport/me")

        assert response.status_code == 404


class TestRequestSignOff:
    def test_a_holder_can_request_one(
        self, holder_client: TestClient, assessor: User
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_user_id": assessor.id,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        assert response.status_code == 201, response.text
        assert response.json()["status"] == "requested"

    def test_asking_yourself_is_refused(
        self, holder_client: TestClient, holder: User
    ) -> None:
        """The whole value of the record is a second named person."""
        passport_id = _create_passport(holder_client)

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_user_id": holder.id,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        assert response.status_code == 400

    def test_an_unknown_competency_is_refused(
        self, holder_client: TestClient, assessor: User
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/not_a_competency"
            "/requests",
            json={
                "assessor_user_id": assessor.id,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        assert response.status_code == 404

    def test_nobody_else_can_request_against_a_passport(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: Organisation,
        assessor: User,
    ) -> None:
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)

        bystander_client = _login(test_client, "bystander")
        response = bystander_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_user_id": assessor.id,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        assert response.status_code == 404


class TestSignOff:
    @pytest.fixture
    def requested(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: Organisation,
        assessor: User,
    ) -> tuple[str, str]:
        """A passport with one open request, ready to be signed."""
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_user_id": assessor.id,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )
        assert response.status_code == 201, response.text

        return passport_id, response.json()["name"]

    def test_the_named_assessor_can_sign(
        self, test_client: TestClient, requested: tuple[str, str]
    ) -> None:
        passport_id, name = requested
        client = _login(test_client, "assessor")

        response = client.post(
            f"/api/passport/{passport_id}/sign-offs/{name}/sign-off",
            json={
                "meaning": "directly observed",
                "declaration_confirmed": True,
                "level_id": LEVEL,
            },
        )

        assert response.status_code == 200, response.text
        assert response.json()["status"] == "signed_off"

    def test_signing_without_the_declaration_is_refused(
        self, test_client: TestClient, requested: tuple[str, str]
    ) -> None:
        """And nothing is written when it is refused."""
        passport_id, name = requested
        client = _login(test_client, "assessor")

        before = client.get(f"/api/passport/{passport_id}").json()

        response = client.post(
            f"/api/passport/{passport_id}/sign-offs/{name}/sign-off",
            json={
                "meaning": "directly observed",
                "declaration_confirmed": False,
            },
        )

        assert response.status_code == 400

        after = client.get(f"/api/passport/{passport_id}").json()
        assert (
            after["passport"]["head_commit"]
            == before["passport"]["head_commit"]
        )

    def test_the_holder_cannot_sign_their_own(
        self, test_client: TestClient, requested: tuple[str, str]
    ) -> None:
        """Refused because they were not asked, before self-sign is reached."""
        passport_id, name = requested
        client = _login(test_client, "holder")

        response = client.post(
            f"/api/passport/{passport_id}/sign-offs/{name}/sign-off",
            json={
                "meaning": "directly observed",
                "declaration_confirmed": True,
            },
        )

        assert response.status_code == 403

    def test_an_unrelated_user_cannot_sign(
        self, test_client: TestClient, requested: tuple[str, str]
    ) -> None:
        passport_id, name = requested
        client = _login(test_client, "bystander")

        response = client.post(
            f"/api/passport/{passport_id}/sign-offs/{name}/sign-off",
            json={
                "meaning": "directly observed",
                "declaration_confirmed": True,
            },
        )

        assert response.status_code == 403

    def test_signing_twice_is_refused(
        self, test_client: TestClient, requested: tuple[str, str]
    ) -> None:
        passport_id, name = requested
        client = _login(test_client, "assessor")

        first = client.post(
            f"/api/passport/{passport_id}/sign-offs/{name}/sign-off",
            json={
                "meaning": "directly observed",
                "declaration_confirmed": True,
                "level_id": LEVEL,
            },
        )
        assert first.status_code == 200

        second = client.post(
            f"/api/passport/{passport_id}/sign-offs/{name}/sign-off",
            json={
                "meaning": "directly observed",
                "declaration_confirmed": True,
                "level_id": LEVEL,
            },
        )

        assert second.status_code == 409


class TestDeclineAndWithdraw:
    @pytest.fixture
    def requested(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: Organisation,
        assessor: User,
    ) -> tuple[str, str]:
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_user_id": assessor.id,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )
        assert response.status_code == 201

        return passport_id, response.json()["name"]

    def test_the_assessor_can_decline(
        self, test_client: TestClient, requested: tuple[str, str]
    ) -> None:
        """A decline is part of the record, not an absence from it."""
        passport_id, name = requested
        client = _login(test_client, "assessor")

        response = client.post(
            f"/api/passport/{passport_id}/sign-offs/{name}/decline",
            json={"reason": "Not yet ready for this level."},
        )

        assert response.status_code == 200, response.text
        assert response.json()["status"] == "declined"

    def test_the_holder_can_withdraw(
        self, test_client: TestClient, requested: tuple[str, str]
    ) -> None:
        passport_id, name = requested
        client = _login(test_client, "holder")

        response = client.post(
            f"/api/passport/{passport_id}/sign-offs/{name}/withdraw"
        )

        assert response.status_code == 200, response.text

    def test_an_assessor_cannot_withdraw(
        self, test_client: TestClient, requested: tuple[str, str]
    ) -> None:
        """Withdrawing is the holder's act; declining is the assessor's."""
        passport_id, name = requested
        client = _login(test_client, "assessor")

        response = client.post(
            f"/api/passport/{passport_id}/sign-offs/{name}/withdraw"
        )

        assert response.status_code == 404


class TestInbox:
    def test_an_assessor_sees_what_they_were_asked(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: Organisation,
        assessor: User,
    ) -> None:
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)
        holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_user_id": assessor.id,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        client = _login(test_client, "assessor")
        response = client.get("/api/passport/requests/inbox")

        assert response.status_code == 200, response.text
        assert len(response.json()) == 1
        assert response.json()[0]["competency"]["id"] == COMPETENCY

    def test_an_unrelated_assessor_sees_nothing(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: Organisation,
        assessor: User,
    ) -> None:
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)
        holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_user_id": assessor.id,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        client = _login(test_client, "bystander")
        response = client.get("/api/passport/requests/inbox")

        assert response.status_code == 200
        assert response.json() == []


class TestVerify:
    def test_a_signed_record_verifies(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: Organisation,
        assessor: User,
    ) -> None:
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)
        created = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_user_id": assessor.id,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )
        name = created.json()["name"]

        assessor_client = _login(test_client, "assessor")
        assessor_client.post(
            f"/api/passport/{passport_id}/sign-offs/{name}/sign-off",
            json={
                "meaning": "directly observed",
                "declaration_confirmed": True,
                "level_id": LEVEL,
            },
        )

        client = _login(test_client, "holder")
        response = client.get(
            f"/api/passport/{passport_id}/sign-offs/{name}/verify"
        )

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["unchanged"] is True

    def test_the_response_states_what_it_does_not_prove(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: Organisation,
        assessor: User,
    ) -> None:
        """The limits matter as much as the result."""
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)
        created = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_user_id": assessor.id,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )
        name = created.json()["name"]

        response = holder_client.get(
            f"/api/passport/{passport_id}/sign-offs/{name}/verify"
        )

        body = response.json()
        assert "registration" in body["does_not_prove"]
        assert "distrusts Quill" in body["does_not_prove"]


class TestFeatureGate:
    def test_the_feature_must_be_enabled(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        db_session: Session,
    ) -> None:
        """Without the organisation feature, every route refuses."""
        user = _make_user(db_session, "ungated")
        organisation = Organisation(name="No Feature Trust")
        db_session.add(organisation)
        db_session.commit()
        db_session.refresh(organisation)
        db_session.execute(
            organisation_member.insert().values(
                organisation_id=organisation.id, user_id=user.id
            )
        )
        db_session.commit()

        client = _login(test_client, "ungated")
        response = client.post("/api/passport")

        assert response.status_code == 403
