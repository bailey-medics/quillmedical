"""Image storage abstraction for the teaching feature.

Production: signed GCS URLs.
Local dev: filesystem URLs via a static-files endpoint.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod

from app.config import settings

logger = logging.getLogger(__name__)


class StorageBackend(ABC):
    """Abstract image-serving backend."""

    @abstractmethod
    def get_image_url(
        self, bank_id: str, item_folder: str, filename: str
    ) -> str:
        """Return a URL the frontend can use to load an image."""


class LocalStorageBackend(StorageBackend):
    """Serve images from a local directory (dev only)."""

    def __init__(self, base_url: str) -> None:
        self._base = base_url.rstrip("/")

    def get_image_url(
        self, bank_id: str, item_folder: str, filename: str
    ) -> str:
        return f"{self._base}/questions/{bank_id}/{item_folder}/{filename}"


class GCSStorageBackend(StorageBackend):
    """Generate signed GCS URLs (production)."""

    def __init__(self, bucket_name: str) -> None:
        # Lazy import — only needed in production
        from google.cloud import storage  # type: ignore[import-untyped]

        self._client = storage.Client()
        self._bucket = self._client.bucket(bucket_name)

    def get_image_url(
        self, bank_id: str, item_folder: str, filename: str
    ) -> str:
        import datetime as dt

        blob = self._bucket.blob(
            f"questions/{bank_id}/{item_folder}/{filename}"
        )
        return blob.generate_signed_url(
            expiration=dt.timedelta(minutes=15),
            method="GET",
        )


def get_storage_backend() -> StorageBackend:
    """Return the appropriate storage backend based on config."""
    bucket = settings.TEACHING_GCS_BUCKET
    base_url = settings.TEACHING_IMAGES_BASE_URL

    if bucket:
        return GCSStorageBackend(bucket)

    if base_url:
        return LocalStorageBackend(base_url)

    # Fallback for local dev — images served from /static/questions/
    return LocalStorageBackend("/static")
