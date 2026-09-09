"""Tests for site<->organisation linking and site staff removal endpoints.

Covers:
- POST   /api/organisations/{org_id}/sites/{site_id}   (link_site_to_org)
- DELETE /api/organisations/{org_id}/sites/{site_id}   (unlink_site_from_org)
- DELETE /api/sites/{site_id}/staff/{user_id}          (remove_site_staff)
"""

from __future__ import annotations

from sqlalchemy import insert, select

from app.models import (
    Organisation,
    Site,
    User,
    organisation_member,
    organisation_site,
    site_member,
)
from app.security import hash_password


class TestLinkSiteToOrg:
    def test_link_success(self, authenticated_superadmin_client, db_session):
        org = Organisation(name="Link Org", type="hospital")
        site = Site(name="Link Site", type="hospital")
        db_session.add_all([org, site])
        db_session.commit()

        resp = authenticated_superadmin_client.post(
            f"/api/organisations/{org.id}/sites/{site.id}"
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "linked"

    def test_link_already_linked_is_idempotent(
        self, authenticated_superadmin_client, db_session
    ):
        org = Organisation(name="Link Org", type="hospital")
        site = Site(name="Link Site", type="hospital")
        db_session.add_all([org, site])
        db_session.commit()

        first = authenticated_superadmin_client.post(
            f"/api/organisations/{org.id}/sites/{site.id}"
        )
        assert first.status_code == 200

        second = authenticated_superadmin_client.post(
            f"/api/organisations/{org.id}/sites/{site.id}"
        )
        assert second.status_code == 200
        assert second.json()["status"] == "already_linked"

    def test_link_organisation_not_found(
        self, authenticated_superadmin_client, db_session
    ):
        site = Site(name="Link Site", type="hospital")
        db_session.add(site)
        db_session.commit()

        resp = authenticated_superadmin_client.post(
            f"/api/organisations/999999/sites/{site.id}"
        )
        assert resp.status_code == 404

    def test_link_site_not_found(
        self, authenticated_superadmin_client, db_session
    ):
        org = Organisation(name="Link Org", type="hospital")
        db_session.add(org)
        db_session.commit()

        resp = authenticated_superadmin_client.post(
            f"/api/organisations/{org.id}/sites/999999"
        )
        assert resp.status_code == 404


class TestUnlinkSiteFromOrg:
    def test_unlink_success(self, authenticated_superadmin_client, db_session):
        org = Organisation(name="Unlink Org", type="hospital")
        site = Site(name="Unlink Site", type="hospital")
        db_session.add_all([org, site])
        db_session.commit()

        link = authenticated_superadmin_client.post(
            f"/api/organisations/{org.id}/sites/{site.id}"
        )
        assert link.status_code == 200

        resp = authenticated_superadmin_client.delete(
            f"/api/organisations/{org.id}/sites/{site.id}"
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "unlinked"

    def test_unlink_not_found(
        self, authenticated_superadmin_client, db_session
    ):
        org = Organisation(name="Unlink Org", type="hospital")
        site = Site(name="Unlink Site", type="hospital")
        db_session.add_all([org, site])
        db_session.commit()

        resp = authenticated_superadmin_client.delete(
            f"/api/organisations/{org.id}/sites/{site.id}"
        )
        assert resp.status_code == 404


class TestRemoveSiteStaff:
    def test_remove_success(self, authenticated_superadmin_client, db_session):
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
            insert(site_member).values(
                site_id=site.id, user_id=member.id, capacity="staff"
            )
        )
        db_session.commit()

        resp = authenticated_superadmin_client.delete(
            f"/api/sites/{site.id}/staff/{member.id}"
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "removed"

    def test_remove_not_found(
        self, authenticated_superadmin_client, db_session
    ):
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

        resp = authenticated_superadmin_client.delete(
            f"/api/sites/{site.id}/staff/{member.id}"
        )
        assert resp.status_code == 404


class TestSiteRoutesAreScopedToYourOrganisations:
    """Every site route was `admin only` and nothing more.

    None of them asked *which* organisation you administer, so any admin
    could rename, deactivate or delete any site in the system, and link or
    unlink any site to any organisation. Sites underpin teaching governance
    — clinical-lead resolution runs through the site-to-organisation
    linkage — so this reached further than site records.

    Refusals are 404 rather than 403, matching ``get_organisation``: the
    response must not confirm a site exists to someone who cannot see it.
    """

    def _foreign_site(self, db_session) -> Site:
        """A site belonging to an organisation the test admin is not in."""
        org = Organisation(name="Someone Else's Trust", type="hospital")
        site = Site(name="Their Ward", type="ward")
        db_session.add_all([org, site])
        db_session.commit()
        db_session.execute(
            insert(organisation_site).values(
                organisation_id=org.id, site_id=site.id
            )
        )
        db_session.commit()
        return site

    def _own_site(self, db_session, admin: User) -> Site:
        """A site belonging to an organisation the admin does belong to."""
        org = Organisation(name="My Trust", type="hospital")
        site = Site(name="My Ward", type="ward")
        db_session.add_all([org, site])
        db_session.commit()
        db_session.execute(
            insert(organisation_member).values(
                organisation_id=org.id, user_id=admin.id
            )
        )
        db_session.execute(
            insert(organisation_site).values(
                organisation_id=org.id, site_id=site.id
            )
        )
        db_session.commit()
        return site

    def test_reading_a_foreign_site_is_refused(
        self, authenticated_admin_client, db_session
    ):
        site = self._foreign_site(db_session)
        resp = authenticated_admin_client.get(f"/api/sites/{site.id}")
        assert resp.status_code == 404

    def test_updating_a_foreign_site_is_refused(
        self, authenticated_admin_client, db_session, test_admin
    ):
        site = self._foreign_site(db_session)
        resp = authenticated_admin_client.put(
            f"/api/sites/{site.id}", json={"name": "Renamed By A Stranger"}
        )
        assert resp.status_code == 404
        db_session.refresh(site)
        assert site.name == "Their Ward"

    def test_deactivating_a_foreign_site_is_refused(
        self, authenticated_admin_client, db_session
    ):
        site = self._foreign_site(db_session)
        resp = authenticated_admin_client.patch(
            f"/api/sites/{site.id}/active", json={"is_active": False}
        )
        assert resp.status_code == 404
        db_session.refresh(site)
        assert site.is_active is True

    def test_deleting_a_foreign_site_is_refused(
        self, authenticated_admin_client, db_session
    ):
        site = self._foreign_site(db_session)
        resp = authenticated_admin_client.delete(f"/api/sites/{site.id}")
        assert resp.status_code == 404
        assert db_session.get(Site, site.id) is not None

    def test_adding_staff_to_a_foreign_site_is_refused(
        self, authenticated_admin_client, db_session
    ):
        site = self._foreign_site(db_session)
        outsider = User(
            username="outsider",
            email="outsider@example.com",
            password_hash=hash_password("Password123!"),
            is_active=True,
            email_verified=True,
        )
        db_session.add(outsider)
        db_session.commit()

        resp = authenticated_admin_client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": outsider.id, "role": "staff"},
        )
        assert resp.status_code == 404

    def test_removing_staff_from_a_foreign_site_is_refused(
        self, authenticated_admin_client, db_session
    ):
        site = self._foreign_site(db_session)
        member = User(
            username="their_staff",
            email="their.staff@example.com",
            password_hash=hash_password("Password123!"),
            is_active=True,
            email_verified=True,
        )
        db_session.add(member)
        db_session.commit()
        db_session.execute(
            insert(site_member).values(
                site_id=site.id, user_id=member.id, capacity="staff"
            )
        )
        db_session.commit()

        resp = authenticated_admin_client.delete(
            f"/api/sites/{site.id}/staff/{member.id}"
        )
        assert resp.status_code == 404

    def test_linking_into_an_organisation_you_are_not_in_is_refused(
        self, authenticated_admin_client, db_session
    ):
        """The link is what grants access, so it is gated on the target.

        Linking a site to an organisation makes that site's staff members
        of it, via the site-to-organisation join in ``get_user_org_ids``.
        """
        other = Organisation(name="Not Mine", type="hospital")
        site = Site(name="Loose Site", type="ward")
        db_session.add_all([other, site])
        db_session.commit()

        resp = authenticated_admin_client.post(
            f"/api/organisations/{other.id}/sites/{site.id}"
        )
        assert resp.status_code == 404

    def test_unlinking_from_an_organisation_you_are_not_in_is_refused(
        self, authenticated_admin_client, db_session
    ):
        site = self._foreign_site(db_session)
        org_id = db_session.execute(
            select(organisation_site.c.organisation_id).where(
                organisation_site.c.site_id == site.id
            )
        ).scalar_one()

        resp = authenticated_admin_client.delete(
            f"/api/organisations/{org_id}/sites/{site.id}"
        )
        assert resp.status_code == 404
        still_linked = db_session.execute(
            select(organisation_site).where(
                organisation_site.c.site_id == site.id
            )
        ).first()
        assert still_linked is not None

    def test_your_own_site_is_still_reachable(
        self, authenticated_admin_client, db_session, test_admin
    ):
        """The guard must not lock admins out of their own sites."""
        site = self._own_site(db_session, test_admin)

        assert (
            authenticated_admin_client.get(f"/api/sites/{site.id}")
        ).status_code == 200
        renamed = authenticated_admin_client.put(
            f"/api/sites/{site.id}", json={"name": "Renamed By Its Owner"}
        )
        assert renamed.status_code == 200
        db_session.refresh(site)
        assert site.name == "Renamed By Its Owner"
