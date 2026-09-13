"""The user responses carry ``platform_role`` alongside the old column.

The badge that marks operators reads ``platform_role``, and three
response schemas fed it only ``system_permissions``: ``MeOut`` already
carried both, ``UserSummaryItem`` and ``UserOut`` carried neither. A
frontend component cannot show what the API does not send, so this is
the backend half of that change.

Additive, so a stale client is unaffected and no decision file is
needed. The old column is still served beside it while callers migrate.

Each test makes the two columns **disagree** — an `admin` in the old
column who is `standard` in the new one, and an operator who is
`superadmin` in both. A test where they agree passes whichever field the
route actually reads, which is exactly the bug worth catching.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.models import Organisation, User, organisation_member
from app.security import hash_password


def _user(
    db: Session,
    username: str,
    *,
    profession: str,
    system_permissions: str,
    platform_role: str,
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
        system_permissions=system_permissions,
        platform_role=platform_role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def org(db_session: Session) -> Organisation:
    organisation = Organisation(name="Trust", type="hospital")
    db_session.add(organisation)
    db_session.commit()
    db_session.refresh(organisation)
    return organisation


def _place(db: Session, org: Organisation, user: User) -> None:
    db.execute(
        insert(organisation_member).values(
            organisation_id=org.id, user_id=user.id, capacity="staff"
        )
    )
    db.commit()


@pytest.fixture
def caller(db_session: Session, org: Organisation) -> User:
    """An administrator who may list and read users at their own place."""
    admin = _user(
        db_session,
        "the_admin",
        profession="system_administrator",
        system_permissions="admin",
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
        org: Organisation,
        caller: User,
    ) -> None:
        """The columns disagree, and the new one is served as it stands."""
        client = _login(test_client, "the_admin")
        response = client.get("/api/users")

        assert response.status_code == 200, response.text
        rows = {u["username"]: u for u in response.json()["users"]}
        assert rows["the_admin"]["platform_role"] == "standard"
        assert rows["the_admin"]["system_permissions"] == "admin"


class TestTheDetailCarriesIt:
    """``UserOut`` — one user's admin page."""

    def test_a_standard_account_says_standard(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        caller: User,
    ) -> None:
        target = _user(
            db_session,
            "a_colleague",
            profession="receptionist",
            system_permissions="staff",
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
        org: Organisation,
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
        org: Organisation,
        caller: User,
    ) -> None:
        client = _login(test_client, "the_admin")
        response = client.get("/api/auth/me")

        assert response.status_code == 200, response.text
        assert response.json()["platform_role"] == "standard"
