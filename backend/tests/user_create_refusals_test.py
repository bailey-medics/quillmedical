"""What the create route answers when a new account is refused outright.

The rules are in ``app.users.create`` and are tested there. This drives
the route, to pin what a caller is sent: the status and the ``detail``
the route gave when the rules were written inside it. No test pinned
these words on this route before the rules moved.

The refusals for an org unit, a scope, practice and enrolments are
pinned beside the same refusals on the update route, in the other
``user_*_refusals_test.py`` files.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.organisations import add_org_unit_member
from app.security import hash_password

PASSWORD = "Coordinator123!"


def _person(db: Session, username: str, profession: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@pytest.fixture
def colleague(db_session: Session) -> User:
    """Somebody whose username and address are spoken for."""
    return _person(db_session, "colleague", "consultant")


@pytest.fixture
def teaching_admin_client(
    test_client: TestClient, db_session: Session
) -> TestClient:
    """Signed in as a teaching admin, whose scope has a limit."""
    org = OrgUnit(name="Teaching Trust", type="organisation")
    db_session.add(org)
    db_session.commit()
    coordinator = _person(db_session, "coordinator", "teaching_admin")
    add_org_unit_member(db_session, org.id, coordinator.id, "staff")
    db_session.commit()

    response = test_client.post(
        "/api/auth/login",
        json={"username": coordinator.username, "password": PASSWORD},
    )
    assert response.status_code == 200
    csrf = test_client.cookies.get("XSRF-TOKEN")

    if csrf:
        test_client.headers["X-CSRF-Token"] = csrf

    return test_client


def _new_user(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": "New Starter",
        "username": "new_starter",
        "email": "new_starter@example.test",
        "password": "NewStarter123!",
        "base_profession": "consultant",
    }
    body.update(overrides)

    return body


def _was_made(db: Session) -> bool:
    return (
        db.scalar(select(User).where(User.username == "new_starter"))
        is not None
    )


@pytest.mark.parametrize(
    ("overrides", "detail"),
    [
        ({"email": "  "}, "Missing required fields"),
        ({"password": ""}, "Missing required fields"),
        ({"password": "short"}, "Password must be at least 8 characters"),
        ({"username": "colleague"}, "Username already exists"),
        ({"email": "Colleague@Example.Test"}, "Email already exists"),
    ],
    ids=[
        "no address",
        "no password",
        "a short password",
        "a taken username",
        "a taken address",
    ],
)
def test_a_refused_account_is_a_400_with_the_reason(
    authenticated_admin_client: TestClient,
    db_session: Session,
    colleague: User,
    overrides: dict[str, str],
    detail: str,
) -> None:
    response = authenticated_admin_client.post(
        "/api/users", json=_new_user(**overrides)
    )

    assert response.status_code == 400
    assert response.json() == {"detail": detail}
    assert not _was_made(db_session)


@pytest.mark.parametrize(
    "org_unit_ids",
    [{}, {"org_unit_ids": None}, {"org_unit_ids": []}],
    ids=["left out", "null", "empty"],
)
def test_a_scoped_manager_naming_no_org_unit_is_a_400_with_the_reason(
    teaching_admin_client: TestClient,
    db_session: Session,
    org_unit_ids: dict[str, Any],
) -> None:
    response = teaching_admin_client.post(
        "/api/users",
        json=_new_user(base_profession="teaching_delegate", **org_unit_ids),
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Choose at least one organisation or site."
    }
    assert not _was_made(db_session)


def test_something_missing_is_reported_before_a_taken_username(
    authenticated_admin_client: TestClient, colleague: User
) -> None:
    response = authenticated_admin_client.post(
        "/api/users", json=_new_user(username="colleague", password="")
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Missing required fields"}


def test_a_taken_username_is_reported_before_a_taken_address(
    authenticated_admin_client: TestClient, colleague: User
) -> None:
    response = authenticated_admin_client.post(
        "/api/users",
        json=_new_user(username="colleague", email="colleague@example.test"),
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Username already exists"}


def test_no_org_unit_is_reported_before_a_profession_out_of_scope(
    teaching_admin_client: TestClient,
) -> None:
    response = teaching_admin_client.post("/api/users", json=_new_user())

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Choose at least one organisation or site."
    }
