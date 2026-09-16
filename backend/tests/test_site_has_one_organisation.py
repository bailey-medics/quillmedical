"""A site belongs to exactly one organisation.

Ownership is the parent column: a place hangs beneath its organisation's
own row in the tree. These tests pin the behaviour that is for: one
owner, a refusal rather than a silent second owner, and a re-parent that
cannot cross from one organisation into another.

Covers:
- Creating a site records its owner on the site row
- Giving an owned site to a second organisation is refused
- Taking a site away leaves it owned by nobody
- The organisation's own page lists the sites it owns
- A parent from another organisation is refused, on create and on move
"""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from app.models import Organisation, OrgUnit, User
from app.org_units.tree import organisation_id_of_site
from app.organisations import add_organisation_member


@pytest.fixture
def own_org(db_session: Session, test_admin: User) -> Organisation:
    """An organisation the admin in the fixtures belongs to."""
    org = Organisation(name="Own Trust", type="hospital_team")
    db_session.add(org)
    db_session.commit()
    add_organisation_member(db_session, org.id, test_admin.id, "staff")
    db_session.commit()
    return org


@pytest.fixture
def other_org(db_session: Session) -> Organisation:
    """An organisation nobody in the fixtures belongs to."""
    org = Organisation(name="Other Trust", type="hospital_team")
    db_session.add(org)
    db_session.commit()
    return org


def _site_of(db: Session, org: Organisation | None, name: str) -> OrgUnit:
    site = OrgUnit(
        name=name,
        type="ward",
        parent_id=org.org_unit_id if org else None,
    )
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


def _owner_of(db: Session, site_id: int) -> int | None:
    """The organisation accountable for a place, by walking up the tree."""
    return organisation_id_of_site(db, site_id)


class TestCreating:
    def test_the_owner_is_written_on_the_site_itself(
        self, authenticated_admin_client, db_session, own_org
    ):
        resp = authenticated_admin_client.post(
            "/api/sites",
            json={
                "name": "New Ward",
                "type": "ward",
                "organisation_id": own_org.id,
            },
        )
        assert resp.status_code == 200
        assert _owner_of(db_session, resp.json()["id"]) == own_org.id


class TestGivingASiteToAnOrganisation:
    def test_an_unowned_site_is_taken_on(
        self, authenticated_superadmin_client, db_session, own_org
    ):
        site = _site_of(db_session, None, "Loose Ward")

        resp = authenticated_superadmin_client.post(
            f"/api/organisations/{own_org.id}/sites/{site.id}"
        )

        assert resp.status_code == 200
        assert resp.json()["status"] == "linked"
        assert _owner_of(db_session, site.id) == own_org.id

    def test_a_second_organisation_is_refused(
        self, authenticated_superadmin_client, db_session, own_org, other_org
    ):
        """The point of the change: two owners is not an answer.

        A site with two owners has no single answer to whose features
        apply, who its clinical lead is, or which admins may edit it.
        """
        site = _site_of(db_session, own_org, "Owned Ward")

        resp = authenticated_superadmin_client.post(
            f"/api/organisations/{other_org.id}/sites/{site.id}"
        )

        assert resp.status_code == 409
        assert _owner_of(db_session, site.id) == own_org.id

    def test_the_same_organisation_twice_changes_nothing(
        self, authenticated_superadmin_client, db_session, own_org
    ):
        site = _site_of(db_session, own_org, "Owned Ward")

        resp = authenticated_superadmin_client.post(
            f"/api/organisations/{own_org.id}/sites/{site.id}"
        )

        assert resp.status_code == 200
        assert resp.json()["status"] == "already_linked"
        assert _owner_of(db_session, site.id) == own_org.id


class TestTakingASiteAway:
    def test_the_site_is_left_owned_by_nobody(
        self, authenticated_superadmin_client, db_session, own_org
    ):
        site = _site_of(db_session, own_org, "Owned Ward")

        resp = authenticated_superadmin_client.delete(
            f"/api/organisations/{own_org.id}/sites/{site.id}"
        )

        assert resp.status_code == 200
        assert _owner_of(db_session, site.id) is None

    def test_taking_it_from_the_wrong_organisation_is_refused(
        self, authenticated_superadmin_client, db_session, own_org, other_org
    ):
        site = _site_of(db_session, own_org, "Owned Ward")

        resp = authenticated_superadmin_client.delete(
            f"/api/organisations/{other_org.id}/sites/{site.id}"
        )

        assert resp.status_code == 404
        assert _owner_of(db_session, site.id) == own_org.id


class TestTheOrganisationPage:
    def test_it_lists_the_sites_that_organisation_owns(
        self, authenticated_superadmin_client, db_session, own_org, other_org
    ):
        mine = _site_of(db_session, own_org, "My Ward")
        _site_of(db_session, other_org, "Their Ward")

        resp = authenticated_superadmin_client.get(
            f"/api/organisations/{own_org.id}"
        )

        assert resp.status_code == 200
        assert [s["id"] for s in resp.json()["sites"]] == [mine.id]


class TestNestingStaysInsideOneOrganisation:
    def test_creating_under_another_organisations_site_is_refused(
        self, authenticated_superadmin_client, db_session, own_org, other_org
    ):
        theirs = _site_of(db_session, other_org, "Their Building")

        resp = authenticated_superadmin_client.post(
            "/api/sites",
            json={
                "name": "My Ward",
                "type": "ward",
                "organisation_id": own_org.id,
                "parent_id": theirs.id,
            },
        )

        assert resp.status_code == 404

    def test_moving_under_another_organisations_site_is_refused(
        self, authenticated_superadmin_client, db_session, own_org, other_org
    ):
        mine = _site_of(db_session, own_org, "My Ward")
        theirs = _site_of(db_session, other_org, "Their Building")

        resp = authenticated_superadmin_client.put(
            f"/api/sites/{mine.id}", json={"parent_id": theirs.id}
        )

        assert resp.status_code == 404
        db_session.refresh(mine)
        # Left where it was: directly inside its own organisation.
        assert mine.parent_id == own_org.org_unit_id

    def test_moving_under_a_sibling_still_works(
        self, authenticated_superadmin_client, db_session, own_org
    ):
        mine = _site_of(db_session, own_org, "My Ward")
        sibling = _site_of(db_session, own_org, "My Building")

        resp = authenticated_superadmin_client.put(
            f"/api/sites/{mine.id}", json={"parent_id": sibling.id}
        )

        assert resp.status_code == 200
        db_session.refresh(mine)
        assert mine.parent_id == sibling.id

    def test_an_unowned_site_cannot_be_given_a_parent(
        self, authenticated_superadmin_client, db_session, own_org
    ):
        """A site with no owner has nothing to compare a parent against."""
        loose = _site_of(db_session, None, "Loose Ward")
        parent = _site_of(db_session, own_org, "My Building")

        resp = authenticated_superadmin_client.put(
            f"/api/sites/{loose.id}", json={"parent_id": parent.id}
        )

        assert resp.status_code == 404
        db_session.refresh(loose)
        assert loose.parent_id is None
