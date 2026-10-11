"""What ``PATCH /api/users/{id}`` answers when a promotion is refused.

The rule is in ``app.users.competencies`` and is tested there. This
drives the route, to pin what a caller is sent: the status and the
``detail`` the route gave when the rule was written inside it.
``platform_role_is_writable_test.py`` pins the status and that nothing
is written; no test pinned the words before the rule moved.

The caller holds ``manage_users``, so there is no limit on what they
may grant, and is not an operator. That is the one caller who reaches
this refusal: somebody with a limited scope is told earlier that they
may not set a platform role at all.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import OrgUnit, User
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.places import administers

PASSWORD = "Administrator123!"

NO_PROMOTION = "Cannot grant the superadmin platform role"


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
    org = OrgUnit(name="Trust", type="organisation")
    db_session.add(org)
    db_session.commit()
    db_session.refresh(org)

    return org


@pytest.fixture
def user_manager(db_session: Session, trust: OrgUnit) -> User:
    """Holds ``manage_users`` at the trust, and is not an operator."""
    user = _member(db_session, trust, "manager", "system_administrator")
    administers(db_session, user.id, trust.id)
    db_session.commit()

    return user


@pytest.fixture
def receptionist(db_session: Session, trust: OrgUnit) -> User:
    return _member(db_session, trust, "receptionist", "receptionist")


@pytest.fixture
def client(test_client: TestClient, user_manager: User) -> TestClient:
    """Signed in as the user manager."""
    response = test_client.post(
        "/api/auth/login",
        json={"username": user_manager.username, "password": PASSWORD},
    )
    assert response.status_code == 200
    csrf = test_client.cookies.get("XSRF-TOKEN")

    if csrf:
        test_client.headers["X-CSRF-Token"] = csrf

    return test_client


def test_promoting_somebody_without_being_an_operator_is_a_403_with_the_reason(
    client: TestClient, receptionist: User
) -> None:
    response = client.patch(
        f"/api/users/{receptionist.id}", json={"platform_role": "superadmin"}
    )

    assert response.status_code == 403
    assert response.json() == {"detail": NO_PROMOTION}


def test_a_refused_promotion_leaves_the_rest_of_the_save_unwritten(
    client: TestClient, receptionist: User, db_session: Session
) -> None:
    """The profession is set before the role is refused, then undone."""
    response = client.patch(
        f"/api/users/{receptionist.id}",
        json={
            "base_profession": "teaching_delegate",
            "additional_competencies": ["view_teaching_analytics"],
            "platform_role": "superadmin",
        },
    )

    db_session.expire_all()
    saved = db_session.get(User, receptionist.id)

    assert response.status_code == 403
    assert response.json() == {"detail": NO_PROMOTION}
    assert saved is not None
    assert saved.platform_role == "standard"
    assert saved.base_profession == "receptionist"
    assert saved.get_final_competencies() == ["access_clinic_admin"]
