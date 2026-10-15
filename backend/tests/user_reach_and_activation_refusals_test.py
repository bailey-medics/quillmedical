"""What the people routes answer about one account named by its id.

The rules are in ``app.users.reach``, ``app.users.activation`` and
``app.users.setup_invite`` and are tested there. This drives the routes,
to pin what a caller is sent: the status and the ``detail`` each route
gave when the rules were written inside it. The statuses were pinned
before the rules moved; these words were not.
"""

from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.organisations import add_org_unit_member
from app.security import hash_password, verify_password_reset_token

NOT_FOUND = "User not found"
NOT_AN_OPERATORS = "Cannot modify superadmin users"
ACCOUNT_OUT_OF_SCOPE = "This account is outside what you may manage."

#: An id no account has.
NOBODY = 999_999

#: Every route that acts on one account by its id: how it is called.
ROUTES: list[tuple[str, str, dict[str, Any] | None]] = [
    ("get", "/api/users/{id}", None),
    ("patch", "/api/users/{id}", {"name": "Renamed"}),
    ("post", "/api/users/{id}/deactivate", None),
    ("post", "/api/users/{id}/reactivate", None),
    ("post", "/api/users/{id}/send-invite", None),
    ("patch", "/api/users/{id}/link-patient", {"fhir_patient_id": "p-1"}),
]

#: The routes that change an account, which an operator's is closed to.
WRITING_ROUTES = ROUTES[1:5]


def _person(
    db: Session,
    username: str,
    profession: str = "consultant",
    platform_role: str = "standard",
    *,
    at: OrgUnit | None = None,
    is_active: bool = True,
) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=is_active,
        email_verified=True,
        base_profession=profession,
        platform_role=platform_role,
    )
    db.add(user)
    db.flush()

    if at is not None:
        add_org_unit_member(db, at.id, user.id, "staff")

    db.commit()
    db.refresh(user)

    return user


def _call(
    client: TestClient, method: str, path: str, body: dict[str, Any] | None
) -> Any:
    send = getattr(client, method)

    return send(path, json=body) if body is not None else send(path)


@pytest.fixture
def trust(db_session: Session, test_admin: User) -> OrgUnit:
    """The administrator's own organisation."""
    org = OrgUnit(name="Severn Trust", type="organisation")
    db_session.add(org)
    db_session.commit()
    add_org_unit_member(db_session, org.id, test_admin.id, "staff")
    db_session.commit()
    db_session.refresh(org)

    return org


@pytest.fixture
def other_trust(db_session: Session) -> OrgUnit:
    org = OrgUnit(name="Wye Trust", type="organisation")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    return org


@pytest.fixture
def colleague(db_session: Session, trust: OrgUnit) -> User:
    return _person(db_session, "colleague", at=trust)


@pytest.fixture
def leaver(db_session: Session, trust: OrgUnit) -> User:
    """Somebody whose account is already closed."""
    return _person(db_session, "leaver", at=trust, is_active=False)


@pytest.fixture
def outsider(db_session: Session, other_trust: OrgUnit) -> User:
    return _person(db_session, "outsider", at=other_trust)


# --- an account that is not the caller's to see -----------------------------


@pytest.mark.parametrize(("method", "path", "body"), ROUTES)
def test_an_id_no_account_has_is_a_404_with_the_reason(
    authenticated_admin_client: TestClient,
    trust: OrgUnit,
    method: str,
    path: str,
    body: dict[str, Any] | None,
) -> None:
    response = _call(
        authenticated_admin_client, method, path.format(id=NOBODY), body
    )

    assert response.status_code == 404
    assert response.json() == {"detail": NOT_FOUND}


@pytest.mark.parametrize(("method", "path", "body"), ROUTES)
def test_somebody_out_of_reach_is_answered_as_an_id_nobody_has(
    authenticated_admin_client: TestClient,
    trust: OrgUnit,
    outsider: User,
    method: str,
    path: str,
    body: dict[str, Any] | None,
) -> None:
    response = _call(
        authenticated_admin_client, method, path.format(id=outsider.id), body
    )

    assert response.status_code == 404
    assert response.json() == {"detail": NOT_FOUND}


# --- an operator's account --------------------------------------------------


@pytest.mark.parametrize(("method", "path", "body"), WRITING_ROUTES)
def test_changing_an_operators_account_is_a_403_with_the_reason(
    authenticated_admin_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    method: str,
    path: str,
    body: dict[str, Any] | None,
) -> None:
    operator = _person(
        db_session,
        "operator",
        "superadmin_profession",
        "superadmin",
        at=trust,
    )

    response = _call(
        authenticated_admin_client, method, path.format(id=operator.id), body
    )

    assert response.status_code == 403
    assert response.json() == {"detail": NOT_AN_OPERATORS}


@pytest.mark.parametrize(("method", "path", "body"), WRITING_ROUTES)
def test_an_operator_out_of_reach_is_reported_as_an_operator_not_as_nobody(
    authenticated_admin_client: TestClient,
    db_session: Session,
    trust: OrgUnit,
    method: str,
    path: str,
    body: dict[str, Any] | None,
) -> None:
    """Which is reported when two things are wrong: the 403, not the 404."""
    operator = _person(
        db_session, "operator", "superadmin_profession", "superadmin"
    )

    response = _call(
        authenticated_admin_client, method, path.format(id=operator.id), body
    )

    assert response.status_code == 403
    assert response.json() == {"detail": NOT_AN_OPERATORS}


# --- closing an account, and opening it again -------------------------------


def test_deactivating_answers_with_whose_account_was_closed(
    authenticated_admin_client: TestClient,
    db_session: Session,
    colleague: User,
) -> None:
    response = authenticated_admin_client.post(
        f"/api/users/{colleague.id}/deactivate"
    )

    db_session.expire_all()
    saved = db_session.get(User, colleague.id)

    assert response.status_code == 200
    assert response.json() == {
        "detail": "deactivated",
        "id": colleague.id,
        "username": "colleague",
    }
    assert saved is not None
    assert saved.is_active is False


def test_deactivating_your_own_account_is_a_400_with_the_reason(
    authenticated_admin_client: TestClient,
    db_session: Session,
    test_admin: User,
    trust: OrgUnit,
) -> None:
    response = authenticated_admin_client.post(
        f"/api/users/{test_admin.id}/deactivate"
    )

    db_session.expire_all()
    saved = db_session.get(User, test_admin.id)

    assert response.status_code == 400
    assert response.json() == {"detail": "Cannot deactivate your own account"}
    assert saved is not None
    assert saved.is_active is True


def test_deactivating_an_account_already_closed_is_a_400_with_the_reason(
    authenticated_admin_client: TestClient, leaver: User
) -> None:
    response = authenticated_admin_client.post(
        f"/api/users/{leaver.id}/deactivate"
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "User is already deactivated"}


def test_reactivating_answers_with_whose_account_was_opened(
    authenticated_admin_client: TestClient,
    db_session: Session,
    leaver: User,
) -> None:
    response = authenticated_admin_client.post(
        f"/api/users/{leaver.id}/reactivate"
    )

    db_session.expire_all()
    saved = db_session.get(User, leaver.id)

    assert response.status_code == 200
    assert response.json() == {
        "detail": "reactivated",
        "id": leaver.id,
        "username": "leaver",
    }
    assert saved is not None
    assert saved.is_active is True


def test_reactivating_an_account_already_open_is_a_400_with_the_reason(
    authenticated_admin_client: TestClient, colleague: User
) -> None:
    response = authenticated_admin_client.post(
        f"/api/users/{colleague.id}/reactivate"
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "User is already active"}


# --- the invite to set a password -------------------------------------------


def test_the_invite_carries_a_link_that_resets_that_accounts_password(
    authenticated_admin_client: TestClient, colleague: User
) -> None:
    with patch("app.users.router.send_email") as mock_send:
        response = authenticated_admin_client.post(
            f"/api/users/{colleague.id}/send-invite"
        )

    sent = mock_send.call_args.kwargs
    link = sent["text_body"].split("/reset-password?token=")[1].split()[0]
    token, marker = link.split("&")

    assert response.status_code == 200
    assert response.json() == {"detail": "Invite email sent"}
    assert sent["to"] == colleague.email
    assert marker == "invite=1"
    claims = verify_password_reset_token(token)
    assert claims is not None
    assert claims.email == colleague.email


def test_no_invite_is_sent_when_the_account_is_refused(
    authenticated_admin_client: TestClient, trust: OrgUnit, outsider: User
) -> None:
    with patch("app.users.router.send_email") as mock_send:
        response = authenticated_admin_client.post(
            f"/api/users/{outsider.id}/send-invite"
        )

    assert response.status_code == 404
    assert response.json() == {"detail": NOT_FOUND}
    mock_send.assert_not_called()
