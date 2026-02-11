"""Tests for main.py endpoints and dependencies."""

from unittest.mock import patch

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

    def test_require_roles_success(self, authenticated_clinician_client: TestClient):
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
        response = authenticated_client.post("/api/auth/totp/disable")
        assert response.status_code == 403

    def test_csrf_missing_cookie(self, authenticated_client: TestClient):
        """Test CSRF when cookie is missing."""
        # Clear the CSRF cookie
        authenticated_client.cookies.delete("XSRF-TOKEN")
        response = authenticated_client.post(
            "/api/auth/totp/disable", headers={"X-CSRF-Token": "some_token"}
        )
        assert response.status_code == 403

    def test_csrf_mismatch(self, authenticated_client: TestClient):
        """Test CSRF when header and cookie don't match."""
        authenticated_client.cookies.set("XSRF-TOKEN", "token1")
        response = authenticated_client.post(
            "/api/auth/totp/disable", headers={"X-CSRF-Token": "token2"}
        )
        assert response.status_code == 403


class TestPatientEndpoints:
    """Test patient-related endpoints with mocked FHIR client."""

    @patch("app.main.list_fhir_patients")
    def test_list_patients(self, mock_list, authenticated_clinician_client: TestClient):
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

        response = authenticated_clinician_client.get("/api/patients/123/demographics")
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
            json={"name": "Updated Name"},
            headers={"X-CSRF-Token": csrf_token},
        )
        assert response.status_code == 200


class TestLetterEndpoints:
    """Test letter-related endpoints with mocked EHRbase client."""

    @patch("app.main.list_letters_for_patient")
    def test_list_letters(self, mock_list, authenticated_clinician_client: TestClient):
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
    def test_get_letter(self, mock_get, authenticated_clinician_client: TestClient):
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
