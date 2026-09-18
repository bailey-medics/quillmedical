"""Staff membership has its own competency.

Writing a membership row was gated on ``manage_users``, which also gates
twenty-five other routes: creating and deleting accounts, activating
patients, editing organisations, toggling feature flags, and site CRUD.
So the person who should be able to add a nurse to their ward could also
delete the ward.

``manage_staff_membership`` carries the four membership routes instead.
It mirrors ``manage_patient_membership``, which already made exactly this
separation for patients and for the same reason.

**What these tests pin is the separation itself** — that holding
``manage_users`` alone no longer opens these routes. Everything was
granted both competencies in the same change, so nobody lost access at
the switch; a test asserting the four professions still work would pass
whether or not the split happened, and prove nothing.

Like every competency it answers *what*, never *where*: the place check
beside each route is unchanged, and is tested elsewhere.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import (
    OrgUnit,
    User,
)
from app.organisations import add_place_member
from app.security import hash_password


def _user(
    db: Session,
    username: str,
    *,
    competencies: list[str],
) -> User:
    """A user holding exactly the competencies named.

    ``base_profession`` is ``patient`` so the only staff-like
    competencies present are the ones the test asks for — a profession
    granting extras would make it unclear which one opened the door.
    """
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="patient",
        additional_competencies=competencies,
        platform_role="standard",
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


@pytest.fixture
def site(db_session: Session, org: OrgUnit) -> OrgUnit:
    site = OrgUnit(name="Ward 9", type="ward")
    db_session.add(site)
    db_session.commit()
    db_session.refresh(site)
    db_session.execute(
        update(OrgUnit).where(OrgUnit.id == site.id).values(parent_id=org.id)
    )
    db_session.commit()
    return site


def _place(db: Session, org: OrgUnit, user: User) -> None:
    add_place_member(db, org.id, user.id, "staff")
    db.commit()


def _login(client: TestClient, username: str) -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": "Password123!"},
    )
    assert response.status_code == 200, response.text
    return client


def _csrf(client: TestClient) -> dict[str, str]:
    return {"X-CSRF-Token": client.cookies.get("XSRF-TOKEN", "")}


@pytest.fixture
def colleague(db_session: Session) -> User:
    """Somebody to be added and removed."""
    return _user(db_session, "a_colleague", competencies=[])


class TestThePlaceSurfaceSaysTheSame:
    """The separation, asked of the surface that administers places.

    It was written against four routes on two addresses, both now
    retired. The rule is about the competency rather than the address,
    so it moved here rather than going with them.
    """

    @pytest.fixture
    def account_admin(self, db_session: Session, org: OrgUnit) -> User:
        user = _user(
            db_session, "place_account_admin", competencies=["manage_users"]
        )
        _place(db_session, org, user)
        return user

    @pytest.fixture
    def membership_admin(self, db_session: Session, org: OrgUnit) -> User:
        user = _user(
            db_session,
            "place_membership_admin",
            competencies=["manage_staff_membership"],
        )
        _place(db_session, org, user)
        return user

    def test_managing_accounts_does_not_put_somebody_at_a_place(
        self,
        test_client: TestClient,
        org: OrgUnit,
        site: OrgUnit,
        account_admin: User,
        colleague: User,
    ) -> None:
        client = _login(test_client, "place_account_admin")
        response = client.post(
            f"/api/org-units/{site.id}/members",
            json={"user_id": colleague.id, "capacity": "staff"},
            headers=_csrf(client),
        )

        assert response.status_code == 403, response.text

    def test_managing_accounts_does_not_take_somebody_off_one(
        self,
        test_client: TestClient,
        org: OrgUnit,
        site: OrgUnit,
        account_admin: User,
        colleague: User,
    ) -> None:
        client = _login(test_client, "place_account_admin")
        response = client.delete(
            f"/api/org-units/{site.id}/members/{colleague.id}",
            headers=_csrf(client),
        )

        assert response.status_code == 403, response.text

    def test_managing_membership_puts_somebody_at_a_place(
        self,
        test_client: TestClient,
        org: OrgUnit,
        site: OrgUnit,
        membership_admin: User,
        colleague: User,
    ) -> None:
        client = _login(test_client, "place_membership_admin")
        response = client.post(
            f"/api/org-units/{site.id}/members",
            json={"user_id": colleague.id, "capacity": "staff"},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text

    def test_managing_membership_takes_somebody_off_one(
        self,
        test_client: TestClient,
        org: OrgUnit,
        site: OrgUnit,
        membership_admin: User,
        colleague: User,
    ) -> None:
        """Added first, so the removal has something to remove."""
        client = _login(test_client, "place_membership_admin")
        added = client.post(
            f"/api/org-units/{site.id}/members",
            json={"user_id": colleague.id, "capacity": "staff"},
            headers=_csrf(client),
        )
        assert added.status_code == 200, added.text

        response = client.delete(
            f"/api/org-units/{site.id}/members/{colleague.id}",
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text

    def test_the_grant_comes_with_the_membership_here_too(
        self,
        test_client: TestClient,
        db_session: Session,
        org: OrgUnit,
        membership_admin: User,
        colleague: User,
    ) -> None:
        """Granting competencies without ``manage_users`` is deliberate."""
        client = _login(test_client, "place_membership_admin")
        response = client.post(
            f"/api/org-units/{org.id}/members",
            json={
                "user_id": colleague.id,
                "capacity": "staff",
                "base_profession": "healthcare_assistant",
            },
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(colleague)
        assert "perform_venepuncture" in colleague.get_final_competencies()
