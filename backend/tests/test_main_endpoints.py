"""Tests for main.py endpoints and dependencies."""

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.models import Organization, User, organisation_staff_member
from app.security import hash_password


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
            json={"name": "Updated Name"},
            headers={"X-CSRF-Token": csrf_token},
        )
        assert response.status_code == 200


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


class TestOrganizationEndpoints:
    """Test organization endpoints."""

    def test_get_organizations_unauthenticated(self, test_client: TestClient):
        """Test getting organizations without authentication."""
        response = test_client.get("/api/organizations")
        assert response.status_code == 401

    def test_get_organizations_forbidden(
        self, authenticated_client: TestClient
    ):
        """Test getting organizations without admin permissions."""
        response = authenticated_client.get("/api/organizations")
        assert response.status_code == 403
        assert "admin" in response.json()["detail"].lower()

    def test_get_organizations_empty(
        self, authenticated_admin_client: TestClient, db_session
    ):
        """Test getting organizations when none exist."""
        response = authenticated_admin_client.get("/api/organizations")
        assert response.status_code == 200
        data = response.json()
        assert "organizations" in data
        assert data["organizations"] == []

    def test_get_organizations_success(
        self,
        authenticated_admin_client: TestClient,
        db_session,
        test_admin: User,
    ):
        """Test getting list of organizations (admin sees only own)."""
        from sqlalchemy import insert

        from app.models import Organization, organisation_staff_member

        # Create test organizations
        org1 = Organization(
            name="Test Hospital", type="hospital", location="London"
        )
        org2 = Organization(
            name="Test Clinic", type="clinic", location="Manchester"
        )
        db_session.add_all([org1, org2])
        db_session.commit()

        # Add admin as staff to both orgs
        db_session.execute(
            insert(organisation_staff_member).values(
                [
                    {"organisation_id": org1.id, "user_id": test_admin.id},
                    {"organisation_id": org2.id, "user_id": test_admin.id},
                ]
            )
        )
        db_session.commit()

        response = authenticated_admin_client.get("/api/organizations")
        assert response.status_code == 200
        data = response.json()
        assert "organizations" in data
        assert len(data["organizations"]) == 2
        assert data["organizations"][0]["name"] == "Test Hospital"
        assert data["organizations"][0]["type"] == "hospital"
        assert data["organizations"][1]["name"] == "Test Clinic"

    def test_get_organizations_admin_only_sees_own(
        self,
        authenticated_admin_client: TestClient,
        db_session,
        test_admin: User,
    ):
        """Test admin only sees organisations they are a member of."""
        from sqlalchemy import insert

        from app.models import Organization, organisation_staff_member

        org1 = Organization(name="My Org", type="hospital", location="London")
        org2 = Organization(
            name="Other Org", type="clinic", location="Manchester"
        )
        db_session.add_all([org1, org2])
        db_session.commit()

        # Admin is only a member of org1
        db_session.execute(
            insert(organisation_staff_member).values(
                organisation_id=org1.id, user_id=test_admin.id
            )
        )
        db_session.commit()

        response = authenticated_admin_client.get("/api/organizations")
        assert response.status_code == 200
        data = response.json()
        assert len(data["organizations"]) == 1
        assert data["organizations"][0]["name"] == "My Org"

    def test_get_organization_by_id_admin_not_member(
        self,
        authenticated_admin_client: TestClient,
        db_session,
    ):
        """Test admin cannot access org they are not a member of."""
        from app.models import Organization

        org = Organization(
            name="Restricted Org", type="hospital", location="London"
        )
        db_session.add(org)
        db_session.commit()

        response = authenticated_admin_client.get(
            f"/api/organizations/{org.id}"
        )
        assert response.status_code == 404

    def test_get_organization_by_id_not_found(
        self, authenticated_admin_client: TestClient
    ):
        """Test getting organization that doesn't exist."""
        response = authenticated_admin_client.get("/api/organizations/999")
        assert response.status_code == 404

    def test_get_organization_by_id_success(
        self,
        authenticated_admin_client: TestClient,
        db_session,
        test_admin: User,
    ):
        """Test getting organization by ID with details."""
        from sqlalchemy import insert

        from app.models import Organization, organisation_staff_member

        # Create organization
        org = Organization(name="Test Practice", type="general_practice")
        db_session.add(org)
        db_session.commit()

        # Add staff member
        stmt = insert(organisation_staff_member).values(
            organisation_id=org.id, user_id=test_admin.id, is_primary=True
        )
        db_session.execute(stmt)
        db_session.commit()

        response = authenticated_admin_client.get(
            f"/api/organizations/{org.id}"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Test Practice"
        assert data["type"] == "general_practice"
        assert len(data["staff_members"]) == 1
        assert data["staff_members"][0]["username"] == test_admin.username
        assert data["patient_count"] == 0
        assert data["patient_members"] == []

    def test_create_organization_unauthenticated(
        self, test_client: TestClient
    ):
        """Test creating organisation without authentication."""
        response = test_client.post(
            "/api/organizations",
            json={"name": "Test Org", "type": "hospital_team"},
        )
        assert response.status_code == 401

    def test_create_organization_forbidden(
        self, authenticated_client: TestClient
    ):
        """Test creating organisation without admin permissions."""
        response = authenticated_client.post(
            "/api/organizations",
            json={"name": "Test Org", "type": "hospital_team"},
        )
        assert response.status_code == 403

    def test_create_organization_success(
        self, authenticated_admin_client: TestClient, db_session
    ):
        """Test creating a new organisation."""
        response = authenticated_admin_client.post(
            "/api/organizations",
            json={
                "name": "New Hospital",
                "type": "hospital_team",
                "location": "London",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "New Hospital"
        assert data["type"] == "hospital_team"
        assert data["location"] == "London"
        assert "id" in data
        assert "created_at" in data

    def test_create_organization_without_location(
        self, authenticated_admin_client: TestClient, db_session
    ):
        """Test creating organisation without optional location."""
        response = authenticated_admin_client.post(
            "/api/organizations",
            json={"name": "Remote Clinic", "type": "private_clinic"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Remote Clinic"
        assert data["location"] is None

    def test_create_organization_invalid_type(
        self, authenticated_admin_client: TestClient, db_session
    ):
        """Test creating organisation with invalid type."""
        response = authenticated_admin_client.post(
            "/api/organizations",
            json={"name": "Bad Org", "type": "invalid_type"},
        )
        assert response.status_code == 400
        assert "Invalid organisation type" in response.json()["detail"]

    def test_create_organization_missing_name(
        self, authenticated_admin_client: TestClient, db_session
    ):
        """Test creating organisation without required name field."""
        response = authenticated_admin_client.post(
            "/api/organizations",
            json={"type": "hospital_team"},
        )
        assert response.status_code == 422

    def test_create_organization_strips_whitespace(
        self, authenticated_admin_client: TestClient, db_session
    ):
        """Test that name and location are trimmed of whitespace."""
        response = authenticated_admin_client.post(
            "/api/organizations",
            json={
                "name": "  Spaced Hospital  ",
                "type": "gp_practice",
                "location": "  Manchester  ",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Spaced Hospital"
        assert data["location"] == "Manchester"

    def test_update_organization_unauthenticated(
        self, test_client: TestClient
    ):
        """Test updating organisation without authentication."""
        response = test_client.put(
            "/api/organizations/1", json={"name": "New Name"}
        )
        assert response.status_code == 401

    def test_update_organization_forbidden(
        self, authenticated_client: TestClient
    ):
        """Test updating organisation without admin permissions."""
        response = authenticated_client.put(
            "/api/organizations/1", json={"name": "New Name"}
        )
        assert response.status_code == 403

    def test_update_organization_not_found(
        self, authenticated_admin_client: TestClient
    ):
        """Test updating non-existent organisation."""
        response = authenticated_admin_client.put(
            "/api/organizations/999", json={"name": "New Name"}
        )
        assert response.status_code == 404

    def test_update_organization_success(
        self,
        authenticated_admin_client: TestClient,
        db_session,
        test_admin: User,
    ):
        """Test successfully updating an organisation."""
        from sqlalchemy import insert

        from app.models import Organization, organisation_staff_member

        org = Organization(
            name="Original Hospital",
            type="hospital_team",
            location="London",
        )
        db_session.add(org)
        db_session.commit()

        db_session.execute(
            insert(organisation_staff_member).values(
                organisation_id=org.id, user_id=test_admin.id
            )
        )
        db_session.commit()

        # Update it
        response = authenticated_admin_client.put(
            f"/api/organizations/{org.id}",
            json={"name": "Updated Hospital", "location": "Manchester"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Hospital"
        assert data["type"] == "hospital_team"
        assert data["location"] == "Manchester"

    def test_update_organization_invalid_type(
        self,
        authenticated_admin_client: TestClient,
        db_session,
        test_admin: User,
    ):
        """Test updating organisation with invalid type."""
        from sqlalchemy import insert

        from app.models import Organization, organisation_staff_member

        org = Organization(name="Test Org", type="hospital_team")
        db_session.add(org)
        db_session.commit()

        db_session.execute(
            insert(organisation_staff_member).values(
                organisation_id=org.id, user_id=test_admin.id
            )
        )
        db_session.commit()

        response = authenticated_admin_client.put(
            f"/api/organizations/{org.id}", json={"type": "invalid_type"}
        )
        assert response.status_code == 400

    def test_update_organization_partial(
        self,
        authenticated_admin_client: TestClient,
        db_session,
        test_admin: User,
    ):
        """Test partial update only changes specified fields."""
        from sqlalchemy import insert

        from app.models import Organization, organisation_staff_member

        org = Organization(
            name="Test Hospital",
            type="hospital_team",
            location="London",
        )
        db_session.add(org)
        db_session.commit()

        db_session.execute(
            insert(organisation_staff_member).values(
                organisation_id=org.id, user_id=test_admin.id
            )
        )
        db_session.commit()

        response = authenticated_admin_client.put(
            f"/api/organizations/{org.id}", json={"name": "New Name"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "New Name"
        assert data["type"] == "hospital_team"
        assert data["location"] == "London"

    def test_add_staff_unauthenticated(self, test_client: TestClient):
        """Test adding staff without authentication."""
        response = test_client.post(
            "/api/organizations/1/staff", json={"user_id": 1}
        )
        assert response.status_code == 401

    def test_add_staff_forbidden(self, authenticated_client: TestClient):
        """Test adding staff without admin permissions."""
        response = authenticated_client.post(
            "/api/organizations/1/staff", json={"user_id": 1}
        )
        assert response.status_code == 403

    def test_add_staff_org_not_found(
        self, authenticated_admin_client: TestClient
    ):
        """Test adding staff to non-existent organisation."""
        response = authenticated_admin_client.post(
            "/api/organizations/999/staff", json={"user_id": 1}
        )
        assert response.status_code == 404

    def test_add_staff_user_not_found(
        self,
        authenticated_admin_client: TestClient,
        db_session,
        test_admin: User,
    ):
        """Test adding non-existent user as staff."""
        from sqlalchemy import insert

        from app.models import Organization, organisation_staff_member

        org = Organization(name="Test Org", type="hospital_team")
        db_session.add(org)
        db_session.commit()

        db_session.execute(
            insert(organisation_staff_member).values(
                organisation_id=org.id, user_id=test_admin.id
            )
        )
        db_session.commit()

        response = authenticated_admin_client.post(
            f"/api/organizations/{org.id}/staff", json={"user_id": 9999}
        )
        assert response.status_code == 404
        assert "User not found" in response.json()["detail"]

    def test_add_staff_success(
        self,
        authenticated_admin_client: TestClient,
        db_session,
        test_admin: User,
    ):
        """Test successfully adding a staff member."""
        from sqlalchemy import insert

        from app.models import Organization, organisation_staff_member

        org = Organization(name="Staff Org", type="hospital_team")
        db_session.add(org)
        db_session.commit()

        # Pre-add admin as member so they can manage this org
        db_session.execute(
            insert(organisation_staff_member).values(
                organisation_id=org.id, user_id=test_admin.id
            )
        )
        db_session.commit()

        # Create a second staff user to add
        staff_user = User(
            username="newstaff",
            email="newstaff@example.com",
            password_hash=hash_password("StaffPass123!"),
            is_active=True,
            system_permissions="staff",
        )
        db_session.add(staff_user)
        db_session.commit()

        response = authenticated_admin_client.post(
            f"/api/organizations/{org.id}/staff",
            json={"user_id": staff_user.id},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["organisation_id"] == org.id
        assert data["user_id"] == staff_user.id
        assert data["username"] == staff_user.username

    def test_add_staff_auto_sets_primary(
        self,
        authenticated_admin_client: TestClient,
        db_session,
        test_admin: User,
    ):
        """Test first org membership is auto-set as primary."""
        from sqlalchemy import insert, select

        from app.models import Organization, organisation_staff_member

        org = Organization(name="Primary Org", type="hospital_team")
        db_session.add(org)
        db_session.commit()

        # Pre-add admin as member so they can manage this org
        db_session.execute(
            insert(organisation_staff_member).values(
                organisation_id=org.id, user_id=test_admin.id
            )
        )
        db_session.commit()

        # Create a new staff user with no existing memberships
        staff_user = User(
            username="primarytest",
            email="primarytest@example.com",
            password_hash=hash_password("StaffPass123!"),
            is_active=True,
            system_permissions="staff",
        )
        db_session.add(staff_user)
        db_session.commit()

        authenticated_admin_client.post(
            f"/api/organizations/{org.id}/staff",
            json={"user_id": staff_user.id},
        )

        row = db_session.execute(
            select(organisation_staff_member).where(
                organisation_staff_member.c.user_id == staff_user.id,
                organisation_staff_member.c.organisation_id == org.id,
            )
        ).first()
        assert row is not None
        assert row.is_primary is True

    def test_add_staff_does_not_override_primary(
        self,
        authenticated_admin_client: TestClient,
        db_session,
        test_admin: User,
    ):
        """Test second org membership does not override existing primary."""
        from sqlalchemy import insert, select

        from app.models import Organization, organisation_staff_member

        org1 = Organization(name="First Org", type="hospital_team")
        org2 = Organization(name="Second Org", type="hospital_team")
        db_session.add_all([org1, org2])
        db_session.commit()

        # Admin is member of both orgs
        db_session.execute(
            insert(organisation_staff_member).values(
                [
                    {
                        "organisation_id": org1.id,
                        "user_id": test_admin.id,
                    },
                    {
                        "organisation_id": org2.id,
                        "user_id": test_admin.id,
                    },
                ]
            )
        )
        db_session.commit()

        # Create a staff user with primary in org1
        staff_user = User(
            username="multiorgstaff",
            email="multiorgstaff@example.com",
            password_hash=hash_password("StaffPass123!"),
            is_active=True,
            system_permissions="staff",
        )
        db_session.add(staff_user)
        db_session.commit()

        db_session.execute(
            insert(organisation_staff_member).values(
                organisation_id=org1.id,
                user_id=staff_user.id,
                is_primary=True,
            )
        )
        db_session.commit()

        # Add staff_user to org2 — should NOT be primary
        authenticated_admin_client.post(
            f"/api/organizations/{org2.id}/staff",
            json={"user_id": staff_user.id},
        )

        row = db_session.execute(
            select(organisation_staff_member).where(
                organisation_staff_member.c.user_id == staff_user.id,
                organisation_staff_member.c.organisation_id == org2.id,
            )
        ).first()
        assert row is not None
        assert row.is_primary is False

    def test_add_staff_duplicate(
        self,
        authenticated_admin_client: TestClient,
        db_session,
        test_admin: User,
    ):
        """Test adding user who is already a staff member."""
        from sqlalchemy import insert

        from app.models import Organization, organisation_staff_member

        org = Organization(name="Dup Org", type="hospital_team")
        db_session.add(org)
        db_session.commit()

        stmt = insert(organisation_staff_member).values(
            organisation_id=org.id,
            user_id=test_admin.id,
            is_primary=False,
        )
        db_session.execute(stmt)
        db_session.commit()

        response = authenticated_admin_client.post(
            f"/api/organizations/{org.id}/staff",
            json={"user_id": test_admin.id},
        )
        assert response.status_code == 409
        assert "already a staff member" in response.json()["detail"]

    def test_add_staff_rejects_patient_user(
        self,
        authenticated_admin_client: TestClient,
        db_session,
        test_admin: User,
    ):
        """Test adding a patient-level user as staff is rejected."""
        from sqlalchemy import insert

        from app.models import Organization, organisation_staff_member

        org = Organization(name="Staff Only Org", type="hospital_team")
        db_session.add(org)
        db_session.commit()

        db_session.execute(
            insert(organisation_staff_member).values(
                organisation_id=org.id, user_id=test_admin.id
            )
        )
        db_session.commit()

        patient_user = User(
            username="patientuser",
            email="patient@example.com",
            password_hash=hash_password("PatientPass123!"),
            is_active=True,
            system_permissions="patient",
        )
        db_session.add(patient_user)
        db_session.commit()

        response = authenticated_admin_client.post(
            f"/api/organizations/{org.id}/staff",
            json={"user_id": patient_user.id},
        )
        assert response.status_code == 400
        assert "staff-level permissions" in response.json()["detail"]

    def test_list_users_permission_level_filter(
        self,
        authenticated_admin_client: TestClient,
        db_session,
        test_admin: User,
    ):
        """Test filtering users by minimum permission level."""
        # Create an org and add admin + test users to it
        org = Organization(name="Filter Org")
        db_session.add(org)
        db_session.flush()

        db_session.execute(
            organisation_staff_member.insert().values(
                organisation_id=org.id,
                user_id=test_admin.id,
                is_primary=True,
            )
        )

        patient_user = User(
            username="listpatient",
            email="listpatient@example.com",
            password_hash=hash_password("PatientPass123!"),
            is_active=True,
            email_verified=True,
            system_permissions="patient",
        )
        staff_user = User(
            username="liststaff",
            email="liststaff@example.com",
            password_hash=hash_password("StaffPass123!"),
            is_active=True,
            email_verified=True,
            system_permissions="staff",
        )
        db_session.add_all([patient_user, staff_user])
        db_session.flush()

        # Add both to the org so the admin can see them
        db_session.execute(
            organisation_staff_member.insert().values(
                [
                    {
                        "organisation_id": org.id,
                        "user_id": patient_user.id,
                        "is_primary": True,
                    },
                    {
                        "organisation_id": org.id,
                        "user_id": staff_user.id,
                        "is_primary": True,
                    },
                ]
            )
        )
        db_session.commit()

        response = authenticated_admin_client.get(
            "/api/users?permission_level=staff"
        )
        assert response.status_code == 200

        usernames = [u["username"] for u in response.json()["users"]]
        assert "liststaff" in usernames
        assert "testadmin" in usernames
        assert "listpatient" not in usernames

    def test_list_users_admin_only_sees_own_org(
        self,
        authenticated_admin_client: TestClient,
        db_session,
        test_admin: User,
    ):
        """Admin cannot see users in other organisations."""
        # Admin's org
        org_a = Organization(name="Org A")
        db_session.add(org_a)
        db_session.flush()
        db_session.execute(
            organisation_staff_member.insert().values(
                organisation_id=org_a.id,
                user_id=test_admin.id,
                is_primary=True,
            )
        )

        # Another org with a user the admin should NOT see
        org_b = Organization(name="Org B")
        db_session.add(org_b)
        db_session.flush()
        other_user = User(
            username="otherorguser",
            email="other@example.com",
            password_hash=hash_password("OtherPass123!"),
            is_active=True,
            email_verified=True,
            system_permissions="staff",
        )
        db_session.add(other_user)
        db_session.flush()
        db_session.execute(
            organisation_staff_member.insert().values(
                organisation_id=org_b.id,
                user_id=other_user.id,
                is_primary=True,
            )
        )
        db_session.commit()

        response = authenticated_admin_client.get("/api/users")
        assert response.status_code == 200
        usernames = [u["username"] for u in response.json()["users"]]
        assert "testadmin" in usernames
        assert "otherorguser" not in usernames

    def test_list_users_invalid_permission_level(
        self,
        authenticated_admin_client: TestClient,
    ):
        """Test invalid permission_level returns 400."""
        response = authenticated_admin_client.get(
            "/api/users?permission_level=invalid"
        )
        assert response.status_code == 400

    def test_list_users_exclude_org(
        self,
        authenticated_admin_client: TestClient,
        db_session,
        test_admin: User,
    ):
        """Test exclude_org filters out existing org members."""
        org = Organization(name="Exclude Org")
        db_session.add(org)
        db_session.flush()

        # Add admin to org so they can see users
        db_session.execute(
            organisation_staff_member.insert().values(
                organisation_id=org.id,
                user_id=test_admin.id,
                is_primary=True,
            )
        )

        # Create two staff users in the same org
        member_user = User(
            username="staff-member-a",
            email="staff-member-a@example.com",
            password_hash=hash_password("Password123!"),
            is_active=True,
            email_verified=True,
            system_permissions="staff",
        )
        non_member_user = User(
            username="staff-available",
            email="staff-available@example.com",
            password_hash=hash_password("Password123!"),
            is_active=True,
            email_verified=True,
            system_permissions="staff",
        )
        db_session.add_all([member_user, non_member_user])
        db_session.flush()

        # Add both to admin's org so admin can see them
        db_session.execute(
            organisation_staff_member.insert().values(
                [
                    {
                        "organisation_id": org.id,
                        "user_id": member_user.id,
                        "is_primary": False,
                    },
                    {
                        "organisation_id": org.id,
                        "user_id": non_member_user.id,
                        "is_primary": False,
                    },
                ]
            )
        )
        db_session.commit()

        # Without exclude_org: both visible
        response = authenticated_admin_client.get(
            "/api/users?permission_level=staff"
        )
        assert response.status_code == 200
        usernames = [u["username"] for u in response.json()["users"]]
        assert "staff-member-a" in usernames
        assert "staff-available" in usernames

        # With exclude_org: members of that org are excluded
        response = authenticated_admin_client.get(
            f"/api/users?permission_level=staff&exclude_org={org.id}"
        )
        assert response.status_code == 200
        usernames = [u["username"] for u in response.json()["users"]]
        assert "staff-member-a" not in usernames
        assert "staff-available" not in usernames
        # Admin is also a member but should be excluded too
        assert "testadmin" not in usernames

    def test_deactivate_user_success(
        self,
        authenticated_admin_client: TestClient,
        db_session,
    ):
        """Test admin can deactivate another user."""
        user = User(
            username="deactivate-me",
            email="deactivate@example.com",
            password_hash=hash_password("Password123!"),
            is_active=True,
            system_permissions="staff",
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        response = authenticated_admin_client.post(
            f"/api/users/{user.id}/deactivate"
        )
        assert response.status_code == 200
        assert response.json()["detail"] == "deactivated"

        db_session.refresh(user)
        assert user.is_active is False

    def test_deactivate_user_cannot_deactivate_self(
        self,
        authenticated_admin_client: TestClient,
        test_admin: User,
    ):
        """Test admin cannot deactivate their own account."""
        response = authenticated_admin_client.post(
            f"/api/users/{test_admin.id}/deactivate"
        )
        assert response.status_code == 400
        assert "own account" in response.json()["detail"]

    def test_deactivate_user_already_inactive(
        self,
        authenticated_admin_client: TestClient,
        db_session,
    ):
        """Test deactivating an already-inactive user returns 400."""
        user = User(
            username="already-inactive",
            email="inactive@example.com",
            password_hash=hash_password("Password123!"),
            is_active=False,
            system_permissions="staff",
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        response = authenticated_admin_client.post(
            f"/api/users/{user.id}/deactivate"
        )
        assert response.status_code == 400
        assert "already deactivated" in response.json()["detail"]

    def test_deactivate_user_not_found(
        self,
        authenticated_admin_client: TestClient,
    ):
        """Test deactivating a non-existent user returns 404."""
        response = authenticated_admin_client.post(
            "/api/users/99999/deactivate"
        )
        assert response.status_code == 404

    def test_deactivate_user_forbidden_for_staff(
        self,
        authenticated_client: TestClient,
    ):
        """Test non-admin cannot deactivate users."""
        response = authenticated_client.post("/api/users/1/deactivate")
        assert response.status_code == 403

    def test_add_patient_unauthenticated(self, test_client: TestClient):
        """Test adding patient without authentication."""
        response = test_client.post(
            "/api/organizations/1/patients",
            json={"patient_id": "fhir-123"},
        )
        assert response.status_code == 401

    def test_add_patient_forbidden(self, authenticated_client: TestClient):
        """Test adding patient without admin permissions."""
        response = authenticated_client.post(
            "/api/organizations/1/patients",
            json={"patient_id": "fhir-123"},
        )
        assert response.status_code == 403

    def test_add_patient_org_not_found(
        self, authenticated_admin_client: TestClient
    ):
        """Test adding patient to non-existent organisation."""
        response = authenticated_admin_client.post(
            "/api/organizations/999/patients",
            json={"patient_id": "fhir-123"},
        )
        assert response.status_code == 404

    def test_add_patient_success(
        self,
        authenticated_admin_client: TestClient,
        db_session,
        test_admin: User,
    ):
        """Test successfully adding a patient."""
        from sqlalchemy import insert

        from app.models import Organization, organisation_staff_member

        org = Organization(name="Patient Org", type="hospital_team")
        db_session.add(org)
        db_session.commit()

        db_session.execute(
            insert(organisation_staff_member).values(
                organisation_id=org.id, user_id=test_admin.id
            )
        )
        db_session.commit()

        response = authenticated_admin_client.post(
            f"/api/organizations/{org.id}/patients",
            json={"patient_id": "fhir-456"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["organisation_id"] == org.id
        assert data["patient_id"] == "fhir-456"

    def test_add_patient_duplicate(
        self,
        authenticated_admin_client: TestClient,
        db_session,
        test_admin: User,
    ):
        """Test adding patient who is already a member."""
        from sqlalchemy import insert

        from app.models import (
            Organization,
            organisation_patient_member,
            organisation_staff_member,
        )

        org = Organization(name="Dup Patient Org", type="hospital_team")
        db_session.add(org)
        db_session.commit()

        db_session.execute(
            insert(organisation_staff_member).values(
                organisation_id=org.id, user_id=test_admin.id
            )
        )
        db_session.execute(
            insert(organisation_patient_member).values(
                organisation_id=org.id,
                patient_id="fhir-789",
                is_primary=False,
            )
        )
        db_session.commit()

        response = authenticated_admin_client.post(
            f"/api/organizations/{org.id}/patients",
            json={"patient_id": "fhir-789"},
        )
        assert response.status_code == 409
        assert "already a member" in response.json()["detail"]
