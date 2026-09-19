"""Administrative routes ask membership, not reach.

`get_reachable_org_ids` answers *can this person get here*, and a site
trainee reaches the organisations their site is linked to — that is why a
delegate sees the trust's teaching content. Administrative routes must
ask the narrower question: *is this person a member of this
organisation*.

The two were one function until recently, and the call sites all said
`get_user_org_ids`, a name that answers neither question out loud. They
now say `get_member_org_ids`. That rename is behaviour-preserving, so
these tests do not pin the rename — they pin the thing the rename exists
to protect, which no test covered: that a site trainee cannot administer
the trust above their site.

**The risk runs one way.** Moving a call site from membership to reach
can only ever *widen* what it admits, because reach adds site-linked
organisations to a set that held only direct memberships. A mistake here
is therefore a permission that is too generous, which is the failure that
does not announce itself. `test_place_resolver.py` pins the resolvers
themselves; this pins the routes that call them.
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
    site_member,
)
from app.organisations import add_organisation_member
from app.security import hash_password


def _user(db: Session, username: str, *, profession: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession=profession,
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
    """A ward of the trust, linked to it the ordinary way."""
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


@pytest.fixture
def site_only_admin(db_session: Session, site: Site) -> User:
    """Holds ``manage_users`` at a site, and no organisation row.

    They reach the trust — the site is linked to it — so a route asking
    reach would admit them. Every route below asks membership, and must
    not.
    """
    user = _user(db_session, "ward_admin", profession="system_administrator")
    db_session.execute(
        insert(site_member).values(
            site_id=site.id,
            org_unit_id=site.id,
            user_id=user.id,
            capacity="staff",
        )
    )
    db_session.commit()
    return user


def _login(client: TestClient, username: str) -> TestClient:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": "Password123!"},
    )
    assert response.status_code == 200, response.text
    return client


def _csrf(client: TestClient) -> dict[str, str]:
    return {"X-CSRF-Token": client.cookies.get("XSRF-TOKEN", "")}


class TestSiteMembershipDoesNotAdministerTheTrust:
    """The widening this batch exists to prevent."""

    def test_the_organisation_is_not_theirs_to_read(
        self,
        test_client: TestClient,
        org: Organisation,
        site_only_admin: User,
    ) -> None:
        """404, because the route asks membership and finds none."""
        client = _login(test_client, "ward_admin")
        response = client.get(f"/api/organisations/{org.id}")

        assert response.status_code == 404, response.text

    def test_it_is_not_theirs_to_edit(
        self,
        test_client: TestClient,
        org: Organisation,
        site_only_admin: User,
    ) -> None:
        client = _login(test_client, "ward_admin")
        response = client.put(
            f"/api/organisations/{org.id}",
            json={"name": "Renamed By Someone Downstairs"},
            headers=_csrf(client),
        )

        assert response.status_code == 404, response.text

    def test_it_does_not_appear_in_their_organisation_list(
        self,
        test_client: TestClient,
        org: Organisation,
        site_only_admin: User,
    ) -> None:
        """The listing is built from the same question."""
        client = _login(test_client, "ward_admin")
        response = client.get("/api/organisations")

        assert response.status_code == 200, response.text
        names = [o["name"] for o in response.json()["organisations"]]
        assert "Trust" not in names


class TestOrganisationMembershipStillWorks:
    """The filter must not refuse the people it was never about."""

    @pytest.fixture
    def org_admin(self, db_session: Session, org: Organisation) -> User:
        user = _user(
            db_session, "trust_admin", profession="system_administrator"
        )
        add_organisation_member(db_session, org.id, user.id, "staff")
        db_session.commit()
        return user

    def test_a_member_reads_their_own_organisation(
        self,
        test_client: TestClient,
        org: Organisation,
        org_admin: User,
    ) -> None:
        client = _login(test_client, "trust_admin")
        response = client.get(f"/api/organisations/{org.id}")

        assert response.status_code == 200, response.text
        assert response.json()["name"] == "Trust"

    def test_it_appears_in_their_list(
        self,
        test_client: TestClient,
        org: Organisation,
        org_admin: User,
    ) -> None:
        client = _login(test_client, "trust_admin")
        response = client.get("/api/organisations")

        assert response.status_code == 200, response.text
        names = [o["name"] for o in response.json()["organisations"]]
        assert "Trust" in names
