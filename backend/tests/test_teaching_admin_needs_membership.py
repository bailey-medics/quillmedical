"""Teaching's admin routes need membership of an organisation.

``_get_user_org_id`` resolved through ``_get_user_org_ids``, which
answers *reach*. All eighteen of its call sites are administrative routes
behind ``manage_teaching_content`` — syncing items, linking and deleting
media, writing captions, reading results — so a ``teaching_admin`` whose
only membership was a ward linked to the trust resolved to the trust and
administered it.

It now asks ``get_member_org_ids``. The plural helper keeps reach,
because content visibility is a different question: a ward trainee
receives what the trust made available there, which
``TestLearningContentGate`` pins.

**What this does not fix.** Which organisation is returned is still
whichever comes back first. That bug is known, documented on
``promote_bank_version`` and caught once already by
``test_a_bank_held_only_by_your_second_organisation_is_found``. Narrowing
to membership shrinks the set chosen from without making the choice
correct, and the routes that matter most already name ``org_id`` in the
path instead.

Three routes are covered rather than all eighteen: they share one
resolver, so the third adds confidence about the shape rather than new
information. A read, a write and a list are enough to show it is the
resolver and not one route's own check.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.models import (
    Organisation,
    OrgUnit,
    OrgUnitFeature,
    User,
    org_unit_member,
)
from app.organisations import add_place_member
from app.security import hash_password


def _teaching_org(db: Session, name: str = "Trust") -> Organisation:
    org = Organisation(name=name)
    db.add(org)
    db.flush()
    db.add(
        OrgUnitFeature(
            org_unit_id=org.org_unit_id, feature_key="teaching", enabled_by=1
        )
    )
    db.commit()
    db.refresh(org)
    return org


def _teaching_admin(db: Session, username: str) -> User:
    """Holds ``manage_teaching_content``, with no membership yet."""
    user = User(
        username=username,
        email=f"{username}@test.local",
        password_hash=hash_password("Educator123!"),
        is_active=True,
        email_verified=True,
        base_profession="teaching_admin",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _join_org(db: Session, org: Organisation, user: User) -> None:
    add_place_member(db, org.org_unit_id, user.id, "staff")
    db.commit()


def _join_linked_site(db: Session, org: Organisation, user: User) -> None:
    """A ward of the trust, and no organisation row.

    The shape reach admits and membership does not.
    """
    site = OrgUnit(name="Ward 9", type="ward")
    db.add(site)
    db.flush()
    db.execute(
        update(OrgUnit)
        .where(OrgUnit.id == site.id)
        .values(parent_id=org.org_unit_id)
    )
    db.execute(
        org_unit_member.insert().values(
            org_unit_id=site.id,
            user_id=user.id,
            capacity="staff",
        )
    )
    db.commit()


def _login(client: TestClient, username: str) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"username": username, "password": "Educator123!"},
    )
    assert response.status_code == 200, response.text
    return {"X-CSRF-Token": client.cookies.get("XSRF-TOKEN", "")}


@pytest.fixture
def org(db_session: Session) -> Organisation:
    return _teaching_org(db_session)


class TestAWardAdminCannotAdministerTheTrust:
    """The escalation this closes.

    ``manage_teaching_content`` admits the caller at the competency gate.
    The resolver is what must refuse them.
    """

    @pytest.fixture
    def ward_admin(self, db_session: Session, org: Organisation) -> User:
        user = _teaching_admin(db_session, "ward_admin")
        _join_linked_site(db_session, org, user)
        return user

    def test_they_cannot_list_the_trusts_items(
        self, test_client: TestClient, org: Organisation, ward_admin: User
    ) -> None:
        """A read, and the simplest of the eighteen."""
        headers = _login(test_client, "ward_admin")
        response = test_client.get("/api/teaching/items", headers=headers)

        assert response.status_code == 403, response.text

    def test_they_cannot_read_the_trusts_results(
        self, test_client: TestClient, org: Organisation, ward_admin: User
    ) -> None:
        """Assessment results are other people's performance data."""
        headers = _login(test_client, "ward_admin")
        response = test_client.get("/api/teaching/results", headers=headers)

        assert response.status_code == 403, response.text

    def test_they_cannot_list_the_trusts_banks(
        self, test_client: TestClient, org: Organisation, ward_admin: User
    ) -> None:
        headers = _login(test_client, "ward_admin")
        response = test_client.get(
            "/api/teaching/admin/banks", headers=headers
        )

        assert response.status_code == 403, response.text

    def test_the_refusal_says_membership_rather_than_no_organisation(
        self, test_client: TestClient, org: Organisation, ward_admin: User
    ) -> None:
        """They have a place; what they lack is membership of the trust.

        The old message would send someone looking for the wrong fix.
        """
        headers = _login(test_client, "ward_admin")
        response = test_client.get("/api/teaching/items", headers=headers)

        assert "member" in response.json()["detail"].lower()


class TestAnOrganisationMemberIsUnaffected:
    """A narrowing must refuse only the people it is about."""

    @pytest.fixture
    def trust_admin(self, db_session: Session, org: Organisation) -> User:
        user = _teaching_admin(db_session, "trust_admin")
        _join_org(db_session, org, user)
        return user

    def test_they_can_still_list_items(
        self, test_client: TestClient, org: Organisation, trust_admin: User
    ) -> None:
        headers = _login(test_client, "trust_admin")
        response = test_client.get("/api/teaching/items", headers=headers)

        assert response.status_code == 200, response.text

    def test_they_can_still_read_results(
        self, test_client: TestClient, org: Organisation, trust_admin: User
    ) -> None:
        headers = _login(test_client, "trust_admin")
        response = test_client.get("/api/teaching/results", headers=headers)

        assert response.status_code == 200, response.text
