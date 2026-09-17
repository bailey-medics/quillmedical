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

import hashlib
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from jose import jwt
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import settings
from app.features.passport import router
from app.features.passport.models import (
    AssessorRegistrationVerification,
    Passport,
    PassportAssessorInvite,
    PassportSignOffRequest,
)
from app.features.passport.store import LocalPassportStore
from app.main import app
from app.models import (
    Organisation,
    OrgUnit,
    OrgUnitFeature,
    User,
    org_unit_member,
)
from app.organisations import (
    add_place_member,
    organisation_place_member,
)
from app.passport_storage import get_passport_store
from app.security import PASSPORT_INVITE_TYPE, hash_password

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

    db.add(OrgUnitFeature(org_unit_id=org.org_unit_id, feature_key="passport"))

    for user in users:
        add_place_member(db, org.org_unit_id, user.id, "trainee")

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


class TestAssessorInvites:
    """Bringing somebody in from outside, and the limits on doing so.

    The invitation is about a *person*, not a competency: one assessor
    goes on to sign off many things over months, and what they were
    asked for is a sign-off request naming their user id — which cannot
    exist until they have accepted and have an account at all.
    """

    @pytest.fixture
    def sent(self, monkeypatch: pytest.MonkeyPatch) -> list[dict[str, str]]:
        """Capture outgoing email instead of sending it.

        ``EMAIL_DRY_RUN`` is already true under test, so nothing would
        leave the process either way. This is to assert on *what* was
        written — above all that the token never appears in the response
        and the link does appear in the email.
        """
        outbox: list[dict[str, str]] = []

        def capture(
            *, to: str, subject: str, html_body: str, **kw: object
        ) -> None:
            outbox.append(
                {"to": to, "subject": subject, "html_body": html_body}
            )

        monkeypatch.setattr(router, "send_email", capture)
        return outbox

    def _invite(
        self,
        client: TestClient,
        passport_id: str,
        *,
        email: str = "okafor@other-trust.nhs.uk",
        name: str = "Dr Amara Okafor",
        competency_id: str | None = None,
    ) -> Response:
        body: dict[str, object] = {
            "email": email,
            "name": name,
            "registration_authority": "GMC",
            "registration_number": "7654321",
        }
        if competency_id is not None:
            body["competency_id"] = competency_id

        return client.post(
            f"/api/passport/{passport_id}/assessor-invites", json=body
        )

    def test_the_holder_can_invite_an_outside_assessor(
        self,
        holder_client: TestClient,
        db_session: Session,
        sent: list[dict[str, str]],
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = self._invite(holder_client, passport_id)

        assert response.status_code == 201, response.text
        payload = response.json()
        assert payload["email"] == "okafor@other-trust.nhs.uk"
        assert payload["name"] == "Dr Amara Okafor"
        assert payload["accepted_at"] is None

        row = db_session.get(PassportAssessorInvite, payload["id"])
        assert row is not None
        assert row.passport_id == passport_id
        assert row.registration_number == "7654321"

    def test_the_token_is_emailed_and_never_returned(
        self,
        holder_client: TestClient,
        db_session: Session,
        sent: list[dict[str, str]],
    ) -> None:
        """The credential goes to the address, not to the caller.

        Returning it would let a holder redeem or forward the invitation
        by any route they liked, defeating the point of sending it to an
        address somebody controls.
        """
        passport_id = _create_passport(holder_client)

        response = self._invite(holder_client, passport_id)
        body = response.text

        assert "token" not in response.json()
        assert len(sent) == 1
        assert sent[0]["to"] == "okafor@other-trust.nhs.uk"
        assert "/passport/assessors/accept?token=" in sent[0]["html_body"]

        # The emailed token must not appear in the response anywhere.
        link = sent[0]["html_body"].split("token=")[1].split('"')[0]
        assert link not in body

    def test_only_the_hash_of_the_token_is_stored(
        self,
        holder_client: TestClient,
        db_session: Session,
        sent: list[dict[str, str]],
    ) -> None:
        """A readable copy would let anyone with a row redeem it."""
        passport_id = _create_passport(holder_client)

        response = self._invite(holder_client, passport_id)
        row = db_session.get(PassportAssessorInvite, response.json()["id"])
        assert row is not None

        token = sent[0]["html_body"].split("token=")[1].split('"')[0]

        assert row.token_hash != token
        assert row.token_hash == hashlib.sha256(token.encode()).hexdigest()

    def test_a_competency_makes_the_email_specific_but_is_not_stored(
        self,
        holder_client: TestClient,
        db_session: Session,
        sent: list[dict[str, str]],
    ) -> None:
        """The invitation is about a person.

        Naming a competency helps a cold recipient decide whether to act,
        so it shapes the email. Storing it would either force a second
        invitation for somebody who already has an account, or describe
        only the first of the things they were eventually asked to
        assess.
        """
        passport_id = _create_passport(holder_client)

        response = self._invite(
            holder_client, passport_id, competency_id=COMPETENCY
        )

        assert response.status_code == 201, response.text
        assert "competency_id" not in response.json()

        row = db_session.get(PassportAssessorInvite, response.json()["id"])
        assert not hasattr(row, "competency_id")

        assert "assess" in sent[0]["html_body"].lower()

    def test_an_unknown_competency_is_refused(
        self,
        holder_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = self._invite(
            holder_client, passport_id, competency_id="not_a_competency"
        )

        assert response.status_code in (404, 422)
        assert sent == []

    def test_you_cannot_invite_yourself(
        self,
        holder_client: TestClient,
        holder: User,
        sent: list[dict[str, str]],
    ) -> None:
        """The whole value of the record is a second named person."""
        passport_id = _create_passport(holder_client)

        response = self._invite(
            holder_client, passport_id, email=holder.email.upper()
        )

        assert response.status_code == 400
        assert sent == []

    def test_a_bystander_cannot_invite_on_somebody_else_s_passport(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: Organisation,
        sent: list[dict[str, str]],
    ) -> None:
        """A 404, not a 403: an unrelated passport is invisible."""
        passport_id = _create_passport(holder_client)

        bystander_client = _login(test_client, "bystander")
        response = self._invite(bystander_client, passport_id)

        assert response.status_code == 404
        assert sent == []

    def test_the_daily_limit_is_per_holder(
        self,
        holder_client: TestClient,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        sent: list[dict[str, str]],
    ) -> None:
        """Counted per passport, not per address.

        A limiter keyed on the remote address would throttle a hospital's
        whole NAT and leave a holder free to invite from anywhere else.

        The ceiling is lowered for the test. What is under test is that
        a limit exists and is counted per passport; driving the real
        hundred through HTTP would prove the same thing a hundred times
        more slowly, and would then have to be rewritten every time
        somebody tuned the number.
        """
        monkeypatch.setattr(router, "INVITES_PER_DAY", 3)
        passport_id = _create_passport(holder_client)

        for index in range(3):
            response = self._invite(
                holder_client,
                passport_id,
                email=f"assessor{index}@other-trust.nhs.uk",
            )
            assert response.status_code == 201, response.text

        response = self._invite(
            holder_client, passport_id, email="one-too-many@example.nhs.uk"
        )

        assert response.status_code == 429
        assert len(sent) == 3

    def test_the_cap_is_a_backstop_not_a_quota(self) -> None:
        """High enough that a rotation's worth of sign-offs never meets it.

        Pinned because the number is a judgement, and a later edit that
        dropped it to something a busy trainee could hit would look
        like tightening security while quietly breaking the feature.
        """
        assert router.INVITES_PER_DAY >= 50

    def test_the_holder_sees_their_invitations_newest_first(
        self,
        holder_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        passport_id = _create_passport(holder_client)

        self._invite(
            holder_client, passport_id, email="first@other-trust.nhs.uk"
        )
        self._invite(
            holder_client, passport_id, email="second@other-trust.nhs.uk"
        )

        response = holder_client.get(
            f"/api/passport/{passport_id}/assessor-invites"
        )

        assert response.status_code == 200, response.text
        listed = response.json()
        assert len(listed) == 2
        assert {row["email"] for row in listed} == {
            "first@other-trust.nhs.uk",
            "second@other-trust.nhs.uk",
        }
        for row in listed:
            assert "token" not in row
            assert "token_hash" not in row

    def test_a_bystander_cannot_list_them(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: Organisation,
        sent: list[dict[str, str]],
    ) -> None:
        """An invitation names an address and a declared registration."""
        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)

        bystander_client = _login(test_client, "bystander")
        response = bystander_client.get(
            f"/api/passport/{passport_id}/assessor-invites"
        )

        assert response.status_code == 404


class TestAcceptingAnInvitation:
    """Opening the link is not what consumes it; registering is.

    The distinction is the difference between a workable invitation and
    a dead end. An assessor who opens the link between clinics and
    closes the tab, or who starts registering and is interrupted, must
    be able to come back to it for the whole fourteen days.
    """

    @pytest.fixture
    def sent(self, monkeypatch: pytest.MonkeyPatch) -> list[dict[str, str]]:
        outbox: list[dict[str, str]] = []

        def capture(
            *, to: str, subject: str, html_body: str, **kw: object
        ) -> None:
            outbox.append({"to": to, "html_body": html_body})

        monkeypatch.setattr(router, "send_email", capture)
        return outbox

    def _token(self, sent: list[dict[str, str]]) -> str:
        """The token as it was actually emailed."""
        return sent[-1]["html_body"].split("token=")[1].split('"')[0]

    def _invite(
        self,
        client: TestClient,
        passport_id: str,
        *,
        email: str = "okafor@other-trust.nhs.uk",
    ) -> None:
        response = client.post(
            f"/api/passport/{passport_id}/assessor-invites",
            json={
                "email": email,
                "name": "Dr Amara Okafor",
                "registration_authority": "GMC",
                "registration_number": "7654321",
            },
        )
        assert response.status_code == 201, response.text

    def _accept(
        self,
        client: TestClient,
        token: str,
        *,
        username: str | None = "okafor",
        password: str | None = "AssessorPassword123!",
    ) -> Response:
        body: dict[str, object] = {"token": token}
        if username is not None:
            body["username"] = username
        if password is not None:
            body["password"] = password
        return client.post("/api/passport/assessor-invites/accept", json=body)

    def test_the_link_can_be_opened_repeatedly(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """The tab-closed case. Reading is not accepting."""
        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)
        token = self._token(sent)

        for _ in range(3):
            response = test_client.get(
                "/api/passport/assessor-invites/preview",
                params={"token": token},
            )
            assert response.status_code == 200, response.text
            body = response.json()
            assert body["assessor_name"] == "Dr Amara Okafor"
            assert body["needs_account"] is True
            assert body["already_accepted"] is False

    def test_the_preview_says_who_is_asking_and_nothing_more(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """A cold recipient needs to know who is asking.

        They do not need the passport's id, its contents, or anything
        about the holder beyond a name.
        """
        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)

        response = test_client.get(
            "/api/passport/assessor-invites/preview",
            params={"token": self._token(sent)},
        )

        body = response.json()
        assert body["holder_name"] == "Dr Holder"
        assert passport_id not in response.text
        for leaked in ("competencies", "sign_offs", "passport_id"):
            assert leaked not in body

    def test_an_interrupted_registration_can_be_resumed(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """A failed attempt must not spend the invitation.

        This is the case that turns a mistyped password into a dead end
        if ``accepted_at`` is set too early.
        """
        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)
        token = self._token(sent)

        # Too short: refused, and the invitation is untouched.
        first = self._accept(test_client, token, password="short")
        assert first.status_code == 400

        second = self._accept(test_client, token)
        assert second.status_code == 200, second.text
        assert second.json()["status"] == "registered"

    def test_registering_consumes_the_invitation(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        sent: list[dict[str, str]],
    ) -> None:
        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)
        token = self._token(sent)

        first = self._accept(test_client, token)
        assert first.status_code == 200, first.text

        second = self._accept(test_client, token, username="okafor2")
        assert second.status_code == 409

    def test_a_click_after_acceptance_is_not_an_error(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """The link has done its job; the page sends them to sign in.

        Scolding somebody for reusing their own link is the software
        blaming a person for its own model.
        """
        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)
        token = self._token(sent)
        self._accept(test_client, token)

        response = test_client.get(
            "/api/passport/assessor-invites/preview",
            params={"token": token},
        )

        assert response.status_code == 200
        assert response.json()["already_accepted"] is True
        assert response.json()["needs_account"] is False

    def test_a_new_assessor_gets_the_external_assessor_profession(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        sent: list[dict[str, str]],
    ) -> None:
        """The profession is the whole grant: the passport and nothing else."""
        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)

        response = self._accept(test_client, self._token(sent))
        assert response.status_code == 200, response.text

        user = db_session.get(User, response.json()["user_id"])
        assert user is not None
        assert user.base_profession == "external_assessor"
        assert user.professional_registrations == {"GMC": "7654321"}
        assert "access_clinician_passport" in user.get_final_competencies()
        assert "access_patient_records" not in user.get_final_competencies()

    def test_the_membership_is_external_at_the_holder_s_organisation(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        sent: list[dict[str, str]],
    ) -> None:
        """A holder at organisation level only yields an org membership."""
        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)

        response = self._accept(test_client, self._token(sent))
        body = response.json()

        assert body["place"] == "organisation"
        # A place id whichever kind ``place`` says, now that membership
        # counts in places. It used to be the organisation's own id.
        assert body["place_id"] == org.org_unit_id

        capacity = db_session.scalar(
            select(organisation_place_member.c.capacity).where(
                organisation_place_member.c.org_unit_id == org.org_unit_id,
                organisation_place_member.c.user_id == body["user_id"],
            )
        )
        assert capacity == "external"

    def test_a_sited_holder_yields_a_site_membership(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        holder: User,
        org: Organisation,
        sent: list[dict[str, str]],
    ) -> None:
        """The narrowest place the holder holds, so a site over its org."""
        site = OrgUnit(name="Ward 9", type="ward")
        db_session.add(site)
        db_session.commit()
        db_session.refresh(site)
        db_session.execute(
            update(OrgUnit)
            .where(OrgUnit.id == site.id)
            .values(parent_id=org.org_unit_id)
        )
        db_session.execute(
            org_unit_member.insert().values(
                org_unit_id=site.id,
                user_id=holder.id,
                capacity="trainee",
            )
        )
        db_session.commit()

        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)

        response = self._accept(test_client, self._token(sent))
        body = response.json()

        assert body["place"] == "site"
        assert body["place_id"] == site.id

        capacity = db_session.scalar(
            select(org_unit_member.c.capacity).where(
                org_unit_member.c.org_unit_id == site.id,
                org_unit_member.c.user_id == body["user_id"],
            )
        )
        assert capacity == "external"

    def test_an_existing_user_keeps_what_they_already_hold(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        assessor: User,
        org: Organisation,
        sent: list[dict[str, str]],
    ) -> None:
        """Memberships are per place and independent.

        A consultant who is staff at their own site becomes external at
        the registrar's, holding nothing more there. What they may do at
        their own site is untouched.
        """
        own_site = OrgUnit(name="Their Own Ward", type="ward")
        db_session.add(own_site)
        db_session.commit()
        db_session.refresh(own_site)
        db_session.execute(
            org_unit_member.insert().values(
                org_unit_id=own_site.id,
                user_id=assessor.id,
                capacity="staff",
            )
        )
        db_session.commit()

        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id, email=assessor.email)

        response = self._accept(
            test_client, self._token(sent), username=None, password=None
        )

        assert response.status_code == 200, response.text
        assert response.json()["status"] == "linked"
        assert response.json()["user_id"] == assessor.id

        db_session.refresh(assessor)
        assert assessor.base_profession == "consultant"

        kept = db_session.scalar(
            select(org_unit_member.c.capacity).where(
                org_unit_member.c.org_unit_id == own_site.id,
                org_unit_member.c.user_id == assessor.id,
            )
        )
        assert kept == "staff"

    def test_a_forged_or_expired_token_is_refused(
        self, test_client: TestClient
    ) -> None:
        """One message for every failure, so nothing is learned by probing."""
        for token in ("not-a-token", "", "a.b.c"):
            response = test_client.post(
                "/api/passport/assessor-invites/accept",
                json={"token": token or "x"},
            )
            assert response.status_code in (400, 422)

    def test_accepting_needs_no_feature_flag(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """The gate resolves through membership, which an invitee lacks.

        Gating these routes would make an invitation impossible to
        accept — a circular dependency that is obvious once seen and
        invisible in review.
        """
        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)
        token = self._token(sent)

        # A brand new client with no session at all.
        preview = test_client.get(
            "/api/passport/assessor-invites/preview",
            params={"token": token},
        )

        assert preview.status_code == 200, preview.text


class TestTheGateResolvesForAnAcceptedAssessor:
    """The membership the accept endpoint writes is what lets them in.

    ``requires_feature`` unions organisation membership with site
    membership resolved through the site's organisation, and reads no
    capacity at all — so an ``external`` member passes exactly as a
    ``staff`` one does. That is the whole reason no sibling gate is
    needed, and it is pinned here rather than reasoned about, because
    it is a property of code in another module that could change
    without anybody thinking about assessors.

    A passport route also demands ``access_clinician_passport``, which
    for a new account comes from the ``external_assessor`` profession.
    Both halves have to hold for an assessor to reach anything, so both
    are exercised together through a real route.
    """

    @pytest.fixture
    def sent(self, monkeypatch: pytest.MonkeyPatch) -> list[dict[str, str]]:
        outbox: list[dict[str, str]] = []

        def capture(
            *, to: str, subject: str, html_body: str, **kw: object
        ) -> None:
            outbox.append({"to": to, "html_body": html_body})

        monkeypatch.setattr(router, "send_email", capture)
        return outbox

    def _invite_and_accept(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        passport_id: str,
        sent: list[dict[str, str]],
    ) -> int:
        """Run the real flow, and return the new assessor's user id."""
        invited = holder_client.post(
            f"/api/passport/{passport_id}/assessor-invites",
            json={
                "email": "okafor@other-trust.nhs.uk",
                "name": "Dr Amara Okafor",
                "registration_authority": "GMC",
                "registration_number": "7654321",
            },
        )
        assert invited.status_code == 201, invited.text

        token = sent[-1]["html_body"].split("token=")[1].split('"')[0]

        accepted = test_client.post(
            "/api/passport/assessor-invites/accept",
            json={
                "token": token,
                "username": "okafor",
                # The password ``_login`` uses, so the assessor can then
                # sign in through the ordinary route like anybody else.
                "password": "PassportPassword123!",
            },
        )
        assert accepted.status_code == 200, accepted.text

        return int(accepted.json()["user_id"])

    def test_an_organisation_membership_opens_the_gate(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        sent: list[dict[str, str]],
    ) -> None:
        """The ordinary case: the holder sits at organisation level."""
        passport_id = _create_passport(holder_client)
        self._invite_and_accept(holder_client, test_client, passport_id, sent)

        assessor_client = _login(test_client, "okafor")
        response = assessor_client.get("/api/passport/requests/inbox")

        assert response.status_code == 200, response.text
        assert response.json() == []

    def test_a_site_membership_opens_it_through_its_organisation(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        holder: User,
        org: Organisation,
        sent: list[dict[str, str]],
    ) -> None:
        """The feature is enabled on the organisation, not the site.

        So this only works because ``requires_feature`` joins
        the site's own organisation column. A site
        membership alone would otherwise resolve to nothing.
        """
        site = OrgUnit(name="Ward 11", type="ward")
        db_session.add(site)
        db_session.commit()
        db_session.refresh(site)
        db_session.execute(
            update(OrgUnit)
            .where(OrgUnit.id == site.id)
            .values(parent_id=org.org_unit_id)
        )
        db_session.execute(
            org_unit_member.insert().values(
                org_unit_id=site.id,
                user_id=holder.id,
                capacity="trainee",
            )
        )
        db_session.commit()

        passport_id = _create_passport(holder_client)
        assessor_id = self._invite_and_accept(
            holder_client, test_client, passport_id, sent
        )

        # The membership written was a site one, not an organisation one.
        at_site = db_session.scalar(
            select(org_unit_member.c.capacity).where(
                org_unit_member.c.org_unit_id == site.id,
                org_unit_member.c.user_id == assessor_id,
            )
        )
        at_org = db_session.scalar(
            select(organisation_place_member.c.user_id).where(
                organisation_place_member.c.org_unit_id == org.org_unit_id,
                organisation_place_member.c.user_id == assessor_id,
            )
        )
        assert at_site == "external"
        assert at_org is None

        assessor_client = _login(test_client, "okafor")
        response = assessor_client.get("/api/passport/requests/inbox")

        assert response.status_code == 200, response.text

    def test_capacity_is_not_read_by_the_gate(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        sent: list[dict[str, str]],
    ) -> None:
        """``external`` passes exactly as ``staff`` would.

        Stated as its own test because the opposite — a gate that
        quietly required ``staff`` — would leave every invited assessor
        with a 403 and no obvious cause.
        """
        passport_id = _create_passport(holder_client)
        assessor_id = self._invite_and_accept(
            holder_client, test_client, passport_id, sent
        )

        capacity = db_session.scalar(
            select(organisation_place_member.c.capacity).where(
                organisation_place_member.c.user_id == assessor_id,
            )
        )
        assert capacity == "external"

        assessor_client = _login(test_client, "okafor")

        assert (
            assessor_client.get("/api/passport/requests/inbox").status_code
            == 200
        )

    def test_an_assessor_still_cannot_read_the_holder_s_passport(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """The gate is not authorisation, and must not be mistaken for it.

        Passing ``requires_feature`` says only that the passport feature
        is on where they are. What they may see is still resolved from
        the request rows naming them, and they are named on none.
        """
        passport_id = _create_passport(holder_client)
        self._invite_and_accept(holder_client, test_client, passport_id, sent)

        assessor_client = _login(test_client, "okafor")
        response = assessor_client.get(f"/api/passport/{passport_id}")

        assert response.status_code == 404


class TestAdminVerifyAndRevoke:
    """What an organisation's admin may do about an outside assessor.

    "Admin of the holder's organisation" is two questions. ``manage_users``
    says *what* somebody may do and is global; membership says *where*.
    Either alone is wrong — the competency by itself would make an admin
    at one trust an administrator of every assessor in Quill — so the
    tests that matter most here are the ones proving an admin elsewhere
    is refused.
    """

    @pytest.fixture
    def sent(self, monkeypatch: pytest.MonkeyPatch) -> list[dict[str, str]]:
        outbox: list[dict[str, str]] = []

        def capture(
            *, to: str, subject: str, html_body: str, **kw: object
        ) -> None:
            outbox.append({"to": to, "html_body": html_body})

        monkeypatch.setattr(router, "send_email", capture)
        return outbox

    @pytest.fixture
    def admin(self, db_session: Session, org: Organisation) -> User:
        """An admin of the holder's organisation."""
        user = _make_user(db_session, "orgadmin", profession="consultant")
        user.additional_competencies = ["manage_users"]
        add_place_member(db_session, org.org_unit_id, user.id, "staff")
        db_session.commit()
        db_session.refresh(user)
        return user

    @pytest.fixture
    def outsider_admin(self, db_session: Session) -> User:
        """An admin, but of a different trust entirely.

        The case a check on ``manage_users`` alone would wrongly allow.
        """
        user = _make_user(db_session, "otheradmin", profession="consultant")
        user.additional_competencies = ["manage_users"]

        other = Organisation(name="Unrelated Trust")
        db_session.add(other)
        db_session.commit()
        db_session.refresh(other)

        db_session.add(
            OrgUnitFeature(
                org_unit_id=other.org_unit_id, feature_key="passport"
            )
        )
        add_place_member(db_session, other.org_unit_id, user.id, "staff")
        db_session.commit()
        db_session.refresh(user)
        return user

    def _accept_an_assessor(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> int:
        """Run the real invite and accept flow; return the assessor's id."""
        passport_id = _create_passport(holder_client)
        holder_client.post(
            f"/api/passport/{passport_id}/assessor-invites",
            json={
                "email": "okafor@other-trust.nhs.uk",
                "name": "Dr Amara Okafor",
                "registration_authority": "GMC",
                "registration_number": "7654321",
            },
        )
        token = sent[-1]["html_body"].split("token=")[1].split('"')[0]

        accepted = test_client.post(
            "/api/passport/assessor-invites/accept",
            json={
                "token": token,
                "username": "okafor",
                "password": "PassportPassword123!",
            },
        )
        assert accepted.status_code == 200, accepted.text
        return int(accepted.json()["user_id"])

    def test_an_admin_can_verify_a_declared_registration(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        admin: User,
        sent: list[dict[str, str]],
    ) -> None:
        assessor_id = self._accept_an_assessor(
            holder_client, test_client, sent
        )

        admin_client = _login(test_client, "orgadmin")
        response = admin_client.post(
            f"/api/passport/assessors/{assessor_id}/registration-verification",
            json={
                "registration_authority": "GMC",
                "registration_number": "7654321",
            },
        )

        assert response.status_code == 201, response.text
        body = response.json()
        assert body["verified_by_name"] == "Dr Orgadmin"
        assert body["verified_at"] is not None

    def test_an_admin_at_another_trust_cannot(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        outsider_admin: User,
        sent: list[dict[str, str]],
    ) -> None:
        """The whole reason a place check sits beside the competency.

        A 404 rather than a 403, so the response does not confirm the
        assessor exists to somebody who may not act on them.
        """
        assessor_id = self._accept_an_assessor(
            holder_client, test_client, sent
        )

        admin_client = _login(test_client, "otheradmin")
        response = admin_client.post(
            f"/api/passport/assessors/{assessor_id}/registration-verification",
            json={
                "registration_authority": "GMC",
                "registration_number": "7654321",
            },
        )

        assert response.status_code == 404

    def test_a_clinician_without_manage_users_cannot(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """Membership alone is not authority."""
        assessor_id = self._accept_an_assessor(
            holder_client, test_client, sent
        )

        response = holder_client.post(
            f"/api/passport/assessors/{assessor_id}/registration-verification",
            json={
                "registration_authority": "GMC",
                "registration_number": "7654321",
            },
        )

        assert response.status_code == 404

    def test_a_number_the_assessor_never_declared_is_refused(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        admin: User,
        sent: list[dict[str, str]],
    ) -> None:
        """Otherwise the row records a check of something Quill has no
        reason to associate with them."""
        assessor_id = self._accept_an_assessor(
            holder_client, test_client, sent
        )

        admin_client = _login(test_client, "orgadmin")
        response = admin_client.post(
            f"/api/passport/assessors/{assessor_id}/registration-verification",
            json={
                "registration_authority": "GMC",
                "registration_number": "0000000",
            },
        )

        assert response.status_code == 400

    def test_verifying_twice_updates_rather_than_duplicates(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        admin: User,
        sent: list[dict[str, str]],
    ) -> None:
        """Re-checking is an update of when it was last confirmed."""
        assessor_id = self._accept_an_assessor(
            holder_client, test_client, sent
        )

        admin_client = _login(test_client, "orgadmin")
        payload = {
            "registration_authority": "GMC",
            "registration_number": "7654321",
        }

        first = admin_client.post(
            f"/api/passport/assessors/{assessor_id}/registration-verification",
            json=payload,
        )
        second = admin_client.post(
            f"/api/passport/assessors/{assessor_id}/registration-verification",
            json=payload,
        )

        assert first.status_code == 201
        assert second.status_code == 201, second.text

        rows = db_session.scalars(
            select(AssessorRegistrationVerification).where(
                AssessorRegistrationVerification.user_id == assessor_id
            )
        ).all()
        assert len(rows) == 1

    def test_revoking_removes_the_membership(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        admin: User,
        org: Organisation,
        sent: list[dict[str, str]],
    ) -> None:
        assessor_id = self._accept_an_assessor(
            holder_client, test_client, sent
        )

        admin_client = _login(test_client, "orgadmin")
        response = admin_client.delete(
            f"/api/passport/assessors/{assessor_id}/membership"
        )

        assert response.status_code == 200, response.text

        remaining = db_session.scalar(
            select(organisation_place_member.c.user_id).where(
                organisation_place_member.c.org_unit_id == org.org_unit_id,
                organisation_place_member.c.user_id == assessor_id,
            )
        )
        assert remaining is None

    def test_revoking_leaves_the_sign_offs_they_made_intact(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        admin: User,
        sent: list[dict[str, str]],
    ) -> None:
        """A record of who assessed somebody is not undone by that person
        later losing their access — the assessment happened."""
        assessor_id = self._accept_an_assessor(
            holder_client, test_client, sent
        )

        # A resolved request stands in for a sign-off the assessor made.
        passport_id = db_session.scalar(select(Passport.id))
        db_session.add(
            PassportSignOffRequest(
                passport_id=passport_id,
                signoff_id="2026-03-14-a-thing",
                competency_id=COMPETENCY,
                assessor_user_id=assessor_id,
                status="signed_off",
            )
        )
        db_session.commit()

        admin_client = _login(test_client, "orgadmin")
        response = admin_client.delete(
            f"/api/passport/assessors/{assessor_id}/membership"
        )

        assert response.status_code == 200, response.text
        assert response.json()["sign_offs_kept"] == 1

        still_there = db_session.scalar(
            select(PassportSignOffRequest.id).where(
                PassportSignOffRequest.assessor_user_id == assessor_id,
                PassportSignOffRequest.status == "signed_off",
            )
        )
        assert still_there is not None

    def test_revoking_never_removes_a_staff_membership(
        self,
        test_client: TestClient,
        db_session: Session,
        admin: User,
        assessor: User,
        org: Organisation,
        passport_store: LocalPassportStore,
    ) -> None:
        """Otherwise a passport route could quietly sack somebody from
        the trust they actually work for."""
        admin_client = _login(test_client, "orgadmin")
        response = admin_client.delete(
            f"/api/passport/assessors/{assessor.id}/membership"
        )

        assert response.status_code == 404

        still_staff = db_session.scalar(
            select(organisation_place_member.c.user_id).where(
                organisation_place_member.c.org_unit_id == org.org_unit_id,
                organisation_place_member.c.user_id == assessor.id,
            )
        )
        assert still_staff is not None

    def test_an_admin_at_another_trust_cannot_revoke(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        outsider_admin: User,
        sent: list[dict[str, str]],
    ) -> None:
        assessor_id = self._accept_an_assessor(
            holder_client, test_client, sent
        )

        admin_client = _login(test_client, "otheradmin")
        response = admin_client.delete(
            f"/api/passport/assessors/{assessor_id}/membership"
        )

        assert response.status_code == 404


class TestWhatAnExternalAssessorCannotReach:
    """The authorisation matrix for somebody invited from outside.

    An external assessor is the widest-reaching account the passport
    creates without an administrator ever approving it: a holder sends an
    email and a stranger gets a Quill login. So what they *cannot* do
    matters more here than what they can, and each clause is stated as
    its own test rather than inferred from the design.

    The membership they gain is a record that they were there. It is not
    a key to the place: what they may act on is resolved from the
    request rows naming them, and an assessor named on nothing reaches
    nothing.
    """

    @pytest.fixture
    def sent(self, monkeypatch: pytest.MonkeyPatch) -> list[dict[str, str]]:
        outbox: list[dict[str, str]] = []

        def capture(
            *, to: str, subject: str, html_body: str, **kw: object
        ) -> None:
            outbox.append({"to": to, "html_body": html_body})

        monkeypatch.setattr(router, "send_email", capture)
        return outbox

    def _accept(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
        *,
        passport_id: str,
        email: str = "okafor@other-trust.nhs.uk",
        username: str = "okafor",
    ) -> int:
        """Invite and accept for real; return the new assessor's id."""
        invited = holder_client.post(
            f"/api/passport/{passport_id}/assessor-invites",
            json={
                "email": email,
                "name": "Dr Amara Okafor",
                "registration_authority": "GMC",
                "registration_number": "7654321",
            },
        )
        assert invited.status_code == 201, invited.text

        token = sent[-1]["html_body"].split("token=")[1].split('"')[0]

        accepted = test_client.post(
            "/api/passport/assessor-invites/accept",
            json={
                "token": token,
                "username": username,
                "password": "PassportPassword123!",
            },
        )
        assert accepted.status_code == 200, accepted.text
        return int(accepted.json()["user_id"])

    def test_they_cannot_read_the_passport_that_invited_them(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """Being invited is not being given the record.

        A 404 rather than a 403: an assessor guessing at ids should not
        be able to tell which passports exist.
        """
        passport_id = _create_passport(holder_client)
        self._accept(holder_client, test_client, sent, passport_id=passport_id)

        assessor_client = _login(test_client, "okafor")

        assert (
            assessor_client.get(f"/api/passport/{passport_id}").status_code
            == 404
        )

    def test_they_cannot_read_the_holder_s_reflections(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """Holder-only, and the narrower default is the safer one.

        Written reflection can be disclosed in legal proceedings, so an
        assessor gaining it by way of an invitation would be the worst
        version of this feature.
        """
        passport_id = _create_passport(holder_client)
        self._accept(holder_client, test_client, sent, passport_id=passport_id)

        assessor_client = _login(test_client, "okafor")
        response = assessor_client.get(
            f"/api/passport/{passport_id}/reflections"
        )

        assert response.status_code == 404

    def test_they_cannot_see_another_assessor_s_requests(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        assessor: User,
        sent: list[dict[str, str]],
    ) -> None:
        """The inbox is a cross-passport query, so it is the one place a
        leak would expose every holder at once."""
        passport_id = _create_passport(holder_client)
        external_id = self._accept(
            holder_client, test_client, sent, passport_id=passport_id
        )

        # A request naming the *other* assessor, not the external one.
        holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_user_id": assessor.id,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        assessor_client = _login(test_client, "okafor")
        response = assessor_client.get("/api/passport/requests/inbox")

        assert response.status_code == 200, response.text
        assert response.json() == []
        assert external_id != assessor.id

    def test_they_cannot_list_users(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """``external_assessor`` carries the passport competency alone.

        Without this the invitation would hand a stranger the staff
        directory of a trust they do not work for.
        """
        passport_id = _create_passport(holder_client)
        self._accept(holder_client, test_client, sent, passport_id=passport_id)

        assessor_client = _login(test_client, "okafor")

        assert assessor_client.get("/api/users").status_code == 403

    def test_they_cannot_list_places(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        passport_id = _create_passport(holder_client)
        self._accept(holder_client, test_client, sent, passport_id=passport_id)

        assessor_client = _login(test_client, "okafor")

        assert assessor_client.get("/api/org-units").status_code == 403

    def test_they_cannot_verify_or_revoke_anybody(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """The admin endpoints need ``manage_users``, which they lack.

        Worth its own test because an assessor *is* a member of the
        place, and a check that asked only about membership would let
        them administer the people there.
        """
        passport_id = _create_passport(holder_client)
        external_id = self._accept(
            holder_client, test_client, sent, passport_id=passport_id
        )

        assessor_client = _login(test_client, "okafor")

        verify = assessor_client.post(
            f"/api/passport/assessors/{external_id}/registration-verification",
            json={
                "registration_authority": "GMC",
                "registration_number": "7654321",
            },
        )
        revoke = assessor_client.delete(
            f"/api/passport/assessors/{external_id}/membership"
        )

        assert verify.status_code == 404
        assert revoke.status_code == 404

    def _stale_invite(
        self, holder_client: TestClient, db_session: Session, passport_id: str
    ) -> PassportAssessorInvite:
        """An invitation whose fortnight has already run out."""
        holder_client.post(
            f"/api/passport/{passport_id}/assessor-invites",
            json={
                "email": "late@other-trust.nhs.uk",
                "name": "Dr Late Arrival",
                "registration_authority": "GMC",
                "registration_number": "1112223",
            },
        )

        invite = db_session.scalar(
            select(PassportAssessorInvite).where(
                PassportAssessorInvite.email == "late@other-trust.nhs.uk"
            )
        )
        assert invite is not None

        invite.expires_at = datetime.now(UTC) - timedelta(days=1)
        db_session.commit()

        return invite

    def test_an_invitation_past_its_fortnight_is_refused(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        sent: list[dict[str, str]],
    ) -> None:
        """Fourteen days bounds joining, and the bound is real.

        The row's own ``expires_at`` is the check exercised here. It is
        checked as well as the token's ``exp`` because the row is what an
        administrator can see and reason about, and the two must not be
        able to disagree — so the row alone has to be able to refuse.
        """
        passport_id = _create_passport(holder_client)
        self._stale_invite(holder_client, db_session, passport_id)

        token = sent[-1]["html_body"].split("token=")[1].split('"')[0]

        preview = test_client.get(
            "/api/passport/assessor-invites/preview",
            params={"token": token},
        )
        accepted = test_client.post(
            "/api/passport/assessor-invites/accept",
            json={
                "token": token,
                "username": "late-arrival",
                "password": "PassportPassword123!",
            },
        )

        assert preview.status_code == 400
        assert accepted.status_code == 400

    def test_a_token_whose_own_expiry_has_passed_is_refused(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        sent: list[dict[str, str]],
    ) -> None:
        """The other half of the same guarantee.

        ``create_passport_invite_token`` refuses a lifetime below a day,
        which is right everywhere but here — minting an already-dead
        token is a bug in real code. So this signs one directly with the
        same key to reach the ``exp`` check inside ``jwt.decode``, which
        is what actually stops a fortnight-old link.
        """
        passport_id = _create_passport(holder_client)
        holder_client.post(
            f"/api/passport/{passport_id}/assessor-invites",
            json={
                "email": "stale@other-trust.nhs.uk",
                "name": "Dr Stale Link",
                "registration_authority": "GMC",
                "registration_number": "4445556",
            },
        )

        invite = db_session.scalar(
            select(PassportAssessorInvite).where(
                PassportAssessorInvite.email == "stale@other-trust.nhs.uk"
            )
        )
        assert invite is not None

        expired = jwt.encode(
            {
                "type": PASSPORT_INVITE_TYPE,
                "invite_id": invite.id,
                "email": invite.email,
                "exp": datetime.now(UTC) - timedelta(seconds=1),
            },
            settings.JWT_SECRET.get_secret_value(),
            algorithm=settings.JWT_ALG,
        )

        response = test_client.get(
            "/api/passport/assessor-invites/preview",
            params={"token": expired},
        )

        assert response.status_code == 400

    def test_a_consumed_token_is_refused(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """Single use is enforced by the row, since a JWT cannot carry a
        record of having been spent."""
        passport_id = _create_passport(holder_client)
        self._accept(holder_client, test_client, sent, passport_id=passport_id)

        token = sent[-1]["html_body"].split("token=")[1].split('"')[0]

        again = test_client.post(
            "/api/passport/assessor-invites/accept",
            json={
                "token": token,
                "username": "okafor-again",
                "password": "PassportPassword123!",
            },
        )

        assert again.status_code == 409

    def test_the_membership_alone_grants_nothing_at_the_place(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        sent: list[dict[str, str]],
    ) -> None:
        """The summary of the whole matrix.

        They hold a membership at the holder's organisation and the
        passport competency as a ceiling, and still reach nothing there:
        not the passport that invited them, not the people, not the
        place itself. What they may act on comes from the request
        rows naming them, and they are named on none.
        """
        passport_id = _create_passport(holder_client)
        assessor_id = self._accept(
            holder_client, test_client, sent, passport_id=passport_id
        )

        member = db_session.scalar(
            select(organisation_place_member.c.capacity).where(
                organisation_place_member.c.org_unit_id == org.org_unit_id,
                organisation_place_member.c.user_id == assessor_id,
            )
        )
        assert member == "external"

        assessor_client = _login(test_client, "okafor")

        assert (
            assessor_client.get(f"/api/passport/{passport_id}").status_code
            == 404
        )
        assert assessor_client.get("/api/users").status_code == 403
        assert assessor_client.get("/api/org-units").status_code == 403
        assert assessor_client.get("/api/passport/requests/inbox").json() == []


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
        add_place_member(
            db_session, organisation.org_unit_id, user.id, "trainee"
        )
        db_session.commit()

        client = _login(test_client, "ungated")
        response = client.post("/api/passport")

        assert response.status_code == 403
