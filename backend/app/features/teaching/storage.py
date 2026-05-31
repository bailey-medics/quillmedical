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
from typing import Any

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
    """Generate signed GCS URLs (production).

    On Cloud Run the default compute credentials cannot sign
    directly (no private key).  We pass ``service_account_email``
    and ``access_token`` so the library uses the IAM ``signBlob``
    API instead.
    """

    def __init__(self, bucket_name: str) -> None:
        from google.auth import default  # type: ignore[import-untyped]
        from google.auth.transport import (
            requests as auth_requests,  # type: ignore[import-untyped]
        )
        from google.cloud import storage  # type: ignore[import-untyped]

        self._credentials, _project = default()
        self._client = storage.Client(credentials=self._credentials)
        self._bucket = self._client.bucket(bucket_name)

        # Resolve the SA email for IAM-based signing.
        # Compute-engine credentials expose service_account_email
        # but return "default" until refreshed.
        auth_req = auth_requests.Request()
        self._credentials.refresh(auth_req)
        self._sa_email: str = self._credentials.service_account_email

    def get_image_url(
        self, bank_id: str, item_folder: str, filename: str
    ) -> str:
        import datetime as dt

        from google.auth.transport import (
            requests as auth_requests,  # type: ignore[import-untyped]
        )

        blob = self._bucket.blob(
            f"questions/{bank_id}/{item_folder}/{filename}"
        )

        # Ensure the access token is fresh
        if not self._credentials.token:
            self._credentials.refresh(auth_requests.Request())

        return blob.generate_signed_url(
            version="v4",
            expiration=dt.timedelta(minutes=15),
            method="GET",
            service_account_email=self._sa_email,
            access_token=self._credentials.token,
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


def _has_assessment_config(directory: Path) -> bool:
    """Check if a directory contains assessment.yaml or config.yaml."""
    return (directory / "assessment.yaml").is_file() or (
        directory / "config.yaml"
    ).is_file()


def discover_local_banks(base_path: str) -> list[str]:
    """Discover question bank IDs from the local teaching-repos layout.

    Supports three directory structures:
    - Modules (current): ``<base>/<repo>/modules/<module_id>/assessment/``
    - Nested (legacy): ``<base>/<repo>/questions/<bank_id>/``
    - Flat (legacy): ``<base>/<bank_id>/``

    Looks for ``assessment.yaml`` or ``config.yaml`` in the bank directory.
    Returns a sorted list of unique bank IDs.
    """
    base = Path(base_path)
    if not base.is_dir():
        return []

    bank_ids: set[str] = set()

    for child in base.iterdir():
        if not child.is_dir():
            continue
        # Check flat layout: <base>/<bank_id>/{assessment,config}.yaml
        if _has_assessment_config(child):
            bank_ids.add(child.name)
            continue
        # Check modules layout: <base>/<repo>/modules/<module_id>/assessment/
        modules_dir = child / "modules"
        if modules_dir.is_dir():
            for module_dir in modules_dir.iterdir():
                if not module_dir.is_dir():
                    continue
                assessment_dir = module_dir / "assessment"
                if assessment_dir.is_dir() and _has_assessment_config(
                    assessment_dir
                ):
                    bank_ids.add(module_dir.name)
        # Check legacy nested layout: <base>/<repo>/questions/<bank_id>/
        questions_dir = child / "questions"
        if questions_dir.is_dir():
            for bank_dir in questions_dir.iterdir():
                if bank_dir.is_dir() and _has_assessment_config(bank_dir):
                    bank_ids.add(bank_dir.name)

    return sorted(bank_ids)


def resolve_local_bank(base_path: str, bank_id: str) -> Path | None:
    """Resolve a bank_id to its filesystem path.

    Supports three directory structures:
    - Modules (current): ``<base>/<repo>/modules/<bank_id>/assessment/``
    - Nested (legacy): ``<base>/<repo>/questions/<bank_id>/``
    - Flat (legacy): ``<base>/<bank_id>/``

    Returns the path to the directory containing assessment content
    (question directories and assessment/config YAML), or None if not found.
    """
    base = Path(base_path)
    if not base.is_dir():
        return None

    # Check flat layout first
    flat = base / bank_id
    if flat.is_dir() and _has_assessment_config(flat):
        return flat

    # Check repo subdirectories
    for child in base.iterdir():
        if not child.is_dir():
            continue
        # Check modules layout: <base>/<repo>/modules/<bank_id>/assessment/
        assessment_dir = child / "modules" / bank_id / "assessment"
        if assessment_dir.is_dir() and _has_assessment_config(assessment_dir):
            return assessment_dir
        # Check legacy nested layout: <base>/<repo>/questions/<bank_id>/
        nested = child / "questions" / bank_id
        if nested.is_dir() and _has_assessment_config(nested):
            return nested

    return None


def resolve_module_dir(base_path: str, module_id: str) -> Path | None:
    """Resolve a module_id to its top-level module directory.

    Returns the path to ``<repo>/modules/<module_id>/`` which contains
    ``module.yaml``, ``assessment/``, and optionally ``learning/``.
    Only works for the modules layout.
    """
    base = Path(base_path)
    if not base.is_dir():
        return None

    for child in base.iterdir():
        if not child.is_dir():
            continue
        module_dir = child / "modules" / module_id
        if module_dir.is_dir() and (module_dir / "module.yaml").is_file():
            return module_dir

    return None


def has_learning_content(base_path: str, module_id: str) -> bool:
    """Check if a module has learning content (content.mdx).

    Works for both local filesystem and GCS.
    """
    # Try GCS first if configured
    bucket = settings.TEACHING_GCS_BUCKET
    if bucket:
        return has_learning_content_gcs(bucket, module_id)
    # Fall back to local filesystem
    module_dir = resolve_module_dir(base_path, module_id)
    if module_dir is None:
        return False
    return (module_dir / "learning" / "content.mdx").is_file()


def has_learning_content_gcs(bucket_name: str, module_id: str) -> bool:
    """Check if a module has learning content in GCS."""
    from google.cloud import storage  # type: ignore[import-untyped]

    if not module_id or not _SAFE_BANK_ID.match(module_id):
        return False

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(f"learning/{module_id}/content.mdx")
    return blob.exists()


def download_learning_mdx_from_gcs(
    bucket_name: str, module_id: str
) -> str | None:
    """Download learning/content.mdx from GCS and return as string."""
    from google.cloud import storage  # type: ignore[import-untyped]

    if not module_id or not _SAFE_BANK_ID.match(module_id):
        return None

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(f"learning/{module_id}/content.mdx")
    if not blob.exists():
        return None
    return blob.download_as_text(encoding="utf-8")


def download_module_yaml_from_gcs(
    bucket_name: str, module_id: str
) -> dict[str, Any] | None:
    """Download modules/<module_id>/module.yaml from GCS."""
    import yaml  # type: ignore[import-untyped]
    from google.cloud import storage  # type: ignore[import-untyped]

    if not module_id or not _SAFE_BANK_ID.match(module_id):
        return None

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(f"modules/{module_id}/module.yaml")
    if not blob.exists():
        return None
    content = blob.download_as_text(encoding="utf-8")
    return yaml.safe_load(content) or {}  # type: ignore[no-any-return]


def get_learning_image_url_gcs(
    bucket_name: str, module_id: str, filename: str
) -> str:
    """Generate a signed URL for a learning image in GCS."""
    import datetime as dt

    from google.auth import default  # type: ignore[import-untyped]
    from google.auth.transport import (
        requests as auth_requests,  # type: ignore[import-untyped]
    )
    from google.cloud import storage  # type: ignore[import-untyped]

    if not module_id or not _SAFE_BANK_ID.match(module_id):
        msg = f"Invalid module_id: {module_id!r}"
        raise ValueError(msg)
    if not filename or not _SAFE_BANK_ID.match(filename.rsplit(".", 1)[0]):
        msg = f"Invalid filename: {filename!r}"
        raise ValueError(msg)

    credentials, _project = default()
    client = storage.Client(credentials=credentials)
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(f"learning/{module_id}/images/{filename}")

    auth_req = auth_requests.Request()
    credentials.refresh(auth_req)
    sa_email: str = credentials.service_account_email

    return blob.generate_signed_url(
        version="v4",
        expiration=dt.timedelta(minutes=15),
        method="GET",
        service_account_email=sa_email,
        access_token=credentials.token,
    )


def list_banks_in_gcs(bucket_name: str) -> list[str]:
    """List available question bank IDs in a GCS bucket.

    Looks for top-level directories under ``questions/`` that contain
    an ``assessment.yaml`` or ``config.yaml`` file.
    """
    from google.cloud import storage  # type: ignore[import-untyped]

    client = storage.Client()
    bucket = client.bucket(bucket_name)

    # List top-level directories under questions/
    prefix = "questions/"
    blobs = bucket.list_blobs(prefix=prefix, delimiter="/")

    # We need to consume the iterator to populate prefixes
    _ = list(blobs)

    bank_ids: list[str] = []
    for p in blobs.prefixes:
        # p looks like "questions/chest-xray-interpretation/"
        bank_id = p.removeprefix(prefix).rstrip("/")
        if bank_id and _SAFE_BANK_ID.match(bank_id):
            # Verify it has assessment.yaml or config.yaml
            assessment_blob = bucket.blob(f"{prefix}{bank_id}/assessment.yaml")
            config_blob = bucket.blob(f"{prefix}{bank_id}/config.yaml")
            if assessment_blob.exists() or config_blob.exists():
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
#: image filenames present (e.g. ``{"wli.png", "nbi.png"}``).
ImageInventory = dict[str, set[str]]


def get_module_status_from_gcs(
    bucket_name: str,
    bank_id: str,
) -> str | None:
    """Read module status from module.yaml in GCS.

    Returns the status string ('draft', 'live', 'retired') or None
    if not found.
    """
    import yaml
    from google.cloud import storage  # type: ignore[import-untyped]

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(f"modules/{bank_id}/module.yaml")

    if not blob.exists():
        return None

    content = blob.download_as_text()
    try:
        data = yaml.safe_load(content)
        if isinstance(data, dict):
            status = data.get("status")
            if isinstance(status, str):
                return status
    except yaml.YAMLError:
        pass
    return None


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
        if not rel_path:
            continue

        # Root-level files (e.g. certificate-blank.png)
        if "/" not in rel_path:
            ext = Path(rel_path).suffix.lower()
            if ext in allowed:
                inventory.setdefault(".", set()).add(rel_path)
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


def download_module_from_gcs(
    bucket_name: str,
    bank_id: str,
) -> Path | None:
    """Download a full module directory from GCS for tooling validation.

    Reconstructs the module directory layout that the teaching-tooling
    validator expects::

        <tmp>/<bank_id>/
            module.yaml
            assessment/
                assessment.yaml
                question_001/question.yaml
                ...
            learning/
                content.mdx (if present)

    Returns the path to the reconstructed module directory, or None
    if module.yaml doesn't exist in GCS.  Caller must clean up with
    ``shutil.rmtree(path.parent)``.
    """
    from google.cloud import storage  # type: ignore[import-untyped]

    if not bank_id or not _SAFE_BANK_ID.match(bank_id):
        return None

    client = storage.Client()
    bucket = client.bucket(bucket_name)

    # Check module.yaml exists
    module_blob = bucket.blob(f"modules/{bank_id}/module.yaml")
    if not module_blob.exists():
        return None

    tmp_dir = Path(tempfile.mkdtemp(prefix=f"module_{bank_id}_"))
    module_dir = tmp_dir / bank_id
    module_dir.mkdir()

    # Download module.yaml
    module_yaml_path = module_dir / "module.yaml"
    module_blob.download_to_filename(str(module_yaml_path))

    # Download assessment content (YAML + image filenames as empty files)
    assessment_dir = module_dir / "assessment"
    assessment_dir.mkdir()

    assessment_prefix = f"questions/{bank_id}/"
    for blob in bucket.list_blobs(prefix=assessment_prefix):
        rel_path = blob.name.removeprefix(assessment_prefix)
        if not rel_path:
            continue
        local_path = assessment_dir / rel_path
        local_path.parent.mkdir(parents=True, exist_ok=True)

        if rel_path.endswith((".yaml", ".yml")):
            # Download YAML content
            blob.download_to_filename(str(local_path))
        else:
            # Create empty placeholder for image files so existence
            # checks pass (actual images served via signed URLs)
            local_path.write_bytes(b"")

    # Download learning content if present
    learning_prefix = f"learning/{bank_id}/"
    learning_blobs = list(bucket.list_blobs(prefix=learning_prefix))
    if learning_blobs:
        learning_dir = module_dir / "learning"
        learning_dir.mkdir()
        for blob in learning_blobs:
            rel_path = blob.name.removeprefix(learning_prefix)
            if not rel_path:
                continue
            local_path = learning_dir / rel_path
            local_path.parent.mkdir(parents=True, exist_ok=True)
            blob.download_to_filename(str(local_path))

    return module_dir
