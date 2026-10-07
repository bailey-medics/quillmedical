"""Tests for app/features/passport/router.py.

The authorisation matrix and the state machine, exercised over HTTP.

The store is swapped for one rooted at a temporary directory through
``app.dependency_overrides`` – the same mechanism ``conftest.py`` already
uses to point the database at SQLite. Nothing in a request can reach that
dictionary; it is populated by test code and cleared afterwards, and the
deployed application resolves the store from configuration alone.

Three groups carry the weight:

**Who may see what.** A passport is a personal record, so every route is
tried as the holder, as a named assessor, and as an unrelated user who
holds the competency and belongs to the same organisation. The last is
the one that matters: an authorisation bug does not look like an error,
it looks like a successful response to the wrong person.

**Self-sign-off is refused.** The one hard rule, tested at both doors –
asking yourself, and signing your own. The assertion is not merely that
it is refused but that nothing is written when it is.

**A refused write changes nothing.** Every rejection path asserts the
head commit has not moved. A route that returns 403 after writing is
worse than one that returns 200, because the record disagrees with what
the caller was told.
"""

from __future__ import annotations

import hashlib
import io
import logging
import zipfile
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from jose import jwt
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import main
from app.config import settings
from app.email_send import EmailNotAllowedError, EmailRateLimitError
from app.features.passport import definitions, paths, router, specialties
from app.features.passport.blobs import BlobStore
from app.features.passport.models import (
    Passport,
    PassportAssessorInvite,
    PassportSignOffRequest,
)
from app.features.passport.store import LocalPassportStore
from app.main import app
from app.models import (
    OrgUnit,
    OrgUnitFeature,
    User,
    org_unit_member,
)
from app.organisations import (
    add_org_unit_member,
    organisation_org_unit_member,
)
from app.passport_storage import get_blob_store, get_passport_store
from app.security import PASSPORT_INVITE_TYPE, hash_password
from tests.competencies import hold, lapse
from tests.registrations import declare

#: From the oncology set drafted in Phase 0. Chosen because it declares
#: the UK SACT Board's four levels, so the level paths are exercised
#: rather than only the bare signed-off-or-not case.
COMPETENCY = "uk_sact_board_2023_prescribe_sact"
# The frameworks a test holder works to. A passport offers the
# competencies in its holder's frameworks and no others, so one made with
# none could record nothing.
WORKING_TO = {"frameworks": ["clinical", "uk_sact_board_2023"]}
# What a sign-off for it covers. It is signed off one tumour site at a
# time, so every request names one.
SCOPE = "lung"

#: One of that competency's levels, quoted from the framework.
LEVEL = "review_and_authorise"


@pytest.fixture
def passport_store(tmp_path: Path) -> Iterator[LocalPassportStore]:
    """Point every route at a passport store under a temporary directory.

    Overridden rather than configured, so no test can reach the real
    location even if settings are wrong. Cleared afterwards so one test
    cannot leak a store into the next.
    """
    root = tmp_path / "passports"
    store = LocalPassportStore(root)
    blobs = BlobStore(root)

    # Both, rooted together. Evidence lives beside the repository it
    # belongs to, so overriding only the passport store would leave the
    # blob store resolving the real configured location – which is the
    # one thing this fixture exists to make impossible.
    app.dependency_overrides[get_passport_store] = lambda: store
    app.dependency_overrides[get_blob_store] = lambda: blobs

    yield store

    app.dependency_overrides.pop(get_passport_store, None)
    app.dependency_overrides.pop(get_blob_store, None)


def _make_user(
    db: Session,
    username: str,
    *,
    profession: str = "consultant",
    registrations: dict[str, str] | None = None,
    writes: bool = False,
) -> User:
    """A user who holds ``assess_clinician_passport`` by profession.

    ``writes`` grants ``passport_write`` as well, which no profession
    carries: it is sold, and reaches a person through onboarding or an
    individual subscription, and always with a term. So a fixture
    holder gets a dated ``passport_write`` row, exactly as a real one
    does.
    """
    user = User(
        username=username,
        email=f"{username}@example.nhs.uk",
        full_name=f"Dr {username.title()}",
        password_hash=hash_password("PassportPassword123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    declare(user, registrations or {"GMC": "1234567"})
    if writes:
        hold(user, "passport_write")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _enable_passport(db: Session, *users: User) -> OrgUnit:
    """One organisation with the feature on, and everyone in it.

    ``requires_feature`` resolves through organisation membership, so
    without this every route answers 403 before any of the authorisation
    logic under test runs.
    """
    org = OrgUnit(name="Test Trust", type="hospital_team")
    db.add(org)
    db.commit()
    db.refresh(org)

    db.add(OrgUnitFeature(org_unit_id=org.id, feature_key="passport"))

    for user in users:
        add_org_unit_member(db, org.id, user.id, "trainee")

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
        db_session,
        "holder",
        profession="specialty_trainee_3_plus",
        writes=True,
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
) -> OrgUnit:
    return _enable_passport(db_session, holder, assessor, bystander)


@pytest.fixture
def holder_client(
    test_client: TestClient,
    passport_store: LocalPassportStore,
    org: OrgUnit,
) -> TestClient:
    return _login(test_client, "holder")


def _create_passport(client: TestClient) -> str:
    """Create the caller's passport and return its id."""
    response = client.post("/api/passport", json=WORKING_TO)
    assert response.status_code == 201, response.text
    return str(response.json()["passport_id"])


class TestCreate:
    def test_a_holder_can_create_their_passport(
        self, holder_client: TestClient
    ) -> None:
        response = holder_client.post("/api/passport", json=WORKING_TO)

        assert response.status_code == 201
        body = response.json()
        assert len(body["passport_id"]) == 32
        assert body["holder_name"] == "Dr Holder"

    def test_a_second_passport_is_refused(
        self, holder_client: TestClient
    ) -> None:
        """One per person. A second would be a partial second career."""
        _create_passport(holder_client)

        response = holder_client.post("/api/passport", json=WORKING_TO)

        assert response.status_code == 409

    def test_registrations_are_recorded_as_declared(
        self, holder_client: TestClient
    ) -> None:
        """Quill checks no register, and the response says so."""
        response = holder_client.post("/api/passport", json=WORKING_TO)

        registrations = response.json()["registrations"]
        assert registrations
        assert all(set(r) == {"body", "number"} for r in registrations)


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
        org: OrgUnit,
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


class TestSearchingForAnAssessor:
    """Finding somebody a trainee already knows, not browsing a list."""

    def test_it_does_not_return_somebody_from_an_unrelated_place(
        self,
        holder_client: TestClient,
        db_session: Session,
        org: OrgUnit,
    ) -> None:
        """A stranger's registration number is not there to be browsed.

        Written as an ``xfail`` when the authorisation review found the
        search unscoped, and passing now because the route requires the
        whole address. Searching by a fragment of a username reaches
        nobody, wherever they are.
        """
        elsewhere = OrgUnit(name="Unrelated Trust", type="organisation")
        db_session.add(elsewhere)
        db_session.commit()
        db_session.refresh(elsewhere)

        stranger = _make_user(
            db_session,
            "stranger_elsewhere",
            registrations={"GMC": "7654321"},
        )
        db_session.execute(
            org_unit_member.insert().values(
                org_unit_id=elsewhere.id,
                user_id=stranger.id,
                capacity="staff",
            )
        )
        db_session.commit()

        response = holder_client.get(
            "/api/passport/assessors/search",
            params={"q": "stranger_elsewhere"},
        )

        assert response.status_code == 200, response.text
        found = {match["user_id"] for match in response.json()["matches"]}
        assert stranger.id not in found

    def test_only_the_whole_address_finds_them(
        self, holder_client: TestClient, assessor: User
    ) -> None:
        """A username or a name finds nobody, and that is the point.

        Matching those made the route a directory: any holder of
        ``assess_clinician_passport`` could read back the address and
        registration number of every active account. The caller already
        knows the address, because it is what the invitation is sent
        to, so requiring it costs a legitimate holder nothing.
        """
        for term in (assessor.username, "Assessor"):
            response = holder_client.get(
                "/api/passport/assessors/search", params={"q": term}
            )

            assert response.status_code == 200, response.text
            assert response.json()["matches"] == [], f"{term!r} found somebody"

        for term in (assessor.email, assessor.email.upper()):
            response = holder_client.get(
                "/api/passport/assessors/search", params={"q": term}
            )

            assert response.status_code == 200, response.text
            found = [m["user_id"] for m in response.json()["matches"]]
            assert assessor.id in found, f"{term!r} found nobody"

    def test_the_registration_number_comes_back(
        self, holder_client: TestClient, assessor: User
    ) -> None:
        """Hard evidence that this is the right person.

        Two consultants may share a name and an address says only that
        somebody controls a mailbox. The number says which registered
        professional this is.
        """
        response = holder_client.get(
            "/api/passport/assessors/search",
            params={"q": assessor.email},
        )

        match = response.json()["matches"][0]
        assert match["registrations"], response.text
        assert match["registrations"][0]["number"] == "1234567"
        # Declared, never checked by Quill. A screen that implied
        # otherwise would be claiming something nobody did.
        assert set(match["registrations"][0]) == {"body", "number"}

    def test_finding_nobody_is_not_an_error(
        self, holder_client: TestClient
    ) -> None:
        """The case the whole flow exists for.

        The consultant who observed the work is often at another trust
        and has never used Quill. An empty answer is success: the
        trainee goes on to ask by the address they typed.
        """
        response = holder_client.get(
            "/api/passport/assessors/search",
            params={"q": "nobody-here@other-trust.nhs.uk"},
        )

        assert response.status_code == 200, response.text
        assert response.json()["matches"] == []

    def test_a_partial_address_finds_nobody_rather_than_erroring(
        self, holder_client: TestClient, assessor: User
    ) -> None:
        """Part way through typing is not a mistake.

        There used to be a minimum length, refused with a 400. Nothing
        but a whole address can match now, so a partial one is simply
        an empty answer and the field stays quiet until it is finished.
        """
        partials = (
            "a",
            assessor.email.split("@")[0],
            # Contains an `@`, so it gets as far as the query. A
            # substring match would return every account at the domain,
            # which is the hole this route was found to have.
            "@" + assessor.email.split("@")[1],
            assessor.email[:-1],
        )

        for term in partials:
            response = holder_client.get(
                "/api/passport/assessors/search", params={"q": term}
            )

            assert response.status_code == 200, response.text
            assert response.json()["matches"] == [], f"{term!r} found somebody"

    def test_you_do_not_find_yourself(
        self, holder_client: TestClient, holder: User
    ) -> None:
        """Nobody assesses their own competency, so nobody offers to."""
        response = holder_client.get(
            "/api/passport/assessors/search",
            params={"q": holder.email},
        )

        assert response.status_code == 200, response.text
        found = [m["user_id"] for m in response.json()["matches"]]
        assert holder.id not in found

    def test_somebody_without_the_passport_competency_cannot_search(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
    ) -> None:
        """The passport competency is the door, as on every other route.

        Without it this would be a staff directory readable by anyone
        with an account, which is not what a search for one known
        assessor needs to be.
        """
        user = _make_user(db_session, "reception", profession="receptionist")
        add_org_unit_member(db_session, org.id, user.id, "staff")
        db_session.commit()

        client = _login(test_client, "reception")
        response = client.get(
            "/api/passport/assessors/search", params={"q": "assessor"}
        )

        assert response.status_code == 403, response.text


class TestRequestSignOff:
    def test_a_holder_can_request_one(
        self, holder_client: TestClient, assessor: User
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": assessor.email,
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        assert response.status_code == 201, response.text
        assert response.json()["status"] == "requested"

    def test_a_failed_email_makes_no_request(
        self,
        holder_client: TestClient,
        assessor: User,
        db_session: Session,
        passport_store: LocalPassportStore,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """No mail, no request, and nothing left behind.

        An assessor learns of a request only by email, so one that never
        went out would leave the holder believing they had asked and the
        assessor never knowing. The mail is therefore sent before
        anything is written.
        """
        passport_id = _create_passport(holder_client)
        before = passport_store.head(passport_id).commit

        def _explode(**_kwargs: object) -> None:
            raise RuntimeError("mail server unreachable")

        monkeypatch.setattr(router, "send_email", _explode)

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": assessor.email,
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        assert response.status_code == 502, response.text

        # The database has no row, and the repository has no commit:
        # the two failure modes this ordering exists to prevent.
        assert db_session.scalars(select(PassportSignOffRequest)).all() == []
        assert passport_store.head(passport_id).commit == before

    def test_a_scaled_competency_with_no_level_is_refused_before_any_email(
        self,
        holder_client: TestClient,
        assessor: User,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """What happened on the live site on 27 September 2026: the form
        sent no level, the assessor was emailed, then the request was
        refused and never saved."""
        passport_id = _create_passport(holder_client)
        mailed: list[str] = []
        monkeypatch.setattr(
            router, "send_email", lambda **kw: mailed.append(str(kw["to"]))
        )

        with caplog.at_level(logging.ERROR, logger=router.logger.name):
            response = holder_client.post(
                f"/api/passport/{passport_id}/competencies/{COMPETENCY}"
                "/requests",
                json={
                    "assessor_email": assessor.email,
                    "scope_id": SCOPE,
                    "observed_on": "2026-03-14",
                },
            )

        assert response.status_code == 400, response.text
        assert response.json()["detail"] == (
            "Choose the level you are asking to be signed off at."
        )
        assert mailed == []
        assert db_session.scalars(select(PassportAssessorInvite)).all() == []
        # Logged at error, which is what reaches the team: the form
        # should never send this, so it means the two disagree.
        assert any(
            record.levelno == logging.ERROR
            and COMPETENCY in record.getMessage()
            for record in caplog.records
        )

    def test_an_unknown_level_is_refused_before_any_email(
        self,
        holder_client: TestClient,
        assessor: User,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        passport_id = _create_passport(holder_client)
        mailed: list[str] = []
        monkeypatch.setattr(
            router, "send_email", lambda **kw: mailed.append(str(kw["to"]))
        )

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": assessor.email,
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": "not_a_level",
            },
        )

        assert response.status_code == 400, response.text
        assert "not_a_level" not in response.json()["detail"]
        assert mailed == []

    def test_a_scoped_competency_asked_for_with_no_scope_is_refused(
        self,
        holder_client: TestClient,
        assessor: User,
        monkeypatch: pytest.MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """Refused before the email, as a missing level is."""
        passport_id = _create_passport(holder_client)
        mailed: list[str] = []
        monkeypatch.setattr(
            router, "send_email", lambda **kw: mailed.append(str(kw["to"]))
        )

        with caplog.at_level(logging.ERROR, logger=router.logger.name):
            response = holder_client.post(
                f"/api/passport/{passport_id}/competencies/{COMPETENCY}"
                "/requests",
                json={
                    "assessor_email": assessor.email,
                    "observed_on": "2026-03-14",
                    "level_id": LEVEL,
                },
            )

        assert response.status_code == 400, response.text
        assert response.json()["detail"] == (
            "Choose what this sign-off covers."
        )
        assert mailed == []
        assert (
            holder_client.get(f"/api/passport/{passport_id}/sign-offs").json()
            == []
        )
        assert any(
            record.levelno == logging.ERROR for record in caplog.records
        )

    def test_a_scope_the_competency_does_not_declare_is_refused(
        self,
        holder_client: TestClient,
        assessor: User,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        passport_id = _create_passport(holder_client)
        mailed: list[str] = []
        monkeypatch.setattr(
            router, "send_email", lambda **kw: mailed.append(str(kw["to"]))
        )

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": assessor.email,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
                "scope_id": "left_elbow",
            },
        )

        assert response.status_code == 400, response.text
        assert "left_elbow" not in response.json()["detail"]
        assert mailed == []

    def test_a_scope_on_a_competency_with_none_is_refused(
        self,
        holder_client: TestClient,
        assessor: User,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        passport_id = _create_passport(holder_client)
        mailed: list[str] = []
        monkeypatch.setattr(
            router, "send_email", lambda **kw: mailed.append(str(kw["to"]))
        )

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/perform_cannulation"
            "/requests",
            json={
                "assessor_email": assessor.email,
                "observed_on": "2026-03-14",
                "scope_id": SCOPE,
            },
        )

        assert response.status_code == 400, response.text
        assert mailed == []

    def test_a_competency_reports_where_it_stands_for_one_scope(
        self, holder_client: TestClient, assessor: User
    ) -> None:
        passport_id = _create_passport(holder_client)
        for scope_id in ("lung", "breast"):
            response = holder_client.post(
                f"/api/passport/{passport_id}/competencies/{COMPETENCY}"
                "/requests",
                json={
                    "assessor_email": assessor.email,
                    "observed_on": "2026-03-14",
                    "level_id": LEVEL,
                    "scope_id": scope_id,
                },
            )
            assert response.status_code == 201, response.text

        detail = holder_client.get(f"/api/passport/{passport_id}").json()
        scopes = [
            entry["scope"]["id"]
            for entry in detail["competencies"]
            if entry["id"] == COMPETENCY
        ]
        assert sorted(scopes) == ["breast", "lung"]

        one = holder_client.get(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}",
            params={"scope_id": "lung"},
        )
        assert one.status_code == 200, one.text
        assert one.json()["scope"] == {"id": "lung", "name": "Lung"}

        missing = holder_client.get(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}",
            params={"scope_id": "skin"},
        )
        assert missing.status_code == 404, missing.text

    def test_the_scope_comes_back_on_the_record(
        self, holder_client: TestClient, assessor: User
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": assessor.email,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
                "scope_id": SCOPE,
            },
        )

        assert response.status_code == 201, response.text
        listed = holder_client.get(
            f"/api/passport/{passport_id}/sign-offs"
        ).json()
        assert listed[0]["scope"] == {"id": SCOPE, "name": "Lung"}

    def test_the_email_names_the_level_asked_for(
        self,
        holder_client: TestClient,
        assessor: User,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        passport_id = _create_passport(holder_client)
        bodies: list[str] = []
        monkeypatch.setattr(
            router,
            "send_email",
            lambda **kw: bodies.append(str(kw["text_body"])),
        )

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": assessor.email,
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        assert response.status_code == 201, response.text
        level_name = next(
            level.name
            for level in definitions.levels(COMPETENCY)
            if level.id == LEVEL
        )
        assert level_name in bodies[0]
        # And what it covers, since the competency is signed off one
        # tumour site at a time.
        assert 'for "Lung"' in bodies[0]

    def test_a_rate_limited_address_is_a_429(
        self,
        holder_client: TestClient,
        assessor: User,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Distinct from an outage: one waits, the other retries."""
        passport_id = _create_passport(holder_client)

        def _limited(**_kwargs: object) -> None:
            raise EmailRateLimitError("too many")

        monkeypatch.setattr(router, "send_email", _limited)

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": assessor.email,
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        assert response.status_code == 429, response.text

    def test_a_disallowed_address_is_a_400(
        self,
        holder_client: TestClient,
        assessor: User,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Only reachable where EMAIL_ALLOWED_RECIPIENTS is set."""
        passport_id = _create_passport(holder_client)

        def _refused(**_kwargs: object) -> None:
            raise EmailNotAllowedError("not on the list")

        monkeypatch.setattr(router, "send_email", _refused)

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": assessor.email,
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        assert response.status_code == 400, response.text

    def test_asking_yourself_is_refused(
        self, holder_client: TestClient, holder: User
    ) -> None:
        """The whole value of the record is a second named person."""
        passport_id = _create_passport(holder_client)

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": holder.email,
                "scope_id": SCOPE,
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
                "assessor_email": assessor.email,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        assert response.status_code == 404

    def test_nobody_else_can_request_against_a_passport(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: OrgUnit,
        assessor: User,
    ) -> None:
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)

        bystander_client = _login(test_client, "bystander")
        response = bystander_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": assessor.email,
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        assert response.status_code == 404


class TestAnExistingAccountAskedToAssess:
    """An existing account asked to assess gets what a new assessor gets.

    Somebody new to Quill accepts an invitation and becomes a
    `passport_external_assessor`, an external member where the holder is.
    An existing account is sent no invitation, so until 28 September 2026 it
    got neither: a teaching delegate asked to assess met a 404 on the
    passport pages and a 403 from the API.
    """

    @pytest.fixture
    def learner(self, db_session: Session) -> User:
        """An account on Quill with no passport access: a teaching
        delegate, in no organisation with the passport switched on."""
        return _make_user(
            db_session, "learner", profession="teaching_delegate"
        )

    def _ask(
        self,
        holder_client: TestClient,
        email: str,
        monkeypatch: pytest.MonkeyPatch,
        send: object = None,
    ) -> tuple[Response, list[dict[str, str]]]:
        sent: list[dict[str, str]] = []

        def capture(**kw: object) -> None:
            sent.append({"to": str(kw["to"]), "text": str(kw["text_body"])})

        monkeypatch.setattr(router, "send_email", send or capture)
        passport_id = _create_passport(holder_client)
        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": email,
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )
        return response, sent

    def _capacity(self, db: Session, org: OrgUnit, user: User) -> str | None:
        return db.scalar(
            select(org_unit_member.c.capacity).where(
                org_unit_member.c.org_unit_id == org.id,
                org_unit_member.c.user_id == user.id,
            )
        )

    def test_they_are_given_the_assessor_competency_and_a_membership(
        self,
        holder_client: TestClient,
        learner: User,
        holder: User,
        org: OrgUnit,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        response, _ = self._ask(holder_client, learner.email, monkeypatch)

        assert response.status_code == 201, response.text
        db_session.refresh(learner)
        assert "assess_clinician_passport" in learner.get_final_competencies()
        grant = next(
            g
            for g in learner.competency_grants
            if g.competency_id == "assess_clinician_passport"
        )
        assert grant.source == "sign_off_request"
        assert grant.granted_by == holder.id
        assert self._capacity(db_session, org, learner) == "external"
        # The profession is left alone.
        assert learner.base_profession == "teaching_delegate"

    def test_they_join_the_organisation_with_the_passport(
        self,
        holder_client: TestClient,
        learner: User,
        holder: User,
        org: OrgUnit,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Not the holder's first organisation, which may not have it.

        The holder here belongs to a teaching organisation as well as the
        passport one, and the learner is already in the teaching one. The
        organisation lookup once ignored which had the passport, took the
        teaching one, found the learner already there, and added nothing:
        the competency was granted and the passport stayed out of reach.
        """
        # Out of the fixture's trust, so the only passport organisation
        # the holder has is the one made here.
        db_session.execute(
            org_unit_member.delete().where(
                org_unit_member.c.org_unit_id == org.id,
                org_unit_member.c.user_id == holder.id,
            )
        )
        teaching = OrgUnit(name="Teaching Academy", type="organisation")
        passport_org = OrgUnit(name="Passport Trust", type="organisation")
        db_session.add_all([teaching, passport_org])
        db_session.commit()
        db_session.add(
            OrgUnitFeature(org_unit_id=passport_org.id, feature_key="passport")
        )
        # The teaching organisation first, so it is the one an unfiltered
        # lookup finds.
        add_org_unit_member(db_session, teaching.id, holder.id, "staff")
        add_org_unit_member(db_session, passport_org.id, holder.id, "staff")
        add_org_unit_member(db_session, teaching.id, learner.id, "trainee")
        db_session.commit()

        response, _ = self._ask(holder_client, learner.email, monkeypatch)

        assert response.status_code == 201, response.text
        assert self._capacity(db_session, passport_org, learner) == "external"

    def test_they_can_then_open_their_inbox(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        learner: User,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        self._ask(holder_client, learner.email, monkeypatch)

        client = _login(test_client, "learner")
        response = client.get("/api/passport/requests/inbox")

        assert response.status_code == 200, response.text
        assert len(response.json()) == 1

    def test_the_email_links_to_the_inbox_page(
        self,
        holder_client: TestClient,
        learner: User,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """`/inbox` is the page: it lists what is waiting on the assessor."""
        _, sent = self._ask(holder_client, learner.email, monkeypatch)

        assert "/inbox" in sent[0]["text"]
        assert "/passport/inbox" not in sent[0]["text"]
        assert "/passport/requests" not in sent[0]["text"]

    def test_a_failed_email_gives_them_nothing(
        self,
        holder_client: TestClient,
        learner: User,
        org: OrgUnit,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def _explode(**_kwargs: object) -> None:
            raise RuntimeError("mail server unreachable")

        response, _ = self._ask(
            holder_client, learner.email, monkeypatch, send=_explode
        )

        assert response.status_code == 502, response.text
        db_session.expire_all()
        reloaded = db_session.get(User, learner.id)
        assert reloaded is not None
        assert (
            "assess_clinician_passport"
            not in reloaded.get_final_competencies()
        )
        assert self._capacity(db_session, org, learner) is None

    def test_a_clinician_already_there_is_left_as_they_were(
        self,
        holder_client: TestClient,
        assessor: User,
        org: OrgUnit,
        db_session: Session,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        before = len(assessor.competency_grants)

        response, _ = self._ask(holder_client, assessor.email, monkeypatch)

        assert response.status_code == 201, response.text
        db_session.refresh(assessor)
        assert len(assessor.competency_grants) == before
        assert self._capacity(db_session, org, assessor) == "trainee"


class TestSignOff:
    @pytest.fixture
    def requested(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: OrgUnit,
        assessor: User,
    ) -> tuple[str, str]:
        """A passport with one open request, ready to be signed."""
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": assessor.email,
                "scope_id": SCOPE,
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

    def test_the_assessor_can_sign_a_different_level_with_a_reason(
        self, test_client: TestClient, requested: tuple[str, str]
    ) -> None:
        passport_id, name = requested
        client = _login(test_client, "assessor")

        response = client.post(
            f"/api/passport/{passport_id}/sign-offs/{name}/sign-off",
            json={
                "meaning": "directly observed",
                "declaration_confirmed": True,
                "level_id": "observation_only",
                "comments": "Watched me do it; not yet reviewing alone.",
            },
        )
        assert response.status_code == 200, response.text

        record = client.get(
            f"/api/passport/{passport_id}/sign-offs/{name}"
        ).json()
        assert record["level"]["id"] == "observation_only"
        assert record["requested_level"]["id"] == LEVEL

    def test_a_different_level_without_a_reason_is_refused(
        self, test_client: TestClient, requested: tuple[str, str]
    ) -> None:
        passport_id, name = requested
        client = _login(test_client, "assessor")

        response = client.post(
            f"/api/passport/{passport_id}/sign-offs/{name}/sign-off",
            json={
                "meaning": "directly observed",
                "declaration_confirmed": True,
                "level_id": "observation_only",
            },
        )

        assert response.status_code == 400, response.text
        assert "different level" in response.json()["detail"]

    def test_the_assessor_never_needs_the_sold_competency(
        self,
        test_client: TestClient,
        requested: tuple[str, str],
        assessor: User,
        db_session: Session,
    ) -> None:
        """Assessing is free, and this is what that has to mean.

        An assessor is doing somebody else's record a favour: the
        holder's organisation gets the benefit and the assessor gets
        nothing. Meeting a price or a lapsed entitlement here would
        stall the trainee waiting on them, so the whole split between
        ``assess_clinician_passport`` and ``passport_write`` exists to
        keep this path clear.

        The fixture already grants no ``passport_write``, so the test
        above passes for this reason without saying so. Stated here
        because a fixture gaining one later would take the guarantee
        away silently, and every sign-off test would still be green.
        """
        db_session.refresh(assessor)
        assert "passport_write" not in assessor.get_final_competencies()
        assert not any(
            row.competency_id == "passport_write"
            for row in assessor.competency_grants
        )

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

    def test_a_request_raised_before_a_lapse_still_lands(
        self,
        test_client: TestClient,
        requested: tuple[str, str],
        holder: User,
        db_session: Session,
    ) -> None:
        """The write is the assessor's judgement, not the holder's.

        A holder whose entitlement ends may have requests already
        sitting in assessors' queues. Those complete: what lands is an
        assessor's judgement about work already done and observed, so
        allowing it does not breach the rule that a lapsed holder
        cannot add to their own record.

        Freezing them instead would put an item in an assessor's queue
        that they cannot action for a billing reason, which is the
        assessor-facing wall this design exists to avoid. It does mean
        a lapsed passport can still gain a sign-off, which is
        deliberate rather than an oversight.
        """
        passport_id, name = requested

        # The holder's cover ends after the request was raised.
        lapse(holder, "passport_write")
        db_session.commit()

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

        # The commit is read as the holder: an assessor may read the
        # sign-off they were asked about and not the passport around it,
        # so the record's own state is the holder's to see.
        holder_client = _login(test_client, "holder")
        before = holder_client.get(f"/api/passport/{passport_id}").json()

        client = _login(test_client, "assessor")
        response = client.post(
            f"/api/passport/{passport_id}/sign-offs/{name}/sign-off",
            json={
                "meaning": "directly observed",
                "declaration_confirmed": False,
            },
        )

        assert response.status_code == 400

        holder_client = _login(test_client, "holder")
        after = holder_client.get(f"/api/passport/{passport_id}").json()
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

    def test_an_assessor_reads_the_sign_off_but_not_the_passport(
        self, test_client: TestClient, requested: tuple[str, str]
    ) -> None:
        """Being asked to judge one thing opens that thing only.

        An assessor asked about a bronchoscopy has no business reading a
        year of CPD, a logbook of every procedure, or what another
        assessor declined. The whole passport, its logbook, its
        certificates and its CPD are the holder's.
        """
        passport_id, name = requested
        client = _login(test_client, "assessor")

        allowed = client.get(f"/api/passport/{passport_id}/sign-offs/{name}")
        assert allowed.status_code == 200, allowed.text

        for path in (
            "",
            "/certificates",
            "/logbook",
            "/cpd",
            "/cpd/2026",
        ):
            refused = client.get(f"/api/passport/{passport_id}{path}")
            assert (
                refused.status_code == 404
            ), f"{path or '/'} was readable: {refused.text}"

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
        org: OrgUnit,
        assessor: User,
    ) -> tuple[str, str]:
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": assessor.email,
                "scope_id": SCOPE,
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


class TestListingSignOffs:
    """Every sign-off, one row each, rather than one per competency."""

    def _ask(
        self, client: TestClient, passport_id: str, email: str, on: str
    ) -> str:
        response = client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": email,
                "scope_id": SCOPE,
                "observed_on": on,
                "level_id": LEVEL,
            },
        )
        assert response.status_code == 201, response.text
        return str(response.json()["name"])

    def test_a_declined_request_and_the_one_after_are_both_listed(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: OrgUnit,
        assessor: User,
    ) -> None:
        """The competency list would show only the second of these."""
        holder = _login(test_client, "holder")
        passport_id = _create_passport(holder)
        first = self._ask(holder, passport_id, assessor.email, "2026-03-14")

        declined = _login(test_client, "assessor").post(
            f"/api/passport/{passport_id}/sign-offs/{first}/decline",
            json={"reason": "Not yet ready for this level."},
        )
        assert declined.status_code == 200, declined.text

        holder = _login(test_client, "holder")
        second = self._ask(holder, passport_id, assessor.email, "2026-04-02")

        response = holder.get(f"/api/passport/{passport_id}/sign-offs")

        assert response.status_code == 200, response.text
        listed = response.json()
        assert [item["name"] for item in listed] == [second, first]
        assert [item["status"] for item in listed] == [
            "requested",
            "declined",
        ]

    def test_each_sign_off_says_who_was_asked(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: OrgUnit,
        assessor: User,
    ) -> None:
        """The signed record names only who signed, so a request nobody
        has answered said nothing about who it was waiting on."""
        holder = _login(test_client, "holder")
        passport_id = _create_passport(holder)
        name = self._ask(holder, passport_id, assessor.email, "2026-03-14")

        listed = holder.get(f"/api/passport/{passport_id}/sign-offs").json()
        one = holder.get(
            f"/api/passport/{passport_id}/sign-offs/{name}"
        ).json()

        assert listed[0]["assessor_email"] == assessor.email
        assert one["assessor_email"] == assessor.email

    def test_the_assessor_is_not_sent_the_address_back(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: OrgUnit,
        assessor: User,
    ) -> None:
        """It is the holder's note of who they asked, not the assessor's."""
        holder = _login(test_client, "holder")
        passport_id = _create_passport(holder)
        name = self._ask(holder, passport_id, assessor.email, "2026-03-14")

        response = _login(test_client, "assessor").get(
            f"/api/passport/{passport_id}/sign-offs/{name}"
        )

        assert response.status_code == 200, response.text
        assert response.json()["assessor_email"] is None

    def test_an_empty_passport_lists_nothing(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: OrgUnit,
    ) -> None:
        holder = _login(test_client, "holder")
        passport_id = _create_passport(holder)

        response = holder.get(f"/api/passport/{passport_id}/sign-offs")

        assert response.status_code == 200, response.text
        assert response.json() == []

    def test_the_assessor_cannot_list_them(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: OrgUnit,
        assessor: User,
    ) -> None:
        """Named on one request, which is not the whole record."""
        holder = _login(test_client, "holder")
        passport_id = _create_passport(holder)
        self._ask(holder, passport_id, assessor.email, "2026-03-14")

        response = _login(test_client, "assessor").get(
            f"/api/passport/{passport_id}/sign-offs"
        )

        assert response.status_code == 404


class TestInbox:
    def test_an_assessor_sees_what_they_were_asked(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: OrgUnit,
        assessor: User,
    ) -> None:
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)
        holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": assessor.email,
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        client = _login(test_client, "assessor")
        response = client.get("/api/passport/requests/inbox")

        assert response.status_code == 200, response.text
        assert len(response.json()) == 1
        assert response.json()[0]["sign_off"]["competency"]["id"] == COMPETENCY

        # The passport the request belongs to, which the assessor cannot
        # work out for themselves: this is the only sign-off response
        # that names it, and without it they cannot act on the request.
        assert response.json()[0]["passport_id"] == passport_id

    def test_an_unrelated_assessor_sees_nothing(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: OrgUnit,
        assessor: User,
    ) -> None:
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)
        holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": assessor.email,
                "scope_id": SCOPE,
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
        org: OrgUnit,
        assessor: User,
    ) -> None:
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)
        created = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": assessor.email,
                "scope_id": SCOPE,
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
        org: OrgUnit,
        assessor: User,
    ) -> None:
        """The limits matter as much as the result."""
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)
        created = holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": assessor.email,
                "scope_id": SCOPE,
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


class TestTheInvitationAnAskSends:
    """The credential minted when an assessor has no account yet.

    The route that invited somebody by hand is gone: asking for a
    sign-off is what sends the invitation now. What it mints is a
    single-use link, and the properties that matter are the same ones
    that mattered before – the token reaches the address and nobody
    else, only its hash is kept, and a holder cannot mail an unbounded
    number of strangers.
    """

    @pytest.fixture
    def sent(self, monkeypatch: pytest.MonkeyPatch) -> list[dict[str, str]]:
        """Capture outgoing email instead of sending it.

        ``EMAIL_DRY_RUN`` is already true under test, so nothing would
        leave the process either way. This is to assert on *what* was
        written – above all that the token never appears in the response
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

    def _ask(
        self,
        client: TestClient,
        passport_id: str,
        *,
        email: str = "okafor@other-trust.nhs.uk",
    ) -> Response:
        return client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": email,
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

    def test_the_token_is_emailed_and_never_returned(
        self,
        holder_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """The credential goes to the address, not to the caller.

        Returning it would let a holder redeem or forward the invitation
        by any route they liked, defeating the point of sending it to an
        address somebody controls.
        """
        passport_id = _create_passport(holder_client)

        response = self._ask(holder_client, passport_id)
        assert response.status_code == 201, response.text

        assert "token" not in response.json()
        assert len(sent) == 1
        assert sent[0]["to"] == "okafor@other-trust.nhs.uk"
        assert "token=" in sent[0]["html_body"]

        link = sent[0]["html_body"].split("token=")[1].split('"')[0]
        assert link not in response.text

    def test_only_the_hash_of_the_token_is_stored(
        self,
        holder_client: TestClient,
        db_session: Session,
        sent: list[dict[str, str]],
    ) -> None:
        """A readable copy would let anyone with a row redeem it."""
        passport_id = _create_passport(holder_client)

        assert self._ask(holder_client, passport_id).status_code == 201

        token = sent[0]["html_body"].split("token=")[1].split('"')[0]
        row = db_session.scalar(select(PassportAssessorInvite))
        assert row is not None

        assert row.token_hash != token
        assert row.token_hash == hashlib.sha256(token.encode()).hexdigest()

    def test_an_assessor_already_on_quill_gets_no_token(
        self,
        holder_client: TestClient,
        assessor: User,
        db_session: Session,
        sent: list[dict[str, str]],
    ) -> None:
        """There is no account to create, so nothing is minted.

        They are sent to their inbox instead, where the request is
        waiting. Minting a registration link for somebody who can
        already sign in would be a credential nobody needs.
        """
        passport_id = _create_passport(holder_client)

        assert (
            self._ask(
                holder_client, passport_id, email=assessor.email
            ).status_code
            == 201
        )

        assert len(sent) == 1
        assert "token=" not in sent[0]["html_body"]
        assert db_session.scalar(select(PassportAssessorInvite)) is None

    def test_the_daily_limit_is_per_holder(
        self,
        holder_client: TestClient,
        sent: list[dict[str, str]],
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A backstop against a compromised account mailing strangers.

        Counted per passport rather than per address, because keying on
        the remote address would throttle a whole hospital's outbound
        network and leave a holder free to ask from anywhere else.
        """
        monkeypatch.setattr(router, "INVITES_PER_DAY", 2)
        passport_id = _create_passport(holder_client)

        for index in range(2):
            response = self._ask(
                holder_client, passport_id, email=f"a{index}@other.nhs.uk"
            )
            assert response.status_code == 201, response.text

        refused = self._ask(
            holder_client, passport_id, email="one-too-many@other.nhs.uk"
        )

        assert refused.status_code == 429, refused.text

    def test_the_cap_is_a_backstop_not_a_quota(self) -> None:
        """Low enough to matter, high enough nobody legitimate meets it."""
        assert router.INVITES_PER_DAY >= 20


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
        """Bring an assessor in the way a holder actually does.

        Asking for a sign-off is what sends the invitation now; the
        route that invited somebody by hand is gone, and with it the
        name and registration a holder used to type on their behalf.
        """
        response = client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
            json={
                "assessor_email": email,
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
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
        full_name: str | None = "Dr Amara Okafor",
        registration_authority: str | None = "GMC",
        registration_number: str | None = "7654321",
    ) -> Response:
        body: dict[str, object] = {"token": token}
        if username is not None:
            body["username"] = username
        if password is not None:
            body["password"] = password
        if full_name is not None:
            body["full_name"] = full_name
        if registration_authority is not None:
            body["registration_authority"] = registration_authority
        if registration_number is not None:
            body["registration_number"] = registration_number
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
            # The address, not a name: nobody has told Quill their name
            # yet. The holder gave an address, and the assessor says who
            # they are when they register.
            assert body["assessor_name"] == "okafor@other-trust.nhs.uk"
            assert body["needs_account"] is True
            assert body["already_accepted"] is False

    def test_the_preview_names_the_competency_asked_about(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """Somebody deciding whether to register needs to know what for.

        The words rather than the id, so the page renders without
        holding the catalogue.
        """
        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)

        response = test_client.get(
            "/api/passport/assessor-invites/preview",
            params={"token": self._token(sent)},
        )

        assert response.status_code == 200, response.text
        assert response.json()["competency_name"] == (
            "Review and prescribe systemic anti-cancer therapy"
        )

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

    def test_a_new_assessor_gets_the_passport_external_assessor_profession(
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
        assert user.base_profession == "passport_external_assessor"
        assert [(r.authority, r.number) for r in user.registrations] == [
            ("GMC", "7654321")
        ]
        assert "assess_clinician_passport" in user.get_final_competencies()
        assert "access_patient_records" not in user.get_final_competencies()

    def test_the_assessor_states_their_own_name_and_registration(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        sent: list[dict[str, str]],
    ) -> None:
        """The holder gives an address and nothing else.

        Before this, the account was built from the invitation's own
        name and registration columns – which the holder used to fill
        in. Asking for a sign-off does not collect them, so a new
        assessor was registered with an empty name and a registration
        of ``{"": ""}``: a meaningless entry in a clinical field.
        """
        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)

        response = self._accept(
            test_client,
            self._token(sent),
            full_name="Dr Winifred Achebe",
            registration_authority="NMC",
            registration_number="99AB1234",
        )
        assert response.status_code == 200, response.text

        user = db_session.get(User, response.json()["user_id"])
        assert user is not None
        assert user.full_name == "Dr Winifred Achebe"
        assert [(r.authority, r.number) for r in user.registrations] == [
            ("NMC", "99AB1234")
        ]

    def test_registering_writes_the_registration_as_a_row(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        sent: list[dict[str, str]],
    ) -> None:
        """One row per registration declared."""
        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)

        response = self._accept(
            test_client,
            self._token(sent),
            registration_authority="NMC",
            registration_number="99AB1234",
        )
        assert response.status_code == 200, response.text

        user = db_session.get(User, response.json()["user_id"])
        assert user is not None
        assert [
            (r.authority, r.number, r.ends_on) for r in user.registrations
        ] == [("NMC", "99AB1234", None)]

    def test_a_body_in_any_case_is_stored_as_the_config_spells_it(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        sent: list[dict[str, str]],
    ) -> None:
        """Somebody typing ``gphc`` means the GPhC."""
        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)

        response = self._accept(
            test_client, self._token(sent), registration_authority=" gphc "
        )
        assert response.status_code == 200, response.text

        user = db_session.get(User, response.json()["user_id"])
        assert user is not None
        assert [r.authority for r in user.registrations] == ["GPhC"]

    def test_a_body_the_jurisdiction_does_not_list_is_refused(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        sent: list[dict[str, str]],
    ) -> None:
        """Refused with a 422 naming the bodies, not a 500 from the model.

        The invitation is not spent, so the assessor can try again.
        """
        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)
        token = self._token(sent)

        refused = self._accept(
            test_client, token, registration_authority="General Medical"
        )
        assert refused.status_code == 422, refused.text
        assert "GMC" in refused.json()["detail"]

        accepted = self._accept(test_client, token)
        assert accepted.status_code == 200, accepted.text

    def test_registering_without_a_name_is_refused(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """An empty name is what the defect produced, so it is refused."""
        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)

        response = self._accept(test_client, self._token(sent), full_name=None)

        assert response.status_code == 422, response.text

    def test_registering_without_a_registration_is_refused(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """A sign-off records who signed and on what standing.

        An assessor with no registration recorded could sign one, and
        the record would say nothing about their authority to do so.
        """
        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)

        response = self._accept(
            test_client,
            self._token(sent),
            registration_authority=None,
            registration_number=None,
        )

        assert response.status_code == 422, response.text

    def test_the_membership_is_external_at_the_holder_s_organisation(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        sent: list[dict[str, str]],
    ) -> None:
        """A holder at organisation level only yields an org membership."""
        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)

        response = self._accept(test_client, self._token(sent))
        body = response.json()

        # ``place`` and ``place_id`` have gone: an org_unit's type is not
        # something a caller needs told, and ``org_unit_id`` says where.
        assert body["org_unit_id"] == org.id
        assert "place" not in body
        assert "place_id" not in body

        capacity = db_session.scalar(
            select(organisation_org_unit_member.c.capacity).where(
                organisation_org_unit_member.c.org_unit_id == org.id,
                organisation_org_unit_member.c.user_id == body["user_id"],
            )
        )
        assert capacity == "external"

    def test_of_several_passport_org_units_the_lowest_id_is_joined(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        holder: User,
        org: OrgUnit,
        sent: list[dict[str, str]],
    ) -> None:
        """Arbitrary but stable, and never decided by type.

        The holder is at the trust and at a ward inside it, and both reach
        the passport. The trust was created first, so it has the lower id
        and is joined, though the ward is the narrower of the two.
        """
        ward = OrgUnit(name="Ward 10", type="ward", parent_id=org.id)
        db_session.add(ward)
        db_session.commit()
        add_org_unit_member(db_session, ward.id, holder.id, "trainee")
        db_session.commit()

        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)

        body = self._accept(test_client, self._token(sent)).json()

        assert org.id < ward.id
        assert body["org_unit_id"] == org.id

    def test_a_sited_holder_yields_a_site_membership(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        holder: User,
        org: OrgUnit,
        sent: list[dict[str, str]],
    ) -> None:
        """A holder at a ward alone gives the assessor a ward membership.

        This once preferred a site over an organisation whenever the
        holder had both. Which org_unit is chosen no longer depends on
        type (see the lowest-id test below), so the holder here is at the
        ward only.
        """
        site = OrgUnit(name="Ward 9", type="ward")
        db_session.add(site)
        db_session.commit()
        db_session.refresh(site)
        db_session.execute(
            update(OrgUnit)
            .where(OrgUnit.id == site.id)
            .values(parent_id=org.id)
        )
        db_session.execute(
            org_unit_member.insert().values(
                org_unit_id=site.id,
                user_id=holder.id,
                capacity="trainee",
            )
        )
        db_session.commit()
        # The holder's only org_unit is the ward, so the ward is the one
        # the assessor joins, whatever its type.
        db_session.execute(
            org_unit_member.delete().where(
                org_unit_member.c.org_unit_id == org.id,
                org_unit_member.c.user_id == holder.id,
            )
        )
        db_session.commit()

        passport_id = _create_passport(holder_client)
        self._invite(holder_client, passport_id)

        response = self._accept(test_client, self._token(sent))
        body = response.json()

        assert body["org_unit_id"] == site.id
        assert "place" not in body

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
        org: OrgUnit,
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

        # Somebody who already uses Quill is sent to their inbox rather
        # than through registration: there is no account to create, so
        # no invitation is minted and no token is emailed. Their right
        # to read and sign comes from the request naming their address.
        assert "token=" not in sent[-1]["html_body"]

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
        accept – a circular dependency that is obvious once seen and
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
    capacity at all – so an ``external`` member passes exactly as a
    ``staff`` one does. That is the whole reason no sibling gate is
    needed, and it is pinned here rather than reasoned about, because
    it is a property of code in another module that could change
    without anybody thinking about assessors.

    A passport route also demands ``assess_clinician_passport``, which
    for a new account comes from the ``passport_external_assessor``
    profession.
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
            f"/api/passport/{passport_id}/competencies/"
            f"{COMPETENCY}/requests",
            json={
                "assessor_email": "okafor@other-trust.nhs.uk",
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
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
                "full_name": "Dr Amara Okafor",
                "registration_authority": "GMC",
                "registration_number": "7654321",
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

        # Reaching the route at all is what this pins: 200 rather than
        # the 403 an account without the gate would get. The inbox is no
        # longer empty, because asking for a sign-off is what brings an
        # assessor in – so the request that invited them is waiting,
        # which is the arrangement the whole flow exists to produce.
        assert response.status_code == 200, response.text
        assert len(response.json()) == 1
        assert response.json()[0]["passport_id"] == passport_id

    def test_a_holder_in_two_places_puts_them_where_the_feature_is(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        holder: User,
        sent: list[dict[str, str]],
    ) -> None:
        """A rotating trainee belongs to more than one place.

        One of them is a hospital under a different trust, with no
        passport feature. Adding the assessor there leaves them a member
        of a real place that still cannot open a passport, which is a
        403 nobody can explain from the screen.
        """
        elsewhere = OrgUnit(name="Another Trust", type="organisation")
        db_session.add(elsewhere)
        db_session.commit()
        db_session.refresh(elsewhere)

        hospital = OrgUnit(
            name="Hospital With No Passport",
            type="hospital",
            parent_id=elsewhere.id,
        )
        db_session.add(hospital)
        db_session.commit()
        db_session.refresh(hospital)

        db_session.execute(
            org_unit_member.insert().values(
                org_unit_id=hospital.id, user_id=holder.id, capacity="trainee"
            )
        )
        db_session.commit()

        passport_id = _create_passport(holder_client)
        assessor_id = self._invite_and_accept(
            holder_client, test_client, passport_id, sent
        )

        # Not the hospital with no feature, however narrow it is.
        placed = db_session.scalar(
            select(org_unit_member.c.org_unit_id).where(
                org_unit_member.c.user_id == assessor_id
            )
        )
        assert placed != hospital.id

        assessor_client = _login(test_client, "okafor")
        assert (
            assessor_client.get("/api/passport/requests/inbox").status_code
            == 200
        )

    def test_a_site_membership_opens_it_through_its_organisation(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        holder: User,
        org: OrgUnit,
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
            .values(parent_id=org.id)
        )
        db_session.execute(
            org_unit_member.insert().values(
                org_unit_id=site.id,
                user_id=holder.id,
                capacity="trainee",
            )
        )
        db_session.commit()

        # The holder's only org_unit is the ward, so the ward is the one
        # the assessor joins, whatever its type.
        db_session.execute(
            org_unit_member.delete().where(
                org_unit_member.c.org_unit_id == org.id,
                org_unit_member.c.user_id == holder.id,
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
            select(organisation_org_unit_member.c.user_id).where(
                organisation_org_unit_member.c.org_unit_id == org.id,
                organisation_org_unit_member.c.user_id == assessor_id,
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

        Stated as its own test because the opposite – a gate that
        quietly required ``staff`` – would leave every invited assessor
        with a 403 and no obvious cause.
        """
        passport_id = _create_passport(holder_client)
        assessor_id = self._invite_and_accept(
            holder_client, test_client, passport_id, sent
        )

        capacity = db_session.scalar(
            select(organisation_org_unit_member.c.capacity).where(
                organisation_org_unit_member.c.user_id == assessor_id,
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
        is on where they are. What they may see is resolved separately,
        and a named assessor may read the sign-off they were asked about
        – never the holder's passport as a whole.
        """
        passport_id = _create_passport(holder_client)
        self._invite_and_accept(holder_client, test_client, passport_id, sent)

        assessor_client = _login(test_client, "okafor")
        response = assessor_client.get(f"/api/passport/{passport_id}")

        assert response.status_code == 404


class TestAdminRevoke:
    """What an organisation's admin may do about an outside assessor.

    "Admin of the holder's organisation" is two questions. ``manage_users``
    says *what* somebody may do and is global; membership says *where*.
    Either alone is wrong – the competency by itself would make an admin
    at one trust an administrator of every assessor in Quill – so the
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
    def admin(self, db_session: Session, org: OrgUnit) -> User:
        """An admin of the holder's organisation."""
        user = _make_user(db_session, "orgadmin", profession="consultant")
        hold(user, "manage_users")
        add_org_unit_member(db_session, org.id, user.id, "staff")
        db_session.commit()
        db_session.refresh(user)
        return user

    @pytest.fixture
    def outsider_admin(self, db_session: Session) -> User:
        """An admin, but of a different trust entirely.

        The case a check on ``manage_users`` alone would wrongly allow.
        """
        user = _make_user(db_session, "otheradmin", profession="consultant")
        hold(user, "manage_users")

        other = OrgUnit(name="Unrelated Trust", type="hospital_team")
        db_session.add(other)
        db_session.commit()
        db_session.refresh(other)

        db_session.add(
            OrgUnitFeature(org_unit_id=other.id, feature_key="passport")
        )
        add_org_unit_member(db_session, other.id, user.id, "staff")
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
            f"/api/passport/{passport_id}/competencies/"
            f"{COMPETENCY}/requests",
            json={
                "assessor_email": "okafor@other-trust.nhs.uk",
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )
        token = sent[-1]["html_body"].split("token=")[1].split('"')[0]

        accepted = test_client.post(
            "/api/passport/assessor-invites/accept",
            json={
                "token": token,
                "username": "okafor",
                "password": "PassportPassword123!",
                "full_name": "Dr Amara Okafor",
                "registration_authority": "GMC",
                "registration_number": "7654321",
            },
        )
        assert accepted.status_code == 200, accepted.text
        return int(accepted.json()["user_id"])

    def test_a_clinician_without_manage_users_cannot_revoke(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """Membership alone is not authority."""
        assessor_id = self._accept_an_assessor(
            holder_client, test_client, sent
        )

        response = holder_client.delete(
            f"/api/passport/assessors/{assessor_id}/membership"
        )

        assert response.status_code == 404

    def test_revoking_removes_the_membership(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        admin: User,
        org: OrgUnit,
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
            select(organisation_org_unit_member.c.user_id).where(
                organisation_org_unit_member.c.org_unit_id == org.id,
                organisation_org_unit_member.c.user_id == assessor_id,
            )
        )
        assert remaining is None

    def test_revoking_finds_a_membership_inside_the_admins_org_unit(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        holder: User,
        admin: User,
        org: OrgUnit,
        sent: list[dict[str, str]],
    ) -> None:
        """An assessor who joined at a ward inside the admin's trust.

        Found by where it is, not by its type: the route once looked for
        a site and then an organisation, the same split joining no longer
        makes.
        """
        ward = OrgUnit(name="Ward 12", type="ward", parent_id=org.id)
        db_session.add(ward)
        db_session.commit()
        add_org_unit_member(db_session, ward.id, holder.id, "trainee")
        db_session.execute(
            org_unit_member.delete().where(
                org_unit_member.c.org_unit_id == org.id,
                org_unit_member.c.user_id == holder.id,
            )
        )
        db_session.commit()
        assessor_id = self._accept_an_assessor(
            holder_client, test_client, sent
        )

        response = _login(test_client, "orgadmin").delete(
            f"/api/passport/assessors/{assessor_id}/membership"
        )

        assert response.status_code == 200, response.text
        assert response.json()["org_unit_id"] == ward.id
        assert "place" not in response.json()
        assert (
            db_session.scalar(
                select(org_unit_member.c.user_id).where(
                    org_unit_member.c.org_unit_id == ward.id,
                    org_unit_member.c.user_id == assessor_id,
                )
            )
            is None
        )

    def test_revoking_leaves_the_sign_offs_they_made_intact(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        db_session: Session,
        admin: User,
        sent: list[dict[str, str]],
    ) -> None:
        """A record of who assessed somebody is not undone by that person
        later losing their access – the assessment happened."""
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
                assessor_email="assessor@example.nhs.uk",
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
        org: OrgUnit,
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
            select(organisation_org_unit_member.c.user_id).where(
                organisation_org_unit_member.c.org_unit_id == org.id,
                organisation_org_unit_member.c.user_id == assessor.id,
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


class TestTheWholeLogbook:
    """Every logged procedure, whatever competency it counts towards."""

    def test_entries_come_back_grouped_by_competency(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)

        for competency, day in (
            ("perform_venepuncture", "2026-03-01"),
            ("perform_venepuncture", "2026-03-02"),
            ("certify_death", "2026-03-03"),
        ):
            holder_client.post(
                f"/api/passport/{passport_id}/logbook/{competency}",
                json={"performed_on": day},
            )

        response = holder_client.get(f"/api/passport/{passport_id}/logbook")

        assert response.status_code == 200, response.text
        body = response.json()
        assert body["count"] == 3
        groups = {g["competency"]: g["count"] for g in body["competencies"]}
        assert groups == {
            "perform_venepuncture": 2,
            "certify_death": 1,
        }

    def test_an_empty_logbook_is_not_an_error(
        self, holder_client: TestClient
    ) -> None:
        """A holder who has logged nothing is the ordinary first case."""
        passport_id = _create_passport(holder_client)

        response = holder_client.get(f"/api/passport/{passport_id}/logbook")

        assert response.status_code == 200
        assert response.json() == {"competencies": [], "count": 0}

    def test_entries_sort_by_the_date_they_record(
        self, holder_client: TestClient
    ) -> None:
        """Not by filename, which is when Quill wrote the file."""
        passport_id = _create_passport(holder_client)

        for day in ("2026-03-09", "2026-03-02", "2026-03-05"):
            holder_client.post(
                f"/api/passport/{passport_id}/logbook/perform_venepuncture",
                json={"performed_on": day},
            )

        body = holder_client.get(f"/api/passport/{passport_id}/logbook").json()

        dates = [e["performed_on"] for e in body["competencies"][0]["entries"]]
        assert dates == ["2026-03-02", "2026-03-05", "2026-03-09"]

    def test_an_unrelated_user_cannot_read_it(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: OrgUnit,
    ) -> None:
        """404 rather than 403, as everywhere else."""
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)

        bystander_client = _login(test_client, "bystander")
        response = bystander_client.get(f"/api/passport/{passport_id}/logbook")

        assert response.status_code == 404


class TestEvidence:
    """Uploading a file, and naming it in a record.

    The bytes come through this application deliberately: a blob is
    addressed by the SHA-256 of its own contents, so the address cannot
    be computed without reading every byte. That is the whole reason the
    signed-URL pattern used for teaching videos does not apply, and the
    reason the size and type checks live at this boundary – `blobs.py`
    decides neither, because storing is separate from admitting.
    """

    def _upload(
        self,
        client: TestClient,
        passport_id: str,
        *,
        content: bytes = b"%PDF-1.4 a scanned certificate",
        filename: str = "certificate.pdf",
        media_type: str = "application/pdf",
    ) -> Response:
        return client.post(
            f"/api/passport/{passport_id}/evidence",
            files={"file": (filename, content, media_type)},
        )

    def test_a_holder_can_upload_evidence(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = self._upload(holder_client, passport_id)

        assert response.status_code == 201, response.text
        body = response.json()
        assert body["filename"] == "certificate.pdf"
        assert body["media_type"] == "application/pdf"
        assert body["size_bytes"] > 0

    def test_the_hash_is_of_the_bytes(self, holder_client: TestClient) -> None:
        """The address is the content, which is the whole integrity claim.

        Asserted against a hash computed here rather than merely checking
        the shape: a route returning a plausible-looking digest of
        something else would satisfy a format check and break every
        verification a holder could run.
        """
        passport_id = _create_passport(holder_client)
        content = b"%PDF-1.4 a scanned certificate"

        response = self._upload(holder_client, passport_id, content=content)

        expected = hashlib.sha256(content).hexdigest()
        assert response.json()["hash"] == f"sha256:{expected}"

    def test_the_same_file_twice_is_one_blob(
        self, holder_client: TestClient
    ) -> None:
        """So an interrupted upload is retried rather than reconciled."""
        passport_id = _create_passport(holder_client)

        first = self._upload(holder_client, passport_id)
        second = self._upload(holder_client, passport_id)

        assert first.status_code == 201
        assert second.status_code == 201
        assert first.json()["hash"] == second.json()["hash"]

    def test_an_unsupported_type_is_refused(
        self, holder_client: TestClient
    ) -> None:
        """Storing is separate from admitting, and this is admitting."""
        passport_id = _create_passport(holder_client)

        response = self._upload(
            holder_client,
            passport_id,
            content=b"#!/bin/sh\necho hello",
            filename="script.sh",
            media_type="application/x-sh",
        )

        assert response.status_code == 400

    def test_bytes_that_do_not_match_the_claimed_type_are_refused(
        self, holder_client: TestClient
    ) -> None:
        """A caller sets `Content-Type`, so the allow-list checks a claim.

        Without reading the bytes, anything at all uploads as a PDF –
        the allow-list would be satisfied by the header alone.
        """
        passport_id = _create_passport(holder_client)

        response = self._upload(
            holder_client,
            passport_id,
            content=b"#!/bin/sh\necho not a pdf",
            filename="pretending.pdf",
            media_type="application/pdf",
        )

        assert response.status_code == 400
        assert "does not look like" in response.text

    def test_a_real_png_is_accepted(self, holder_client: TestClient) -> None:
        """The sniff must admit genuine files, not merely refuse fakes.

        A check that rejected everything would pass the test above and
        make evidence upload useless.
        """
        passport_id = _create_passport(holder_client)

        response = self._upload(
            holder_client,
            passport_id,
            content=b"\x89PNG\r\n\x1a\n" + b"\x00" * 64,
            filename="scan.png",
            media_type="image/png",
        )

        assert response.status_code == 201, response.text

    def test_a_file_over_the_ceiling_is_refused(
        self, holder_client: TestClient
    ) -> None:
        """Enforced by reading, not by trusting `Content-Length`.

        The middleware's limit reads that header and skips the check
        when it is absent, so the route counts the bytes it actually
        receives.

        The size is chosen to land between the two ceilings, which is
        the only band where this proves anything. An earlier version of
        this test used ``MAX_EVIDENCE_BYTES + 1`` while the two limits
        were equal, so the multipart envelope pushed every case past the
        middleware and it answered first: deleting the route's check
        outright left the test green. Here the body stays under
        ``MAX_REQUEST_BODY_BYTES``, so a 413 can only have come from the
        route.
        """
        passport_id = _create_passport(holder_client)
        assert router.MAX_EVIDENCE_BYTES < main.MAX_REQUEST_BODY_BYTES, (
            "The route's ceiling must sit below the middleware's, or "
            "the middleware answers first and this test proves nothing"
        )

        oversized = b"%PDF-" + b"\x00" * (router.MAX_EVIDENCE_BYTES)
        assert len(oversized) > router.MAX_EVIDENCE_BYTES
        assert len(oversized) < main.MAX_REQUEST_BODY_BYTES

        response = self._upload(holder_client, passport_id, content=oversized)

        assert response.status_code == 413
        # The middleware's refusal is plain text; the route's is JSON
        # with a detail. Distinguishing them is the point of the test.
        assert "8 MB" in response.text

    def test_an_empty_file_is_refused(self, holder_client: TestClient) -> None:
        passport_id = _create_passport(holder_client)

        response = self._upload(holder_client, passport_id, content=b"")

        assert response.status_code == 400

    def test_an_unrelated_user_cannot_upload(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: OrgUnit,
    ) -> None:
        """404 rather than 403, as everywhere else."""
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)

        bystander_client = _login(test_client, "bystander")
        response = self._upload(bystander_client, passport_id)

        assert response.status_code == 404

    def test_a_record_can_name_uploaded_evidence(
        self, holder_client: TestClient
    ) -> None:
        """The upload response goes straight back into the record.

        It is the only place the filename and media type exist: the blob
        store keeps bytes at a path named by their hash and nothing
        beside it says what the file was called.
        """
        passport_id = _create_passport(holder_client)
        uploaded = self._upload(holder_client, passport_id).json()

        response = holder_client.post(
            f"/api/passport/{passport_id}/certificates",
            json={
                "title": "Advanced life support",
                "issuer": "Resuscitation Council UK",
                "awarded_on": "2026-03-14",
                "attachments": [uploaded],
            },
        )

        assert response.status_code == 201, response.text

    def _certificate_with(
        self, client: TestClient, passport_id: str, uploaded: dict[str, object]
    ) -> str:
        response = client.post(
            f"/api/passport/{passport_id}/certificates",
            json={
                "title": "Advanced life support",
                "issuer": "Resuscitation Council UK",
                "awarded_on": "2026-03-14",
                "attachments": [uploaded],
            },
        )
        assert response.status_code == 201, response.text
        return str(response.json()["name"])

    def test_a_certificate_sends_its_attachment_to_show_inline(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)
        uploaded = self._upload(holder_client, passport_id).json()
        name = self._certificate_with(holder_client, passport_id, uploaded)

        response = holder_client.get(
            f"/api/passport/{passport_id}/certificates/{name}"
            f"/attachments/{uploaded['hash']}"
        )

        assert response.status_code == 200, response.text
        assert response.content == b"%PDF-1.4 a scanned certificate"
        assert response.headers["content-type"] == "application/pdf"
        assert response.headers["content-disposition"] == "inline"
        assert response.headers["x-content-type-options"] == "nosniff"
        # The uploaded filename may name a patient, so it is never sent.
        assert "certificate.pdf" not in str(response.headers)

    def _correct(
        self,
        client: TestClient,
        passport_id: str,
        name: str,
        **extra: object,
    ) -> Response:
        return client.patch(
            f"/api/passport/{passport_id}/certificates/{name}",
            json={
                "title": "Advanced life support",
                "issuer": "Resuscitation Council UK",
                "awarded_on": "2026-03-14",
                **extra,
            },
        )

    def _held(
        self, client: TestClient, passport_id: str, name: str
    ) -> list[str]:
        listed = client.get(f"/api/passport/{passport_id}/certificates").json()
        certificate = next(c for c in listed if c["name"] == name)
        return [a["hash"] for a in certificate["attachments"]]

    def test_correcting_a_certificate_can_replace_its_file(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)
        first = self._upload(holder_client, passport_id).json()
        second = self._upload(
            holder_client, passport_id, content=b"%PDF-1.4 the right scan"
        ).json()
        name = self._certificate_with(holder_client, passport_id, first)

        response = self._correct(
            holder_client, passport_id, name, attachments=[second]
        )

        assert response.status_code == 200, response.text
        assert self._held(holder_client, passport_id, name) == [second["hash"]]

    def test_correcting_a_certificate_can_remove_its_file(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)
        uploaded = self._upload(holder_client, passport_id).json()
        name = self._certificate_with(holder_client, passport_id, uploaded)

        response = self._correct(
            holder_client, passport_id, name, attachments=[]
        )

        assert response.status_code == 200, response.text
        assert self._held(holder_client, passport_id, name) == []

    def test_a_correction_that_leaves_out_attachments_keeps_the_file(
        self, holder_client: TestClient
    ) -> None:
        """An older client sending only the fields it shows must not
        delete the file by leaving the field out."""
        passport_id = _create_passport(holder_client)
        uploaded = self._upload(holder_client, passport_id).json()
        name = self._certificate_with(holder_client, passport_id, uploaded)

        response = self._correct(holder_client, passport_id, name)

        assert response.status_code == 200, response.text
        assert self._held(holder_client, passport_id, name) == [
            uploaded["hash"]
        ]

    def test_a_hash_the_certificate_does_not_name_is_a_404(
        self, holder_client: TestClient
    ) -> None:
        """The bytes exist, but belong to no record reached this way."""
        passport_id = _create_passport(holder_client)
        uploaded = self._upload(holder_client, passport_id).json()
        other = self._upload(
            holder_client,
            passport_id,
            content=b"%PDF-1.4 something else entirely",
        ).json()
        name = self._certificate_with(holder_client, passport_id, uploaded)

        response = holder_client.get(
            f"/api/passport/{passport_id}/certificates/{name}"
            f"/attachments/{other['hash']}"
        )

        assert response.status_code == 404

    def test_a_missing_certificate_has_no_attachments(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)
        uploaded = self._upload(holder_client, passport_id).json()

        response = holder_client.get(
            f"/api/passport/{passport_id}/certificates/nothing-here"
            f"/attachments/{uploaded['hash']}"
        )

        assert response.status_code == 404

    def test_nobody_but_the_holder_can_read_an_attachment(
        self,
        test_client: TestClient,
        holder_client: TestClient,
    ) -> None:
        passport_id = _create_passport(holder_client)
        uploaded = self._upload(holder_client, passport_id).json()
        name = self._certificate_with(holder_client, passport_id, uploaded)

        response = _login(test_client, "assessor").get(
            f"/api/passport/{passport_id}/certificates/{name}"
            f"/attachments/{uploaded['hash']}"
        )

        assert response.status_code == 404

    def test_correcting_a_logbook_entry_keeps_its_attachments(
        self, holder_client: TestClient
    ) -> None:
        """The edit page sends no attachments. The route once wrote an
        empty list regardless, so fixing a date deleted every file."""
        passport_id = _create_passport(holder_client)
        uploaded = self._upload(holder_client, passport_id).json()
        created = holder_client.post(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}",
            json={
                "performed_on": "2026-03-12",
                "attachments": [uploaded],
                "scope_id": SCOPE,
            },
        )
        assert created.status_code == 201, created.text
        stem = created.json()["name"]

        response = holder_client.patch(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}/{stem}",
            json={
                "performed_on": "2026-03-13",
                "outcome": "Successful",
                "scope_id": SCOPE,
            },
        )

        assert response.status_code == 200, response.text
        entry = holder_client.get(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}"
        ).json()["entries"][0]
        assert entry["performed_on"] == "2026-03-13"
        assert [a["hash"] for a in entry["attachments"]] == [uploaded["hash"]]

    def test_correcting_a_cpd_activity_keeps_its_attachments(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)
        uploaded = self._upload(holder_client, passport_id).json()
        created = holder_client.post(
            f"/api/passport/{passport_id}/cpd",
            json={
                "activity_on": "2026-03-12",
                "title": "Airway course",
                "activity_type": "course",
                "attachments": [uploaded],
            },
        )
        assert created.status_code == 201, created.text
        stem = created.json()["name"]

        response = holder_client.patch(
            f"/api/passport/{passport_id}/cpd/2026/{stem}",
            json={
                "activity_on": "2026-03-12",
                "title": "Advanced airway course",
                "activity_type": "course",
            },
        )

        assert response.status_code == 200, response.text
        entry = holder_client.get(
            f"/api/passport/{passport_id}/cpd/2026"
        ).json()[0]
        assert entry["title"] == "Advanced airway course"
        assert [a["hash"] for a in entry["attachments"]] == [uploaded["hash"]]

    def test_correcting_a_reflection_keeps_its_attachments(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)
        uploaded = self._upload(holder_client, passport_id).json()
        created = holder_client.post(
            f"/api/passport/{passport_id}/reflections",
            json={
                "title": "Difficult airway",
                "written_on": "2026-03-12",
                "body": "What I would do differently.",
                "anonymised_confirmed": True,
                "attachments": [uploaded],
            },
        )
        assert created.status_code == 201, created.text
        name = created.json()["name"]

        response = holder_client.patch(
            f"/api/passport/{passport_id}/reflections/{name}",
            json={
                "title": "A difficult airway",
                "written_on": "2026-03-12",
                "body": "What I would do differently.",
                "anonymised_confirmed": True,
            },
        )

        assert response.status_code == 200, response.text
        reflection = holder_client.get(
            f"/api/passport/{passport_id}/reflections"
        ).json()[0]
        assert reflection["title"] == "A difficult airway"
        assert [a["hash"] for a in reflection["attachments"]] == [
            uploaded["hash"]
        ]

    def test_correcting_a_missing_reflection_is_a_404(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = holder_client.patch(
            f"/api/passport/{passport_id}/reflections/nothing-here",
            json={
                "title": "Nothing",
                "written_on": "2026-03-12",
                "body": "Nothing.",
                "anonymised_confirmed": True,
            },
        )

        assert response.status_code == 404, response.text

    def test_correcting_a_missing_logbook_entry_is_a_404(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = holder_client.patch(
            f"/api/passport/{passport_id}/logbook/{COMPETENCY}/nothing-here",
            json={"performed_on": "2026-03-13"},
        )

        assert response.status_code == 404, response.text

    def test_a_record_cannot_relabel_evidence_as_another_type(
        self, holder_client: TestClient
    ) -> None:
        """The sniff at upload is not the only place it must hold.

        Uploading is one call and naming the blob in a record is
        another, so guarding only the first leaves the second taking the
        caller's word. A genuine PNG, uploaded honestly, was then
        nameable as `application/pdf` and the record said so
        permanently – the same claim the upload sniff refuses, made one
        step later against bytes already in the store.
        """
        passport_id = _create_passport(holder_client)
        uploaded = self._upload(
            holder_client,
            passport_id,
            content=b"\x89PNG\r\n\x1a\n" + b"\x00" * 64,
            filename="scan.png",
            media_type="image/png",
        ).json()

        response = holder_client.post(
            f"/api/passport/{passport_id}/certificates",
            json={
                "title": "Advanced life support",
                "issuer": "Resuscitation Council UK",
                "awarded_on": "2026-03-14",
                "attachments": [{**uploaded, "media_type": "application/pdf"}],
            },
        )

        assert response.status_code == 400, response.text

    def test_a_record_can_name_evidence_as_what_it_is(
        self, holder_client: TestClient
    ) -> None:
        """The counterpart: the check must not refuse honest records.

        A check that rejected every media type would pass the test
        above and make attachments unusable.
        """
        passport_id = _create_passport(holder_client)
        uploaded = self._upload(
            holder_client,
            passport_id,
            content=b"\x89PNG\r\n\x1a\n" + b"\x00" * 64,
            filename="scan.png",
            media_type="image/png",
        ).json()

        response = holder_client.post(
            f"/api/passport/{passport_id}/certificates",
            json={
                "title": "Advanced life support",
                "issuer": "Resuscitation Council UK",
                "awarded_on": "2026-03-14",
                "attachments": [uploaded],
            },
        )

        assert response.status_code == 201, response.text

    def test_a_record_cannot_name_evidence_that_is_not_there(
        self, holder_client: TestClient
    ) -> None:
        """A dangling reference in a record that claims to be checkable.

        Refused rather than recorded and hoped for: the passport's whole
        claim is that somebody can verify it years later, and a hash
        resolving to nothing defeats that quietly.
        """
        passport_id = _create_passport(holder_client)

        response = holder_client.post(
            f"/api/passport/{passport_id}/certificates",
            json={
                "title": "Advanced life support",
                "issuer": "Resuscitation Council UK",
                "awarded_on": "2026-03-14",
                "attachments": [
                    {
                        "hash": "sha256:" + "ab" * 32,
                        "filename": "invented.pdf",
                        "size_bytes": 1,
                        "media_type": "application/pdf",
                    }
                ],
            },
        )

        assert response.status_code == 400


class TestExport:
    """Taking the record away.

    All three are holder-only. The zip is the one that could never be
    anything else – it copies the canonical files byte for byte, so it
    carries the holder's reflections whatever the caller asked for – but
    an export hands over a whole passport in one call, and that is not
    something to offer a named assessor for the sake of symmetry with
    the per-record reads.

    The content checks are deliberately about the bytes rather than the
    status code. A route that returned an empty body, or JSON, or an
    error page with a 200 on it, would satisfy a status assertion and
    hand the holder a file that is not what it claims to be.
    """

    def test_the_holder_can_export_markdown(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = holder_client.get(f"/api/passport/{passport_id}/export.md")

        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("text/markdown")
        assert passport_id in response.headers["content-disposition"]

    def test_the_holder_can_export_a_pdf(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = holder_client.get(f"/api/passport/{passport_id}/export.pdf")

        assert response.status_code == 200, response.text
        assert response.headers["content-type"] == "application/pdf"
        # A PDF says so in its first bytes. Without this the test would
        # pass on an empty body or an error page served with a 200.
        assert response.content.startswith(b"%PDF")

    def test_the_holder_can_export_the_bundle(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = holder_client.get(f"/api/passport/{passport_id}/export.zip")

        assert response.status_code == 200, response.text
        assert response.headers["content-type"] == "application/zip"
        assert response.content.startswith(b"PK")

    def test_the_bundle_holds_what_a_holder_needs(
        self, holder_client: TestClient
    ) -> None:
        """The README and the git bundle above all.

        The zip is the artefact a registrar carries between trusts, and
        it is worth nothing if it arrives without the explanation or the
        history.
        """
        passport_id = _create_passport(holder_client)

        response = holder_client.get(f"/api/passport/{passport_id}/export.zip")

        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            names = set(archive.namelist())

        assert "README.md" in names
        assert "VERIFY.md" in names
        assert "passport.bundle" in names

    def test_reflections_are_left_out_unless_asked_for(
        self, holder_client: TestClient
    ) -> None:
        """The default is the narrow one.

        A rendering handed to a panel or an employer must not carry a
        reflection by accident: written reflection can be disclosed in
        legal proceedings, so forgetting the parameter has to fail
        safe rather than fail open.
        """
        passport_id = _create_passport(holder_client)
        holder_client.post(
            f"/api/passport/{passport_id}/reflections",
            json={
                "title": "A difficult airway",
                "written_on": "2026-03-14",
                "body": "What I would do differently next time.",
                "anonymised_confirmed": True,
            },
        )

        default = holder_client.get(f"/api/passport/{passport_id}/export.md")
        asked = holder_client.get(
            f"/api/passport/{passport_id}/export.md?reflections=true"
        )

        assert "What I would do differently" not in default.text
        assert "What I would do differently" in asked.text

    @pytest.mark.parametrize("suffix", ["md", "pdf", "zip"])
    def test_an_unrelated_user_cannot_export(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: OrgUnit,
        suffix: str,
    ) -> None:
        """404 rather than 403, as everywhere else."""
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)

        bystander_client = _login(test_client, "bystander")
        response = bystander_client.get(
            f"/api/passport/{passport_id}/export.{suffix}"
        )

        assert response.status_code == 404

    @pytest.mark.parametrize("suffix", ["md", "pdf", "zip"])
    def test_a_named_assessor_cannot_export_either(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        org: OrgUnit,
        assessor: User,
        suffix: str,
    ) -> None:
        """Being asked to sign one competency is not being handed the lot.

        An assessor may read the sign-off they were named on. An export
        is every record in the passport, reflections included in the
        zip's case, which is a different thing entirely.
        """
        holder_client = _login(test_client, "holder")
        passport_id = _create_passport(holder_client)
        holder_client.post(
            f"/api/passport/{passport_id}/competencies/{COMPETENCY}"
            "/requests",
            json={
                "assessor_email": assessor.email,
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        assessor_client = _login(test_client, "assessor")
        response = assessor_client.get(
            f"/api/passport/{passport_id}/export.{suffix}"
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
            f"/api/passport/{passport_id}/competencies/"
            f"{COMPETENCY}/requests",
            json={
                "assessor_email": email,
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
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
                "full_name": "Dr Amara Okafor",
                "registration_authority": "GMC",
                "registration_number": "7654321",
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
                "assessor_email": assessor.email,
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
            },
        )

        assessor_client = _login(test_client, "okafor")
        response = assessor_client.get("/api/passport/requests/inbox")

        assert response.status_code == 200, response.text

        # Their own is there – asking is what brought them in, so an
        # empty inbox would no longer prove anything. What matters is
        # that the other assessor's request is not, which is the leak
        # this guards: one query spanning every passport.
        names = [row["sign_off"]["name"] for row in response.json()]
        assert len(names) == 1, response.text

        inbox_of_the_other = _login(test_client, "assessor").get(
            "/api/passport/requests/inbox"
        )
        theirs = [row["sign_off"]["name"] for row in inbox_of_the_other.json()]
        assert set(names).isdisjoint(theirs)
        assert external_id != assessor.id

    def test_they_cannot_list_users(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """The external assessor carries the passport competency alone.

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

    def test_they_cannot_revoke_anybody(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        sent: list[dict[str, str]],
    ) -> None:
        """The admin endpoint needs ``manage_users``, which they lack.

        Worth its own test because an assessor *is* a member of the
        place, and a check that asked only about membership would let
        them administer the people there.
        """
        passport_id = _create_passport(holder_client)
        external_id = self._accept(
            holder_client, test_client, sent, passport_id=passport_id
        )

        assessor_client = _login(test_client, "okafor")

        revoke = assessor_client.delete(
            f"/api/passport/assessors/{external_id}/membership"
        )

        assert revoke.status_code == 404

    def _stale_invite(
        self, holder_client: TestClient, db_session: Session, passport_id: str
    ) -> PassportAssessorInvite:
        """An invitation whose fortnight has already run out."""
        holder_client.post(
            f"/api/passport/{passport_id}/competencies/"
            f"{COMPETENCY}/requests",
            json={
                "assessor_email": "late@other-trust.nhs.uk",
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
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
        able to disagree – so the row alone has to be able to refuse.
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
        which is right everywhere but here – minting an already-dead
        token is a bug in real code. So this signs one directly with the
        same key to reach the ``exp`` check inside ``jwt.decode``, which
        is what actually stops a fortnight-old link.
        """
        passport_id = _create_passport(holder_client)
        holder_client.post(
            f"/api/passport/{passport_id}/competencies/"
            f"{COMPETENCY}/requests",
            json={
                "assessor_email": "stale@other-trust.nhs.uk",
                "scope_id": SCOPE,
                "observed_on": "2026-03-14",
                "level_id": LEVEL,
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
        org: OrgUnit,
        sent: list[dict[str, str]],
    ) -> None:
        """The summary of the whole matrix.

        They hold a membership at the holder's organisation and the
        passport competency as a ceiling, and still reach nothing there:
        not the passport that invited them, not the people, not the
        place itself. What they may act on comes from the request
        rows naming them, and nothing else: the one request that brought
        them in, and no more.
        """
        passport_id = _create_passport(holder_client)
        assessor_id = self._accept(
            holder_client, test_client, sent, passport_id=passport_id
        )

        member = db_session.scalar(
            select(organisation_org_unit_member.c.capacity).where(
                organisation_org_unit_member.c.org_unit_id == org.id,
                organisation_org_unit_member.c.user_id == assessor_id,
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

        # The ask that brought them in, and nothing beyond it. The
        # membership added nothing: it is the request row that names
        # them, not the place they now belong to.
        inbox = assessor_client.get("/api/passport/requests/inbox").json()
        assert len(inbox) == 1
        assert inbox[0]["passport_id"] == passport_id


class TestFeatureGate:
    def test_the_feature_must_be_enabled(
        self,
        test_client: TestClient,
        passport_store: LocalPassportStore,
        db_session: Session,
    ) -> None:
        """Without the organisation feature, every route refuses."""
        user = _make_user(db_session, "ungated")
        organisation = OrgUnit(name="No Feature Trust", type="hospital_team")
        db_session.add(organisation)
        db_session.commit()
        db_session.refresh(organisation)
        add_org_unit_member(db_session, organisation.id, user.id, "trainee")
        db_session.commit()

        client = _login(test_client, "ungated")
        response = client.post("/api/passport", json=WORKING_TO)

        assert response.status_code == 403


class TestAnOwnerWhoBelongsNowhereThePassportIsOn:
    """A holder always reads and exports their own passport.

    Reading and exporting come from owning the record, never from paying
    and never from where somebody works. Before 1 October 2026 the
    feature gate sat in front of every route, so a holder removed from
    the one org_unit that had the passport could not open their own
    record at all. Writing, and everything that is not their own record,
    still needs the feature.
    """

    @pytest.fixture
    def removed(
        self,
        holder_client: TestClient,
        db_session: Session,
        holder: User,
        org: OrgUnit,
    ) -> tuple[TestClient, str]:
        """The holder, with a passport, taken off the only org_unit."""
        passport_id = _create_passport(holder_client)
        db_session.execute(
            org_unit_member.delete().where(
                org_unit_member.c.user_id == holder.id
            )
        )
        db_session.commit()
        return holder_client, passport_id

    def test_they_read_it(self, removed: tuple[TestClient, str]) -> None:
        client, passport_id = removed

        assert client.get("/api/passport/me").status_code == 200
        assert client.get(f"/api/passport/{passport_id}").status_code == 200
        assert (
            client.get(f"/api/passport/{passport_id}/logbook").status_code
            == 200
        )

    @pytest.mark.parametrize("kind", ["md", "zip"])
    def test_they_export_it(
        self, removed: tuple[TestClient, str], kind: str
    ) -> None:
        client, passport_id = removed

        response = client.get(f"/api/passport/{passport_id}/export.{kind}")

        assert response.status_code == 200

    def test_they_are_told_it_is_read_only(
        self, removed: tuple[TestClient, str]
    ) -> None:
        """They still hold ``passport_write``; the page must not offer it."""
        client, _ = removed

        entitlement = client.get("/api/passport/me").json()["entitlement"]

        assert entitlement["can_write"] is False

    def test_they_cannot_write_to_it(
        self, removed: tuple[TestClient, str]
    ) -> None:
        client, passport_id = removed

        response = client.post(
            f"/api/passport/{passport_id}/reflections",
            json={
                "title": "After leaving",
                "written_on": "2026-03-12",
                "body": "Not saved.",
                "anonymised_confirmed": True,
                "attachments": [],
            },
        )

        assert response.status_code == 403

    def test_they_cannot_reach_the_assessor_inbox(
        self, removed: tuple[TestClient, str]
    ) -> None:
        client, _ = removed

        assert client.get("/api/passport/requests/inbox").status_code == 403

    def test_they_cannot_read_another_persons(
        self,
        removed: tuple[TestClient, str],
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
    ) -> None:
        """The waiver is for their own record only.

        Refused by the feature gate, with the same 403 whether or not the
        id names a passport, so nothing is confirmed to them.
        """
        client, _ = removed
        other = _make_user(db_session, "other_holder", writes=True)
        add_org_unit_member(db_session, org.id, other.id, "trainee")
        db_session.commit()
        theirs = Passport(id="a" * 32, user_id=other.id)
        db_session.add(theirs)
        db_session.commit()

        assert client.get(f"/api/passport/{theirs.id}").status_code == 403
        assert client.get(f"/api/passport/{'b' * 32}").status_code == 403

    def test_me_says_they_own_a_passport(
        self, removed: tuple[TestClient, str]
    ) -> None:
        client, _ = removed

        me = client.get("/api/auth/me").json()

        assert me["owns_passport"] is True
        assert "passport" not in me["enabled_features"]


class TestOnlyAssessableCompetencies:
    """A passport records skills, never software permissions.

    ``manage_users`` stands in for every competency not marked
    ``assessable``: nobody could watch somebody "manage users" and sign
    it off, so no route creating a record accepts it.
    """

    PERMISSION = "manage_users"

    def test_a_sign_off_request_is_refused_before_any_email(
        self,
        holder_client: TestClient,
        assessor: User,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Nothing can be unsent, so the check comes before the mail."""
        passport_id = _create_passport(holder_client)
        sent: list[object] = []
        monkeypatch.setattr(
            router, "send_email", lambda **kwargs: sent.append(kwargs)
        )

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/"
            f"{self.PERMISSION}/requests",
            json={
                "assessor_email": assessor.email,
                "observed_on": "2026-03-14",
            },
        )

        assert response.status_code == 400, response.text
        assert self.PERMISSION in response.json()["detail"]
        assert sent == []

    def test_an_unknown_competency_sends_no_email_either(
        self,
        holder_client: TestClient,
        assessor: User,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        passport_id = _create_passport(holder_client)
        sent: list[object] = []
        monkeypatch.setattr(
            router, "send_email", lambda **kwargs: sent.append(kwargs)
        )

        response = holder_client.post(
            f"/api/passport/{passport_id}/competencies/not_a_competency"
            "/requests",
            json={
                "assessor_email": assessor.email,
                "observed_on": "2026-03-14",
            },
        )

        assert response.status_code == 404
        assert sent == []

    def test_a_logbook_entry_is_refused(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = holder_client.post(
            f"/api/passport/{passport_id}/logbook/{self.PERMISSION}",
            json={"performed_on": "2026-03-14"},
        )

        assert response.status_code == 400, response.text

    @pytest.mark.parametrize(
        ("path", "body"),
        [
            (
                "/certificates",
                {
                    "title": "Advanced life support",
                    "issuer": "Resuscitation Council UK",
                    "awarded_on": "2026-03-14",
                },
            ),
            (
                "/reflections",
                {
                    "title": "A difficult airway",
                    "written_on": "2026-03-14",
                    "body": "What I would do differently next time.",
                    "anonymised_confirmed": True,
                },
            ),
            (
                "/cpd",
                {
                    "activity_on": "2026-03-14",
                    "title": "Regional oncology day",
                    "activity_type": "teaching day",
                },
            ),
        ],
    )
    def test_a_record_naming_one_is_refused(
        self,
        holder_client: TestClient,
        path: str,
        body: dict[str, object],
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = holder_client.post(
            f"/api/passport/{passport_id}{path}",
            json={**body, "competencies": [self.PERMISSION]},
        )

        assert response.status_code == 400, response.text

    def test_an_assessable_competency_is_accepted(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = holder_client.post(
            f"/api/passport/{passport_id}/logbook/perform_cannulation",
            json={"performed_on": "2026-03-14"},
        )

        assert response.status_code == 201, response.text

    def test_a_record_stays_readable_after_its_competency_is_withdrawn(
        self,
        holder_client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Marking a competency not assessable refuses new records only.

        A record written while it was assessable must still list and
        export, or changing one line of YAML would lose somebody's work.
        """
        passport_id = _create_passport(holder_client)
        written = holder_client.post(
            f"/api/passport/{passport_id}/logbook/perform_cannulation",
            json={"performed_on": "2026-03-14"},
        )
        assert written.status_code == 201, written.text

        monkeypatch.setattr(
            definitions,
            "ASSESSABLE_COMPETENCY_IDS",
            tuple(
                competency_id
                for competency_id in definitions.ASSESSABLE_COMPETENCY_IDS
                if competency_id != "perform_cannulation"
            ),
        )

        logbook = holder_client.get(f"/api/passport/{passport_id}/logbook")
        exported = holder_client.get(f"/api/passport/{passport_id}/export.md")

        assert logbook.status_code == 200, logbook.text
        assert [
            group["competency"] for group in logbook.json()["competencies"]
        ] == ["perform_cannulation"]
        assert exported.status_code == 200, exported.text


class TestSpecialties:
    """A holder's specialties order their competency picker, nothing else.

    Stored in ``profile.yaml``, so they travel with the record. An empty
    list is Generic: no specialty order.
    """

    def test_a_passport_created_with_no_body_is_generic(
        self, holder_client: TestClient
    ) -> None:
        response = holder_client.post("/api/passport", json=WORKING_TO)

        assert response.status_code == 201, response.text
        assert response.json()["specialties"] == []

    def test_a_passport_can_be_created_with_a_specialty(
        self, holder_client: TestClient
    ) -> None:
        response = holder_client.post(
            "/api/passport", json={"specialties": ["oncology"]}
        )

        assert response.status_code == 201, response.text
        assert response.json()["specialties"] == [
            {"id": "oncology", "name": "Oncology"}
        ]

    def test_the_specialty_is_written_into_the_profile(
        self,
        holder_client: TestClient,
        passport_store: LocalPassportStore,
    ) -> None:
        """The name travels with the id, so an export reads with no
        Quill."""
        created = holder_client.post(
            "/api/passport",
            json={"specialties": ["general_medicine", "oncology"]},
        ).json()

        profile = passport_store.read(
            created["passport_id"], paths.PROFILE
        ).decode()

        assert "general_medicine" in profile
        assert "General medicine" in profile
        assert "Oncology" in profile

    def test_an_unknown_specialty_is_refused_at_creation(
        self, holder_client: TestClient
    ) -> None:
        response = holder_client.post(
            "/api/passport", json={"specialties": ["cardiology"]}
        )

        assert response.status_code == 400, response.text
        assert "cardiology" in response.json()["detail"]

    def test_a_specialty_chosen_twice_is_refused(
        self, holder_client: TestClient
    ) -> None:
        response = holder_client.post(
            "/api/passport",
            json={"specialties": ["oncology", "oncology"]},
        )

        assert response.status_code == 400, response.text

    def test_the_holder_can_change_them_in_one_commit(
        self,
        holder_client: TestClient,
        passport_store: LocalPassportStore,
    ) -> None:
        passport_id = _create_passport(holder_client)
        before = passport_store.head(passport_id).commit

        response = holder_client.put(
            f"/api/passport/{passport_id}/specialties",
            json={"specialties": ["general_surgery"]},
        )

        assert response.status_code == 200, response.text
        assert response.json()["specialties"] == [
            {"id": "general_surgery", "name": "General surgery"}
        ]
        after = passport_store.head(passport_id).commit
        assert after != before
        assert response.json()["head_commit"] == after

    def test_changing_back_to_generic_empties_the_list(
        self, holder_client: TestClient
    ) -> None:
        created = holder_client.post(
            "/api/passport", json={"specialties": ["oncology"]}
        ).json()

        response = holder_client.put(
            f"/api/passport/{created['passport_id']}/specialties",
            json={"specialties": []},
        )

        assert response.status_code == 200, response.text
        assert response.json()["specialties"] == []

    def test_an_unknown_specialty_is_refused_on_change(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = holder_client.put(
            f"/api/passport/{passport_id}/specialties",
            json={"specialties": ["cardiology"]},
        )

        assert response.status_code == 400, response.text

    def test_a_removed_specialty_is_kept_on_read(
        self,
        holder_client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Deleting a specialty file must never make a passport
        unreadable. It stops ordering the picker, and nothing else."""
        created = holder_client.post(
            "/api/passport", json={"specialties": ["oncology"]}
        ).json()
        monkeypatch.setattr(specialties, "SPECIALTIES", ())

        response = holder_client.get("/api/passport/me")

        assert response.status_code == 200, response.text
        assert response.json()["passport"]["specialties"] == [
            {"id": "oncology", "name": "Oncology"}
        ]
        assert (
            created["passport_id"]
            == response.json()["passport"]["passport_id"]
        )

    def test_somebody_else_cannot_change_them(
        self,
        holder_client: TestClient,
        test_client: TestClient,
        bystander: User,
    ) -> None:
        passport_id = _create_passport(holder_client)
        client = _login(test_client, "bystander")

        response = client.put(
            f"/api/passport/{passport_id}/specialties",
            json={"specialties": ["oncology"]},
        )

        assert response.status_code == 404, response.text

    def test_a_holder_whose_entitlement_lapsed_cannot_change_them(
        self,
        holder_client: TestClient,
        holder: User,
        db_session: Session,
    ) -> None:
        """Without the right to write there is nothing to pick a
        competency for, so nothing for the order to affect."""
        passport_id = _create_passport(holder_client)
        lapse(holder, "passport_write")
        db_session.commit()

        response = holder_client.put(
            f"/api/passport/{passport_id}/specialties",
            json={"specialties": ["oncology"]},
        )

        assert response.status_code == 403, response.text

    def test_the_markdown_export_names_the_specialty(
        self, holder_client: TestClient
    ) -> None:
        created = holder_client.post(
            "/api/passport", json={"specialties": ["oncology"]}
        ).json()

        exported = holder_client.get(
            f"/api/passport/{created['passport_id']}/export.md"
        )

        assert exported.status_code == 200, exported.text
        assert "Specialty: Oncology" in exported.text


class TestAppraisalPeriods:
    """The holder's CPD date ranges, which CPD is totalled over."""

    def _put(
        self, client: TestClient, passport_id: str, *periods: tuple[str, str]
    ) -> Response:
        return client.put(
            f"/api/passport/{passport_id}/appraisal-periods",
            json={
                "periods": [
                    {"starts_on": starts, "ends_on": ends}
                    for starts, ends in periods
                ]
            },
        )

    def test_a_new_passport_has_none(self, holder_client: TestClient) -> None:
        """So CPD falls back to June to June, as it does today."""
        passport_id = _create_passport(holder_client)

        response = holder_client.get(
            f"/api/passport/{passport_id}/appraisal-periods"
        )

        assert response.status_code == 200, response.text
        assert response.json() == {"periods": []}

    def test_the_holder_can_set_and_read_them_oldest_first(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = self._put(
            holder_client,
            passport_id,
            ("2026-08-01", "2026-11-30"),
            ("2025-08-01", "2026-07-31"),
        )

        assert response.status_code == 200, response.text
        read = holder_client.get(
            f"/api/passport/{passport_id}/appraisal-periods"
        ).json()
        assert read["periods"] == [
            {"starts_on": "2025-08-01", "ends_on": "2026-07-31"},
            {"starts_on": "2026-08-01", "ends_on": "2026-11-30"},
        ]

    def test_gaps_between_ranges_are_allowed(
        self, holder_client: TestClient
    ) -> None:
        """A career break is real, and leaves a gap."""
        passport_id = _create_passport(holder_client)

        response = self._put(
            holder_client,
            passport_id,
            ("2024-01-01", "2024-12-31"),
            ("2026-01-01", "2026-12-31"),
        )

        assert response.status_code == 200, response.text

    def test_overlapping_ranges_are_refused(
        self, holder_client: TestClient
    ) -> None:
        """An activity in both would count its points twice."""
        passport_id = _create_passport(holder_client)

        response = self._put(
            holder_client,
            passport_id,
            ("2025-08-01", "2026-07-31"),
            ("2026-07-31", "2027-07-30"),
        )

        assert response.status_code == 400, response.text
        assert "overlaps" in response.json()["detail"]

    def test_a_range_that_ends_before_it_starts_is_refused(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = self._put(
            holder_client, passport_id, ("2026-08-01", "2026-07-31")
        )

        assert response.status_code == 400, response.text
        assert "cannot end before it starts" in response.json()["detail"]

    def test_an_empty_list_clears_them(
        self, holder_client: TestClient
    ) -> None:
        passport_id = _create_passport(holder_client)
        self._put(holder_client, passport_id, ("2025-08-01", "2026-07-31"))

        response = self._put(holder_client, passport_id)

        assert response.status_code == 200, response.text
        assert response.json() == {"periods": []}

    def test_each_change_is_a_commit_in_the_history(
        self, holder_client: TestClient, passport_store: LocalPassportStore
    ) -> None:
        """So a corrected or removed range is never lost."""
        passport_id = _create_passport(holder_client)
        before = passport_store.head(passport_id)

        self._put(holder_client, passport_id, ("2025-08-01", "2026-07-31"))

        assert passport_store.head(passport_id) != before

    def test_a_holder_whose_entitlement_lapsed_cannot_change_them(
        self,
        holder_client: TestClient,
        holder: User,
        db_session: Session,
    ) -> None:
        """But can still read them, like the rest of the record."""
        passport_id = _create_passport(holder_client)
        lapse(holder, "passport_write")
        db_session.commit()

        written = self._put(
            holder_client, passport_id, ("2025-08-01", "2026-07-31")
        )
        read = holder_client.get(
            f"/api/passport/{passport_id}/appraisal-periods"
        )

        assert written.status_code == 403, written.text
        assert read.status_code == 200, read.text

    def test_an_assessor_cannot_read_them(
        self,
        test_client: TestClient,
        holder_client: TestClient,
        assessor: User,
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = _login(test_client, "assessor").get(
            f"/api/passport/{passport_id}/appraisal-periods"
        )

        assert response.status_code == 404


class TestCpdList:
    """Every CPD activity at once, for totalling over date ranges."""

    def _add(
        self, client: TestClient, passport_id: str, activity_on: str
    ) -> None:
        response = client.post(
            f"/api/passport/{passport_id}/cpd",
            json={
                "activity_on": activity_on,
                "title": f"Grand round {activity_on}",
                "activity_type": "grand round",
                "points": 1,
            },
        )
        assert response.status_code == 201, response.text

    def test_a_new_passport_has_none(self, holder_client: TestClient) -> None:
        passport_id = _create_passport(holder_client)

        response = holder_client.get(f"/api/passport/{passport_id}/cpd")

        assert response.status_code == 200, response.text
        assert response.json() == []

    def test_it_spans_every_year_oldest_first(
        self, holder_client: TestClient
    ) -> None:
        """A date range from August to July crosses a calendar year, so
        the page needs both years' activities in one list."""
        passport_id = _create_passport(holder_client)
        self._add(holder_client, passport_id, "2026-02-10")
        self._add(holder_client, passport_id, "2024-11-03")
        self._add(holder_client, passport_id, "2025-09-15")

        response = holder_client.get(f"/api/passport/{passport_id}/cpd")

        assert response.status_code == 200, response.text
        body = response.json()
        assert [e["activity_on"] for e in body] == [
            "2024-11-03",
            "2025-09-15",
            "2026-02-10",
        ]
        # Each still says the year it is filed under, which its own
        # address needs.
        assert [e["year"] for e in body] == [2024, 2025, 2026]

    def test_an_assessor_cannot_read_it(
        self,
        test_client: TestClient,
        holder_client: TestClient,
        assessor: User,
    ) -> None:
        passport_id = _create_passport(holder_client)

        response = _login(test_client, "assessor").get(
            f"/api/passport/{passport_id}/cpd"
        )

        assert response.status_code == 404
