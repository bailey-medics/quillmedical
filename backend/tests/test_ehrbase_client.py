"""Unit tests for EHRbase client functions."""

from unittest.mock import MagicMock, patch

import pytest
import requests

from app import ehrbase_client
from app.ehrbase_client import EhrAlreadyExistsError, EhrbaseClientError


class TestGetOrCreateEhr:
    """Test getting or creating EHR for patient."""

    @patch("app.ehrbase_client.requests.get")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_get_ehr_exists_already(self, mock_settings, mock_auth, mock_get):
        """Test when EHR already exists for patient."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_auth.return_value = {"Authorization": "Basic test"}

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "ehr_id": {"value": "existing-ehr-123"}
        }
        mock_get.return_value = mock_response

        result = ehrbase_client.get_or_create_ehr("patient-123")

        assert result == "existing-ehr-123"
        mock_get.assert_called_once()

    @patch("app.ehrbase_client.requests.post")
    @patch("app.ehrbase_client.requests.get")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_get_ehr_create_new(
        self, mock_settings, mock_auth, mock_get, mock_post
    ):
        """Test creating new EHR when none exists."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_auth.return_value = {"Authorization": "Basic test"}

        # Mock GET returns 404
        mock_get_response = MagicMock()
        mock_get_response.status_code = 404
        mock_get.return_value = mock_get_response

        # Mock POST creates EHR
        mock_post_response = MagicMock()
        mock_post_response.status_code = 201
        mock_post_response.json.return_value = {
            "ehr_id": {"value": "new-ehr-456"}
        }
        mock_post.return_value = mock_post_response

        result = ehrbase_client.get_or_create_ehr("patient-456")

        assert result == "new-ehr-456"
        mock_get.assert_called_once()
        mock_post.assert_called_once()

    @patch("app.ehrbase_client.requests.get")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_get_ehr_error(self, mock_settings, mock_auth, mock_get):
        """Test error handling when EHR check fails."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_auth.return_value = {"Authorization": "Basic test"}

        mock_get.side_effect = requests.ConnectionError("Connection error")

        with pytest.raises(EhrbaseClientError) as exc_info:
            ehrbase_client.get_or_create_ehr("patient-789")

        assert "Failed to retrieve clinical record" in str(exc_info.value)

    @patch("app.ehrbase_client.requests.post")
    @patch("app.ehrbase_client.requests.get")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_get_or_create_ehr_race_condition_resolved(
        self, mock_settings, mock_auth, mock_get, mock_post
    ):
        """Test race condition: create returns 409, retry fetches existing."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_settings.CLINICAL_SERVICES_ENABLED = True
        mock_auth.return_value = {"Authorization": "Basic test"}

        # First GET returns 404 (no EHR exists yet)
        mock_get_404 = MagicMock()
        mock_get_404.status_code = 404

        # Second GET (after 409) returns the EHR created by another request
        mock_get_200 = MagicMock()
        mock_get_200.status_code = 200
        mock_get_200.json.return_value = {
            "ehr_id": {"value": "race-winner-ehr-123"}
        }

        mock_get.side_effect = [mock_get_404, mock_get_200]

        # POST returns 409 Conflict (another request won the race)
        mock_post_response = MagicMock()
        mock_post_response.status_code = 409
        mock_post.return_value = mock_post_response

        result = ehrbase_client.get_or_create_ehr("patient-race")

        assert result == "race-winner-ehr-123"
        assert mock_get.call_count == 2
        mock_post.assert_called_once()

    @patch("app.ehrbase_client.requests.post")
    @patch("app.ehrbase_client.requests.get")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_get_or_create_ehr_race_condition_unresolvable(
        self, mock_settings, mock_auth, mock_get, mock_post
    ):
        """Test race condition where retry also fails raises error."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_settings.CLINICAL_SERVICES_ENABLED = True
        mock_auth.return_value = {"Authorization": "Basic test"}

        # Both GETs return 404
        mock_get_404 = MagicMock()
        mock_get_404.status_code = 404
        mock_get.side_effect = [mock_get_404, mock_get_404]

        # POST returns 409
        mock_post_response = MagicMock()
        mock_post_response.status_code = 409
        mock_post.return_value = mock_post_response

        with pytest.raises(EhrAlreadyExistsError):
            ehrbase_client.get_or_create_ehr("patient-phantom")


class TestCreateEhrConflict:
    """Test EHR creation with 409 handling."""

    @patch("app.ehrbase_client.requests.post")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_create_ehr_conflict_raises(
        self, mock_settings, mock_auth, mock_post
    ):
        """Test that 409 Conflict raises EhrAlreadyExistsError."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_settings.CLINICAL_SERVICES_ENABLED = True
        mock_auth.return_value = {"Authorization": "Basic test"}

        mock_response = MagicMock()
        mock_response.status_code = 409
        mock_post.return_value = mock_response

        with pytest.raises(EhrAlreadyExistsError):
            ehrbase_client.create_ehr("patient-duplicate")


class TestCreateLetterComposition:
    """Test creating letter compositions in EHRbase."""

    @patch("app.ehrbase_client.get_or_create_ehr")
    @patch("app.ehrbase_client.requests.post")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_create_letter_success(
        self, mock_settings, mock_auth, mock_post, mock_get_ehr
    ):
        """Test successful letter composition creation."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_auth.return_value = {"Authorization": "Basic test"}
        mock_get_ehr.return_value = "ehr-123"

        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json.return_value = {
            "compositionUid": "comp-uid-789::server::1",
            "action": "CREATE",
        }
        mock_post.return_value = mock_response

        result = ehrbase_client.create_letter_composition(
            "patient-123", "Test Letter", "Letter content", "Dr. Smith"
        )

        # Function returns response.json() directly
        assert result["compositionUid"] == "comp-uid-789::server::1"
        mock_get_ehr.assert_called_once_with("patient-123")
        mock_post.assert_called_once()

    @patch("app.ehrbase_client.get_or_create_ehr")
    @patch("app.ehrbase_client.requests.post")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_create_letter_failure(
        self, mock_settings, mock_auth, mock_post, mock_get_ehr
    ):
        """Test letter creation with error raises EhrbaseClientError."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_auth.return_value = {"Authorization": "Basic test"}
        mock_get_ehr.return_value = "ehr-123"

        mock_post.side_effect = requests.RequestException("Creation failed")

        with pytest.raises(EhrbaseClientError) as exc_info:
            ehrbase_client.create_letter_composition(
                "patient-123", "Test", "Body", None
            )

        assert "Failed to create clinical document" in str(exc_info.value)


class TestListLettersForPatient:
    """Test listing letters for a patient."""

    @patch("app.ehrbase_client.get_ehr_by_subject")
    @patch("app.ehrbase_client.query_aql")
    def test_list_letters_success(self, mock_query, mock_get_ehr):
        """Test successful letter listing."""
        mock_get_ehr.return_value = {"ehr_id": {"value": "ehr-123"}}

        mock_query.return_value = {
            "rows": [
                ["uid-1", "Letter 1", "2024-01-01T10:00:00Z", "Dr. Smith"],
                ["uid-2", "Letter 2", "2024-01-02T11:00:00Z", "Dr. Jones"],
            ]
        }

        result = ehrbase_client.list_letters_for_patient("patient-123")

        assert len(result) == 2
        mock_get_ehr.assert_called_once_with("patient-123")
        mock_query.assert_called_once()

    @patch("app.ehrbase_client.get_ehr_by_subject")
    def test_list_letters_no_ehr(self, mock_get_ehr):
        """Test listing letters when patient has no EHR."""
        mock_get_ehr.return_value = None

        result = ehrbase_client.list_letters_for_patient("patient-123")

        assert result == []

    @patch("app.ehrbase_client.get_ehr_by_subject")
    @patch("app.ehrbase_client.query_aql")
    def test_list_letters_empty(self, mock_query, mock_get_ehr):
        """Test listing letters when none exist."""
        mock_get_ehr.return_value = {"ehr_id": {"value": "ehr-123"}}
        mock_query.return_value = {"rows": []}

        result = ehrbase_client.list_letters_for_patient("patient-123")

        assert result == []

    @patch("app.ehrbase_client.get_ehr_by_subject")
    def test_list_letters_exception(self, mock_get_ehr):
        """Test listing letters with exception raises EhrbaseClientError."""
        mock_get_ehr.side_effect = Exception("Query error")

        with pytest.raises(EhrbaseClientError) as exc_info:
            ehrbase_client.list_letters_for_patient("patient-123")

        assert "Failed to retrieve letters" in str(exc_info.value)


class TestGetLetterComposition:
    """Test retrieving a specific letter composition."""

    @patch("app.ehrbase_client.get_ehr_by_subject")
    @patch("app.ehrbase_client.get_composition")
    def test_get_letter_success(self, mock_get_comp, mock_get_ehr):
        """Test successful letter retrieval."""
        mock_get_ehr.return_value = {"ehr_id": {"value": "ehr-123"}}

        mock_get_comp.return_value = {
            "uid": {"value": "comp-uid-123"},
            "name": {"value": "Test Letter"},
            "content": [
                {"data": {"items": [{"value": {"value": "Letter body"}}]}}
            ],
        }

        result = ehrbase_client.get_letter_composition(
            "patient-123", "comp-uid-123"
        )

        assert result is not None
        assert result["uid"]["value"] == "comp-uid-123"
        mock_get_ehr.assert_called_once_with("patient-123")
        mock_get_comp.assert_called_once_with("ehr-123", "comp-uid-123")

    @patch("app.ehrbase_client.get_ehr_by_subject")
    def test_get_letter_no_ehr(self, mock_get_ehr):
        """Test retrieving letter when patient has no EHR."""
        mock_get_ehr.return_value = None

        result = ehrbase_client.get_letter_composition(
            "patient-123", "comp-uid-123"
        )

        assert result is None

    @patch("app.ehrbase_client.get_ehr_by_subject")
    @patch("app.ehrbase_client.get_composition")
    def test_get_letter_exception(self, mock_get_comp, mock_get_ehr):
        """Test retrieving letter with exception raises EhrbaseClientError."""
        mock_get_ehr.return_value = {"ehr_id": {"value": "ehr-123"}}
        mock_get_comp.side_effect = EhrbaseClientError(
            "Failed to retrieve clinical document"
        )

        with pytest.raises(EhrbaseClientError) as exc_info:
            ehrbase_client.get_letter_composition(
                "patient-123", "comp-uid-123"
            )

        assert "Failed to retrieve" in str(exc_info.value)


class TestGetAuthHeader:
    """Test auth header generation."""

    @patch("app.ehrbase_client.settings")
    def test_get_auth_header(self, mock_settings):
        """Test that Basic Auth header is correctly generated."""
        import base64

        mock_settings.EHRBASE_API_USER = "test_user"
        mock_settings.EHRBASE_API_PASSWORD = MagicMock()
        mock_settings.EHRBASE_API_PASSWORD.get_secret_value.return_value = (
            "test_pass"
        )

        result = ehrbase_client.get_auth_header()

        credentials = "test_user:test_pass"
        expected = base64.b64encode(credentials.encode()).decode()
        assert result == {"Authorization": f"Basic {expected}"}


class TestUploadTemplate:
    """Test uploading OpenEHR template."""

    @patch("app.ehrbase_client.requests.post")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_upload_template(self, mock_settings, mock_auth, mock_post):
        """Test successful template upload."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_auth.return_value = {"Authorization": "Basic test"}

        mock_response = MagicMock()
        mock_response.json.return_value = {"template_id": "template-123"}
        mock_post.return_value = mock_response

        result = ehrbase_client.upload_template("<template>XML</template>")

        assert result == {"template_id": "template-123"}
        mock_post.assert_called_once()
        call_args = mock_post.call_args
        assert "Content-Type" in call_args[1]["headers"]
        assert call_args[1]["headers"]["Content-Type"] == "application/xml"


class TestListTemplates:
    """Test listing available templates."""

    @patch("app.ehrbase_client.requests.get")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_list_templates(self, mock_settings, mock_auth, mock_get):
        """Test successful template listing."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_auth.return_value = {"Authorization": "Basic test"}

        mock_response = MagicMock()
        mock_response.json.return_value = [
            {"template_id": "t1"},
            {"template_id": "t2"},
        ]
        mock_get.return_value = mock_response

        result = ehrbase_client.list_templates()

        assert len(result) == 2
        assert result[0]["template_id"] == "t1"


class TestCreateEhr:
    """Test creating new EHR."""

    @patch("app.ehrbase_client.requests.post")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_create_ehr(self, mock_settings, mock_auth, mock_post):
        """Test successful EHR creation."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_auth.return_value = {"Authorization": "Basic test"}

        mock_response = MagicMock()
        mock_response.json.return_value = {"ehr_id": {"value": "new-ehr-123"}}
        mock_post.return_value = mock_response

        result = ehrbase_client.create_ehr("patient-123")

        assert result == {"ehr_id": {"value": "new-ehr-123"}}
        mock_post.assert_called_once()


class TestQueryAql:
    """Test AQL query execution."""

    @patch("app.ehrbase_client.requests.post")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_query_aql(self, mock_settings, mock_auth, mock_post):
        """Test successful AQL query."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_auth.return_value = {"Authorization": "Basic test"}

        mock_response = MagicMock()
        mock_response.json.return_value = {"rows": [{"col1": "val1"}]}
        mock_post.return_value = mock_response

        result = ehrbase_client.query_aql("SELECT * FROM EHR")

        assert result == {"rows": [{"col1": "val1"}]}
        mock_post.assert_called_once()


class TestCreateComposition:
    """Test creating composition."""

    @patch("app.ehrbase_client.requests.post")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_create_composition(self, mock_settings, mock_auth, mock_post):
        """Test successful composition creation."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_auth.return_value = {"Authorization": "Basic test"}

        mock_response = MagicMock()
        mock_response.json.return_value = {"compositionUid": "comp-123"}
        mock_post.return_value = mock_response

        composition_data = {"name": {"value": "Test Composition"}}
        result = ehrbase_client.create_composition(
            "ehr-123", "template-1", composition_data
        )

        assert result == {"compositionUid": "comp-123"}
        mock_post.assert_called_once()


class TestGetComposition:
    """Test retrieving composition."""

    @patch("app.ehrbase_client.requests.get")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_get_composition(self, mock_settings, mock_auth, mock_get):
        """Test successful composition retrieval."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_auth.return_value = {"Authorization": "Basic test"}

        mock_response = MagicMock()
        mock_response.json.return_value = {"uid": {"value": "comp-123"}}
        mock_get.return_value = mock_response

        result = ehrbase_client.get_composition("ehr-123", "comp-123")

        assert result == {"uid": {"value": "comp-123"}}
        mock_get.assert_called_once()


class TestListCompositionsForEhr:
    """Test listing compositions for EHR."""

    @patch("app.ehrbase_client.query_aql")
    def test_list_compositions(self, mock_query):
        """Test successful composition listing."""
        mock_query.return_value = {
            "rows": [{"uid": "comp-1"}, {"uid": "comp-2"}]
        }

        result = ehrbase_client.list_compositions_for_ehr("ehr-123")

        assert len(result) == 2
        assert result[0]["uid"] == "comp-1"


class TestEhrbaseClientErrorHandling:
    """Test EhrbaseClientError propagation for service failures."""

    @patch("app.ehrbase_client.requests.post")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_create_composition_server_error(
        self, mock_settings, mock_auth, mock_post
    ):
        """Server errors in create_composition raise EhrbaseClientError."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_auth.return_value = {"Authorization": "Basic test"}

        mock_post.side_effect = requests.ConnectionError("Connection refused")

        with pytest.raises(EhrbaseClientError) as exc_info:
            ehrbase_client.create_composition(
                "ehr-123", "template-1", {"name": {"value": "test"}}
            )

        assert "Failed to create clinical document" in str(exc_info.value)

    @patch("app.ehrbase_client.requests.get")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_get_composition_server_error(
        self, mock_settings, mock_auth, mock_get
    ):
        """Server errors in get_composition raise EhrbaseClientError."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_auth.return_value = {"Authorization": "Basic test"}

        mock_get.side_effect = requests.Timeout("Request timed out")

        with pytest.raises(EhrbaseClientError) as exc_info:
            ehrbase_client.get_composition("ehr-123", "comp-123")

        assert "Failed to retrieve clinical document" in str(exc_info.value)

    @patch("app.ehrbase_client.requests.post")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_query_aql_server_error(self, mock_settings, mock_auth, mock_post):
        """Server errors in query_aql raise EhrbaseClientError."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_auth.return_value = {"Authorization": "Basic test"}

        mock_post.side_effect = requests.ConnectionError("Connection refused")

        with pytest.raises(EhrbaseClientError) as exc_info:
            ehrbase_client.query_aql("SELECT * FROM EHR")

        assert "Failed to query clinical records" in str(exc_info.value)


class TestUploadTemplateValidation:
    """Test XML validation in upload_template."""

    def test_upload_template_invalid_xml(self):
        """Malformed XML is rejected before HTTP call."""
        with pytest.raises(ValueError) as exc_info:
            ehrbase_client.upload_template("<broken><xml")

        assert "Invalid template XML" in str(exc_info.value)

    def test_upload_template_empty_xml(self):
        """Empty string is rejected."""
        with pytest.raises(ValueError) as exc_info:
            ehrbase_client.upload_template("")

        assert "Invalid template XML" in str(exc_info.value)

    @patch("app.ehrbase_client.requests.post")
    @patch("app.ehrbase_client.get_auth_header")
    @patch("app.ehrbase_client.settings")
    def test_upload_template_valid_xml_server_error(
        self, mock_settings, mock_auth, mock_post
    ):
        """Valid XML that fails on server raises EhrbaseClientError."""
        mock_settings.EHRBASE_URL = "http://test-ehrbase:8080"
        mock_auth.return_value = {"Authorization": "Basic test"}

        mock_post.side_effect = requests.ConnectionError("Connection refused")

        with pytest.raises(EhrbaseClientError) as exc_info:
            ehrbase_client.upload_template("<template>valid</template>")

        assert "Failed to upload clinical template" in str(exc_info.value)
