"""What the people routes answer when a change is outside the caller's scope.

The rules are in ``app.users.scope`` and are tested there. This drives
the routes, to pin what a caller is sent: the status and the ``detail``
each route gave when the rules were written inside it. No test pinned
these words before the rules moved.

A teaching admin is the caller with a limit: ``manage_teaching`` lets
them grant the teaching competencies and give the teaching professions,
and nothing else.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.organisations import add_org_unit_member
from app.security import hash_password

PASSWORD = "Coordinator123!"

ACCOUNT_OUT_OF_SCOPE = "This account is outside what you may manage."
NO_PLATFORM_ROLE = "You may not set a platform role."
NO_CONSULTANT = "You may not give the profession consultant."
NO_PRESCRIBING = "You may not grant or remove: prescribe_non_controlled."
NOT_TO_YOURSELF = (
    "Competencies and platform role must be changed by another user who "
    "holds manage_users"
)


def _member(db: Session, org: OrgUnit, username: str, profession: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession=profession,
    )
    db.add(user)
    db.flush()
    add_org_unit_member(db, org.id, user.id, "staff")
    db.commit()
    db.refresh(user)

    return user


@pytest.fixture
def trust(db_session: Session) -> OrgUnit:
    org = OrgUnit(name="Teaching Trust", type="organisation")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    return org


@pytest.fixture
def teaching_admin(db_session: Session, trust: OrgUnit) -> User:
    return _member(db_session, trust, "coordinator", "teaching_admin")


@pytest.fixture
def delegate(db_session: Session, trust: OrgUnit) -> User:
    """Somebody the teaching admin could have built themselves."""
    return _member(db_session, trust, "delegate", "teaching_delegate")


@pytest.fixture
def consultant(db_session: Session, trust: OrgUnit) -> User:
    """Somebody holding clinical competencies, so out of their reach."""
    return _member(db_session, trust, "consultant", "consultant")


@pytest.fixture
def client(test_client: TestClient, teaching_admin: User) -> TestClient:
    """Signed in as the teaching admin."""
    response = test_client.post(
        "/api/auth/login",
        json={"username": teaching_admin.username, "password": PASSWORD},
    )
    assert response.status_code == 200
    csrf = test_client.cookies.get("XSRF-TOKEN")

    if csrf:
        test_client.headers["X-CSRF-Token"] = csrf

    return test_client


def _new_user(org: OrgUnit, **overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "name": "New Delegate",
        "username": "new_delegate",
        "email": "new_delegate@example.test",
        "password": "NewDelegate123!",
        "base_profession": "teaching_delegate",
        "org_unit_ids": [org.id],
    }
    body.update(overrides)

    return body


# --- the account as a whole -------------------------------------------------


def test_renaming_an_account_out_of_scope_is_a_403_with_the_reason(
    client: TestClient, consultant: User
) -> None:
    response = client.patch(
        f"/api/users/{consultant.id}", json={"name": "Someone Else"}
    )

    assert response.status_code == 403
    assert response.json() == {"detail": ACCOUNT_OUT_OF_SCOPE}


@pytest.mark.parametrize("action", ["deactivate", "send-invite"])
def test_acting_on_an_account_out_of_scope_is_a_403_with_the_reason(
    client: TestClient, consultant: User, action: str
) -> None:
    response = client.post(f"/api/users/{consultant.id}/{action}")

    assert response.status_code == 403
    assert response.json() == {"detail": ACCOUNT_OUT_OF_SCOPE}


def test_reactivating_an_account_out_of_scope_is_a_403_with_the_reason(
    client: TestClient, consultant: User, db_session: Session
) -> None:
    consultant.is_active = False
    db_session.commit()

    response = client.post(f"/api/users/{consultant.id}/reactivate")

    assert response.status_code == 403
    assert response.json() == {"detail": ACCOUNT_OUT_OF_SCOPE}


# --- the profession given ---------------------------------------------------


def test_creating_with_a_profession_out_of_scope_names_the_profession(
    client: TestClient, trust: OrgUnit
) -> None:
    response = client.post(
        "/api/users", json=_new_user(trust, base_profession="consultant")
    )

    assert response.status_code == 403
    assert response.json() == {"detail": NO_CONSULTANT}


def test_changing_to_a_profession_out_of_scope_names_the_profession(
    client: TestClient, delegate: User, db_session: Session
) -> None:
    response = client.patch(
        f"/api/users/{delegate.id}", json={"base_profession": "consultant"}
    )

    db_session.expire_all()
    saved = db_session.get(User, delegate.id)

    assert response.status_code == 403
    assert response.json() == {"detail": NO_CONSULTANT}
    assert saved is not None
    assert saved.base_profession == "teaching_delegate"


# --- the competencies changed -----------------------------------------------


def test_creating_with_a_competency_out_of_scope_names_the_competency(
    client: TestClient, trust: OrgUnit
) -> None:
    response = client.post(
        "/api/users",
        json=_new_user(
            trust, additional_competencies=["prescribe_non_controlled"]
        ),
    )

    assert response.status_code == 403
    assert response.json() == {"detail": NO_PRESCRIBING}


def test_granting_a_competency_out_of_scope_names_the_competency(
    client: TestClient, delegate: User
) -> None:
    response = client.patch(
        f"/api/users/{delegate.id}",
        json={"additional_competencies": ["prescribe_non_controlled"]},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": NO_PRESCRIBING}


def test_removing_a_competency_out_of_scope_names_the_competency(
    client: TestClient, consultant: User, db_session: Session
) -> None:
    response = client.patch(
        f"/api/users/{consultant.id}",
        json={"removed_competencies": ["prescribe_non_controlled"]},
    )

    db_session.expire_all()
    saved = db_session.get(User, consultant.id)

    assert response.status_code == 403
    assert response.json() == {"detail": NO_PRESCRIBING}
    assert saved is not None
    assert "prescribe_non_controlled" in saved.get_final_competencies()


def test_several_competencies_out_of_scope_are_named_together_in_order(
    client: TestClient, delegate: User
) -> None:
    response = client.patch(
        f"/api/users/{delegate.id}",
        json={
            "additional_competencies": [
                "prescribe_non_controlled",
                "manage_users",
            ]
        },
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": (
            "You may not grant or remove: "
            "manage_users, prescribe_non_controlled."
        )
    }


# --- the platform role ------------------------------------------------------


def test_creating_an_operator_with_a_limited_scope_is_a_403_with_the_reason(
    client: TestClient, trust: OrgUnit
) -> None:
    response = client.post(
        "/api/users", json=_new_user(trust, platform_role="superadmin")
    )

    assert response.status_code == 403
    assert response.json() == {"detail": NO_PLATFORM_ROLE}


def test_changing_a_platform_role_with_a_limited_scope_is_a_403(
    client: TestClient, delegate: User, db_session: Session
) -> None:
    response = client.patch(
        f"/api/users/{delegate.id}", json={"platform_role": "superadmin"}
    )

    db_session.expire_all()
    saved = db_session.get(User, delegate.id)

    assert response.status_code == 403
    assert response.json() == {"detail": NO_PLATFORM_ROLE}
    assert saved is not None
    assert saved.platform_role == "standard"


# --- granting to yourself ---------------------------------------------------


@pytest.mark.parametrize(
    "body",
    [
        {"additional_competencies": ["take_teaching_modules"]},
        {"removed_competencies": []},
        {"base_profession": "system_administrator"},
        {"platform_role": "standard"},
    ],
)
def test_granting_to_yourself_is_a_403_with_the_reason(
    authenticated_admin_client: TestClient,
    test_admin: User,
    body: dict[str, Any],
) -> None:
    """Sent is enough, whether or not it differs from what is held."""
    response = authenticated_admin_client.patch(
        f"/api/users/{test_admin.id}", json=body
    )

    assert response.status_code == 403
    assert response.json() == {"detail": NOT_TO_YOURSELF}


# --- which is reported when two things are wrong ----------------------------


def test_the_account_is_reported_before_the_profession(
    client: TestClient, consultant: User
) -> None:
    response = client.patch(
        f"/api/users/{consultant.id}",
        json={"base_profession": "system_administrator"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": ACCOUNT_OUT_OF_SCOPE}


def test_the_profession_is_reported_before_the_platform_role(
    client: TestClient, delegate: User
) -> None:
    response = client.patch(
        f"/api/users/{delegate.id}",
        json={"base_profession": "consultant", "platform_role": "superadmin"},
    )

    assert response.status_code == 403
    assert response.json() == {"detail": NO_CONSULTANT}


def test_a_new_accounts_platform_role_is_reported_before_its_profession(
    client: TestClient, trust: OrgUnit
) -> None:
    response = client.post(
        "/api/users",
        json=_new_user(
            trust, base_profession="consultant", platform_role="superadmin"
        ),
    )

    assert response.status_code == 403
    assert response.json() == {"detail": NO_PLATFORM_ROLE}
