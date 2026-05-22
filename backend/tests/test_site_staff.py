"""Tests for site staff endpoint (POST /api/sites/{site_id}/staff)."""

from __future__ import annotations

from sqlalchemy import insert

from app.models import Site, User, site_staff_member
from app.security import hash_password


class TestSiteStaffClinicalLeadConstraint:
    """Enforce max 1 clinical lead per site."""

    def test_add_clinical_lead_success(
        self, authenticated_admin_client, db_session, test_admin: User
    ):
        """Can add a clinical lead when none exists."""
        site = Site(name="Test Site", type="hospital")
        db_session.add(site)
        db_session.flush()

        target = User(
            username="sitestaff1",
            email="sitestaff1@test.local",
            full_name="Staff One",
            password_hash=hash_password("Pass123!"),
            is_active=True,
            system_permissions="staff",
        )
        db_session.add(target)
        db_session.commit()

        resp = authenticated_admin_client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": target.id, "role": "clinical_lead"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "added"

    def test_add_second_clinical_lead_rejected(
        self, authenticated_admin_client, db_session, test_admin: User
    ):
        """Adding a second clinical lead returns 409."""
        site = Site(name="Lead Site", type="hospital")
        db_session.add(site)
        db_session.flush()

        existing_lead = User(
            username="existlead",
            email="existlead@test.local",
            full_name="Existing Lead",
            password_hash=hash_password("Pass123!"),
            is_active=True,
            system_permissions="staff",
        )
        db_session.add(existing_lead)
        db_session.flush()

        db_session.execute(
            insert(site_staff_member).values(
                site_id=site.id,
                user_id=existing_lead.id,
                role="clinical_lead",
            )
        )

        new_user = User(
            username="newlead",
            email="newlead@test.local",
            full_name="New Lead",
            password_hash=hash_password("Pass123!"),
            is_active=True,
            system_permissions="staff",
        )
        db_session.add(new_user)
        db_session.commit()

        resp = authenticated_admin_client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": new_user.id, "role": "clinical_lead"},
        )
        assert resp.status_code == 409
        assert "already has a clinical lead" in resp.json()["detail"]

    def test_update_existing_user_to_clinical_lead_rejected(
        self, authenticated_admin_client, db_session, test_admin: User
    ):
        """Updating a staff member to clinical_lead fails if one exists."""
        site = Site(name="Update Site", type="hospital")
        db_session.add(site)
        db_session.flush()

        lead = User(
            username="updatelead",
            email="updatelead@test.local",
            full_name="Update Lead",
            password_hash=hash_password("Pass123!"),
            is_active=True,
            system_permissions="staff",
        )
        db_session.add(lead)
        db_session.flush()

        db_session.execute(
            insert(site_staff_member).values(
                site_id=site.id, user_id=lead.id, role="clinical_lead"
            )
        )

        staff = User(
            username="updatestaff",
            email="updatestaff@test.local",
            full_name="Update Staff",
            password_hash=hash_password("Pass123!"),
            is_active=True,
            system_permissions="staff",
        )
        db_session.add(staff)
        db_session.flush()

        db_session.execute(
            insert(site_staff_member).values(
                site_id=site.id, user_id=staff.id, role="staff"
            )
        )
        db_session.commit()

        resp = authenticated_admin_client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": staff.id, "role": "clinical_lead"},
        )
        assert resp.status_code == 409
        assert "already has a clinical lead" in resp.json()["detail"]

    def test_reassign_same_user_as_clinical_lead_allowed(
        self, authenticated_admin_client, db_session, test_admin: User
    ):
        """Re-posting the same user as clinical_lead is idempotent."""
        site = Site(name="Same Lead Site", type="hospital")
        db_session.add(site)
        db_session.flush()

        lead = User(
            username="samelead",
            email="samelead@test.local",
            full_name="Same Lead",
            password_hash=hash_password("Pass123!"),
            is_active=True,
            system_permissions="staff",
        )
        db_session.add(lead)
        db_session.flush()

        db_session.execute(
            insert(site_staff_member).values(
                site_id=site.id, user_id=lead.id, role="clinical_lead"
            )
        )
        db_session.commit()

        resp = authenticated_admin_client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": lead.id, "role": "clinical_lead"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "updated"

    def test_add_staff_role_allowed_with_existing_lead(
        self, authenticated_admin_client, db_session, test_admin: User
    ):
        """Adding a staff/trainee role succeeds even with a lead."""
        site = Site(name="Mixed Site", type="hospital")
        db_session.add(site)
        db_session.flush()

        lead = User(
            username="mixedlead",
            email="mixedlead@test.local",
            full_name="Mixed Lead",
            password_hash=hash_password("Pass123!"),
            is_active=True,
            system_permissions="staff",
        )
        db_session.add(lead)
        db_session.flush()

        db_session.execute(
            insert(site_staff_member).values(
                site_id=site.id, user_id=lead.id, role="clinical_lead"
            )
        )

        staff = User(
            username="mixedstaff",
            email="mixedstaff@test.local",
            full_name="Mixed Staff",
            password_hash=hash_password("Pass123!"),
            is_active=True,
            system_permissions="staff",
        )
        db_session.add(staff)
        db_session.commit()

        resp = authenticated_admin_client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": staff.id, "role": "staff"},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "added"
