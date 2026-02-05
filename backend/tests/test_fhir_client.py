"""Unit tests for FHIR client functions."""

from unittest.mock import MagicMock, patch

import pytest

from app import fhir_client


class TestFhirClient:
    """Test FHIR client initialization."""

    @patch("app.fhir_client.client.FHIRClient")
    @patch("app.fhir_client.settings")
    def test_get_fhir_client(self, mock_settings, mock_client_class):
        """Test FHIR client initialization."""
        mock_settings.FHIR_SERVER_URL = "http://test-fhir:8080/fhir"

        fhir_client.get_fhir_client()

        mock_client_class.assert_called_once()
        # Verify settings were used
        call_args = mock_client_class.call_args
        assert (
            call_args[1]["settings"]["api_base"]
            == "http://test-fhir:8080/fhir"
        )


class TestCreateFhirPatient:
    """Test creating a new FHIR patient."""

    @patch("app.fhir_client.get_fhir_client")
    def test_create_fhir_patient_success(self, mock_get_client):
        """Test successful patient creation."""
        mock_fhir = MagicMock()
        mock_patient = MagicMock()
        mock_patient.create.return_value = {"created": True}
        mock_patient.as_json.return_value = {
            "resourceType": "Patient",
            "id": "new123",
            "name": [{"family": "Smith", "given": ["Jane"]}],
        }

        mock_get_client.return_value = mock_fhir

        with patch("app.fhir_client.Patient") as mock_patient_class:
            mock_patient_class.return_value = mock_patient
            result = fhir_client.create_fhir_patient("Jane", "Smith", "new123")

        assert result["id"] == "new123"

    @patch("app.fhir_client.get_fhir_client")
    def test_create_fhir_patient_exception(self, mock_get_client):
        """Test patient creation with exception."""
        mock_fhir = MagicMock()
        mock_get_client.return_value = mock_fhir

        with patch("app.fhir_client.Patient") as mock_patient_class:
            mock_patient = MagicMock()
            mock_patient.create.side_effect = Exception("Creation failed")
            mock_patient_class.return_value = mock_patient

            with pytest.raises(Exception) as exc_info:
                fhir_client.create_fhir_patient("Test", "User", "123")

            assert "Creation failed" in str(exc_info.value)


class TestReadFhirPatient:
    """Test reading a FHIR patient."""

    @patch("app.fhir_client.get_fhir_client")
    def test_read_fhir_patient_success(self, mock_get_client):
        """Test successful patient read."""
        mock_fhir = MagicMock()
        mock_get_client.return_value = mock_fhir

        mock_patient = MagicMock()
        mock_patient.as_json.return_value = {
            "resourceType": "Patient",
            "id": "123",
            "name": [{"family": "Doe", "given": ["John"]}],
        }

        with patch("app.fhir_client.Patient") as mock_patient_class:
            mock_patient_class.read.return_value = mock_patient
            result = fhir_client.read_fhir_patient("123")

        assert result["id"] == "123"

    @patch("app.fhir_client.get_fhir_client")
    def test_read_fhir_patient_not_found(self, mock_get_client):
        """Test reading non-existent patient."""
        mock_fhir = MagicMock()
        mock_get_client.return_value = mock_fhir

        with patch("app.fhir_client.Patient") as mock_patient_class:
            mock_patient_class.read.side_effect = Exception(
                "Patient not found"
            )
            result = fhir_client.read_fhir_patient("999")

        assert result is None


class TestListFhirPatients:
    """Test listing all FHIR patients."""

    @patch("app.fhir_client.get_fhir_client")
    def test_list_fhir_patients_success(self, mock_get_client):
        """Test successful patient listing."""
        mock_fhir = MagicMock()
        mock_fhir.server = MagicMock()
        mock_get_client.return_value = mock_fhir

        mock_patient1 = MagicMock()
        mock_patient1.as_json.return_value = {
            "resourceType": "Patient",
            "id": "1",
        }
        mock_patient2 = MagicMock()
        mock_patient2.as_json.return_value = {
            "resourceType": "Patient",
            "id": "2",
        }

        with patch("app.fhir_client.Patient") as mock_patient_class:
            mock_search = MagicMock()
            mock_search.perform_resources.return_value = [
                mock_patient1,
                mock_patient2,
            ]
            mock_patient_class.where.return_value = mock_search

            result = fhir_client.list_fhir_patients()

        assert len(result) == 2
        assert result[0]["id"] == "1"
        assert result[1]["id"] == "2"

    @patch("app.fhir_client.get_fhir_client")
    def test_list_fhir_patients_empty(self, mock_get_client):
        """Test patient listing with no patients."""
        mock_fhir = MagicMock()
        mock_fhir.server = MagicMock()
        mock_get_client.return_value = mock_fhir

        with patch("app.fhir_client.Patient") as mock_patient_class:
            mock_search = MagicMock()
            mock_search.perform_resources.return_value = []
            mock_patient_class.where.return_value = mock_search

            result = fhir_client.list_fhir_patients()

        assert result == []


class TestUpdateFhirPatient:
    """Test updating a FHIR patient."""

    @patch("app.fhir_client.get_fhir_client")
    def test_update_fhir_patient_success(self, mock_get_client):
        """Test successful patient update."""
        mock_fhir = MagicMock()
        mock_get_client.return_value = mock_fhir

        mock_patient = MagicMock()
        mock_patient.as_json.return_value = {
            "resourceType": "Patient",
            "id": "123",
            "name": [{"family": "Updated", "given": ["Name"]}],
        }

        with patch("app.fhir_client.Patient") as mock_patient_class:
            mock_patient_class.read.return_value = mock_patient
            mock_patient.update.return_value = {"updated": True}

            demographics = {"name": [{"family": "Updated", "given": ["Name"]}]}
            result = fhir_client.update_fhir_patient("123", demographics)

        assert result["id"] == "123"

    @patch("app.fhir_client.get_fhir_client")
    def test_update_fhir_patient_not_found(self, mock_get_client):
        """Test updating non-existent patient."""
        mock_fhir = MagicMock()
        mock_get_client.return_value = mock_fhir

        with patch("app.fhir_client.Patient") as mock_patient_class:
            mock_patient_class.read.side_effect = Exception(
                "Patient not found"
            )
            result = fhir_client.update_fhir_patient("999", {"name": []})

        assert result is None

    @patch("app.fhir_client.get_fhir_client")
    def test_update_fhir_patient_with_name(self, mock_get_client):
        """Test updating patient with name."""
        mock_fhir = MagicMock()
        mock_get_client.return_value = mock_fhir

        mock_patient = MagicMock()
        mock_patient.as_json.return_value = {
            "id": "123",
            "name": [{"family": "Doe", "given": ["John"]}],
        }

        with (
            patch("app.fhir_client.Patient") as mock_patient_class,
            patch("app.fhir_client.HumanName") as mock_name_class,
        ):
            mock_patient_class.read.return_value = mock_patient
            mock_name = MagicMock()
            mock_name_class.return_value = mock_name

            demographics = {"given_name": "Jane", "family_name": "Smith"}
            result = fhir_client.update_fhir_patient("123", demographics)

        assert result is not None
        assert mock_name.given == ["Jane"]
        assert mock_name.family == "Smith"
        assert mock_name.use == "official"

    @patch("app.fhir_client.get_fhir_client")
    def test_update_fhir_patient_with_birthdate(self, mock_get_client):
        """Test updating patient with birth date."""
        mock_fhir = MagicMock()
        mock_get_client.return_value = mock_fhir

        mock_patient = MagicMock()
        mock_patient.as_json.return_value = {
            "id": "123",
            "birthDate": "1990-01-01",
        }

        with (
            patch("app.fhir_client.Patient") as mock_patient_class,
            patch("app.fhir_client.FHIRDate") as mock_date_class,
        ):
            mock_patient_class.read.return_value = mock_patient
            mock_date = MagicMock()
            mock_date_class.return_value = mock_date

            demographics = {"date_of_birth": "1995-05-15"}
            result = fhir_client.update_fhir_patient("123", demographics)

        assert result is not None
        mock_date_class.assert_called_once_with("1995-05-15")

    @patch("app.fhir_client.get_fhir_client")
    def test_update_fhir_patient_with_gender(self, mock_get_client):
        """Test updating patient with gender."""
        mock_fhir = MagicMock()
        mock_get_client.return_value = mock_fhir

        mock_patient = MagicMock()
        mock_patient.as_json.return_value = {"id": "123", "gender": "female"}

        with patch("app.fhir_client.Patient") as mock_patient_class:
            mock_patient_class.read.return_value = mock_patient

            demographics = {"sex": "female"}
            result = fhir_client.update_fhir_patient("123", demographics)

        assert result is not None
        assert mock_patient.gender == "female"

    @patch("app.fhir_client.get_fhir_client")
    def test_update_fhir_patient_with_address(self, mock_get_client):
        """Test updating patient with address."""
        mock_fhir = MagicMock()
        mock_get_client.return_value = mock_fhir

        mock_patient = MagicMock()
        mock_patient.as_json.return_value = {"id": "123"}

        with (
            patch("app.fhir_client.Patient") as mock_patient_class,
            patch("app.fhir_client.Address") as mock_addr_class,
        ):
            mock_patient_class.read.return_value = mock_patient
            mock_addr = MagicMock()
            mock_addr_class.return_value = mock_addr

            demographics = {
                "address": {
                    "line": ["123 Main St"],
                    "city": "London",
                    "state": "England",
                    "postalCode": "SW1A 1AA",
                    "country": "UK",
                }
            }
            result = fhir_client.update_fhir_patient("123", demographics)

        assert result is not None
        assert mock_addr.line == ["123 Main St"]
        assert mock_addr.city == "London"
        assert mock_addr.state == "England"
        assert mock_addr.postalCode == "SW1A 1AA"
        assert mock_addr.country == "UK"

    @patch("app.fhir_client.get_fhir_client")
    def test_update_fhir_patient_with_contact(self, mock_get_client):
        """Test updating patient with contact information."""
        mock_fhir = MagicMock()
        mock_get_client.return_value = mock_fhir

        mock_patient = MagicMock()
        mock_patient.as_json.return_value = {"id": "123"}

        with (
            patch("app.fhir_client.Patient") as mock_patient_class,
            patch("app.fhir_client.ContactPoint") as mock_contact_class,
        ):
            mock_patient_class.read.return_value = mock_patient
            mock_phone = MagicMock()
            mock_email = MagicMock()
            mock_contact_class.side_effect = [mock_phone, mock_email]

            demographics = {
                "contact": {"phone": "555-1234", "email": "test@example.com"}
            }
            result = fhir_client.update_fhir_patient("123", demographics)

        assert result is not None
        assert mock_phone.system == "phone"
        assert mock_phone.value == "555-1234"
        assert mock_email.system == "email"
        assert mock_email.value == "test@example.com"
