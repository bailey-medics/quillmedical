"""What the user list answers when it refuses, or cannot be read.

The rules are in ``app.users.listing`` and are tested there. This
drives the route, to pin what a caller is sent: the status and the
``detail`` it gave when the rules were written inside it. No test
pinned these words before the rules moved.

There are two. Somebody whose scope has a limit, such as a teaching
admin, may not ask for the people around a patient. And a list that
cannot be read answers with a message and a code, which is the one
refusal the route still makes itself, since its ``detail`` is not a
sentence.
"""

from collections.abc import Sequence

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import app.main as main
from app.models import OrgUnit, User
from app.organisations import add_org_unit_member
from app.security import hash_password

PASSWORD = "Coordinator123!"

NEEDS_MANAGE_USERS = "Forbidden: User lacks required competency 'manage_users'"


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    org = OrgUnit(name="Teaching Trust", type="organisation")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    return org


@pytest.fixture
def teaching_admin(db_session: Session, trust: OrgUnit) -> User:
    user = User(
        username="coordinator",
        email="coordinator@example.test",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession="teaching_admin",
    )
    db_session.add(user)
    db_session.flush()
    add_org_unit_member(db_session, trust.id, user.id, "staff")
    db_session.commit()
    db_session.refresh(user)

    return user


@pytest.fixture
def client(test_client: TestClient, teaching_admin: User) -> TestClient:
    """Signed in as the teaching admin."""
    response = test_client.post(
        "/api/auth/login",
        json={"username": teaching_admin.username, "password": PASSWORD},
    )
    assert response.status_code == 200

    return test_client


def _unreadable(*args: object, **kwargs: object) -> Sequence[User]:
    raise RuntimeError("the database went away")


def test_a_teaching_admin_asking_about_a_patient_is_refused(
    client: TestClient,
) -> None:
    response = client.get("/api/users?patient_id=patient-one")

    assert response.status_code == 403
    assert response.json() == {"detail": NEEDS_MANAGE_USERS}


def test_a_teaching_admin_asking_about_nobody_is_answered(
    client: TestClient,
) -> None:
    """The refusal is for the patient, not for listing people."""
    response = client.get("/api/users")

    assert response.status_code == 200
    assert [user["username"] for user in response.json()["users"]] == [
        "coordinator"
    ]


def test_an_empty_patient_id_is_the_admin_list(client: TestClient) -> None:
    """Sent empty, it asks about nobody, so nothing is refused."""
    response = client.get("/api/users?patient_id=")

    assert response.status_code == 200
    assert [user["username"] for user in response.json()["users"]] == [
        "coordinator"
    ]


def test_a_list_that_cannot_be_read_answers_with_a_message_and_a_code(
    authenticated_superadmin_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(main, "people_to_list", _unreadable)

    response = authenticated_superadmin_client.get("/api/users")

    assert response.status_code == 500
    assert response.json() == {
        "detail": {
            "message": "Could not load the user list",
            "error_code": "user_list_failed",
        }
    }


def test_rows_that_cannot_be_built_answer_the_same(
    authenticated_superadmin_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(main, "admin_rows", _unreadable)

    response = authenticated_superadmin_client.get("/api/users")

    assert response.status_code == 500
    assert response.json()["detail"]["error_code"] == "user_list_failed"
