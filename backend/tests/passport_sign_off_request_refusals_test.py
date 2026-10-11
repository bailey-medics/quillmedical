"""What asking for a sign-off answers when it is not allowed.

The rules are in ``app.features.passport.sign_off_requests`` and are
tested there. This drives the route that asks them, to pin what a caller
is sent: the status and the ``detail`` each gave when the rule was
written inside ``app.features.passport.router``.

One refusal of that module is not here. A holder who belongs nowhere is
told so when they ask somebody who has an account, but the passport
feature is reached through membership, so that holder is stopped at the
door with a 403 before the rule is asked. It is tested on the function.

Covers:
- POST /api/passport/{passport_id}/competencies/{competency_id}/requests
"""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.passport import router
from app.features.passport.blobs import BlobStore
from app.features.passport.models import (
    Passport,
    PassportAssessorInvite,
    PassportSignOffRequest,
)
from app.features.passport.store import LocalPassportStore
from app.main import app
from app.models import OrgUnit, OrgUnitFeature, User
from app.organisations import add_org_unit_member
from app.passport_storage import get_blob_store, get_passport_store
from app.security import hash_password
from tests.competencies import hold

PASSWORD = "Made-up-password-1"
COMPETENCY = "uk_sact_board_2023_prescribe_sact"
WORKING_TO = {"frameworks": ["clinical", "uk_sact_board_2023"]}
#: An address with no account.
OUTSIDE = "outside.assessor@example.com"


@pytest.fixture
def passport_store(tmp_path: Path) -> Iterator[LocalPassportStore]:
    """Point every route at a passport store under a temporary directory."""
    root = tmp_path / "passports"
    store = LocalPassportStore(root)
    blobs = BlobStore(root)
    app.dependency_overrides[get_passport_store] = lambda: store
    app.dependency_overrides[get_blob_store] = lambda: blobs

    yield store

    app.dependency_overrides.pop(get_passport_store, None)
    app.dependency_overrides.pop(get_blob_store, None)


@pytest.fixture
def holder(db_session: Session) -> User:
    """Belongs where the passport is on, and may write to their own."""
    user = User(
        username="holder",
        email="holder@example.com",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession="specialty_trainee_3_plus",
    )
    hold(user, "passport_write")
    db_session.add(user)
    db_session.flush()

    team = OrgUnit(name="Made-up Team", type="hospital_team")
    db_session.add(team)
    db_session.flush()
    db_session.add(OrgUnitFeature(org_unit_id=team.id, feature_key="passport"))
    add_org_unit_member(db_session, team.id, user.id, "trainee")
    db_session.commit()
    db_session.refresh(user)

    return user


@pytest.fixture
def holder_client(
    test_client: TestClient,
    passport_store: LocalPassportStore,
    holder: User,
) -> TestClient:
    response = test_client.post(
        "/api/auth/login",
        json={"username": holder.username, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    test_client.headers["X-CSRF-Token"] = test_client.cookies["XSRF-TOKEN"]

    return test_client


@pytest.fixture
def passport_id(holder_client: TestClient) -> str:
    response = holder_client.post("/api/passport", json=WORKING_TO)
    assert response.status_code == 201, response.text

    return str(response.json()["passport_id"])


@pytest.fixture
def mailed(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Who was emailed, in place of sending anything."""
    sent: list[str] = []
    monkeypatch.setattr(
        router, "send_email", lambda **kw: sent.append(str(kw["to"]))
    )

    return sent


def _ask(client: TestClient, passport_id: str, email: str) -> Response:
    return client.post(
        f"/api/passport/{passport_id}/competencies/{COMPETENCY}/requests",
        json={
            "assessor_email": email,
            "scope_id": "lung",
            "observed_on": "2026-03-14",
            "level_id": "review_and_authorise",
        },
    )


def _head(db: Session, passport_id: str) -> str | None:
    db.expire_all()

    return db.scalar(
        select(Passport.head_commit).where(Passport.id == passport_id)
    )


def test_asking_yourself_is_a_400_and_nothing_is_sent_or_written(
    holder_client: TestClient,
    passport_id: str,
    mailed: list[str],
    db_session: Session,
) -> None:
    before = _head(db_session, passport_id)

    response = _ask(holder_client, passport_id, "Holder@Example.Com")

    assert response.status_code == 400
    assert response.json() == {
        "detail": "You cannot ask yourself to sign off your own competency."
    }
    assert mailed == []
    assert db_session.scalar(select(PassportSignOffRequest)) is None
    assert _head(db_session, passport_id) == before


def test_one_ask_too_many_in_a_day_is_a_429_naming_the_limit(
    holder_client: TestClient,
    passport_id: str,
    mailed: list[str],
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The number is the router's own limit, as the router holds it."""
    monkeypatch.setattr(router, "INVITES_PER_DAY", 2)

    for index in range(2):
        allowed = _ask(
            holder_client, passport_id, f"assessor{index}@example.com"
        )
        assert allowed.status_code == 201, allowed.text

    before = _head(db_session, passport_id)

    response = _ask(holder_client, passport_id, OUTSIDE)

    assert response.status_code == 429
    assert response.json() == {
        "detail": "You can ask up to 2 assessors a day. Try again tomorrow."
    }
    assert OUTSIDE not in mailed
    assert len(db_session.scalars(select(PassportSignOffRequest)).all()) == 2
    assert len(db_session.scalars(select(PassportAssessorInvite)).all()) == 2
    assert _head(db_session, passport_id) == before


def test_the_limit_as_it_ships_is_the_number_the_words_carry(
    holder_client: TestClient,
    passport_id: str,
    mailed: list[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The count is made to look spent, so a hundred asks need not be."""
    monkeypatch.setattr(
        "app.features.passport.sign_off_requests.asks_today",
        lambda db, passport_id: router.INVITES_PER_DAY,
    )

    response = _ask(holder_client, passport_id, OUTSIDE)

    assert response.status_code == 429
    assert response.json() == {
        "detail": "You can ask up to 100 assessors a day. Try again tomorrow."
    }
    assert mailed == []


def test_asking_yourself_is_what_is_reported_when_over_the_limit_too(
    holder_client: TestClient,
    passport_id: str,
    mailed: list[str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(router, "INVITES_PER_DAY", 0)

    response = _ask(holder_client, passport_id, "holder@example.com")

    assert response.status_code == 400
    assert response.json() == {
        "detail": "You cannot ask yourself to sign off your own competency."
    }


def test_an_ask_that_is_allowed_names_the_address_in_lower_case(
    holder_client: TestClient,
    passport_id: str,
    mailed: list[str],
    db_session: Session,
) -> None:
    """The route still hands on what the rule settled."""
    response = _ask(holder_client, passport_id, "Outside.Assessor@Example.COM")

    assert response.status_code == 201, response.text
    assert response.json()["status"] == "requested"
    assert mailed == [OUTSIDE]

    row = db_session.scalar(select(PassportSignOffRequest))
    assert row is not None
    assert row.assessor_email == OUTSIDE
    assert row.signoff_id == response.json()["name"]
    assert _head(db_session, passport_id) == response.json()["commit"]
