"""Tests for site<->organisation linking and site staff removal endpoints.

Covers:
- POST   /api/organisations/{org_id}/sites/{site_id}   (link_site_to_org)
- DELETE /api/organisations/{org_id}/sites/{site_id}   (unlink_site_from_org)
- DELETE /api/sites/{site_id}/staff/{user_id}          (remove_site_staff)
"""

from __future__ import annotations

from sqlalchemy import insert

from app.models import Organisation, Site, User, site_staff_member
from app.security import hash_password


class TestLinkSiteToOrg:
    def test_link_success(self, authenticated_admin_client, db_session):
        org = Organisation(name="Link Org", type="hospital")
        site = Site(name="Link Site", type="hospital")
        db_session.add_all([org, site])
        db_session.commit()

        resp = authenticated_admin_client.post(
            f"/api/organisations/{org.id}/sites/{site.id}"
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "linked"

    def test_link_already_linked_is_idempotent(
        self, authenticated_admin_client, db_session
    ):
        org = Organisation(name="Link Org", type="hospital")
        site = Site(name="Link Site", type="hospital")
        db_session.add_all([org, site])
        db_session.commit()

        first = authenticated_admin_client.post(
            f"/api/organisations/{org.id}/sites/{site.id}"
        )
        assert first.status_code == 200

        second = authenticated_admin_client.post(
            f"/api/organisations/{org.id}/sites/{site.id}"
        )
        assert second.status_code == 200
        assert second.json()["status"] == "already_linked"

    def test_link_organisation_not_found(
        self, authenticated_admin_client, db_session
    ):
        site = Site(name="Link Site", type="hospital")
        db_session.add(site)
        db_session.commit()

        resp = authenticated_admin_client.post(
            f"/api/organisations/999999/sites/{site.id}"
        )
        assert resp.status_code == 404

    def test_link_site_not_found(self, authenticated_admin_client, db_session):
        org = Organisation(name="Link Org", type="hospital")
        db_session.add(org)
        db_session.commit()

        resp = authenticated_admin_client.post(
            f"/api/organisations/{org.id}/sites/999999"
        )
        assert resp.status_code == 404


class TestUnlinkSiteFromOrg:
    def test_unlink_success(self, authenticated_admin_client, db_session):
        org = Organisation(name="Unlink Org", type="hospital")
        site = Site(name="Unlink Site", type="hospital")
        db_session.add_all([org, site])
        db_session.commit()

        link = authenticated_admin_client.post(
            f"/api/organisations/{org.id}/sites/{site.id}"
        )
        assert link.status_code == 200

        resp = authenticated_admin_client.delete(
            f"/api/organisations/{org.id}/sites/{site.id}"
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "unlinked"

    def test_unlink_not_found(self, authenticated_admin_client, db_session):
        org = Organisation(name="Unlink Org", type="hospital")
        site = Site(name="Unlink Site", type="hospital")
        db_session.add_all([org, site])
        db_session.commit()

        resp = authenticated_admin_client.delete(
            f"/api/organisations/{org.id}/sites/{site.id}"
        )
        assert resp.status_code == 404


class TestRemoveSiteStaff:
    def test_remove_success(self, authenticated_admin_client, db_session):
        site = Site(name="Remove Staff Site", type="hospital")
        db_session.add(site)
        db_session.flush()

        member = User(
            username="removeme",
            email="removeme@test.local",
            full_name="Remove Me",
            password_hash=hash_password("Pass123!"),
            is_active=True,
            system_permissions="staff",
        )
        db_session.add(member)
        db_session.flush()

        db_session.execute(
            insert(site_staff_member).values(
                site_id=site.id, user_id=member.id, role="staff"
            )
        )
        db_session.commit()

        resp = authenticated_admin_client.delete(
            f"/api/sites/{site.id}/staff/{member.id}"
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "removed"

    def test_remove_not_found(self, authenticated_admin_client, db_session):
        site = Site(name="Remove Staff Site", type="hospital")
        member = User(
            username="notassigned",
            email="notassigned@test.local",
            full_name="Not Assigned",
            password_hash=hash_password("Pass123!"),
            is_active=True,
            system_permissions="staff",
        )
        db_session.add_all([site, member])
        db_session.commit()

        resp = authenticated_admin_client.delete(
            f"/api/sites/{site.id}/staff/{member.id}"
        )
        assert resp.status_code == 404
