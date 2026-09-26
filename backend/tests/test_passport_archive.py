"""Tests for app/features/passport/archive.py.

Archiving is how a test passport is deleted: copy, check, then remove. The
property that matters most is the failure case, so each backend has a test
that the passport stays exactly where it was when the copy goes wrong.
"""

from __future__ import annotations

import zlib
from collections.abc import Iterable
from pathlib import Path
from typing import Any

import pytest

from app.features.passport import archive, service
from app.features.passport.archive import (
    ArchiveBlob,
    ArchiveError,
    archive_bucket,
    archive_local,
)
from app.features.passport.blobs import BlobStore
from app.features.passport.commits import Actor
from app.features.passport.store import (
    LocalPassportStore,
    PassportExistsError,
    PassportNotFoundError,
)

PASSPORT_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f309"
OTHER_ID = "3f2a8c1e4b7d49f0a6c2e8b1d5a7f30a"


@pytest.fixture
def root(tmp_path: Path) -> Path:
    """A store holding one passport with one evidence file."""
    store_root = tmp_path / "passports"
    service.create_passport(
        LocalPassportStore(store_root),
        PASSPORT_ID,
        Actor(
            name="Dr Test Holder",
            role="specialty_trainee_3_plus",
            email="holder@example.nhs.uk",
        ),
        user_id="1",
    )
    BlobStore(store_root).put(
        PASSPORT_ID,
        b"%PDF-1.4 evidence",
        filename="certificate.pdf",
        media_type="application/pdf",
    )
    return store_root


class TestArchiveLocal:
    def test_moves_the_repository_and_its_evidence(
        self, root: Path, tmp_path: Path
    ) -> None:
        destination = tmp_path / "archive" / "deleted" / "2026-09-26"

        moved = archive_local(root, destination, PASSPORT_ID)

        assert not LocalPassportStore(root).exists(PASSPORT_ID)
        assert any(name.startswith("files/sha256/") for name in moved)
        archived = destination / "3f" / "2a" / PASSPORT_ID
        assert archived.is_dir()

    def test_the_archive_can_be_read_as_a_passport(
        self, root: Path, tmp_path: Path
    ) -> None:
        """A mistake is undone by moving the directory back."""
        destination = tmp_path / "archive"

        archive_local(root, destination, PASSPORT_ID)

        restored = LocalPassportStore(destination)
        assert restored.exists(PASSPORT_ID)
        assert restored.head(PASSPORT_ID).commit is not None

    def test_refuses_a_passport_that_does_not_exist(
        self, root: Path, tmp_path: Path
    ) -> None:
        with pytest.raises(PassportNotFoundError):
            archive_local(root, tmp_path / "archive", OTHER_ID)

    def test_refuses_to_overwrite_an_earlier_archive(
        self, root: Path, tmp_path: Path
    ) -> None:
        destination = tmp_path / "archive"
        (destination / "3f" / "2a" / PASSPORT_ID).mkdir(parents=True)

        with pytest.raises(PassportExistsError):
            archive_local(root, destination, PASSPORT_ID)

        assert LocalPassportStore(root).exists(PASSPORT_ID)

    def test_a_bad_copy_leaves_the_passport_where_it_was(
        self,
        root: Path,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        destination = tmp_path / "archive"

        def short_copy(source: Path, target: Path, **_: object) -> None:
            target.mkdir(parents=True)

        monkeypatch.setattr(archive.shutil, "copytree", short_copy)

        with pytest.raises(ArchiveError):
            archive_local(root, destination, PASSPORT_ID)

        assert LocalPassportStore(root).exists(PASSPORT_ID)
        assert not (destination / "3f" / "2a" / PASSPORT_ID).exists()


class FakeObject:
    def __init__(self, bucket: FakeBucket, name: str) -> None:
        self._bucket = bucket
        self._name = name

    @property
    def name(self) -> str:
        return self._name

    @property
    def crc32c(self) -> str | None:
        data = self._bucket.objects.get(self._name)
        return None if data is None else str(zlib.crc32(data))

    def delete(self) -> None:
        del self._bucket.objects[self._name]


class FakeBucket:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.corrupt_copies = False

    def list_blobs(self, *, prefix: str) -> Iterable[ArchiveBlob]:
        return [
            FakeObject(self, name)
            for name in sorted(self.objects)
            if name.startswith(prefix)
        ]

    def copy_blob(
        self, blob: Any, destination_bucket: Any, new_name: str
    ) -> ArchiveBlob:
        data = self.objects[blob.name]
        if self.corrupt_copies:
            data = data + b"!"
        destination_bucket.objects[new_name] = data
        return FakeObject(destination_bucket, new_name)


BUNDLE = f"passports/3f/2a/{PASSPORT_ID}.bundle"
EVIDENCE = f"passports/3f/2a/{PASSPORT_ID}/files/sha256/ab/cd/abcd"
NEIGHBOUR = f"passports/3f/2a/{OTHER_ID}.bundle"


@pytest.fixture
def buckets() -> tuple[FakeBucket, FakeBucket]:
    source = FakeBucket()
    source.objects = {
        BUNDLE: b"bundle",
        EVIDENCE: b"evidence",
        NEIGHBOUR: b"somebody else",
    }
    return source, FakeBucket()


class TestArchiveBucket:
    def test_moves_the_bundle_and_its_evidence(
        self, buckets: tuple[FakeBucket, FakeBucket]
    ) -> None:
        source, destination = buckets

        moved = archive_bucket(
            source, destination, PASSPORT_ID, "deleted/2026-09-26"
        )

        assert moved == [BUNDLE, EVIDENCE]
        assert set(destination.objects) == {
            f"deleted/2026-09-26/{BUNDLE}",
            f"deleted/2026-09-26/{EVIDENCE}",
        }
        assert set(source.objects) == {NEIGHBOUR}

    def test_leaves_every_other_passport_alone(
        self, buckets: tuple[FakeBucket, FakeBucket]
    ) -> None:
        source, destination = buckets

        archive_bucket(source, destination, PASSPORT_ID, "deleted/x")

        assert source.objects[NEIGHBOUR] == b"somebody else"

    def test_refuses_a_passport_with_no_bundle(
        self, buckets: tuple[FakeBucket, FakeBucket]
    ) -> None:
        source, destination = buckets
        del source.objects[BUNDLE]

        with pytest.raises(PassportNotFoundError):
            archive_bucket(source, destination, PASSPORT_ID, "deleted/x")

        assert EVIDENCE in source.objects

    def test_a_bad_copy_removes_nothing(
        self, buckets: tuple[FakeBucket, FakeBucket]
    ) -> None:
        source, destination = buckets
        source.corrupt_copies = True

        with pytest.raises(ArchiveError):
            archive_bucket(source, destination, PASSPORT_ID, "deleted/x")

        assert {BUNDLE, EVIDENCE, NEIGHBOUR} == set(source.objects)
