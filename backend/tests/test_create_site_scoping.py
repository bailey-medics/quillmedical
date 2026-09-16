"""A site is created inside an organisation, and never belongs nowhere.

`POST /api/sites` took a name and a type and created a bare site. Nothing
owned it, so nothing could scope it: every site place check asks which
organisation a site belongs to, and `list_sites` cannot show one that
belongs to none. The link was a second request, so a failure between the
two left a permanently ownerless record — and the admin page really did
call them separately.

`organisation_id` is now required and the place is hung in the tree in the same
transaction. `_require_site_in_own_org` already assumed this was
impossible when it called a site's organisation "the site's owner"; now
it is true.

**The parent is scoped too.** The route checked that a parent site existed
and not that it was the caller's, so an admin at one trust could hang a
ward inside another trust's building. The rule is same-organisation rather
than "one of the caller's", which differ when an admin belongs to several:
a ward in Trust A's building is Trust A's ward, whoever created it.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models import (
    Organisation,
    OrgUnit,
    User,
)
from app.org_units.tree import organisation_id_of_site
from app.organisations import add_organisation_member


def _org(db: Session, name: str) -> Organisation:
    org = Organisation(name=name, type="hospital")
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _site_in(db: Session, name: str, org: Organisation) -> OrgUnit:
    site = OrgUnit(name=name, type="building")
    db.add(site)
    db.commit()
    db.execute(
        update(OrgUnit)
        .where(OrgUnit.id == site.id)
        .values(parent_id=org.org_unit_id)
    )
    db.commit()
    db.refresh(site)
    return site


@pytest.fixture
def own_org(db_session: Session, test_admin: User) -> Organisation:
    """An organisation the admin belongs to."""
    org = _org(db_session, "Own Trust")
    add_organisation_member(db_session, org.id, test_admin.id, "staff")
    db_session.commit()
    return org


@pytest.fixture
def other_org(db_session: Session) -> Organisation:
    """An organisation the admin has nothing to do with."""
    return _org(db_session, "Other Trust")


def _csrf(client: TestClient) -> str:
    return client.cookies.get("XSRF-TOKEN", "")


def _create(client: TestClient, **body: object) -> Response:
    return client.post(
        "/api/sites",
        json=body,
        headers={"X-CSRF-Token": _csrf(client)},
    )


class TestASiteIsAlwaysOwned:
    """The reason the field is required rather than optional."""

    def test_a_site_is_linked_in_the_same_request(
        self,
        authenticated_admin_client: TestClient,
        own_org: Organisation,
        db_session: Session,
    ):
        resp = _create(
            authenticated_admin_client,
            name="New Ward",
            type="ward",
            organisation_id=own_org.id,
        )

        assert resp.status_code == 200
        site_id = resp.json()["id"]

        owner = organisation_id_of_site(db_session, site_id)
        assert owner == own_org.id

    def test_omitting_the_organisation_is_refused(
        self, authenticated_admin_client: TestClient, own_org: Organisation
    ):
        """The breaking change, asserted rather than assumed.

        A stale client running the old two-call flow lands here. It gets
        a 422 and creates nothing, which is the safe direction: the old
        behaviour on a half-failed sequence was to leave an orphan.
        """
        resp = _create(
            authenticated_admin_client, name="Bare Ward", type="ward"
        )

        assert resp.status_code == 422

    def test_no_site_is_created_when_the_organisation_is_refused(
        self,
        authenticated_admin_client: TestClient,
        own_org: Organisation,
        other_org: Organisation,
        db_session: Session,
    ):
        """A refused request must not leave the site behind."""
        resp = _create(
            authenticated_admin_client,
            name="Smuggled Ward",
            type="ward",
            organisation_id=other_org.id,
        )

        assert resp.status_code == 404
        assert (
            db_session.scalar(
                select(OrgUnit).where(OrgUnit.name == "Smuggled Ward")
            )
            is None
        )


class TestTheOrganisationMustBeTheCallersOwn:
    """Naming an organisation is not the same as belonging to it."""

    def test_another_trusts_organisation_is_refused(
        self,
        authenticated_admin_client: TestClient,
        own_org: Organisation,
        other_org: Organisation,
    ):
        resp = _create(
            authenticated_admin_client,
            name="Ward",
            type="ward",
            organisation_id=other_org.id,
        )

        assert resp.status_code == 404

    def test_an_organisation_that_does_not_exist_is_refused(
        self, authenticated_admin_client: TestClient, own_org: Organisation
    ):
        resp = _create(
            authenticated_admin_client,
            name="Ward",
            type="ward",
            organisation_id=999999,
        )

        assert resp.status_code == 404

    def test_a_superadmin_may_create_in_any_organisation(
        self,
        authenticated_superadmin_client: TestClient,
        other_org: Organisation,
    ):
        resp = _create(
            authenticated_superadmin_client,
            name="Superadmin Ward",
            type="ward",
            organisation_id=other_org.id,
        )

        assert resp.status_code == 200


class TestTheParentMustBeInTheSameOrganisation:
    """Existence was checked; ownership was not."""

    def test_a_parent_in_the_same_organisation_is_accepted(
        self,
        authenticated_admin_client: TestClient,
        own_org: Organisation,
        db_session: Session,
    ):
        building = _site_in(db_session, "Own Building", own_org)

        resp = _create(
            authenticated_admin_client,
            name="Ward In Building",
            type="ward",
            organisation_id=own_org.id,
            parent_id=building.id,
        )

        assert resp.status_code == 200
        assert resp.json()["parent_id"] == building.id

    def test_another_trusts_site_cannot_be_the_parent(
        self,
        authenticated_admin_client: TestClient,
        own_org: Organisation,
        other_org: Organisation,
        db_session: Session,
    ):
        """The hole: a write into a structure the admin does not own."""
        their_building = _site_in(db_session, "Their Building", other_org)

        resp = _create(
            authenticated_admin_client,
            name="Trespassing Ward",
            type="ward",
            organisation_id=own_org.id,
            parent_id=their_building.id,
        )

        assert resp.status_code == 404
        assert (
            db_session.scalar(
                select(OrgUnit).where(OrgUnit.name == "Trespassing Ward")
            )
            is None
        )

    def test_an_unlinked_site_cannot_be_the_parent(
        self,
        authenticated_admin_client: TestClient,
        own_org: Organisation,
        db_session: Session,
    ):
        """A site owned by nobody is not a parent anyone may claim."""
        orphan = OrgUnit(name="Orphan Building", type="building")
        db_session.add(orphan)
        db_session.commit()

        resp = _create(
            authenticated_admin_client,
            name="Ward",
            type="ward",
            organisation_id=own_org.id,
            parent_id=orphan.id,
        )

        assert resp.status_code == 404


class TestReParentingIsScopedToo:
    """`update_site` carried the same fault and is fixed with it."""

    def test_a_site_cannot_be_moved_under_another_trusts_site(
        self,
        authenticated_admin_client: TestClient,
        own_org: Organisation,
        other_org: Organisation,
        db_session: Session,
    ):
        mine = _site_in(db_session, "My Ward", own_org)
        theirs = _site_in(db_session, "Their Building", other_org)

        resp = authenticated_admin_client.put(
            f"/api/sites/{mine.id}",
            json={"parent_id": theirs.id},
            headers={"X-CSRF-Token": _csrf(authenticated_admin_client)},
        )

        assert resp.status_code == 404
        db_session.refresh(mine)
        # Still inside its own organisation, which is what its parent is
        # now that ownership is the tree.
        assert mine.parent_id == own_org.org_unit_id

    def test_a_site_can_be_moved_within_its_own_organisation(
        self,
        authenticated_admin_client: TestClient,
        own_org: Organisation,
        db_session: Session,
    ):
        mine = _site_in(db_session, "My Ward", own_org)
        building = _site_in(db_session, "My Building", own_org)

        resp = authenticated_admin_client.put(
            f"/api/sites/{mine.id}",
            json={"parent_id": building.id},
            headers={"X-CSRF-Token": _csrf(authenticated_admin_client)},
        )

        assert resp.status_code == 200
        db_session.refresh(mine)
        assert mine.parent_id == building.id
