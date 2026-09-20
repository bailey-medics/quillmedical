"""Tests for main.py endpoints and dependencies."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.models import User


class TestCurrentUserDependency:
    """Test current_user dependency injection."""

    def test_current_user_no_token(self, test_client: TestClient):
        """Test current_user when no token is present."""
        # Access endpoint that requires authentication
        response = test_client.get("/api/auth/me")
        assert response.status_code == 401
        assert "not authenticated" in response.json()["detail"].lower()

    def test_current_user_invalid_token(self, test_client: TestClient):
        """Test current_user with invalid token."""
        test_client.cookies.set("access_token", "invalid_token")
        response = test_client.get("/api/auth/me")
        assert response.status_code == 401
        assert "invalid token" in response.json()["detail"].lower()


class TestRequireRolesDependency:
    """Test require_roles dependency."""

    def test_require_roles_forbidden(
        self, authenticated_client: TestClient, test_user: User
    ):
        """Test require_roles when user lacks required role."""
        # Try to access Clinician-only endpoint without Clinician role
        # GET CSRF token first
        authenticated_client.get("/api/auth/me")
        csrf_token = authenticated_client.cookies.get("XSRF-TOKEN")

        # Try to update patient demographics (requires Clinician role + CSRF)
        response = authenticated_client.put(
            "/api/patients/123/demographics",
            json={"name": "Test"},
            headers={"X-CSRF-Token": csrf_token},
        )
        assert response.status_code == 403
        assert "forbidden" in response.json()["detail"].lower()

    def test_require_roles_success(
        self, authenticated_clinician_client: TestClient
    ):
        """Test require_roles when user has required role."""
        with patch("app.fhir_client.list_fhir_patients") as mock_list:
            mock_list.return_value = []
            response = authenticated_clinician_client.get("/api/patients")
            # Should succeed (not 403)
            assert response.status_code == 200


class TestRequireCSRFDependency:
    """Test require_csrf dependency."""

    def test_csrf_missing_header(self, authenticated_client: TestClient):
        """Test CSRF when header is missing."""
        response = authenticated_client.post(
            "/api/auth/totp/disable",
            json={"password": "TestPassword123!"},
        )
        assert response.status_code == 403

    def test_csrf_missing_cookie(self, authenticated_client: TestClient):
        """Test CSRF when cookie is missing."""
        # Clear the CSRF cookie
        authenticated_client.cookies.delete("XSRF-TOKEN")
        response = authenticated_client.post(
            "/api/auth/totp/disable",
            json={"password": "TestPassword123!"},
            headers={"X-CSRF-Token": "some_token"},
        )
        assert response.status_code == 403

    def test_csrf_mismatch(self, authenticated_client: TestClient):
        """Test CSRF when header and cookie don't match."""
        authenticated_client.cookies.set("XSRF-TOKEN", "token1")
        response = authenticated_client.post(
            "/api/auth/totp/disable",
            json={"password": "TestPassword123!"},
            headers={"X-CSRF-Token": "token2"},
        )
        assert response.status_code == 403


class TestFhirClientErrorHandler:
    """Test global FhirClientError exception handler."""

    def test_fhir_client_error_returns_502(
        self, authenticated_clinician_client: TestClient
    ):
        """FhirClientError returns 502 with clean message."""
        from app.fhir_client import FhirClientError

        with patch(
            "app.main.list_fhir_patients",
            side_effect=FhirClientError("Failed to retrieve patient list"),
        ):
            response = authenticated_clinician_client.get("/api/patients")

        assert response.status_code == 502
        assert response.json()["detail"] == "Failed to retrieve patient list"


class TestRequestBodySizeLimit:
    """Test request body size limiting middleware."""

    def test_oversized_request_rejected(self, test_client: TestClient):
        """Requests with Content-Length > 10MB are rejected with 413."""
        response = test_client.post(
            "/api/auth/login",
            content=b"x",
            headers={"Content-Length": str(11 * 1024 * 1024)},
        )
        assert response.status_code == 413

    def test_normal_request_allowed(self, test_client: TestClient):
        """Requests within the size limit are processed normally."""
        response = test_client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "pass"},
        )
        # Should get past the size check (will fail auth, not 413)
        assert response.status_code != 413

    def test_media_upload_exceeds_the_general_limit(
        self, test_client: TestClient
    ):
        """A lecture is far past 10 MB and must still be admitted.

        The body never reaches this application in a real deployment —
        the browser uploads straight to GCS — so this route exists for
        local development, where the general limit would block the one
        endpoint built to carry a whole video.
        """
        response = test_client.put(
            "/api/teaching/admin/modules/a-module/media/abc123/content",
            content=b"x",
            headers={
                "Content-Length": str(50 * 1024 * 1024),
                "Content-Type": "video/mp4",
            },
        )
        # Past the size check. What it fails on afterwards — auth, a
        # missing module — is not this middleware's business.
        assert response.status_code != 413

    def test_media_upload_still_has_a_ceiling(self, test_client: TestClient):
        """The exemption raises the limit rather than removing it."""
        response = test_client.put(
            "/api/teaching/admin/modules/a-module/media/abc123/content",
            content=b"x",
            headers={
                "Content-Length": str(3 * 1024 * 1024 * 1024),
                "Content-Type": "video/mp4",
            },
        )
        assert response.status_code == 413

    def test_the_exemption_is_not_a_general_media_hole(
        self, test_client: TestClient
    ):
        """Only the upload route is exempt, not everything under media.

        The match is on the trailing path segment as well as the
        method, so a POST to a media endpoint keeps the 10 MB limit.
        """
        response = test_client.post(
            "/api/teaching/admin/modules/a-module/media/upload-url",
            content=b"x",
            headers={"Content-Length": str(11 * 1024 * 1024)},
        )
        assert response.status_code == 413


class TestPatientEndpoints:
    """Test patient-related endpoints with mocked FHIR client."""

    @patch("app.main.list_fhir_patients")
    def test_list_patients(
        self, mock_list, authenticated_clinician_client: TestClient
    ):
        """Test listing all patients."""
        mock_list.return_value = [
            {"resourceType": "Patient", "id": "1"},
            {"resourceType": "Patient", "id": "2"},
        ]

        response = authenticated_clinician_client.get("/api/patients")
        assert response.status_code == 200
        assert "patients" in response.json()

    @patch("app.main.read_fhir_patient")
    def test_get_patient_demographics(
        self, mock_read, authenticated_clinician_client: TestClient
    ):
        """Test getting patient demographics."""
        mock_read.return_value = {"resourceType": "Patient", "id": "123"}

        response = authenticated_clinician_client.get(
            "/api/patients/123/demographics"
        )
        assert response.status_code == 200
        assert "patient_id" in response.json()

    @patch("app.main.update_fhir_patient")
    def test_update_patient_demographics(
        self, mock_update, authenticated_clinician_client: TestClient
    ):
        """Test updating patient demographics."""
        mock_update.return_value = {"resourceType": "Patient", "id": "123"}

        # Get CSRF token
        authenticated_clinician_client.get("/api/auth/me")
        csrf_token = authenticated_clinician_client.cookies.get("XSRF-TOKEN")

        response = authenticated_clinician_client.put(
            "/api/patients/123/demographics",
            json={"given_name": "Updated", "family_name": "Name"},
            headers={"X-CSRF-Token": csrf_token},
        )
        assert response.status_code == 200

    @patch("app.main.update_fhir_patient")
    def test_update_patient_demographics_rejects_unknown_field(
        self, mock_update, authenticated_clinician_client: TestClient
    ):
        """Unknown fields in the demographics body are rejected (422)."""
        mock_update.return_value = {"resourceType": "Patient", "id": "123"}

        authenticated_clinician_client.get("/api/auth/me")
        csrf_token = authenticated_clinician_client.cookies.get("XSRF-TOKEN")

        response = authenticated_clinician_client.put(
            "/api/patients/123/demographics",
            json={"name": "Updated Name"},
            headers={"X-CSRF-Token": csrf_token},
        )
        assert response.status_code == 422


class TestLetterEndpoints:
    """Test letter-related endpoints with mocked EHRbase client."""

    @patch("app.main.list_letters_for_patient")
    def test_list_letters(
        self, mock_list, authenticated_clinician_client: TestClient
    ):
        """Test listing letters for a patient."""
        mock_list.return_value = [
            {"uid": "letter1", "title": "Letter 1"},
            {"uid": "letter2", "title": "Letter 2"},
        ]

        response = authenticated_clinician_client.get(
            "/api/patients/patient123/letters"
        )
        assert response.status_code == 200
        data = response.json()
        assert "letters" in data

    @patch("app.main.list_letters_for_patient")
    def test_list_letters_error(
        self, mock_list, authenticated_clinician_client: TestClient
    ):
        """Test listing letters when error occurs."""
        mock_list.side_effect = Exception("EHRbase query error")

        response = authenticated_clinician_client.get(
            "/api/patients/patient123/letters"
        )
        assert response.status_code == 500

    @patch("app.main.get_letter_composition")
    def test_get_letter(
        self, mock_get, authenticated_clinician_client: TestClient
    ):
        """Test getting a specific letter."""
        mock_get.return_value = {
            "composition_uid": "uid123",
            "title": "Test Letter",
            "body": "Letter content",
        }

        response = authenticated_clinician_client.get(
            "/api/patients/patient123/letters/uid123"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["composition_uid"] == "uid123"

    @patch("app.main.get_letter_composition")
    def test_get_letter_not_found(
        self, mock_get, authenticated_clinician_client: TestClient
    ):
        """Test getting letter when not found."""
        mock_get.return_value = None

        response = authenticated_clinician_client.get(
            "/api/patients/patient123/letters/missing"
        )
        assert response.status_code == 404

    @patch("app.main.get_letter_composition")
    def test_get_letter_error(
        self, mock_get, authenticated_clinician_client: TestClient
    ):
        """Test getting letter when error occurs."""
        mock_get.side_effect = Exception("EHRbase retrieval error")

        response = authenticated_clinician_client.get(
            "/api/patients/patient123/letters/uid123"
        )
        assert response.status_code == 500


class TestFailuresDoNotLeakExceptionText:
    """A 500 must say what went wrong, not what the exception said.

    These endpoints wrap EHRbase, HAPI FHIR and the database, and used to
    return ``str(e)`` to the caller — text that can carry a name, an NHS
    number, a request URL with an identifier in it, or a fragment of a
    clinical document, and which pages render on screen via ``err.message``.

    The guard in ``test_no_raw_exceptions_in_details.py`` stops the shape
    coming back. This checks the behaviour: that a real failure produces the
    authored message and the code, and that the exception's own text is
    nowhere in the response.
    """

    LEAK = "connection refused: patient Jane Doe 943 476 5919 at db-host:5432"

    def test_demographics_failure_returns_an_authored_message(
        self,
        authenticated_client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        def explode(*args: object, **kwargs: object) -> None:
            raise RuntimeError(self.LEAK)

        monkeypatch.setattr("app.main.read_fhir_patient", explode)

        resp = authenticated_client.get("/api/patients/abc123/demographics")

        assert resp.status_code == 500
        detail = resp.json()["detail"]
        assert detail["message"] == "Could not load the demographics"
        assert detail["error_code"] == "demographics_fetch_failed"

    def test_no_part_of_the_exception_reaches_the_caller(
        self,
        authenticated_client: TestClient,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """The whole point: none of it, not just the shape of it."""

        def explode(*args: object, **kwargs: object) -> None:
            raise RuntimeError(self.LEAK)

        monkeypatch.setattr("app.main.read_fhir_patient", explode)

        resp = authenticated_client.get("/api/patients/abc123/demographics")

        body = resp.text
        for fragment in ("943 476 5919", "Jane Doe", "db-host", "connection"):
            assert fragment not in body
