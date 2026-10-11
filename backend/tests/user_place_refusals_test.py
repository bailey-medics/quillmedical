"""What the people routes answer when an org unit named is not the caller's.

The rule is in ``app.users.membership`` and is tested there. This drives
the two routes that take ``org_unit_ids``, to pin what a caller is sent:
the status and the ``detail`` each route gave when the rule was written
inside ``app.main``. No test pinned these words before the rule moved.

The words are the same for an id no org unit has and for one that exists
outside the caller's reach, so the answer never confirms that an org
unit exists to somebody who cannot see it.
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OrgUnit, User, org_unit_member
from app.organisations import add_org_unit_member
from app.security import hash_password
from tests.places import administers

#: An id no org unit has.
NOWHERE = 999_999


def _org_unit(db: Session, name: str) -> OrgUnit:
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
    db.commit()
    db.refresh(org)

    return org


@pytest.fixture
def trust(db_session: Session, test_admin: User) -> OrgUnit:
    """Where the caller belongs, and administers."""
    org = _org_unit(db_session, "Severn Trust")
    add_org_unit_member(db_session, org.id, test_admin.id, "staff")
    administers(db_session, test_admin.id, org.id)
    db_session.commit()

    return org


@pytest.fixture
def other_trust(db_session: Session) -> OrgUnit:
    """Somebody else's tree: it exists, outside the caller's reach."""
    return _org_unit(db_session, "Wye Trust")


@pytest.fixture
def person(db_session: Session, trust: OrgUnit) -> User:
    """Somebody at the caller's trust, so the caller may open their page."""
    user = User(
        username="person",
        email="person@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="receptionist",
    )
    db_session.add(user)
    db_session.flush()
    add_org_unit_member(db_session, trust.id, user.id, "staff")
    db_session.commit()
    db_session.refresh(user)

    return user


def _new_user(org_unit_ids: list[int]) -> dict[str, Any]:
    return {
        "name": "New Person",
        "username": "new_person",
        "email": "new_person@example.test",
        "password": "NewPerson123!",
        "base_profession": "receptionist",
        "org_unit_ids": org_unit_ids,
    }


def _places_of(db: Session, user_id: int) -> set[int]:
    db.expire_all()

    return {
        int(row.org_unit_id)
        for row in db.execute(
            select(org_unit_member.c.org_unit_id).where(
                org_unit_member.c.user_id == user_id
            )
        ).all()
    }


# --- creating an account ----------------------------------------------------


def test_creating_at_an_id_no_org_unit_has_is_a_404_naming_the_id(
    authenticated_admin_client: TestClient,
    trust: OrgUnit,
    db_session: Session,
) -> None:
    response = authenticated_admin_client.post(
        "/api/users", json=_new_user([trust.id, NOWHERE])
    )

    assert response.status_code == 404
    assert response.json() == {"detail": f"Place {NOWHERE} not found"}
    assert (
        db_session.scalar(select(User).where(User.username == "new_person"))
        is None
    )


def test_creating_at_an_org_unit_out_of_reach_is_the_same_404(
    authenticated_admin_client: TestClient,
    trust: OrgUnit,
    other_trust: OrgUnit,
    db_session: Session,
) -> None:
    response = authenticated_admin_client.post(
        "/api/users", json=_new_user([trust.id, other_trust.id])
    )

    assert response.status_code == 404
    assert response.json() == {"detail": f"Place {other_trust.id} not found"}
    assert (
        db_session.scalar(select(User).where(User.username == "new_person"))
        is None
    )


# --- changing an account ----------------------------------------------------


def test_moving_somebody_to_an_id_no_org_unit_has_is_a_404_naming_the_id(
    authenticated_admin_client: TestClient,
    person: User,
    trust: OrgUnit,
    db_session: Session,
) -> None:
    response = authenticated_admin_client.patch(
        f"/api/users/{person.id}", json={"org_unit_ids": [NOWHERE]}
    )

    assert response.status_code == 404
    assert response.json() == {"detail": f"Place {NOWHERE} not found"}
    assert _places_of(db_session, person.id) == {trust.id}


def test_moving_somebody_to_an_org_unit_out_of_reach_is_the_same_404(
    authenticated_admin_client: TestClient,
    person: User,
    trust: OrgUnit,
    other_trust: OrgUnit,
    db_session: Session,
) -> None:
    response = authenticated_admin_client.patch(
        f"/api/users/{person.id}", json={"org_unit_ids": [other_trust.id]}
    )

    assert response.status_code == 404
    assert response.json() == {"detail": f"Place {other_trust.id} not found"}
    assert _places_of(db_session, person.id) == {trust.id}
