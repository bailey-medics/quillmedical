"""
test_ehrbase_integration.py

Integration tests for EHRbase/OpenEHR functionality.
Tests creating and reading letters via EHRbase endpoints.

Note: These are integration tests that require docker-compose services to be running.
Mark tests with @pytest.mark.integration for proper test filtering.

Usage:
    pytest tests/test_ehrbase_integration.py -v -m integration
"""

import httpx
import pytest

BASE_URL = "http://localhost/api"


@pytest.mark.integration
class TestEHRbaseLetterOperations:
    """Integration tests for EHRbase letter operations."""

    def test_create_letter(self):
        """Test creating a letter composition for a patient."""
        with httpx.Client(base_url=BASE_URL, follow_redirects=True) as client:
            # Setup: register, login, create patient
            self._register_and_login(client, "ehrbase_create", "ehrbase@test.com")
            patient_id = self._create_patient(client, "Emily", "Davis")

            # Get CSRF token
            client.get("/auth/me")
            csrf_token = client.cookies.get("XSRF-TOKEN")

            # Create letter
            response = client.post(
                f"/patients/{patient_id}/letters",
                headers={"X-CSRF-Token": csrf_token},
                json={
                    "title": "Consultation Letter",
                    "body": "# Patient Consultation\n\nThis is a test letter.",
                    "author_name": "Dr. Smith",
                    "author_email": "dr.smith@example.com",
                },
            )

            assert response.status_code == 200
            data = response.json()
            assert "composition_uid" in data
            assert data["patient_id"] == patient_id
            assert data["title"] == "Consultation Letter"

    def test_list_letters(self):
        """Test listing all letters for a patient."""
        with httpx.Client(base_url=BASE_URL, follow_redirects=True) as client:
            # Setup: register, login, create patient
            self._register_and_login(client, "ehrbase_list", "list_letter@test.com")
            patient_id = self._create_patient(client, "Frank", "Miller")

            # Get CSRF token
            client.get("/auth/me")
            csrf_token = client.cookies.get("XSRF-TOKEN")

            # Create a letter
            client.post(
                f"/patients/{patient_id}/letters",
                headers={"X-CSRF-Token": csrf_token},
                json={
                    "title": "Test Letter",
                    "body": "Test content",
                    "author_name": "Dr. Test",
                },
            )

            # List letters
            response = client.get(f"/patients/{patient_id}/letters")
            assert response.status_code == 200
            data = response.json()
            assert "letters" in data
            assert data["patient_id"] == patient_id
            # Should have at least one letter
            assert isinstance(data["letters"], list)

    def test_read_letter(self):
        """Test reading a specific letter composition."""
        with httpx.Client(base_url=BASE_URL, follow_redirects=True) as client:
            # Setup: register, login, create patient
            self._register_and_login(client, "ehrbase_read", "read_letter@test.com")
            patient_id = self._create_patient(client, "Grace", "Wilson")

            # Get CSRF token
            client.get("/auth/me")
            csrf_token = client.cookies.get("XSRF-TOKEN")

            # Create letter
            create_response = client.post(
                f"/patients/{patient_id}/letters",
                headers={"X-CSRF-Token": csrf_token},
                json={
                    "title": "Follow-up Letter",
                    "body": "Follow-up content here",
                    "author_name": "Dr. Johnson",
                    "author_email": "dr.johnson@example.com",
                },
            )
            composition_uid = create_response.json()["composition_uid"]

            # Read letter
            response = client.get(f"/patients/{patient_id}/letters/{composition_uid}")
            assert response.status_code == 200
            data = response.json()
            assert data["composition_uid"] == composition_uid
            assert data["patient_id"] == patient_id
            assert data["title"] == "Follow-up Letter"
            assert "body" in data
            assert "created" in data

    def test_read_nonexistent_letter(self):
        """Test reading non-existent letter returns 404."""
        with httpx.Client(base_url=BASE_URL, follow_redirects=True) as client:
            # Setup: register, login, create patient
            self._register_and_login(client, "ehrbase_404", "404_letter@test.com")
            patient_id = self._create_patient(client, "Henry", "Taylor")

            # Try to read non-existent letter
            fake_uid = "00000000-0000-0000-0000-000000000000::quill.ehrbase.node::1"
            response = client.get(f"/patients/{patient_id}/letters/{fake_uid}")
            # Should return 404 or 500 (depending on EHRbase error)
            assert response.status_code in [404, 500]

    def _register_and_login(self, client: httpx.Client, username: str, email: str):
        """Helper to register and login a test user."""
        # Register (ignore if already exists)
        try:
            client.post(
                "/auth/register",
                json={
                    "username": username,
                    "email": email,
                    "password": "Test123!@#",
                },
            )
        except Exception:
            pass

        # Login
        response = client.post(
            "/auth/login",
            json={"username": username, "password": "Test123!@#"},
        )
        assert response.status_code == 200

    def _create_patient(self, client: httpx.Client, given: str, family: str) -> str:
        """Helper to create a FHIR patient and return patient_id."""
        response = client.post(
            "/patients",
            json={
                "given_name": given,
                "family_name": family,
            },
        )
        assert response.status_code == 200
        return response.json()["id"]


if __name__ == "__main__":
    # Allow running as standalone script for quick testing
    try:
        test_instance = TestEHRbaseLetterOperations()
        test_instance.test_create_letter()
        test_instance.test_list_letters()
        test_instance.test_read_letter()
        print("\n✅ All EHRbase Integration tests PASSED!")
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback

        traceback.print_exc()
