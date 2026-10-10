"""Tests for POST /api/prescriptions/controlled (CBAC-gated example route)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import User
from tests.competencies import hold


def _csrf(client: TestClient) -> dict[str, str]:
    """The header a page sends with a request that changes something."""
    return {"X-CSRF-Token": client.cookies.get("XSRF-TOKEN", "")}


PRESCRIPTION_BODY = {
    "patient_id": "patient-123",
    "medication": "Diazepam",
    "dose": "5mg",
    "duration_days": 7,
}


class TestPrescribeControlled:
    def test_requires_auth(self, test_client: TestClient):
        resp = test_client.post(
            "/api/prescriptions/controlled", json=PRESCRIPTION_BODY
        )
        assert resp.status_code == 401

    def test_rejected_without_competency(
        self, authenticated_client: TestClient
    ):
        resp = authenticated_client.post(
            "/api/prescriptions/controlled",
            json=PRESCRIPTION_BODY,
            headers=_csrf(authenticated_client),
        )
        assert resp.status_code == 403

    def test_without_the_csrf_token_is_refused(
        self,
        authenticated_client: TestClient,
        test_user: User,
        db_session: Session,
    ):
        """Holding the competency is not enough without the token."""
        hold(test_user, "prescribe_controlled_schedule_2")
        db_session.commit()

        resp = authenticated_client.post(
            "/api/prescriptions/controlled", json=PRESCRIPTION_BODY
        )

        assert resp.status_code == 403
        assert resp.json()["detail"] == "CSRF failed"

    def test_success_with_competency(
        self,
        authenticated_client: TestClient,
        test_user: User,
        db_session: Session,
    ):
        hold(test_user, "prescribe_controlled_schedule_2")
        db_session.commit()

        resp = authenticated_client.post(
            "/api/prescriptions/controlled",
            json=PRESCRIPTION_BODY,
            headers=_csrf(authenticated_client),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["status"] == "success"
        assert data["prescriber"] == test_user.username
        assert data["patient_id"] == "patient-123"
        assert data["medication"] == "Diazepam"
        assert data["dose"] == "5mg"
        assert data["duration_days"] == 7
        assert "prescription_id" in data
