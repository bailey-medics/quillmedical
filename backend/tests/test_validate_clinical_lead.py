"""Tests for the validate-clinical-lead public endpoint."""

from __future__ import annotations

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.cbac.positions import set_clinical_lead
from app.features.teaching.models import QuestionBankOrgStatus
from app.models import (
    OrgUnit,
    User,
    org_unit_member,
)
from app.organisations import organisation_org_unit_member
from app.security import hash_password


def _setup_org_with_site_and_lead(
    db: Session,
) -> tuple[OrgUnit, OrgUnit, User]:
    """Create an org, site, and clinical lead linked together."""
    org = OrgUnit(name="Teaching Org", type="hospital_team")
    db.add(org)
    db.flush()

    site = OrgUnit(name="Test Hospital", type="hospital")
    db.add(site)
    db.flush()

    # Link site to org
    db.execute(
        update(OrgUnit).where(OrgUnit.id == site.id).values(parent_id=org.id)
    )
    db.flush()

    # Create clinical lead user
    lead = User(
        username="clinicallead",
        email="lead@test.local",
        full_name="Dr Lead",
        password_hash=hash_password("Lead123!"),
        is_active=True,
    )
    db.add(lead)
    db.flush()

    # Assign as clinical_lead at the site. Both the role column and the
    # position are written, as the API does: the endpoint reads the post,
    # and the column stays until the contract step removes it.
    db.execute(
        org_unit_member.insert().values(
            org_unit_id=site.id,
            user_id=lead.id,
            capacity="staff",
        )
    )
    set_clinical_lead(db, site, lead)
    db.flush()

    # Enable bank for this org with site_registration
    status = QuestionBankOrgStatus(
        org_unit_id=org.id,
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
        # The organisation is named by its place now, and only by it.
        assert data["org_unit_id"] == org.id
        assert "organisation_id" not in data
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
        )
        db_session.add(staff_user)
        db_session.flush()
        db_session.execute(
            org_unit_member.insert().values(
                org_unit_id=site.id,
                user_id=staff_user.id,
                capacity="staff",
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
            org_unit_id=org.id, question_bank_id="test-bank"
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
        other_org = OrgUnit(name="Other Org", type="hospital_team")
        db_session.add(other_org)
        db_session.flush()

        other_site = OrgUnit(name="Other Hospital", type="hospital")
        db_session.add(other_site)
        db_session.flush()
        db_session.execute(
            update(OrgUnit)
            .where(OrgUnit.id == other_site.id)
            .values(parent_id=other_org.id)
        )

        other_lead = User(
            username="otherlead",
            email="otherlead@test.local",
            password_hash=hash_password("Lead123!"),
            is_active=True,
        )
        db_session.add(other_lead)
        db_session.flush()
        db_session.execute(
            org_unit_member.insert().values(
                org_unit_id=other_site.id,
                user_id=other_lead.id,
                capacity="staff",
            )
        )
        set_clinical_lead(db_session, other_site, other_lead)
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
    """POST /api/auth/register with org_unit_id and site_id."""

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
                "org_unit_id": org.id,
                "site_id": site.id,
                "teaching_module_id": "test-bank",
                "clinical_lead_email": "lead@test.local",
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
            select(organisation_org_unit_member).where(
                organisation_org_unit_member.c.user_id == new_user.id,
                organisation_org_unit_member.c.org_unit_id == org.id,
            )
        ).first()
        assert org_row is not None

        # Verify site membership as trainee
        site_row = db_session.execute(
            select(org_unit_member).where(
                org_unit_member.c.user_id == new_user.id,
                org_unit_member.c.org_unit_id == site.id,
            )
        ).first()
        assert site_row is not None
        assert site_row.capacity == "trainee"

    def test_register_site_without_a_clinical_lead_fails(
        self, test_client, db_session
    ):
        """A site named on its own returns 400.

        This used to be refused for lacking an organisation. It is now
        refused sooner, for naming no clinical lead: the organisation is
        worked out from the lead and is no longer the browser's to give.
        """
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
        assert "clinical lead" in resp.json()["detail"]

    def test_register_site_not_linked_to_org_fails(
        self, test_client, db_session
    ):
        """Site not linked to the provided org returns 400."""
        org, _site, _lead = _setup_org_with_site_and_lead(db_session)

        # Create an unlinked site
        unlinked_site = OrgUnit(name="Unlinked Hospital", type="hospital")
        db_session.add(unlinked_site)
        db_session.flush()

        resp = test_client.post(
            "/api/auth/register",
            json={
                "username": "baduser2",
                "email": "bad2@example.com",
                "password": "Secure123!",
                "org_unit_id": org.id,
                "site_id": unlinked_site.id,
                "teaching_module_id": "test-bank",
                "clinical_lead_email": "lead@test.local",
            },
        )
        assert resp.status_code == 400
        # Refused for not being the lead's site, before it is ever looked
        # up in the tree.
        assert "does not match" in resp.json()["detail"]


def _second_site(
    db: Session, org: OrgUnit, lead: User, name: str = "Another Hospital"
) -> OrgUnit:
    """A second site beneath ``org`` with the same clinical lead."""
    site = OrgUnit(name=name, type="hospital", parent_id=org.id)
    db.add(site)
    db.flush()
    db.execute(
        org_unit_member.insert().values(
            org_unit_id=site.id, user_id=lead.id, capacity="staff"
        )
    )
    set_clinical_lead(db, site, lead)
    db.flush()
    return site


def _register(test_client, username: str, **extra: object):
    return test_client.post(
        "/api/auth/register",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "password": "Secure123!",
            "teaching_module_id": "test-bank",
            "clinical_lead_email": "lead@test.local",
            **extra,
        },
    )


def _sites_of(db: Session, username: str) -> set[int]:
    user = db.scalar(select(User).where(User.username == username))
    assert user is not None
    return set(
        db.scalars(
            select(org_unit_member.c.org_unit_id).where(
                org_unit_member.c.user_id == user.id
            )
        )
    )


class TestALeadAtSeveralSites:
    """A clinical lead may hold the post at more than one site.

    The first was taken without a word, so a delegate could be put at a
    hospital nobody chose. The sites are now listed, the delegate
    chooses, and the server never picks.
    """

    def test_one_site_is_listed_and_is_the_answer(
        self, test_client, db_session
    ):
        org, site, _lead = _setup_org_with_site_and_lead(db_session)

        data = test_client.post(
            "/api/teaching/public/validate-clinical-lead",
            json={"email": "lead@test.local", "bank_id": "test-bank"},
        ).json()

        assert data["sites"] == [
            {
                "site_id": site.id,
                "site_name": "Test Hospital",
                "org_unit_id": org.id,
            }
        ]
        assert data["site_id"] == site.id

    def test_two_sites_are_listed_by_name_with_no_single_answer(
        self, test_client, db_session
    ):
        org, site, lead = _setup_org_with_site_and_lead(db_session)
        other = _second_site(db_session, org, lead)

        data = test_client.post(
            "/api/teaching/public/validate-clinical-lead",
            json={"email": "lead@test.local", "bank_id": "test-bank"},
        ).json()

        assert data["valid"] is True
        # "Another Hospital" before "Test Hospital", though made second.
        assert [s["site_id"] for s in data["sites"]] == [other.id, site.id]
        assert [s["site_name"] for s in data["sites"]] == [
            "Another Hospital",
            "Test Hospital",
        ]
        assert data["site_id"] is None
        assert data["site_name"] is None
        assert data["org_unit_id"] is None

    def test_a_site_under_an_organisation_not_offering_is_left_out(
        self, test_client, db_session
    ):
        org, site, lead = _setup_org_with_site_and_lead(db_session)
        elsewhere = OrgUnit(name="Elsewhere Org", type="hospital_team")
        db_session.add(elsewhere)
        db_session.flush()
        _second_site(db_session, elsewhere, lead)

        data = test_client.post(
            "/api/teaching/public/validate-clinical-lead",
            json={"email": "lead@test.local", "bank_id": "test-bank"},
        ).json()

        assert [s["site_id"] for s in data["sites"]] == [site.id]
        assert data["site_id"] == site.id
        assert data["org_unit_id"] == org.id

    def test_registering_with_the_chosen_site_joins_it_and_no_other(
        self, test_client, db_session
    ):
        org, site, lead = _setup_org_with_site_and_lead(db_session)
        other = _second_site(db_session, org, lead)

        resp = _register(test_client, "chooser", site_id=other.id)

        assert resp.status_code == 200, resp.text
        assert _sites_of(db_session, "chooser") == {org.id, other.id}
        assert site.id not in _sites_of(db_session, "chooser")

    def test_registering_with_no_site_named_is_refused(
        self, test_client, db_session
    ):
        org, _site, lead = _setup_org_with_site_and_lead(db_session)
        _second_site(db_session, org, lead)

        resp = _register(test_client, "undecided")

        assert resp.status_code == 400
        assert "Choose" in resp.json()["detail"]
        assert (
            db_session.scalar(select(User).where(User.username == "undecided"))
            is None
        )

    def test_registering_with_a_site_the_lead_does_not_hold_is_refused(
        self, test_client, db_session
    ):
        org, _site, lead = _setup_org_with_site_and_lead(db_session)
        _second_site(db_session, org, lead)
        stranger = OrgUnit(
            name="Not Theirs", type="hospital", parent_id=org.id
        )
        db_session.add(stranger)
        db_session.flush()

        resp = _register(test_client, "wrong_site", site_id=stranger.id)

        assert resp.status_code == 400
        assert "does not match" in resp.json()["detail"]

    def test_a_lead_at_one_site_needs_no_site_named(
        self, test_client, db_session
    ):
        org, site, _lead = _setup_org_with_site_and_lead(db_session)

        resp = _register(test_client, "one_site")

        assert resp.status_code == 200, resp.text
        assert _sites_of(db_session, "one_site") == {org.id, site.id}
