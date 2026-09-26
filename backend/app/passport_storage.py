"""Choosing where passports are stored.

The composition point for :mod:`app.features.passport`. It sits here
rather than inside that package for one reason, and the reason is
enforced by a test: every module under ``app.features.passport`` must
import without ``app.config``, so that a passport on disk stays readable
by tooling that has no application around it — no settings, no database,
no FastAPI. See ``tests/test_features_import_boundary.py``.

So the package takes a bucket or a directory as an argument, and this
module is the only org_unit that knows how that argument is chosen.

**One setting decides it.** ``PASSPORT_GCS_BUCKET`` set means the bucket
backend; unset means a local directory under ``PASSPORT_LOCAL_ROOT``.
There is deliberately no second ``PASSPORT_STORAGE_BACKEND`` naming
"local" or "gcs", even though the plan first called for one and the
teaching feature has its equivalent: ``TEACHING_STORAGE_BACKEND`` is set
in ``compose.dev.yml``, ``compose.ci.yml`` and ``infra/main.tf`` and read
by nothing, because ``get_storage_backend()`` branches on whether the
bucket is set. A deployment could set it to "local" and still write to
the bucket. A switch that looks like a switch and is not is worse than no
switch at all, so the passport has only the bucket name.
"""

from __future__ import annotations

from datetime import date
from functools import lru_cache
from pathlib import Path

from app.config import settings
from app.features.passport import archive
from app.features.passport.blobs import BlobStore
from app.features.passport.gcs_store import (
    GcsBlobStore,
    build_blob_store,
    build_store,
)
from app.features.passport.store import LocalPassportStore, PassportStore


def using_bucket() -> bool:
    """Whether passports are stored in Cloud Storage.

    Returns:
        True when a bucket is configured. The single question the choice
        of backend turns on, named once so nothing re-derives it.
    """
    return bool(settings.PASSPORT_GCS_BUCKET)


@lru_cache(maxsize=1)
def get_passport_store() -> PassportStore:
    """The passport store this deployment writes to.

    Cached, because building the bucket backend authenticates and there
    is no per-request state to keep: the store holds a bucket handle, and
    every operation downloads what it needs and throws it away. The local
    backend holds only a path.

    Returns:
        The bucket backend when ``PASSPORT_GCS_BUCKET`` is set, otherwise
        a local store under ``PASSPORT_LOCAL_ROOT``.
    """
    bucket = settings.PASSPORT_GCS_BUCKET

    if bucket:
        return build_store(bucket)

    return LocalPassportStore(Path(settings.PASSPORT_LOCAL_ROOT))


@lru_cache(maxsize=1)
def get_blob_store() -> BlobStore | GcsBlobStore:
    """Where evidence blobs go, matching the passport store.

    Always the same backend as :func:`get_passport_store`, because a
    passport and its evidence have to move together: a record naming a
    hash the store cannot resolve is a broken reference, and splitting
    them across backends would produce exactly that.

    Returns:
        The bucket blob store when a bucket is configured, otherwise a
        local one rooted at the same directory as the passports.
    """
    bucket = settings.PASSPORT_GCS_BUCKET

    if bucket:
        return build_blob_store(bucket)

    return BlobStore(Path(settings.PASSPORT_LOCAL_ROOT))


def reset_caches() -> None:
    """Forget the built stores, so the next call rebuilds them.

    For tests that change the settings between cases. Production never
    calls this: the configuration does not change while the process is
    running, which is the assumption the caching rests on.
    """
    get_passport_store.cache_clear()
    get_blob_store.cache_clear()


def archive_passport(
    passport_id: str,
    day: date,
    *,
    archive_bucket: str | None,
    archive_root: str | None,
) -> list[str]:
    """Move one passport, evidence included, into the archive.

    Only the admin command ``delete-passport`` calls this. The archive
    location is passed in rather than read from settings, because only the
    admin job is given one: the web application has no archive to write to.

    Args:
        passport_id: Whose passport.
        day: The date to file it under, as ``deleted/<day>/``.
        archive_bucket: The archive bucket, required when passports live in
            a bucket.
        archive_root: The archive directory for the local backend. Defaults
            to a ``-deleted`` sibling of ``PASSPORT_LOCAL_ROOT``.

    Returns:
        Every object or file moved.

    Raises:
        ValueError: If passports live in a bucket and no archive bucket is
            named. Refusing is the point: with nowhere to copy to, the only
            way to delete would be to destroy.
    """
    prefix = f"deleted/{day.isoformat()}"
    source_bucket = settings.PASSPORT_GCS_BUCKET

    if source_bucket:
        if not archive_bucket:
            raise ValueError(
                "PASSPORT_ARCHIVE_GCS_BUCKET is not set, so there is nowhere "
                "to archive the passport to."
            )
        return archive.archive_bucket(
            archive.build_bucket(source_bucket),
            archive.build_bucket(archive_bucket),
            passport_id,
            prefix,
        )

    root = Path(settings.PASSPORT_LOCAL_ROOT)
    destination = (
        Path(archive_root) if archive_root else Path(f"{root}-deleted")
    )
    return archive.archive_local(root, destination / prefix, passport_id)
