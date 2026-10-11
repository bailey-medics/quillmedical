"""What the patient list and the patient update answer, through the routes.

The rules for the list are in ``app.patients.listing`` and what an
update sends is in ``app.patients.update``; both are tested there. This
drives the two routes, to pin what a caller is sent and what FHIR is
sent. No test pinned these before the rules moved.

FHIR is faked where the routes look it up, in ``app.main``. Every
identifier and name here is made up.
"""

from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import (
    OrgUnit,
    PatientMetadata,
    User,
    org_unit_patient_member,
)
from app.organisations import add_org_unit_member

OWN_PATIENT = "made-up-own"
OTHER_PATIENT = "made-up-other"

LIST = "app.main.list_fhir_patients"
READ = "app.main.read_fhir_patient"
UPDATE = "app.main.update_fhir_patient"

LEAK = "connection refused: made-up-secret at made-up-host:5432"


def _record(patient_id: str) -> dict[str, Any]:
    """A minimal patient resource, as FHIR would give it."""
    return {"resourceType": "Patient", "id": patient_id}


EVERY_RECORD = [_record(OWN_PATIENT), _record(OTHER_PATIENT)]


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


def _shown(client: TestClient, query: str = "") -> list[tuple[str, bool]]:
    """Each patient the list gives, with whether it is active."""
    with patch(LIST, return_value=EVERY_RECORD):
        resp = client.get(f"/api/patients{query}")

    assert resp.status_code == 200
    body = resp.json()
    assert body["fhir_ready"] is True

    return [(row["id"], row["is_active"]) for row in body["patients"]]


class TestTheList:
    def test_a_member_of_a_trust_is_listed_its_patients_alone(
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

        shown = _shown(authenticated_clinician_client)

        assert shown == [(OWN_PATIENT, True)]

    def test_asking_for_the_admin_scope_does_not_widen_a_members_list(
        self,
        authenticated_clinician_client: TestClient,
        test_clinician: User,
        db_session: Session,
        own_trust: OrgUnit,
        other_trust: OrgUnit,
    ) -> None:
        """Answered as though nothing had been asked, and not refused."""
        add_org_unit_member(
            db_session, own_trust.id, test_clinician.id, "staff"
        )
        db_session.commit()

        shown = _shown(authenticated_clinician_client, "?scope=admin")

        assert shown == [(OWN_PATIENT, True)]

    def test_an_operator_in_the_admin_scope_is_listed_every_patient(
        self,
        authenticated_superadmin_client: TestClient,
        own_trust: OrgUnit,
        other_trust: OrgUnit,
    ) -> None:
        shown = _shown(authenticated_superadmin_client, "?scope=admin")

        assert shown == [(OWN_PATIENT, True), (OTHER_PATIENT, True)]

    def test_an_operator_who_does_not_ask_is_listed_nobody(
        self,
        authenticated_superadmin_client: TestClient,
        own_trust: OrgUnit,
    ) -> None:
        assert _shown(authenticated_superadmin_client) == []

    def test_a_deactivated_patient_is_listed_only_to_a_patient_manager_asking(
        self,
        authenticated_patient_manager_client: TestClient,
        test_patient_manager: User,
        db_session: Session,
        own_trust: OrgUnit,
    ) -> None:
        add_org_unit_member(
            db_session, own_trust.id, test_patient_manager.id, "staff"
        )
        db_session.add(
            PatientMetadata(patient_id=OWN_PATIENT, is_active=False)
        )
        db_session.commit()
        client = authenticated_patient_manager_client

        assert _shown(client) == []
        assert _shown(client, "?include_inactive=true") == [
            (OWN_PATIENT, False)
        ]

    def test_asking_for_the_deactivated_without_the_competency_is_not_refused(
        self,
        authenticated_clinician_client: TestClient,
        test_clinician: User,
        db_session: Session,
        own_trust: OrgUnit,
    ) -> None:
        add_org_unit_member(
            db_session, own_trust.id, test_clinician.id, "staff"
        )
        db_session.add(
            PatientMetadata(patient_id=OWN_PATIENT, is_active=False)
        )
        db_session.commit()

        shown = _shown(
            authenticated_clinician_client, "?include_inactive=true"
        )

        assert shown == []

    def test_anything_going_wrong_but_fhir_itself_is_an_empty_list_not_ready(
        self, authenticated_clinician_client: TestClient
    ) -> None:
        with patch(LIST, side_effect=RuntimeError(LEAK)):
            resp = authenticated_clinician_client.get("/api/patients")

        assert resp.status_code == 200
        assert resp.json() == {"patients": [], "fhir_ready": False}

    def test_a_record_that_cannot_be_listed_empties_the_whole_list(
        self, authenticated_superadmin_client: TestClient
    ) -> None:
        records = [_record(OWN_PATIENT), {"resourceType": 7, "id": "made-up"}]

        with patch(LIST, return_value=records):
            resp = authenticated_superadmin_client.get(
                "/api/patients?scope=admin"
            )

        assert resp.status_code == 200
        assert resp.json() == {"patients": [], "fhir_ready": False}

    def test_nobody_signed_in_is_refused(
        self, test_client: TestClient
    ) -> None:
        with patch(LIST, return_value=EVERY_RECORD) as fhir:
            resp = test_client.get("/api/patients")

        assert resp.status_code == 401
        fhir.assert_not_called()


CHANGES = {
    "given_name": "Given",
    "family_name": "Family",
    "birth_date": "1900-01-01",
    "gender": "unknown",
}


def _csrf(client: TestClient) -> dict[str, str]:
    client.get("/api/auth/me")
    token = client.cookies.get("XSRF-TOKEN")
    assert token is not None

    return {"X-CSRF-Token": token}


class TestTheUpdate:
    @pytest.fixture(autouse=True)
    def _the_clinician_is_at_the_patients_trust(
        self, test_clinician: User, db_session: Session, own_trust: OrgUnit
    ) -> None:
        """An update is refused to somebody who cannot reach the patient.

        That rule is pinned in ``patient_update_route_scoping_test.py``.
        The tests here are about what FHIR is sent and what is answered,
        so the clinician is placed where the patient is cared for.
        """
        add_org_unit_member(
            db_session, own_trust.id, test_clinician.id, "staff"
        )
        db_session.commit()

    def test_fhir_is_sent_the_four_demographics_under_its_clients_names(
        self, authenticated_clinician_client: TestClient
    ) -> None:
        client = authenticated_clinician_client
        updated = {**_record(OWN_PATIENT), "gender": "unknown"}

        with (
            patch(READ, return_value=_record(OWN_PATIENT)) as read,
            patch(UPDATE, return_value=updated) as update,
        ):
            resp = client.patch(
                f"/api/patients/{OWN_PATIENT}",
                json={**CHANGES, "nhs_number": "made-up", "mrn": "made-up"},
                headers=_csrf(client),
            )

        assert resp.status_code == 200
        assert resp.json()["id"] == OWN_PATIENT
        assert resp.json()["gender"] == "unknown"
        read.assert_called_once_with(OWN_PATIENT)
        update.assert_called_once_with(
            OWN_PATIENT,
            {
                "given_name": "Given",
                "family_name": "Family",
                "date_of_birth": "1900-01-01",
                "sex": "unknown",
            },
        )

    def test_what_was_not_given_is_not_sent(
        self, authenticated_clinician_client: TestClient
    ) -> None:
        client = authenticated_clinician_client

        with (
            patch(READ, return_value=_record(OWN_PATIENT)),
            patch(UPDATE, return_value=_record(OWN_PATIENT)) as update,
        ):
            resp = client.patch(
                f"/api/patients/{OWN_PATIENT}",
                json={"given_name": "Given", "family_name": "Family"},
                headers=_csrf(client),
            )

        assert resp.status_code == 200
        update.assert_called_once_with(
            OWN_PATIENT, {"given_name": "Given", "family_name": "Family"}
        )

    def test_a_patient_fhir_does_not_have_is_not_found_and_nothing_is_sent(
        self, authenticated_clinician_client: TestClient
    ) -> None:
        client = authenticated_clinician_client

        with (
            patch(READ, return_value=None),
            patch(UPDATE, return_value=_record(OWN_PATIENT)) as update,
        ):
            resp = client.patch(
                f"/api/patients/{OWN_PATIENT}",
                json=CHANGES,
                headers=_csrf(client),
            )

        assert resp.status_code == 404
        assert resp.json() == {"detail": "Patient not found"}
        update.assert_not_called()

    def test_an_update_fhir_gives_nothing_back_for_has_failed(
        self, authenticated_clinician_client: TestClient
    ) -> None:
        client = authenticated_clinician_client

        with (
            patch(READ, return_value=_record(OWN_PATIENT)),
            patch(UPDATE, return_value=None),
        ):
            resp = client.patch(
                f"/api/patients/{OWN_PATIENT}",
                json=CHANGES,
                headers=_csrf(client),
            )

        assert resp.status_code == 500
        assert resp.json() == {"detail": "Failed to update patient"}

    @pytest.mark.parametrize("failing", [READ, UPDATE])
    def test_anything_else_going_wrong_is_answered_in_written_words(
        self, authenticated_clinician_client: TestClient, failing: str
    ) -> None:
        client = authenticated_clinician_client
        fakes: dict[str, MagicMock] = {
            READ: MagicMock(return_value=_record(OWN_PATIENT)),
            UPDATE: MagicMock(return_value=_record(OWN_PATIENT)),
        }
        fakes[failing].side_effect = RuntimeError(LEAK)

        with patch(READ, fakes[READ]), patch(UPDATE, fakes[UPDATE]):
            resp = client.patch(
                f"/api/patients/{OWN_PATIENT}",
                json=CHANGES,
                headers=_csrf(client),
            )

        assert resp.status_code == 500
        assert resp.json() == {
            "detail": {
                "message": "Could not update the patient",
                "error_code": "patient_update_failed",
            }
        }
        assert "made-up-secret" not in resp.text

    def test_nothing_to_change_is_answered_as_a_failure(
        self, authenticated_clinician_client: TestClient
    ) -> None:
        """Empty names pass the request model and leave nothing to send."""
        client = authenticated_clinician_client

        with patch(READ, return_value=_record(OWN_PATIENT)):
            resp = client.patch(
                f"/api/patients/{OWN_PATIENT}",
                json={"given_name": "", "family_name": ""},
                headers=_csrf(client),
            )

        assert resp.status_code == 500
        assert resp.json()["detail"]["error_code"] == "patient_update_failed"

    def test_a_field_the_request_does_not_know_is_refused_before_fhir(
        self, authenticated_clinician_client: TestClient
    ) -> None:
        client = authenticated_clinician_client

        with patch(READ, return_value=_record(OWN_PATIENT)) as read:
            resp = client.patch(
                f"/api/patients/{OWN_PATIENT}",
                json={**CHANGES, "address": "made-up"},
                headers=_csrf(client),
            )

        assert resp.status_code == 422
        read.assert_not_called()

    def test_without_a_csrf_token_nothing_is_asked_of_fhir(
        self, authenticated_clinician_client: TestClient
    ) -> None:
        with patch(READ, return_value=_record(OWN_PATIENT)) as read:
            resp = authenticated_clinician_client.patch(
                f"/api/patients/{OWN_PATIENT}", json=CHANGES
            )

        assert resp.status_code == 403
        read.assert_not_called()
