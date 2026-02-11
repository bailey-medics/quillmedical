"""Tests for patient records file operations (legacy file-based system)."""

from pathlib import Path
from unittest.mock import MagicMock, patch

from app.patient_records import (
    ensure_repo_exists,
    patient_repo_name,
    read_file,
    write_file,
)


class TestPatientRecords:
    """Test legacy file-based patient record operations."""

    def test_patient_repo_name(self):
        """Test patient repo name generation."""
        assert patient_repo_name("abc123") == "patient-abc123"
        assert (
            patient_repo_name("patient/with/slashes") == "patient-patient-with-slashes"
        )
        assert patient_repo_name("test@email.com") == "patient-test-email-com"
        assert patient_repo_name("test_user-123") == "patient-test_user-123"

    def test_patient_repo_name_special_chars(self):
        """Test patient repo name with various special characters."""
        # Test that only alphanumeric, dash, and underscore are preserved
        assert patient_repo_name("test!@#$%") == "patient-test-----"
        assert patient_repo_name("user name") == "patient-user-name"

    @patch("app.patient_records.PATIENT_DATA_ROOT")
    def test_ensure_repo_exists(self, mock_root):
        """Test repository folder creation."""
        mock_path = MagicMock(spec=Path)
        mock_root.__truediv__ = MagicMock(return_value=mock_path)

        ensure_repo_exists("test-repo")

        mock_path.mkdir.assert_called_once_with(parents=True, exist_ok=True)

    @patch("app.patient_records.PATIENT_DATA_ROOT")
    def test_write_file(self, mock_root):
        """Test file writing functionality."""
        mock_repo_path = MagicMock(spec=Path)
        mock_file_path = MagicMock(spec=Path)
        mock_file_path.__str__ = MagicMock(return_value="/fake/path/test.txt")
        mock_repo_path.__truediv__ = MagicMock(return_value=mock_file_path)
        mock_root.__truediv__ = MagicMock(return_value=mock_repo_path)

        result = write_file("test-repo", "test.txt", "test content")

        mock_file_path.parent.mkdir.assert_called_once_with(parents=True, exist_ok=True)
        mock_file_path.write_text.assert_called_once_with(
            "test content", encoding="utf-8"
        )
        assert result == {"path": "/fake/path/test.txt"}

    @patch("app.patient_records.PATIENT_DATA_ROOT")
    def test_read_file_exists(self, mock_root):
        """Test reading existing file."""
        mock_repo_path = MagicMock(spec=Path)
        mock_file_path = MagicMock(spec=Path)
        mock_file_path.exists.return_value = True
        mock_file_path.read_text.return_value = "file content"
        mock_repo_path.__truediv__ = MagicMock(return_value=mock_file_path)
        mock_root.__truediv__ = MagicMock(return_value=mock_repo_path)

        content = read_file("test-repo", "test.txt")

        assert content == "file content"
        mock_file_path.exists.assert_called_once()
        mock_file_path.read_text.assert_called_once()

    @patch("app.patient_records.PATIENT_DATA_ROOT")
    def test_read_file_not_exists(self, mock_root):
        """Test reading non-existent file returns None."""
        mock_repo_path = MagicMock(spec=Path)
        mock_file_path = MagicMock(spec=Path)
        mock_file_path.exists.return_value = False
        mock_repo_path.__truediv__ = MagicMock(return_value=mock_file_path)
        mock_root.__truediv__ = MagicMock(return_value=mock_repo_path)

        content = read_file("test-repo", "missing.txt")

        assert content is None
        mock_file_path.exists.assert_called_once()
