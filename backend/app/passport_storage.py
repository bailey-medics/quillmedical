"""Choosing where passports are stored.

The composition point for :mod:`app.features.passport`. It sits here
rather than inside that package for one reason, and the reason is
enforced by a test: every module under ``app.features.passport`` must
import without ``app.config``, so that a passport on disk stays readable
by tooling that has no application around it — no settings, no database,
no FastAPI. See ``tests/test_features_import_boundary.py``.

So the package takes a bucket or a directory as an argument, and this
module is the only place that knows how that argument is chosen.

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

from functools import lru_cache
from pathlib import Path

from app.config import settings
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
