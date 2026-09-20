"""Features, patient lists and conversations hang off a place.

They used to name an organisation. They now name that organisation's own
row in the tree, which is the same thing said in the tree's terms — and
the column was renamed with it, so a call site that had not moved across
would fail rather than match a different place.

Covers:
- Enabling a feature records it against the organisation's place
- A place inside an organisation holds no features of its own
- Adding and removing a patient works through the place
- Deleting an organisation takes everything at its place with it
"""

from __future__ import annotations

from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.models import (
    Organisation,
    OrgUnit,
    OrgUnitFeature,
    org_unit_patient_member,
)
from app.organisations import add_organisation_member

PATIENT = "patient-abc"


def _org(db: Session, name: str = "Trust") -> Organisation:
    org = Organisation(name=name, type="hospital_team")
    db.add(org)
    db.commit()
    db.refresh(org)
    return org


def _ward(db: Session, org: Organisation) -> OrgUnit:
    site = OrgUnit(name="Ward 1", type="ward", parent_id=org.org_unit_id)
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


class TestFeatures:
    def test_enabling_one_records_it_against_the_place(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)

        resp = authenticated_superadmin_client.put(
            f"/api/organisations/{org.id}/features/teaching",
            json={"enabled": True},
        )

        assert resp.status_code == 200
        place_id = db_session.scalar(
            select(OrgUnitFeature.org_unit_id).where(
                OrgUnitFeature.feature_key == "teaching"
            )
        )
        assert place_id == org.org_unit_id

    def test_the_organisation_lists_it_back(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        authenticated_superadmin_client.put(
            f"/api/organisations/{org.id}/features/teaching",
            json={"enabled": True},
        )

        listed = authenticated_superadmin_client.get(
            f"/api/organisations/{org.id}/features"
        )

        assert listed.status_code == 200
        assert [f["feature_key"] for f in listed.json()["features"]] == [
            "teaching"
        ]

    def test_a_ward_does_not_share_its_organisations_features(
        self, db_session
    ):
        """Features are a fact about the organisation, not about the tree."""
        org = _org(db_session)
        ward = _ward(db_session, org)
        db_session.add(
            OrgUnitFeature(org_unit_id=org.org_unit_id, feature_key="teaching")
        )
        db_session.commit()

        at_ward = db_session.scalar(
            select(OrgUnitFeature.id).where(
                OrgUnitFeature.org_unit_id == ward.id
            )
        )
        assert at_ward is None


class TestPatientLists:
    def test_a_patient_is_added_against_the_place(
        self,
        authenticated_patient_manager_client,
        db_session,
        test_patient_manager,
    ):
        org = _org(db_session)
        add_organisation_member(
            db_session, org.id, test_patient_manager.id, "staff"
        )
        db_session.commit()

        resp = authenticated_patient_manager_client.post(
            f"/api/organisations/{org.id}/patients",
            json={"patient_id": PATIENT},
        )

        assert resp.status_code == 200
        place_id = db_session.scalar(
            select(org_unit_patient_member.c.org_unit_id).where(
                org_unit_patient_member.c.patient_id == PATIENT
            )
        )
        assert place_id == org.org_unit_id

    def test_removing_them_clears_the_row(
        self,
        authenticated_patient_manager_client,
        db_session,
        test_patient_manager,
    ):
        org = _org(db_session)
        add_organisation_member(
            db_session, org.id, test_patient_manager.id, "staff"
        )
        db_session.commit()
        authenticated_patient_manager_client.post(
            f"/api/organisations/{org.id}/patients",
            json={"patient_id": PATIENT},
        )

        resp = authenticated_patient_manager_client.delete(
            f"/api/organisations/{org.id}/patients/{PATIENT}"
        )

        assert resp.status_code == 200
        assert (
            db_session.execute(select(org_unit_patient_member)).first() is None
        )

    def test_the_organisation_page_lists_them(
        self, authenticated_superadmin_client, db_session
    ):
        org = _org(db_session)
        db_session.execute(
            insert(org_unit_patient_member).values(
                org_unit_id=org.org_unit_id, patient_id=PATIENT
            )
        )
        db_session.commit()

        resp = authenticated_superadmin_client.get(
            f"/api/organisations/{org.id}"
        )

        assert resp.status_code == 200
        assert [p["patient_id"] for p in resp.json()["patient_members"]] == [
            PATIENT
        ]


class TestDeletingAnOrganisation:
    def test_everything_at_its_place_goes_with_it(self, db_session):
        org = _org(db_session)
        db_session.add(
            OrgUnitFeature(org_unit_id=org.org_unit_id, feature_key="teaching")
        )
        db_session.execute(
            insert(org_unit_patient_member).values(
                org_unit_id=org.org_unit_id, patient_id=PATIENT
            )
        )
        db_session.commit()

        db_session.delete(org)
        db_session.commit()

        assert db_session.execute(select(OrgUnitFeature)).first() is None
        assert (
            db_session.execute(select(org_unit_patient_member)).first() is None
        )
