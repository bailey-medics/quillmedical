"""Tests for teaching storage backends."""

from __future__ import annotations

import shutil
from unittest.mock import MagicMock, patch

import google.cloud as _gc
import pytest

from app.features.teaching.storage import (
    GCSStorageBackend,
    LocalStorageBackend,
    download_bank_from_gcs,
    get_storage_backend,
    list_bank_images_in_gcs,
    list_banks_in_gcs,
)


def _mock_gcs_client(
    mock_client: MagicMock,
) -> MagicMock:
    """Build a mock google.cloud.storage module with the given client.

    Patches both ``sys.modules`` and the ``google.cloud.storage``
    attribute so that ``from google.cloud import storage`` resolves
    to the mock regardless of previous import ordering.
    """
    mock_storage = MagicMock()
    mock_storage.Client.return_value = mock_client
    return mock_storage


class TestLocalStorageBackend:
    """LocalStorageBackend serves images from a local URL base."""

    def test_url_construction(self) -> None:
        backend = LocalStorageBackend("http://localhost:8000/static")
        url = backend.get_image_url("my-bank", "question_1", "image_1.png")
        assert url == (
            "http://localhost:8000/static/questions/my-bank"
            "/question_1/image_1.png"
        )

    def test_strips_trailing_slash(self) -> None:
        backend = LocalStorageBackend("http://localhost:8000/static/")
        url = backend.get_image_url("my-bank", "question_1", "image_1.png")
        assert url.startswith("http://localhost:8000/static/questions/")

    def test_fallback_static(self) -> None:
        backend = LocalStorageBackend("/static")
        url = backend.get_image_url("bank", "q1", "img.png")
        assert url == "/static/questions/bank/q1/img.png"


class TestGCSStorageBackend:
    """GCSStorageBackend generates signed URLs (mocked)."""

    @patch("app.features.teaching.storage.GCSStorageBackend.__init__")
    def test_url_calls_signed_url(self, mock_init: MagicMock) -> None:
        mock_init.return_value = None
        backend = GCSStorageBackend.__new__(GCSStorageBackend)

        mock_blob = MagicMock()
        mock_blob.generate_signed_url.return_value = (
            "https://storage.googleapis.com/signed-url"
        )
        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob
        backend._bucket = mock_bucket  # type: ignore[attr-defined]
        backend._sa_email = "sa@project.iam.gserviceaccount.com"  # type: ignore[attr-defined]

        mock_credentials = MagicMock()
        mock_credentials.token = "fake-token"
        backend._credentials = mock_credentials  # type: ignore[attr-defined]

        url = backend.get_image_url("bank-id", "question_1", "image_1.png")
        assert url == "https://storage.googleapis.com/signed-url"
        mock_bucket.blob.assert_called_once_with(
            "questions/bank-id/question_1/image_1.png"
        )
        mock_blob.generate_signed_url.assert_called_once()
        call_kwargs = mock_blob.generate_signed_url.call_args.kwargs
        assert call_kwargs["version"] == "v4"
        assert call_kwargs["service_account_email"] == (
            "sa@project.iam.gserviceaccount.com"
        )
        assert call_kwargs["access_token"] == "fake-token"


class TestGetStorageBackend:
    """Factory function returns correct backend based on config."""

    @patch("app.features.teaching.storage.settings")
    def test_returns_local_when_no_bucket(
        self, mock_settings: MagicMock
    ) -> None:
        mock_settings.TEACHING_GCS_BUCKET = ""
        mock_settings.TEACHING_IMAGES_BASE_URL = "http://localhost:8000/static"
        backend = get_storage_backend()
        assert isinstance(backend, LocalStorageBackend)

    @patch("app.features.teaching.storage.settings")
    def test_fallback_to_static(self, mock_settings: MagicMock) -> None:
        mock_settings.TEACHING_GCS_BUCKET = ""
        mock_settings.TEACHING_IMAGES_BASE_URL = ""
        backend = get_storage_backend()
        assert isinstance(backend, LocalStorageBackend)


class TestListBanksInGcs:
    """list_banks_in_gcs discovers bank IDs from GCS prefixes."""

    def test_finds_banks_with_config(self) -> None:
        mock_client = MagicMock()
        mock_bucket = MagicMock()
        mock_client.bucket.return_value = mock_bucket

        # Simulate blobs iterator with prefixes
        mock_blobs = MagicMock()
        mock_blobs.__iter__ = MagicMock(return_value=iter([]))
        mock_blobs.prefixes = [
            "questions/chest-xray/",
            "questions/ecg-basics/",
        ]
        mock_bucket.list_blobs.return_value = mock_blobs

        # Both banks have config.yaml
        config_blob = MagicMock()
        config_blob.exists.return_value = True
        mock_bucket.blob.return_value = config_blob

        ms = _mock_gcs_client(mock_client)
        with patch.object(_gc, "storage", ms, create=True):
            result = list_banks_in_gcs("test-bucket")
        assert result == ["chest-xray", "ecg-basics"]

    def test_filters_banks_without_config(self) -> None:
        mock_client = MagicMock()
        mock_bucket = MagicMock()
        mock_client.bucket.return_value = mock_bucket

        mock_blobs = MagicMock()
        mock_blobs.__iter__ = MagicMock(return_value=iter([]))
        mock_blobs.prefixes = [
            "questions/has-config/",
            "questions/no-config/",
        ]
        mock_bucket.list_blobs.return_value = mock_blobs

        def blob_exists_side_effect(name: str) -> MagicMock:
            blob = MagicMock()
            blob.exists.return_value = "has-config" in name
            return blob

        mock_bucket.blob.side_effect = blob_exists_side_effect

        ms = _mock_gcs_client(mock_client)
        with patch.object(_gc, "storage", ms, create=True):
            result = list_banks_in_gcs("test-bucket")
        assert result == ["has-config"]


class TestDownloadBankFromGcs:
    """download_bank_from_gcs downloads YAML files to a temp dir."""

    def test_downloads_yaml_only(self) -> None:
        mock_client = MagicMock()
        mock_bucket = MagicMock()
        mock_client.bucket.return_value = mock_bucket

        # Create mock blobs — mix of YAML and image files
        yaml_blob = MagicMock()
        yaml_blob.name = "questions/test-bank/config.yaml"

        q1_yaml = MagicMock()
        q1_yaml.name = "questions/test-bank/question_1/question.yaml"

        image_blob = MagicMock()
        image_blob.name = "questions/test-bank/question_1/image_1.png"

        mock_bucket.list_blobs.return_value = [
            yaml_blob,
            q1_yaml,
            image_blob,
        ]

        ms = _mock_gcs_client(mock_client)
        with patch.object(_gc, "storage", ms, create=True):
            result = download_bank_from_gcs("test-bucket", "test-bank")
        try:
            assert result.name == "test-bank"
            assert result.is_dir()
            # Only YAML blobs downloaded (2 calls), image skipped
            assert yaml_blob.download_to_filename.call_count == 1
            assert q1_yaml.download_to_filename.call_count == 1
            assert image_blob.download_to_filename.call_count == 0
        finally:
            shutil.rmtree(result.parent, ignore_errors=True)

    def test_empty_bucket_raises(self) -> None:
        mock_client = MagicMock()
        mock_bucket = MagicMock()
        mock_client.bucket.return_value = mock_bucket
        mock_bucket.list_blobs.return_value = []

        ms = _mock_gcs_client(mock_client)
        with patch.object(_gc, "storage", ms, create=True):
            with pytest.raises(FileNotFoundError, match="No content found"):
                download_bank_from_gcs("test-bucket", "missing-bank")

    def test_invalid_bank_id_raises(self) -> None:
        with pytest.raises(ValueError, match="Invalid bank_id"):
            download_bank_from_gcs("test-bucket", "../escape")

    def test_empty_bank_id_raises(self) -> None:
        with pytest.raises(ValueError, match="Invalid bank_id"):
            download_bank_from_gcs("test-bucket", "")


class TestListBankImagesInGcs:
    """list_bank_images_in_gcs builds image inventory from GCS."""

    def test_builds_inventory(self) -> None:
        mock_client = MagicMock()
        mock_bucket = MagicMock()
        mock_client.bucket.return_value = mock_bucket

        blob1 = MagicMock()
        blob1.name = "questions/my-bank/question_001/image_1.png"
        blob2 = MagicMock()
        blob2.name = "questions/my-bank/question_001/image_2.jpg"
        blob3 = MagicMock()
        blob3.name = "questions/my-bank/question_002/image_1.webp"
        # YAML files should be ignored
        yaml_blob = MagicMock()
        yaml_blob.name = "questions/my-bank/question_001/question.yaml"
        # Config at root should be ignored
        config_blob = MagicMock()
        config_blob.name = "questions/my-bank/config.yaml"

        mock_bucket.list_blobs.return_value = [
            blob1,
            blob2,
            blob3,
            yaml_blob,
            config_blob,
        ]

        ms = _mock_gcs_client(mock_client)
        with patch.object(_gc, "storage", ms, create=True):
            result = list_bank_images_in_gcs("test-bucket", "my-bank")

        assert result == {
            "question_001": {"image_1.png", "image_2.jpg"},
            "question_002": {"image_1.webp"},
        }

    def test_empty_bucket_returns_empty(self) -> None:
        mock_client = MagicMock()
        mock_bucket = MagicMock()
        mock_client.bucket.return_value = mock_bucket
        mock_bucket.list_blobs.return_value = []

        ms = _mock_gcs_client(mock_client)
        with patch.object(_gc, "storage", ms, create=True):
            result = list_bank_images_in_gcs("test-bucket", "empty-bank")

        assert result == {}

    def test_invalid_bank_id_raises(self) -> None:
        with pytest.raises(ValueError, match="Invalid bank_id"):
            list_bank_images_in_gcs("test-bucket", "../escape")
