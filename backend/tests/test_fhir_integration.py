"""
test_fhir_integration.py

Integration tests for FHIR functionality.
Tests creating and reading patients via FHIR endpoints.

Note: Requires docker-compose services to be running.

Usage:
    pytest tests/test_fhir_integration.py -v
"""

import httpx
import pytest

BASE_URL = "http://localhost/api"


@pytest.mark.integration
def test_fhir_create_and_read_patient():
    """Test creating and reading a FHIR patient."""
    print("🧪 Testing FHIR Integration...")

    # First, login to get auth cookies
    print("\n1. Logging in...")
    with httpx.Client(base_url=BASE_URL, follow_redirects=True) as client:
        # Register a test user
        try:
            response = client.post(
                "/auth/register",
                json={
                    "username": "fhir_test_user",
                    "email": "fhir@test.com",
                    "password": "Test123!@#",
                },
            )
            if response.status_code == 200:
                print("   ✓ Test user registered")
            else:
                print(
                    f"   - User already exists or registration failed: {response.status_code}"
                )
        except Exception as e:
            print(f"   ! Registration error (might already exist): {e}")

        # Login
        response = client.post(
            "/auth/login",
            json={"username": "fhir_test_user", "password": "Test123!@#"},
        )

        if response.status_code != 200:
            print(f"   ✗ Login failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return False

        print("   ✓ Logged in successfully")

        # Create a FHIR patient
        print("\n2. Creating FHIR patient...")
        response = client.post(
            "/patients",
            json={
                "given_name": "Alice",
                "family_name": "Smith",
                "patient_id": "test-patient-001",
            },
        )

        if response.status_code != 200:
            print(f"   ✗ Failed to create patient: {response.status_code}")
            print(f"   Response: {response.text}")
            return False

        patient_data = response.json()
        patient_id = patient_data.get("id")
        print(f"   ✓ Patient created with ID: {patient_id}")
        print(f"   Name: {patient_data.get('name', [{}])[0]}")

        # Read the patient back
        print("\n3. Reading FHIR patient...")
        response = client.get(f"/patients/{patient_id}/demographics")

        if response.status_code != 200:
            print(f"   ✗ Failed to read patient: {response.status_code}")
            print(f"   Response: {response.text}")
            return False

        response_data = response.json()
        retrieved_patient = response_data.get("data", {})
        print("   ✓ Patient retrieved successfully")
        print(f"   ID: {retrieved_patient.get('id')}")
        name_obj = retrieved_patient.get("name", [{}])[0]
        print(f"   Given: {name_obj.get('given', [])}")
        print(f"   Family: {name_obj.get('family')}")

        # Verify data matches
        if (
            name_obj.get("given") == ["Alice"]
            and name_obj.get("family") == "Smith"
        ):
            print("\n✅ FHIR Integration test PASSED!")
            return True
        else:
            print("\n❌ Data mismatch!")
            return False


if __name__ == "__main__":
    # Allow running as standalone script for quick testing
    try:
        test_fhir_create_and_read_patient()
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback

        traceback.print_exc()
