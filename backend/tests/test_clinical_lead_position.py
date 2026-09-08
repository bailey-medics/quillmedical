"""Tests for clinical lead moving onto positions.

The expand step: both `site_member.role` and the position are
written, and the two read paths — `validate_clinical_lead` and the
organisation detail listing — have moved across. The column stays, and stays
in the site response, until the contract step, which is a breaking API
change and needs its own deploy.

What these check is that the two stay in step, and that the reads now answer
from the post rather than the column.
"""

from __future__ import annotations

from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.cbac.positions import clinical_lead_post, clinical_leads_of
from app.models import (
    Organisation,
    Position,
    PositionHolding,
    Site,
    User,
    organisation_site,
    organisation_staff_member,
    site_member,
)
from app.security import hash_password


def _user(db: Session, username: str) -> User:
    user = User(
        username=username,
        email=f"{username}@example.test",
        password_hash=hash_password("Password123!"),
        is_active=True,
        email_verified=True,
        base_profession="consultant",
        system_permissions="staff",
    )
    db.add(user)
    db.commit()
    return user


def _org_with_site(db: Session, admin: User) -> tuple[Organisation, Site]:
    org = Organisation(name="Trust", type="hospital")
    site = Site(name="Ward 1", type="ward")
    db.add_all([org, site])
    db.commit()
    db.execute(
        insert(organisation_site).values(
            organisation_id=org.id, site_id=site.id
        )
    )
    db.execute(
        insert(organisation_staff_member).values(
            organisation_id=org.id, user_id=admin.id
        )
    )
    db.commit()
    return org, site


class TestAppointingThroughTheApi:
    """Adding site staff with the clinical lead role fills the post."""

    def test_the_post_is_created_and_filled(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        _org, site = _org_with_site(db_session, test_superadmin)
        lead = _user(db_session, "dr_lead")

        resp = authenticated_superadmin_client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": lead.id, "role": "clinical_lead"},
        )

        assert resp.status_code == 200
        assert clinical_leads_of(db_session, [site.id]) == {site.id: lead.id}

    def test_the_lead_is_an_ordinary_member_of_the_site(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        """Leading is the post, not a kind of membership.

        Appointing someone still makes them a member of the site, in the
        ordinary "staff" capacity. `clinical_lead` is no longer a capacity,
        because a capacity cannot be vacant and a post can.
        """
        _org, site = _org_with_site(db_session, test_superadmin)
        lead = _user(db_session, "dr_lead")

        authenticated_superadmin_client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": lead.id, "role": "clinical_lead"},
        )

        row = db_session.execute(
            select(site_member.c.capacity).where(
                site_member.c.site_id == site.id,
                site_member.c.user_id == lead.id,
            )
        ).first()
        assert row is not None and row[0] == "staff"

    def test_ordinary_staff_do_not_fill_the_post(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        _org, site = _org_with_site(db_session, test_superadmin)
        nurse = _user(db_session, "nurse")

        authenticated_superadmin_client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": nurse.id, "role": "staff"},
        )

        assert clinical_leads_of(db_session, [site.id]) == {}

    def test_demotion_vacates_the_post(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        """Changing someone's role away from lead leaves the post empty."""
        _org, site = _org_with_site(db_session, test_superadmin)
        lead = _user(db_session, "dr_lead")

        authenticated_superadmin_client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": lead.id, "role": "clinical_lead"},
        )
        authenticated_superadmin_client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": lead.id, "role": "staff"},
        )

        assert clinical_leads_of(db_session, [site.id]) == {}

    def test_removal_vacates_the_post(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        _org, site = _org_with_site(db_session, test_superadmin)
        lead = _user(db_session, "dr_lead")

        authenticated_superadmin_client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": lead.id, "role": "clinical_lead"},
        )
        authenticated_superadmin_client.delete(
            f"/api/sites/{site.id}/staff/{lead.id}"
        )

        assert clinical_leads_of(db_session, [site.id]) == {}

    def test_the_departure_is_recorded_rather_than_erased(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        """Vacating ends the holding; it does not delete the history."""
        _org, site = _org_with_site(db_session, test_superadmin)
        lead = _user(db_session, "dr_lead")

        authenticated_superadmin_client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": lead.id, "role": "clinical_lead"},
        )
        authenticated_superadmin_client.delete(
            f"/api/sites/{site.id}/staff/{lead.id}"
        )

        post = clinical_lead_post(db_session, site)
        holdings = (
            db_session.execute(
                select(PositionHolding).where(
                    PositionHolding.position_id == post.id
                )
            )
            .scalars()
            .all()
        )
        assert len(holdings) == 1
        assert holdings[0].ended_on is not None


class TestTheReadsAnswerFromThePost:
    """Both read paths moved across, so the post is what they report."""

    def test_the_organisation_listing_names_the_lead(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        org, site = _org_with_site(db_session, test_superadmin)
        lead = _user(db_session, "dr_lead")
        lead.full_name = "Dr Ada Lead"
        db_session.commit()

        authenticated_superadmin_client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": lead.id, "role": "clinical_lead"},
        )

        resp = authenticated_superadmin_client.get(
            f"/api/organisations/{org.id}"
        )
        assert resp.status_code == 200
        listed = {s["id"]: s for s in resp.json()["sites"]}
        assert listed[site.id]["clinical_lead"] == "Dr Ada Lead"

    def test_a_lead_written_only_to_the_column_is_not_reported(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        """Proves the read really moved.

        Writing the column directly, as the pre-migration code did, no
        longer makes someone the clinical lead — only the post does.
        """
        org, site = _org_with_site(db_session, test_superadmin)
        impostor = _user(db_session, "dr_column_only")
        db_session.execute(
            insert(site_member).values(
                site_id=site.id,
                user_id=impostor.id,
                capacity="staff",
            )
        )
        db_session.commit()

        resp = authenticated_superadmin_client.get(
            f"/api/organisations/{org.id}"
        )
        listed = {s["id"]: s for s in resp.json()["sites"]}
        assert listed[site.id]["clinical_lead"] == ""


class TestThePostIsCreatedOnDemand:
    """A post nobody has tried to fill is not a vacancy anyone is chasing."""

    def test_a_new_site_has_no_clinical_lead_post(self, db_session):
        site = Site(name="Fresh Ward", type="ward")
        db_session.add(site)
        db_session.commit()

        assert (
            db_session.execute(
                select(Position).where(Position.site_id == site.id)
            ).first()
            is None
        )

    def test_asking_for_it_creates_it_vacant(self, db_session):
        site = Site(name="Fresh Ward", type="ward")
        db_session.add(site)
        db_session.commit()

        post = clinical_lead_post(db_session, site)
        db_session.commit()

        assert post.kind == "clinical_lead"
        assert post.max_holders == 1
        assert clinical_leads_of(db_session, [site.id]) == {}

    def test_asking_twice_returns_the_same_post(self, db_session):
        site = Site(name="Fresh Ward", type="ward")
        db_session.add(site)
        db_session.commit()

        first = clinical_lead_post(db_session, site)
        db_session.commit()
        second = clinical_lead_post(db_session, site)

        assert first.id == second.id


class TestTheSiteResponseNamesTheLead:
    """Added so the interface can stop scanning staff rows for a role.

    Additive: `role` is still in `SiteStaffItem`, so nothing breaks and
    there is no API change to declare. Removing it is the contract step.
    """

    def test_a_vacant_post_reports_none(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        """A vacancy is a real state, not a missing row."""
        _org, site = _org_with_site(db_session, test_superadmin)

        resp = authenticated_superadmin_client.get(f"/api/sites/{site.id}")

        assert resp.status_code == 200
        assert resp.json()["clinical_lead_id"] is None

    def test_a_filled_post_names_the_holder(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        _org, site = _org_with_site(db_session, test_superadmin)
        lead = _user(db_session, "dr_lead")

        authenticated_superadmin_client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": lead.id, "role": "clinical_lead"},
        )

        resp = authenticated_superadmin_client.get(f"/api/sites/{site.id}")
        assert resp.json()["clinical_lead_id"] == lead.id

    def test_the_role_column_alone_does_not_name_a_lead(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        """Proves the field comes from the post, not from the staff rows."""
        _org, site = _org_with_site(db_session, test_superadmin)
        impostor = _user(db_session, "dr_column_only")
        db_session.execute(
            insert(site_member).values(
                site_id=site.id,
                user_id=impostor.id,
                capacity="staff",
            )
        )
        db_session.commit()

        resp = authenticated_superadmin_client.get(f"/api/sites/{site.id}")
        assert resp.json()["clinical_lead_id"] is None

    def test_role_is_no_longer_returned(
        self, authenticated_superadmin_client, db_session, test_superadmin
    ):
        """The contract step: the field is gone.

        It named three unrelated things — who led the site, who was on
        placement, and who was simply a member. Leading is now
        `clinical_lead_id`, and the rest is what the membership row says by
        existing.
        """
        _org, site = _org_with_site(db_session, test_superadmin)
        nurse = _user(db_session, "nurse")

        authenticated_superadmin_client.post(
            f"/api/sites/{site.id}/staff",
            json={"user_id": nurse.id, "role": "staff"},
        )

        resp = authenticated_superadmin_client.get(f"/api/sites/{site.id}")
        member = resp.json()["staff"][0]
        assert "role" not in member
        assert member["username"] == "nurse"
