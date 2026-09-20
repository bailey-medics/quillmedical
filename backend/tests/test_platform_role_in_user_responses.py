"""The user responses carry ``platform_role``.

The badge that marks operators reads it, and three response schemas once
fed only ``system_permissions``: ``MeOut`` carried both, while
``UserSummaryItem`` and ``UserOut`` carried neither. A frontend component
cannot show what the API does not send, so this was the backend half of
that change.

These tests originally made the two columns **disagree** — an ``admin``
in the old column who was ``standard`` in the new one — because a test
where they agreed would pass whichever field the route actually read.
The old column has since been dropped, so there is nothing left to
disagree with and the assertions simply read the field.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.organisations import add_place_member
from app.security import hash_password


def _user(
    db: Session,
    username: str,
    *,
    profession: str,
    platform_role: str,
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        platform_role=platform_role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def org(db_session: Session) -> OrgUnit:
    organisation = OrgUnit(name="Trust", type="organisation")
    db_session.add(organisation)
    db_session.commit()
    db_session.refresh(organisation)
    return organisation


def _place(db: Session, org: OrgUnit, user: User) -> None:
    add_place_member(db, org.id, user.id, "staff")
    db.commit()


@pytest.fixture
def caller(db_session: Session, org: OrgUnit) -> User:
    """An administrator who may list and read users at their own place."""
    admin = _user(
        db_session,
        "the_admin",
        profession="system_administrator",
        platform_role="standard",
    )
    _place(db_session, org, admin)
    return admin


def _login(client: TestClient, username: str) -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": "Password123!"},
    )
    assert response.status_code == 200, response.text
    return client


class TestTheListingCarriesIt:
    """``UserSummaryItem`` — the user list the badge column reads."""

    def test_a_standard_account_says_standard(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        caller: User,
    ) -> None:
        """The listing carries the field for an ordinary account."""
        client = _login(test_client, "the_admin")
        response = client.get("/api/users")

        assert response.status_code == 200, response.text
        rows = {u["username"]: u for u in response.json()["users"]}
        assert rows["the_admin"]["platform_role"] == "standard"


class TestTheDetailCarriesIt:
    """``UserOut`` — one user's admin page."""

    def test_a_standard_account_says_standard(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        caller: User,
    ) -> None:
        target = _user(
            db_session,
            "a_colleague",
            profession="receptionist",
            platform_role="standard",
        )
        _place(db_session, org, target)

        client = _login(test_client, "the_admin")
        response = client.get(f"/api/users/{target.id}")

        assert response.status_code == 200, response.text
        assert response.json()["platform_role"] == "standard"

    def test_the_caller_reads_their_own_record(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        caller: User,
    ) -> None:
        """Self is always reachable, and carries the field too."""
        client = _login(test_client, "the_admin")
        response = client.get(f"/api/users/{caller.id}")

        assert response.status_code == 200, response.text
        assert response.json()["platform_role"] == "standard"


class TestMeCarriesIt:
    """``MeOut`` already had it; asserted so it cannot quietly go."""

    def test_the_signed_in_user_carries_it(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        caller: User,
    ) -> None:
        client = _login(test_client, "the_admin")
        response = client.get("/api/auth/me")

        assert response.status_code == 200, response.text
        assert response.json()["platform_role"] == "standard"
