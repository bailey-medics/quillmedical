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
from sqlalchemy import insert, update
from sqlalchemy.orm import Session

from app.models import (
    Organisation,
    Site,
    User,
    organisation_member,
)
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
def org(db_session: Session) -> Organisation:
    organisation = Organisation(name="Trust", type="hospital")
    db_session.add(organisation)
    db_session.commit()
    db_session.refresh(organisation)
    return organisation


@pytest.fixture
def site(db_session: Session, org: Organisation) -> Site:
    site = Site(name="Ward 9", type="ward")
    db_session.add(site)
    db_session.commit()
    db_session.refresh(site)
    db_session.execute(
        update(Site)
        .where(Site.id == site.id)
        .values(parent_id=org.org_unit_id)
    )
    db_session.commit()
    return site


def _place(db: Session, org: Organisation, user: User) -> None:
    db.execute(
        insert(organisation_member).values(
            organisation_id=org.id, user_id=user.id, capacity="staff"
        )
    )
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


class TestManageUsersAloneIsNotEnough:
    """The separation, stated four times — once per route.

    Somebody holding ``manage_users`` and nothing else administers
    accounts. That is deliberately no longer authority over who belongs
    where.
    """

    @pytest.fixture
    def account_admin(self, db_session: Session, org: Organisation) -> User:
        user = _user(
            db_session, "account_admin", competencies=["manage_users"]
        )
        _place(db_session, org, user)
        return user

    def test_it_cannot_add_staff_to_an_organisation(
        self,
        test_client: TestClient,
        org: Organisation,
        account_admin: User,
        colleague: User,
    ) -> None:
        client = _login(test_client, "account_admin")
        response = client.post(
            f"/api/organisations/{org.id}/staff",
            json={"user_id": colleague.id},
            headers=_csrf(client),
        )

        assert response.status_code == 403, response.text

    def test_it_cannot_remove_staff_from_an_organisation(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        account_admin: User,
        colleague: User,
    ) -> None:
        _place(db_session, org, colleague)

        client = _login(test_client, "account_admin")
        response = client.delete(
            f"/api/organisations/{org.id}/staff/{colleague.id}",
            headers=_csrf(client),
        )

        assert response.status_code == 403, response.text

    def test_it_cannot_add_staff_to_a_site(
        self,
        test_client: TestClient,
        org: Organisation,
        site: Site,
        account_admin: User,
        colleague: User,
    ) -> None:
        client = _login(test_client, "account_admin")
        response = client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": colleague.id, "role": "staff"},
            headers=_csrf(client),
        )

        assert response.status_code == 403, response.text

    def test_it_cannot_remove_staff_from_a_site(
        self,
        test_client: TestClient,
        org: Organisation,
        site: Site,
        account_admin: User,
        colleague: User,
    ) -> None:
        client = _login(test_client, "account_admin")
        response = client.delete(
            f"/api/sites/{site.id}/staff/{colleague.id}",
            headers=_csrf(client),
        )

        assert response.status_code == 403, response.text


class TestTheNewCompetencyOpensThem:
    """And it opens them without ``manage_users``.

    The reverse of the class above: membership can now be granted on its
    own, which is the whole point of splitting it out. A ward manager can
    hold this and never be able to delete the ward.
    """

    @pytest.fixture
    def membership_admin(self, db_session: Session, org: Organisation) -> User:
        user = _user(
            db_session,
            "membership_admin",
            competencies=["manage_staff_membership"],
        )
        _place(db_session, org, user)
        return user

    def test_it_adds_staff_to_an_organisation(
        self,
        test_client: TestClient,
        org: Organisation,
        membership_admin: User,
        colleague: User,
    ) -> None:
        client = _login(test_client, "membership_admin")
        response = client.post(
            f"/api/organisations/{org.id}/staff",
            json={"user_id": colleague.id},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text

    def test_it_removes_staff_from_an_organisation(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        membership_admin: User,
        colleague: User,
    ) -> None:
        _place(db_session, org, colleague)

        client = _login(test_client, "membership_admin")
        response = client.delete(
            f"/api/organisations/{org.id}/staff/{colleague.id}",
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text

    def test_it_adds_staff_to_a_site(
        self,
        test_client: TestClient,
        org: Organisation,
        site: Site,
        membership_admin: User,
        colleague: User,
    ) -> None:
        client = _login(test_client, "membership_admin")
        response = client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": colleague.id, "role": "staff"},
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text

    def test_it_removes_staff_from_a_site(
        self,
        test_client: TestClient,
        org: Organisation,
        site: Site,
        membership_admin: User,
        colleague: User,
    ) -> None:
        """Added first, so the removal has something to remove."""
        client = _login(test_client, "membership_admin")
        added = client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": colleague.id, "role": "staff"},
            headers=_csrf(client),
        )
        assert added.status_code == 200, added.text

        response = client.delete(
            f"/api/sites/{site.id}/staff/{colleague.id}",
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text


class TestTheGrantStillWorksThroughTheNewGate:
    """The competency grant on add survives the change of gate.

    ``add_staff_to_organisation`` grants a profession in the same act as
    the membership row. That behaviour is tested in
    ``test_granting_staff_competencies.py``; asserted once here because
    it now runs for a caller who does not hold ``manage_users``, and
    granting competencies without it is worth stating deliberately
    rather than discovering.
    """

    def test_a_membership_admin_can_grant_a_profession(
        self,
        test_client: TestClient,
        db_session: Session,
        org: Organisation,
        colleague: User,
    ) -> None:
        admin = _user(
            db_session,
            "grants_without_manage_users",
            competencies=["manage_staff_membership"],
        )
        _place(db_session, org, admin)

        client = _login(test_client, "grants_without_manage_users")
        response = client.post(
            f"/api/organisations/{org.id}/staff",
            json={
                "user_id": colleague.id,
                "base_profession": "healthcare_assistant",
            },
            headers=_csrf(client),
        )

        assert response.status_code == 200, response.text
        db_session.refresh(colleague)
        assert "perform_venepuncture" in colleague.get_final_competencies()
