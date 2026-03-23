"""Image storage abstraction for the teaching feature.

Production: signed GCS URLs.
Local dev: filesystem URLs via a static-files endpoint.

Also provides ``download_bank_from_gcs`` for syncing question bank
YAML files from GCS to a local temporary directory.
"""

from __future__ import annotations

import logging
import re
import tempfile
from abc import ABC, abstractmethod
from pathlib import Path

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


# ------------------------------------------------------------------
# GCS helpers for sync
# ------------------------------------------------------------------

_SAFE_BANK_ID = re.compile(r"^[a-zA-Z0-9_-]+$")


def list_banks_in_gcs(bucket_name: str) -> list[str]:
    """List available question bank IDs in a GCS bucket.

    Looks for top-level directories under ``questions/`` that contain
    a ``config.yaml`` file.
    """
    from google.cloud import storage  # type: ignore[import-untyped]

    client = storage.Client()
    bucket = client.bucket(bucket_name)

    # List blobs matching questions/*/config.yaml
    prefix = "questions/"
    blobs = bucket.list_blobs(prefix=prefix, delimiter="/")

    # We need to consume the iterator to populate prefixes
    _ = list(blobs)

    bank_ids: list[str] = []
    for p in blobs.prefixes:
        # p looks like "questions/chest-xray-interpretation/"
        bank_id = p.removeprefix(prefix).rstrip("/")
        if bank_id and _SAFE_BANK_ID.match(bank_id):
            # Verify it has a config.yaml
            config_blob = bucket.blob(f"{prefix}{bank_id}/config.yaml")
            if config_blob.exists():
                bank_ids.append(bank_id)

    return sorted(bank_ids)


def download_bank_from_gcs(
    bucket_name: str,
    bank_id: str,
) -> Path:
    """Download question bank YAML files from GCS to a temp directory.

    Downloads only YAML files (``config.yaml`` and
    ``question_N/question.yaml``).  Images are NOT downloaded — they
    stay in the bucket and are served via signed URLs at runtime.

    Returns the path to the temporary directory.  The caller is
    responsible for cleaning it up (use ``shutil.rmtree`` or a
    context manager).
    """
    from google.cloud import storage  # type: ignore[import-untyped]

    if not bank_id or not _SAFE_BANK_ID.match(bank_id):
        msg = f"Invalid bank_id: {bank_id!r}"
        raise ValueError(msg)

    client = storage.Client()
    bucket = client.bucket(bucket_name)

    prefix = f"questions/{bank_id}/"
    blobs = list(bucket.list_blobs(prefix=prefix))

    if not blobs:
        msg = f"No content found in gs://{bucket_name}/{prefix}"
        raise FileNotFoundError(msg)

    tmp_dir = Path(tempfile.mkdtemp(prefix=f"bank_{bank_id}_"))
    bank_dir = tmp_dir / bank_id
    bank_dir.mkdir()

    yaml_count = 0
    for blob in blobs:
        # Only download YAML files
        rel_path = blob.name.removeprefix(prefix)
        if not rel_path:
            continue
        if not rel_path.endswith((".yaml", ".yml")):
            continue

        local_path = bank_dir / rel_path
        local_path.parent.mkdir(parents=True, exist_ok=True)
        blob.download_to_filename(str(local_path))
        yaml_count += 1

    logger.info(
        "Downloaded %d YAML files for bank '%s' from GCS to %s",
        yaml_count,
        bank_id,
        bank_dir,
    )
    return bank_dir


#: Type alias for the image inventory passed to validation.
#: Maps item directory names (e.g. ``question_001``) to the set of
#: image filenames present (e.g. ``{"image_1.png", "image_2.jpg"}``).
ImageInventory = dict[str, set[str]]


def list_bank_images_in_gcs(
    bucket_name: str,
    bank_id: str,
) -> ImageInventory:
    """Build an image inventory for a question bank from GCS.

    Scans all blobs under ``questions/<bank_id>/`` and returns a
    mapping of item directory names to the set of image filenames
    found.  Only files with allowed image extensions are included.
    """
    from google.cloud import storage  # type: ignore[import-untyped]

    if not bank_id or not _SAFE_BANK_ID.match(bank_id):
        msg = f"Invalid bank_id: {bank_id!r}"
        raise ValueError(msg)

    client = storage.Client()
    bucket = client.bucket(bucket_name)

    prefix = f"questions/{bank_id}/"
    blobs = bucket.list_blobs(prefix=prefix)

    allowed = {".png", ".jpg", ".jpeg", ".webp"}
    inventory: ImageInventory = {}

    for blob in blobs:
        rel_path = blob.name.removeprefix(prefix)
        if not rel_path or "/" not in rel_path:
            continue
        parts = rel_path.split("/", 1)
        item_dir_name = parts[0]
        filename = parts[1]

        # Only include image files (not nested subdirectories)
        if "/" in filename:
            continue
        ext = Path(filename).suffix.lower()
        if ext not in allowed:
            continue

        inventory.setdefault(item_dir_name, set()).add(filename)

    logger.info(
        "GCS image inventory for bank '%s': %d items, %d total images",
        bank_id,
        len(inventory),
        sum(len(v) for v in inventory.values()),
    )
    return inventory
