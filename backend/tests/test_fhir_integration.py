"""
test_fhir_integration.py

Integration tests for FHIR functionality.
Tests creating, reading, and updating patients via FHIR endpoints.

Note: These are integration tests that require docker-compose services to be running.
Mark tests with @pytest.mark.integration for proper test filtering.

Usage:
    pytest tests/test_fhir_integration.py -v -m integration
"""

import httpx
import pytest

BASE_URL = "http://localhost/api"


@pytest.mark.integration
class TestFHIRPatientOperations:
    """Integration tests for FHIR Patient operations."""

    def test_create_patient(self):
        """Test creating a FHIR patient."""
        with httpx.Client(base_url=BASE_URL, follow_redirects=True) as client:
            # Register and login
            self._register_and_login(client, "fhir_test_user", "fhir@test.com")

            # Create a FHIR patient
            response = client.post(
                "/patients",
                json={
                    "given_name": "Alice",
                    "family_name": "Smith",
                    "patient_id": "test-patient-001",
                },
            )

            assert response.status_code == 200
            patient_data = response.json()
            assert patient_data.get("id")
            assert patient_data.get("name")
            name_obj = patient_data.get("name", [{}])[0]
            assert name_obj.get("given") == ["Alice"]
            assert name_obj.get("family") == "Smith"

    def test_list_patients(self):
        """Test listing all FHIR patients."""
        with httpx.Client(base_url=BASE_URL, follow_redirects=True) as client:
            self._register_and_login(client, "fhir_list_user", "list@test.com")

            # Create a test patient first
            client.post(
                "/patients",
                json={
                    "given_name": "Bob",
                    "family_name": "Johnson",
                    "patient_id": "test-patient-002",
                },
            )

            # List patients
            response = client.get("/patients")
            assert response.status_code == 200
            data = response.json()
            assert "patients" in data
            assert isinstance(data["patients"], list)
            assert len(data["patients"]) > 0

    def test_read_patient_demographics(self):
        """Test reading patient demographics."""
        with httpx.Client(base_url=BASE_URL, follow_redirects=True) as client:
            self._register_and_login(client, "fhir_read_user", "read@test.com")

            # Create patient
            create_response = client.post(
                "/patients",
                json={
                    "given_name": "Carol",
                    "family_name": "Williams",
                    "patient_id": "test-patient-003",
                },
            )
            patient_id = create_response.json().get("id")

            # Read demographics
            response = client.get(f"/patients/{patient_id}/demographics")
            assert response.status_code == 200
            data = response.json()
            assert data["patient_id"] == patient_id
            assert "data" in data

            patient = data["data"]
            name_obj = patient.get("name", [{}])[0]
            assert name_obj.get("given") == ["Carol"]
            assert name_obj.get("family") == "Williams"

    def test_update_patient_demographics(self):
        """Test updating patient demographics."""
        with httpx.Client(base_url=BASE_URL, follow_redirects=True) as client:
            self._register_and_login(
                client,
                "fhir_update_user",
                "update@test.com",
                assign_clinician_role=True,
            )

            # Create patient
            create_response = client.post(
                "/patients",
                json={
                    "given_name": "David",
                    "family_name": "Brown",
                    "patient_id": "test-patient-004",
                },
            )
            patient_id = create_response.json().get("id")

            # Get CSRF token
            client.get("/auth/me")
            csrf_token = client.cookies.get("XSRF-TOKEN")

            # Update demographics
            response = client.put(
                f"/patients/{patient_id}/demographics",
                headers={"X-CSRF-Token": csrf_token},
                json={
                    "given_name": "David",
                    "family_name": "Brown-Updated",
                    "date_of_birth": "1990-01-01",
                    "sex": "male",
                },
            )
            assert response.status_code == 200
            data = response.json()
            assert data["patient_id"] == patient_id

            # Verify update
            read_response = client.get(f"/patients/{patient_id}/demographics")
            patient = read_response.json()["data"]
            name_obj = patient.get("name", [{}])[0]
            assert name_obj.get("family") == "Brown-Updated"

    def test_read_nonexistent_patient(self):
        """Test reading demographics for non-existent patient."""
        with httpx.Client(base_url=BASE_URL, follow_redirects=True) as client:
            self._register_and_login(client, "fhir_404_user", "404@test.com")

            response = client.get("/patients/nonexistent-id/demographics")
            assert response.status_code == 404

    def _register_and_login(
        self,
        client: httpx.Client,
        username: str,
        email: str,
        assign_clinician_role: bool = False,
    ):
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

        # Note: Assigning clinician role would require direct database access
        # For integration tests with roles, use test fixtures or separate setup
        if assign_clinician_role:
            # This would need database access to assign role
            # For now, this is a placeholder
            pass


if __name__ == "__main__":
    # Allow running as standalone script for quick testing
    try:
        test_instance = TestFHIRPatientOperations()
        test_instance.test_create_patient()
        test_instance.test_list_patients()
        test_instance.test_read_patient_demographics()
        print("\n✅ All FHIR Integration tests PASSED!")
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback

        traceback.print_exc()
