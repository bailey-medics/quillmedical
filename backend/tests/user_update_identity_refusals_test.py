"""What the update route answers when a name, email or password is refused.

The rules are in ``app.users.identity`` and are tested there. This
drives the route, to pin what a caller is sent: the status and the
``detail`` the route gave when the rules were written inside it. They
reach the caller through the handler for ``UserAdminError`` in
``app.main``, so this is also the test that the handler is registered
and answers in the shape an ``HTTPException`` does.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.organisations import add_org_unit_member
from app.security import hash_password, verify_password

PASSWORD = "InsiderPass123!"


@pytest.fixture
def admin_org(db_session: Session, test_admin: User) -> OrgUnit:
    """The admin's own organisation."""
    org = OrgUnit(name="Own Trust", type="organisation")
    db_session.add(org)
    db_session.commit()
    add_org_unit_member(db_session, org.id, test_admin.id, "staff")
    db_session.commit()
    db_session.refresh(org)

    return org


def _member(db: Session, org: OrgUnit, username: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password(PASSWORD),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
    )
    db.add(user)
    db.flush()
    add_org_unit_member(db, org.id, user.id, "staff")
    db.commit()
    db.refresh(user)

    return user


@pytest.fixture
def insider(db_session: Session, admin_org: OrgUnit) -> User:
    """Somebody the admin may edit."""
    return _member(db_session, admin_org, "insider")


@pytest.fixture
def colleague(db_session: Session, admin_org: OrgUnit) -> User:
    """Somebody else, whose username and address are spoken for."""
    return _member(db_session, admin_org, "colleague")


@pytest.mark.parametrize(
    ("body", "detail"),
    [
        ({"username": "colleague"}, "Username already exists"),
        ({"email": "colleague@example.test"}, "Email already exists"),
        ({"password": "short"}, "Password must be at least 8 characters"),
    ],
)
def test_a_refused_change_is_a_400_with_the_reason(
    authenticated_admin_client: TestClient,
    db_session: Session,
    insider: User,
    colleague: User,
    body: dict[str, str],
    detail: str,
) -> None:
    response = authenticated_admin_client.patch(
        f"/api/users/{insider.id}", json=body
    )

    assert response.status_code == 400
    assert response.json() == {"detail": detail}


def test_a_refused_change_writes_nothing(
    authenticated_admin_client: TestClient,
    db_session: Session,
    insider: User,
    colleague: User,
) -> None:
    """The name was fine and the email was not: neither is kept."""
    response = authenticated_admin_client.patch(
        f"/api/users/{insider.id}",
        json={"name": "A New Name", "email": "colleague@example.test"},
    )

    db_session.expire_all()
    saved = db_session.get(User, insider.id)

    assert response.status_code == 400
    assert saved is not None
    assert saved.full_name is None
    assert saved.email == "insider@example.test"


def test_a_change_that_is_allowed_is_saved(
    authenticated_admin_client: TestClient,
    db_session: Session,
    insider: User,
) -> None:
    response = authenticated_admin_client.patch(
        f"/api/users/{insider.id}",
        json={
            "username": "renamed",
            "name": " Sam Patel ",
            "email": "Sam.Patel@Example.test",
            "password": "NewPassword456!",
        },
    )

    db_session.expire_all()
    saved = db_session.get(User, insider.id)

    assert response.status_code == 200
    assert response.json()["username"] == "renamed"
    assert saved is not None
    assert saved.full_name == "Sam Patel"
    assert saved.email == "sam.patel@example.test"
    assert verify_password("NewPassword456!", saved.password_hash)
