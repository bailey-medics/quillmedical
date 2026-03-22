"""Tests for teaching storage backends."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.features.teaching.storage import (
    GCSStorageBackend,
    LocalStorageBackend,
    get_storage_backend,
)


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

        url = backend.get_image_url("bank-id", "question_1", "image_1.png")
        assert url == "https://storage.googleapis.com/signed-url"
        mock_bucket.blob.assert_called_once_with(
            "questions/bank-id/question_1/image_1.png"
        )


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
