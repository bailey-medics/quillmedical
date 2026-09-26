"""Moving a whole passport out of the store, for deleting a test passport.

The only way a passport ever leaves its store, and deliberately not reachable
from the web application: the admin command ``delete-passport`` in
``backend/scripts/admin_cli.py`` is its one caller, and that command acts only
on holders named in Terraform. See Phases 6 to 9 of
``docs/docs/plans/2026-09-26-passport-specialties-plan.md``.

**Copy, check, then remove.** Everything is copied to the destination first,
each copy is checked against its original, and only then are the originals
removed. A failure part way through leaves the passport where it was, with at
worst a partial copy in the archive, which clears itself.

Functions rather than methods on the stores, because the two backends archive
to different kinds of place, a directory or a bucket, and because a passport's
evidence blobs belong to the blob stores: the repository and its evidence sit
under one shard on both backends, so one function per backend moves both.
"""

from __future__ import annotations

import shutil
from collections.abc import Iterable
from pathlib import Path
from typing import Any, Protocol

from . import paths
from .gcs_store import PREFIX
from .store import PassportExistsError, PassportNotFoundError, StoreError


class ArchiveError(StoreError):
    """A copy did not match its original, so nothing was removed."""


def archive_local(
    root: Path, destination: Path, passport_id: str
) -> list[str]:
    """Move one passport's directory, evidence included, under *destination*.

    Args:
        root: The store root, as :class:`~.store.LocalPassportStore` uses.
        destination: Where archived passports go, such as
            ``<archive root>/deleted/2026-09-26``.
        passport_id: Whose passport.

    Returns:
        Every file moved, relative to the passport's directory, sorted.

    Raises:
        PassportNotFoundError: If there is no such passport.
        PassportExistsError: If the destination already holds it.
        ArchiveError: If the copy differs from the original. The original
            is left untouched and the partial copy removed.
    """
    shard = paths.shard(passport_id)
    source = root / shard
    target = destination / shard

    if not source.is_dir():
        raise PassportNotFoundError(passport_id)
    if target.exists():
        raise PassportExistsError(f"{target} already exists")

    shutil.copytree(source, target, symlinks=True)

    moved = _files(source)
    if moved != _files(target):
        shutil.rmtree(target)
        raise ArchiveError(f"The copy of {passport_id} is incomplete.")

    shutil.rmtree(source)
    return sorted(moved)


def _files(directory: Path) -> dict[str, int]:
    """Each file under *directory*, relative, with its size."""
    return {
        str(path.relative_to(directory)): path.lstat().st_size
        for path in directory.rglob("*")
        if not path.is_dir()
    }


class ArchiveBlob(Protocol):
    """The part of a Cloud Storage object archiving uses."""

    @property
    def name(self) -> str: ...

    @property
    def crc32c(self) -> str | None: ...

    def delete(self) -> None: ...


class ArchiveBucket(Protocol):
    """The part of a Cloud Storage bucket archiving uses.

    Separate from the store's own bucket protocol, so the stores and their
    test fakes need nothing they never use.
    """

    def list_blobs(self, *, prefix: str) -> Iterable[ArchiveBlob]: ...

    def copy_blob(
        self, blob: Any, destination_bucket: Any, new_name: str
    ) -> ArchiveBlob: ...


def archive_bucket(
    source: ArchiveBucket,
    destination: ArchiveBucket,
    passport_id: str,
    prefix: str,
) -> list[str]:
    """Move one passport's bundle and evidence into *destination*.

    Each object keeps its name beneath *prefix*, so the archive mirrors the
    passport bucket's layout and a mistake can be undone by copying back.

    The passport bucket is versioned and nothing removes its versions, so the
    removed objects stay recoverable there too. That is accepted for a test
    passport rather than worked around.

    Args:
        source: The passport bucket.
        destination: The archive bucket.
        passport_id: Whose passport.
        prefix: Where in the archive, such as ``deleted/2026-09-26``.

    Returns:
        Every object name moved, sorted.

    Raises:
        PassportNotFoundError: If the passport has no bundle.
        ArchiveError: If a copy's checksum differs from its original. No
            original is removed.
    """
    shard = paths.shard(passport_id)
    bundle = f"{PREFIX}/{shard}.bundle"
    folder = f"{PREFIX}/{shard}/"

    # Listing on the shared stem finds the bundle and the evidence folder
    # in one call; the filter keeps it to exactly those two.
    objects = [
        blob
        for blob in source.list_blobs(prefix=f"{PREFIX}/{shard}")
        if blob.name == bundle or blob.name.startswith(folder)
    ]

    if not any(blob.name == bundle for blob in objects):
        raise PassportNotFoundError(passport_id)

    for blob in objects:
        copy = source.copy_blob(blob, destination, f"{prefix}/{blob.name}")
        if copy.crc32c != blob.crc32c:
            raise ArchiveError(
                f"The archived copy of {blob.name} does not match. Nothing "
                "was removed."
            )

    for blob in objects:
        blob.delete()

    return sorted(blob.name for blob in objects)


def build_bucket(bucket_name: str, client: Any = None) -> ArchiveBucket:
    """A bucket handle for archiving, from the ambient credentials.

    The import is deferred so this module stays importable without the
    Cloud Storage library, as the rest of the package does.

    Args:
        bucket_name: The bucket to open.
        client: A Cloud Storage client, built when omitted.

    Returns:
        The bucket.
    """
    if client is None:
        from google.cloud import storage  # type: ignore[import-untyped]

        client = storage.Client()

    bucket: ArchiveBucket = client.bucket(bucket_name)
    return bucket
