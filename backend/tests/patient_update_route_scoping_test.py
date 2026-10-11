"""A patient's demographics are changed only by somebody who can reach them.

``PATCH /api/patients/{patient_id}`` asked nothing about who was calling
beyond that they were signed in, so any signed-in user could change any
patient's name, date of birth and gender by naming the patient's id.

It now asks what the routes that deactivate and reactivate a patient
ask: an org unit shared with the patient, through
``_require_shared_org_with_patient``, with an operator let through. The
refusal is the same 404 in the same words as a patient that does not
exist, so it does not confirm that one does, and it is given before FHIR
is asked anything.

No competency is asked for yet: see the plan step in
``docs/docs/plans/2026-10-11-thin-routes-and-steady-frontend-tests-plan.md``.

FHIR is faked where the route looks it up, in ``app.main``. Every
identifier and name here is made up.
"""

from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import OrgUnit, User, org_unit_patient_member
from app.organisations import add_org_unit_member

OWN_PATIENT = "made-up-own"
OTHER_PATIENT = "made-up-other"
NOWHERE_PATIENT = "made-up-nowhere"

READ = "app.main.read_fhir_patient"
UPDATE = "app.main.update_fhir_patient"

CHANGES = {
    "given_name": "Given",
    "family_name": "Family",
    "birth_date": "1900-01-01",
    "gender": "unknown",
}

NOT_FOUND = {"detail": "Patient not found"}


def _record(patient_id: str) -> dict[str, Any]:
    """A minimal patient resource, as FHIR would give it."""
    return {"resourceType": "Patient", "id": patient_id}


def _trust_with(db: Session, name: str, patient_id: str) -> OrgUnit:
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
    db.flush()
    db.execute(
        org_unit_patient_member.insert().values(
            org_unit_id=org.id, patient_id=patient_id
        )
    )
    db.commit()
    db.refresh(org)

    return org


@pytest.fixture
def own_trust(db_session: Session) -> OrgUnit:
    return _trust_with(db_session, "Own Trust", OWN_PATIENT)


@pytest.fixture
def other_trust(db_session: Session) -> OrgUnit:
    return _trust_with(db_session, "Other Trust", OTHER_PATIENT)


def _csrf(client: TestClient) -> dict[str, str]:
    client.get("/api/auth/me")
    token = client.cookies.get("XSRF-TOKEN")
    assert token is not None

    return {"X-CSRF-Token": token}


class TestSomebodyWhoCannotReachThePatientIsRefused:
    def test_a_member_of_another_trust_is_told_not_found_and_fhir_is_not_asked(
        self,
        authenticated_clinician_client: TestClient,
        test_clinician: User,
        db_session: Session,
        own_trust: OrgUnit,
        other_trust: OrgUnit,
    ) -> None:
        add_org_unit_member(
            db_session, own_trust.id, test_clinician.id, "staff"
        )
        db_session.commit()
        client = authenticated_clinician_client

        with (
            patch(READ, return_value=_record(OTHER_PATIENT)) as read,
            patch(UPDATE, return_value=_record(OTHER_PATIENT)) as update,
        ):
            resp = client.patch(
                f"/api/patients/{OTHER_PATIENT}",
                json=CHANGES,
                headers=_csrf(client),
            )

        assert resp.status_code == 404
        assert resp.json() == NOT_FOUND
        read.assert_not_called()
        update.assert_not_called()

    def test_somebody_at_no_org_unit_is_told_not_found_and_fhir_is_not_asked(
        self,
        authenticated_client: TestClient,
        own_trust: OrgUnit,
    ) -> None:
        client = authenticated_client

        with (
            patch(READ, return_value=_record(OWN_PATIENT)) as read,
            patch(UPDATE, return_value=_record(OWN_PATIENT)) as update,
        ):
            resp = client.patch(
                f"/api/patients/{OWN_PATIENT}",
                json=CHANGES,
                headers=_csrf(client),
            )

        assert resp.status_code == 404
        assert resp.json() == NOT_FOUND
        read.assert_not_called()
        update.assert_not_called()

    def test_an_administrator_of_another_trust_is_refused_like_anyone_else(
        self,
        authenticated_admin_client: TestClient,
        test_admin: User,
        db_session: Session,
        own_trust: OrgUnit,
        other_trust: OrgUnit,
    ) -> None:
        """Holding ``manage_users`` somewhere is not reach everywhere."""
        add_org_unit_member(db_session, own_trust.id, test_admin.id, "staff")
        db_session.commit()

        with (
            patch(READ, return_value=_record(OTHER_PATIENT)) as read,
            patch(UPDATE, return_value=_record(OTHER_PATIENT)) as update,
        ):
            resp = authenticated_admin_client.patch(
                f"/api/patients/{OTHER_PATIENT}", json=CHANGES
            )

        assert resp.status_code == 404
        assert resp.json() == NOT_FOUND
        read.assert_not_called()
        update.assert_not_called()

    def test_a_patient_cared_for_nowhere_is_refused_and_not_shared(
        self,
        authenticated_clinician_client: TestClient,
        test_clinician: User,
        db_session: Session,
        own_trust: OrgUnit,
    ) -> None:
        """A patient at no org unit is in nobody's reach but an operator's."""
        add_org_unit_member(
            db_session, own_trust.id, test_clinician.id, "staff"
        )
        db_session.commit()
        client = authenticated_clinician_client

        with (
            patch(READ, return_value=_record(NOWHERE_PATIENT)) as read,
            patch(UPDATE, return_value=_record(NOWHERE_PATIENT)) as update,
        ):
            resp = client.patch(
                f"/api/patients/{NOWHERE_PATIENT}",
                json=CHANGES,
                headers=_csrf(client),
            )

        assert resp.status_code == 404
        assert resp.json() == NOT_FOUND
        read.assert_not_called()
        update.assert_not_called()

    def test_the_refusal_is_the_one_deactivating_the_patient_gives(
        self,
        authenticated_admin_client: TestClient,
        test_admin: User,
        db_session: Session,
        own_trust: OrgUnit,
        other_trust: OrgUnit,
    ) -> None:
        """The same status and the same body as the route it is modelled on."""
        add_org_unit_member(db_session, own_trust.id, test_admin.id, "staff")
        db_session.commit()
        client = authenticated_admin_client

        with (
            patch(READ, return_value=_record(OTHER_PATIENT)),
            patch(UPDATE, return_value=_record(OTHER_PATIENT)),
        ):
            updating = client.patch(
                f"/api/patients/{OTHER_PATIENT}", json=CHANGES
            )
            deactivating = client.post(
                f"/api/patients/{OTHER_PATIENT}/deactivate"
            )

        assert updating.status_code == deactivating.status_code == 404
        assert updating.content == deactivating.content


class TestSomebodyWhoCanReachThePatientMayUpdate:
    def test_a_member_of_the_patients_trust_updates_them(
        self,
        authenticated_clinician_client: TestClient,
        test_clinician: User,
        db_session: Session,
        own_trust: OrgUnit,
    ) -> None:
        add_org_unit_member(
            db_session, own_trust.id, test_clinician.id, "staff"
        )
        db_session.commit()
        client = authenticated_clinician_client
        updated = {**_record(OWN_PATIENT), "gender": "unknown"}

        with (
            patch(READ, return_value=_record(OWN_PATIENT)) as read,
            patch(UPDATE, return_value=updated) as update,
        ):
            resp = client.patch(
                f"/api/patients/{OWN_PATIENT}",
                json=CHANGES,
                headers=_csrf(client),
            )

        assert resp.status_code == 200
        assert resp.json()["id"] == OWN_PATIENT
        read.assert_called_once_with(OWN_PATIENT)
        update.assert_called_once()

    def test_an_operator_updates_a_patient_of_any_trust(
        self,
        authenticated_superadmin_client: TestClient,
        other_trust: OrgUnit,
    ) -> None:
        """As for deactivating: an operator is let through the check."""
        with (
            patch(READ, return_value=_record(OTHER_PATIENT)) as read,
            patch(UPDATE, return_value=_record(OTHER_PATIENT)) as update,
        ):
            resp = authenticated_superadmin_client.patch(
                f"/api/patients/{OTHER_PATIENT}", json=CHANGES
            )

        assert resp.status_code == 200
        read.assert_called_once_with(OTHER_PATIENT)
        update.assert_called_once()


class TestAPatientThatDoesNotExist:
    def test_an_operator_is_told_not_found_by_fhir_and_nothing_is_sent(
        self, authenticated_superadmin_client: TestClient
    ) -> None:
        with (
            patch(READ, return_value=None) as read,
            patch(UPDATE, return_value=_record(NOWHERE_PATIENT)) as update,
        ):
            resp = authenticated_superadmin_client.patch(
                f"/api/patients/{NOWHERE_PATIENT}", json=CHANGES
            )

        assert resp.status_code == 404
        assert resp.json() == NOT_FOUND
        read.assert_called_once_with(NOWHERE_PATIENT)
        update.assert_not_called()

    def test_anybody_else_is_told_not_found_in_the_same_words(
        self, authenticated_clinician_client: TestClient
    ) -> None:
        """Nobody can tell a patient out of reach from one that is not there."""
        client = authenticated_clinician_client

        with (
            patch(READ, return_value=None) as read,
            patch(UPDATE, return_value=_record(NOWHERE_PATIENT)) as update,
        ):
            resp = client.patch(
                f"/api/patients/{NOWHERE_PATIENT}",
                json=CHANGES,
                headers=_csrf(client),
            )

        assert resp.status_code == 404
        assert resp.json() == NOT_FOUND
        read.assert_not_called()
        update.assert_not_called()
