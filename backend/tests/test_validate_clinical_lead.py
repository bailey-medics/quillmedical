"""Tests for the validate-clinical-lead public endpoint."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.teaching.models import QuestionBankOrgStatus
from app.models import (
    Organization,
    Site,
    User,
    organisation_site,
    organisation_staff_member,
    site_staff_member,
)
from app.security import hash_password


def _setup_org_with_site_and_lead(
    db: Session,
) -> tuple[Organization, Site, User]:
    """Create an org, site, and clinical lead linked together."""
    org = Organization(name="Teaching Org")
    db.add(org)
    db.flush()

    site = Site(name="Test Hospital", type="hospital")
    db.add(site)
    db.flush()

    # Link site to org
    db.execute(
        organisation_site.insert().values(
            organisation_id=org.id, site_id=site.id
        )
    )
    db.flush()

    # Create clinical lead user
    lead = User(
        username="clinicallead",
        email="lead@test.local",
        full_name="Dr Lead",
        password_hash=hash_password("Lead123!"),
        is_active=True,
        system_permissions="staff",
    )
    db.add(lead)
    db.flush()

    # Assign as clinical_lead at the site
    db.execute(
        site_staff_member.insert().values(
            site_id=site.id, user_id=lead.id, role="clinical_lead"
        )
    )
    db.flush()

    # Enable bank for this org with site_registration
    status = QuestionBankOrgStatus(
        organisation_id=org.id,
        question_bank_id="test-bank",
        is_live=True,
        site_registration=True,
    )
    db.add(status)
    db.flush()

    return org, site, lead


class TestValidateClinicalLead:
    """POST /api/teaching/public/validate-clinical-lead."""

    def test_valid_lead(self, test_client, db_session):
        """Valid clinical lead email returns valid=True with org/site info."""
        org, site, _lead = _setup_org_with_site_and_lead(db_session)

        resp = test_client.post(
            "/api/teaching/public/validate-clinical-lead",
            json={"email": "lead@test.local", "bank_id": "test-bank"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert data["site_name"] == site.name
        assert data["organisation_id"] == org.id
        assert data["site_id"] == site.id

    def test_valid_lead_case_insensitive(self, test_client, db_session):
        """Email matching is case-insensitive."""
        _setup_org_with_site_and_lead(db_session)

        resp = test_client.post(
            "/api/teaching/public/validate-clinical-lead",
            json={"email": "LEAD@TEST.LOCAL", "bank_id": "test-bank"},
        )
        assert resp.status_code == 200
        assert resp.json()["valid"] is True

    def test_unknown_email(self, test_client, db_session):
        """Unknown email returns valid=False."""
        _setup_org_with_site_and_lead(db_session)

        resp = test_client.post(
            "/api/teaching/public/validate-clinical-lead",
            json={"email": "nobody@test.local", "bank_id": "test-bank"},
        )
        assert resp.status_code == 200
        assert resp.json()["valid"] is False

    def test_user_exists_but_not_clinical_lead(self, test_client, db_session):
        """User exists but is staff (not clinical_lead) at the site."""
        org, site, _lead = _setup_org_with_site_and_lead(db_session)

        staff_user = User(
            username="staffmember",
            email="staff@test.local",
            password_hash=hash_password("Staff123!"),
            is_active=True,
            system_permissions="staff",
        )
        db_session.add(staff_user)
        db_session.flush()
        db_session.execute(
            site_staff_member.insert().values(
                site_id=site.id, user_id=staff_user.id, role="staff"
            )
        )
        db_session.flush()

        resp = test_client.post(
            "/api/teaching/public/validate-clinical-lead",
            json={"email": "staff@test.local", "bank_id": "test-bank"},
        )
        assert resp.status_code == 200
        assert resp.json()["valid"] is False

    def test_wrong_bank_id(self, test_client, db_session):
        """Valid lead but wrong bank returns valid=False."""
        _setup_org_with_site_and_lead(db_session)

        resp = test_client.post(
            "/api/teaching/public/validate-clinical-lead",
            json={"email": "lead@test.local", "bank_id": "other-bank"},
        )
        assert resp.status_code == 200
        assert resp.json()["valid"] is False

    def test_site_registration_disabled(self, test_client, db_session):
        """Bank exists but site_registration is False."""
        org, site, _lead = _setup_org_with_site_and_lead(db_session)

        # Disable site registration
        db_session.query(QuestionBankOrgStatus).filter_by(
            organisation_id=org.id, question_bank_id="test-bank"
        ).update({"site_registration": False})
        db_session.flush()

        resp = test_client.post(
            "/api/teaching/public/validate-clinical-lead",
            json={"email": "lead@test.local", "bank_id": "test-bank"},
        )
        assert resp.status_code == 200
        assert resp.json()["valid"] is False

    def test_lead_at_unlinked_site(self, test_client, db_session):
        """Lead is at a site not linked to the bank's org."""
        _setup_org_with_site_and_lead(db_session)

        # Create a separate org+site not linked to this bank
        other_org = Organization(name="Other Org")
        db_session.add(other_org)
        db_session.flush()

        other_site = Site(name="Other Hospital", type="hospital")
        db_session.add(other_site)
        db_session.flush()
        db_session.execute(
            organisation_site.insert().values(
                organisation_id=other_org.id, site_id=other_site.id
            )
        )

        other_lead = User(
            username="otherlead",
            email="otherlead@test.local",
            password_hash=hash_password("Lead123!"),
            is_active=True,
            system_permissions="staff",
        )
        db_session.add(other_lead)
        db_session.flush()
        db_session.execute(
            site_staff_member.insert().values(
                site_id=other_site.id,
                user_id=other_lead.id,
                role="clinical_lead",
            )
        )
        db_session.flush()

        resp = test_client.post(
            "/api/teaching/public/validate-clinical-lead",
            json={
                "email": "otherlead@test.local",
                "bank_id": "test-bank",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["valid"] is False


class TestRegisterWithSiteMembership:
    """POST /api/auth/register with organisation_id and site_id."""

    def test_register_adds_org_and_site_membership(
        self, test_client, db_session
    ):
        """Registration with org+site creates both membership rows."""
        org, site, _lead = _setup_org_with_site_and_lead(db_session)

        resp = test_client.post(
            "/api/auth/register",
            json={
                "username": "newtrainee",
                "email": "trainee@example.com",
                "password": "Secure123!",
                "full_name": "New Trainee",
                "organisation_id": org.id,
                "site_id": site.id,
            },
        )
        assert resp.status_code == 200
        assert resp.json()["detail"] == "created"

        # Verify org membership
        new_user = (
            db_session.execute(
                select(User).where(User.username == "newtrainee")
            )
            .scalars()
            .first()
        )
        assert new_user is not None

        org_row = db_session.execute(
            select(organisation_staff_member).where(
                organisation_staff_member.c.user_id == new_user.id,
                organisation_staff_member.c.organisation_id == org.id,
            )
        ).first()
        assert org_row is not None
        assert org_row.is_primary is True

        # Verify site membership as trainee
        site_row = db_session.execute(
            select(site_staff_member).where(
                site_staff_member.c.user_id == new_user.id,
                site_staff_member.c.site_id == site.id,
            )
        ).first()
        assert site_row is not None
        assert site_row.role == "trainee"

    def test_register_site_without_org_fails(self, test_client, db_session):
        """Providing site_id without organisation_id returns 400."""
        _org, site, _lead = _setup_org_with_site_and_lead(db_session)

        resp = test_client.post(
            "/api/auth/register",
            json={
                "username": "baduser",
                "email": "bad@example.com",
                "password": "Secure123!",
                "site_id": site.id,
            },
        )
        assert resp.status_code == 400
        assert "organisation_id required" in resp.json()["detail"]

    def test_register_site_not_linked_to_org_fails(
        self, test_client, db_session
    ):
        """Site not linked to the provided org returns 400."""
        org, _site, _lead = _setup_org_with_site_and_lead(db_session)

        # Create an unlinked site
        unlinked_site = Site(name="Unlinked Hospital", type="hospital")
        db_session.add(unlinked_site)
        db_session.flush()

        resp = test_client.post(
            "/api/auth/register",
            json={
                "username": "baduser2",
                "email": "bad2@example.com",
                "password": "Secure123!",
                "organisation_id": org.id,
                "site_id": unlinked_site.id,
            },
        )
        assert resp.status_code == 400
        assert "Site not found" in resp.json()["detail"]
