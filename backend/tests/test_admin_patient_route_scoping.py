"""An admin may act on a patient only where they share an organisation.

Three routes took a patient id, checked that the caller was an admin, and
acted. Being an admin is global in the column and scoped in practice, so an
admin at one trust could deactivate another trust's patient, or revoke an
external clinician's access to them, by naming the id.

**`check_user_patient_access` is not the check these needed**, though it
looks like it. Its first line returns ``True`` for any admin — "always True
for admin pages" — so calling it from an admin-gated route reads as a place
check while permitting exactly what it appears to forbid.
``_require_shared_org_with_patient`` asks the question that matters instead.

Each test here fails without that helper.

**404, not 403.** Matching the other place checks. It matters more here than
most: a patient id is a clinical identifier, so confirming one exists is
itself a disclosure.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.models import (
    ExternalPatientAccess,
    Organisation,
    User,
    organisation_member,
    organisation_patient_member,
)
from app.security import hash_password

OUTSIDE_PATIENT = "fhir-patient-other-trust"
OWN_PATIENT = "fhir-patient-own-trust"

FHIR_TARGET = "app.main.read_fhir_patient"


def _fhir(patient_id: str) -> dict[str, object]:
    """A minimal FHIR patient, enough for the routes under test."""
    return {"resourceType": "Patient", "id": patient_id, "active": True}


@pytest.fixture
def admin_org(db_session: Session, test_admin: User) -> Organisation:
    """The admin's own organisation, with a patient in it."""
    org = Organisation(name="Own Trust", type="hospital")
    db_session.add(org)
    db_session.commit()
    db_session.execute(
        insert(organisation_member).values(
            organisation_id=org.id,
            user_id=test_admin.id,
            capacity="staff",
        )
    )
    db_session.execute(
        insert(organisation_patient_member).values(
            organisation_id=org.id, patient_id=OWN_PATIENT
        )
    )
    db_session.commit()
    db_session.refresh(org)
    return org


@pytest.fixture
def other_org(db_session: Session) -> Organisation:
    """An organisation the admin has nothing to do with."""
    org = Organisation(name="Other Trust", type="hospital")
    db_session.add(org)
    db_session.commit()
    db_session.execute(
        insert(organisation_patient_member).values(
            organisation_id=org.id, patient_id=OUTSIDE_PATIENT
        )
    )
    db_session.commit()
    db_session.refresh(org)
    return org


def _csrf(client: TestClient) -> str:
    return client.cookies.get("XSRF-TOKEN", "")


class TestAnAdminCannotReachAnotherOrganisationsPatient:
    """The hole, one test per route."""

    @patch(FHIR_TARGET, return_value=_fhir(OUTSIDE_PATIENT))
    def test_cannot_deactivate_them(
        self,
        _mock_fhir,
        authenticated_admin_client: TestClient,
        admin_org: Organisation,
        other_org: Organisation,
    ):
        resp = authenticated_admin_client.post(
            f"/api/patients/{OUTSIDE_PATIENT}/deactivate",
            headers={"X-CSRF-Token": _csrf(authenticated_admin_client)},
        )
        assert resp.status_code == 404

    @patch(FHIR_TARGET, return_value=_fhir(OUTSIDE_PATIENT))
    def test_cannot_activate_them(
        self,
        _mock_fhir,
        authenticated_admin_client: TestClient,
        admin_org: Organisation,
        other_org: Organisation,
    ):
        resp = authenticated_admin_client.post(
            f"/api/patients/{OUTSIDE_PATIENT}/activate",
            headers={"X-CSRF-Token": _csrf(authenticated_admin_client)},
        )
        assert resp.status_code == 404

    def test_cannot_revoke_external_access_to_them(
        self,
        authenticated_admin_client: TestClient,
        admin_org: Organisation,
        other_org: Organisation,
        db_session: Session,
    ):
        """Revoking another trust's grant is a change to their care.

        The external clinician here is a real one with a live grant, so
        the refusal is about the admin's reach and not about the grant
        being absent.
        """
        external = User(
            username="external-clinician",
            email="external@example.test",
            password_hash=hash_password("ExternalPass123!"),
            is_active=True,
            email_verified=True,
            base_profession="consultant",
            system_permissions="single-user",
        )
        db_session.add(external)
        db_session.flush()
        db_session.add(
            ExternalPatientAccess(
                user_id=external.id,
                patient_id=OUTSIDE_PATIENT,
                granted_by_user_id=external.id,
            )
        )
        db_session.commit()

        resp = authenticated_admin_client.delete(
            f"/api/patients/{OUTSIDE_PATIENT}/external-access/{external.id}",
            headers={"X-CSRF-Token": _csrf(authenticated_admin_client)},
        )
        assert resp.status_code == 404

        # And the grant is untouched.
        grant = db_session.scalar(
            select(ExternalPatientAccess).where(
                ExternalPatientAccess.user_id == external.id
            )
        )
        assert grant is not None
        assert grant.revoked_at is None


class TestTheGateIsACompetencyNotARank:
    """`manage_users`, not `system_permissions in ("admin", ...)`.

    A rank said what someone is on the platform; the competency says what
    they may do. The place check beside it still says where — without
    one, this competency is global and so strictly weaker than the rank
    it replaced.
    """

    @patch(FHIR_TARGET, return_value=_fhir(OWN_PATIENT))
    def test_the_rank_alone_is_not_enough(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        admin_org: Organisation,
        test_user: User,
        db_session: Session,
    ):
        """A user at the right organisation, without the competency.

        Promoted to `admin` by rank and placed in the organisation
        holding the patient, so only the competency is missing. Under the
        old string comparison this would have succeeded.
        """
        test_user.system_permissions = "admin"
        test_user.base_profession = "consultant"
        db_session.execute(
            insert(organisation_member).values(
                organisation_id=admin_org.id,
                user_id=test_user.id,
                capacity="staff",
            )
        )
        db_session.commit()

        resp = authenticated_client.post(
            f"/api/patients/{OWN_PATIENT}/deactivate",
            headers={"X-CSRF-Token": _csrf(authenticated_client)},
        )

        assert resp.status_code == 403

    @patch(FHIR_TARGET, return_value=_fhir(OWN_PATIENT))
    def test_the_competency_alone_is_not_enough(
        self,
        _mock_fhir,
        authenticated_client: TestClient,
        admin_org: Organisation,
        other_org: Organisation,
        test_user: User,
        db_session: Session,
    ):
        """Holding it somewhere is not holding it everywhere.

        The competency is global on the user; the place check is what
        keeps it from reaching another organisation's patient. Delete
        that check and this test fails while the one above still passes.
        """
        test_user.base_profession = "system_administrator"
        db_session.execute(
            insert(organisation_member).values(
                organisation_id=admin_org.id,
                user_id=test_user.id,
                capacity="staff",
            )
        )
        db_session.commit()

        resp = authenticated_client.post(
            f"/api/patients/{OUTSIDE_PATIENT}/deactivate",
            headers={"X-CSRF-Token": _csrf(authenticated_client)},
        )

        assert resp.status_code == 404


class TestTheCheckDoesNotBreakLegitimateAdministration:
    """A check that refused everything would pass the tests above."""

    @patch(FHIR_TARGET, return_value=_fhir(OWN_PATIENT))
    def test_can_deactivate_a_patient_at_their_own_organisation(
        self,
        _mock_fhir,
        authenticated_admin_client: TestClient,
        admin_org: Organisation,
    ):
        resp = authenticated_admin_client.post(
            f"/api/patients/{OWN_PATIENT}/deactivate",
            headers={"X-CSRF-Token": _csrf(authenticated_admin_client)},
        )
        assert resp.status_code == 200

    @patch(FHIR_TARGET, return_value=_fhir(OWN_PATIENT))
    def test_can_activate_a_patient_at_their_own_organisation(
        self,
        _mock_fhir,
        authenticated_admin_client: TestClient,
        admin_org: Organisation,
    ):
        resp = authenticated_admin_client.post(
            f"/api/patients/{OWN_PATIENT}/activate",
            headers={"X-CSRF-Token": _csrf(authenticated_admin_client)},
        )
        assert resp.status_code == 200


class TestSuperadminsAreGlobal:
    """Reach from the rank, not from where they happen to be."""

    @patch(FHIR_TARGET, return_value=_fhir(OUTSIDE_PATIENT))
    def test_a_superadmin_reaches_any_organisations_patient(
        self,
        _mock_fhir,
        authenticated_superadmin_client: TestClient,
        other_org: Organisation,
    ):
        resp = authenticated_superadmin_client.post(
            f"/api/patients/{OUTSIDE_PATIENT}/deactivate",
            headers={"X-CSRF-Token": _csrf(authenticated_superadmin_client)},
        )
        assert resp.status_code == 200


class TestAPatientInNoOrganisationFailsClosed:
    """A patient outside the membership table is refused, not shared."""

    @patch(FHIR_TARGET, return_value=_fhir("fhir-patient-orphan"))
    def test_an_unplaced_patient_is_not_reachable_by_an_admin(
        self,
        _mock_fhir,
        authenticated_admin_client: TestClient,
        admin_org: Organisation,
    ):
        resp = authenticated_admin_client.post(
            "/api/patients/fhir-patient-orphan/deactivate",
            headers={"X-CSRF-Token": _csrf(authenticated_admin_client)},
        )
        assert resp.status_code == 404
