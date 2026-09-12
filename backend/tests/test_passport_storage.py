"""Tests for app/passport_storage.py.

The composition point: which backend a deployment gets, and why. Small,
but worth testing for two reasons that are not obvious from the code.

**The choice must turn on one setting.** The teaching feature has a
second setting naming the backend that nothing reads, so a deployment can
set it to "local" and still write to a bucket. These tests pin that the
passport has no such trap: the bucket name alone decides, and there is no
``PASSPORT_STORAGE_BACKEND`` to disagree with it.

**Passports and their evidence must not split.** A record names evidence
by hash, so a passport in a bucket whose blobs are on a disk is a set of
broken references. The two stores are asserted to agree.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
from unittest.mock import MagicMock

import pytest

from app import passport_storage
from app.config import settings
from app.features.passport.blobs import BlobStore
from app.features.passport.gcs_store import GcsBlobStore, GcsPassportStore
from app.features.passport.store import LocalPassportStore


@pytest.fixture(autouse=True)
def _clear_caches() -> Any:
    """Rebuild the stores per test, since both are cached."""
    passport_storage.reset_caches()
    yield
    passport_storage.reset_caches()


class TestWithoutABucket:
    """No bucket configured: passports live on a local disk."""

    def test_the_store_is_local(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        monkeypatch.setattr(settings, "PASSPORT_GCS_BUCKET", None)
        monkeypatch.setattr(settings, "PASSPORT_LOCAL_ROOT", str(tmp_path))

        assert isinstance(
            passport_storage.get_passport_store(), LocalPassportStore
        )

    def test_the_blob_store_is_local(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        monkeypatch.setattr(settings, "PASSPORT_GCS_BUCKET", None)
        monkeypatch.setattr(settings, "PASSPORT_LOCAL_ROOT", str(tmp_path))

        assert isinstance(passport_storage.get_blob_store(), BlobStore)

    def test_using_bucket_is_false(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "PASSPORT_GCS_BUCKET", None)

        assert not passport_storage.using_bucket()

    def test_an_empty_bucket_name_counts_as_unset(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        """An empty string is a missing value, not a bucket called "".

        Environment variables arrive as strings, so a variable set but
        left blank is a realistic way to land here, and treating it as a
        bucket name would fail at the first request rather than at
        startup.
        """
        monkeypatch.setattr(settings, "PASSPORT_GCS_BUCKET", "")
        monkeypatch.setattr(settings, "PASSPORT_LOCAL_ROOT", str(tmp_path))

        assert not passport_storage.using_bucket()
        assert isinstance(
            passport_storage.get_passport_store(), LocalPassportStore
        )


class TestWithABucket:
    """A bucket configured: passports live in Cloud Storage."""

    def test_the_store_is_the_bucket_backend(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            settings, "PASSPORT_GCS_BUCKET", "quill-passports-prod"
        )
        monkeypatch.setattr(
            passport_storage,
            "build_store",
            lambda bucket: GcsPassportStore(MagicMock()),
        )

        assert isinstance(
            passport_storage.get_passport_store(), GcsPassportStore
        )

    def test_the_blob_store_is_the_bucket_backend(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            settings, "PASSPORT_GCS_BUCKET", "quill-passports-prod"
        )
        monkeypatch.setattr(
            passport_storage,
            "build_blob_store",
            lambda bucket: GcsBlobStore(MagicMock()),
        )

        assert isinstance(passport_storage.get_blob_store(), GcsBlobStore)

    def test_using_bucket_is_true(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            settings, "PASSPORT_GCS_BUCKET", "quill-passports-prod"
        )

        assert passport_storage.using_bucket()

    def test_the_configured_bucket_is_the_one_used(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The name reaches the builder unchanged.

        A store built against the wrong bucket would read as an empty
        passport rather than an error, so the name is asserted rather
        than assumed.
        """
        seen: list[str] = []

        def record(bucket: str) -> GcsPassportStore:
            seen.append(bucket)
            return GcsPassportStore(MagicMock())

        monkeypatch.setattr(
            settings, "PASSPORT_GCS_BUCKET", "quill-passports-prod"
        )
        monkeypatch.setattr(passport_storage, "build_store", record)

        passport_storage.get_passport_store()

        assert seen == ["quill-passports-prod"]


class TestTheTwoStoresAgree:
    """Evidence must never be on a different backend from its passport."""

    def test_both_local_without_a_bucket(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        monkeypatch.setattr(settings, "PASSPORT_GCS_BUCKET", None)
        monkeypatch.setattr(settings, "PASSPORT_LOCAL_ROOT", str(tmp_path))

        assert isinstance(
            passport_storage.get_passport_store(), LocalPassportStore
        )
        assert isinstance(passport_storage.get_blob_store(), BlobStore)

    def test_both_bucket_backed_with_a_bucket(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(
            settings, "PASSPORT_GCS_BUCKET", "quill-passports-prod"
        )
        monkeypatch.setattr(
            passport_storage,
            "build_store",
            lambda bucket: GcsPassportStore(MagicMock()),
        )
        monkeypatch.setattr(
            passport_storage,
            "build_blob_store",
            lambda bucket: GcsBlobStore(MagicMock()),
        )

        assert isinstance(
            passport_storage.get_passport_store(), GcsPassportStore
        )
        assert isinstance(passport_storage.get_blob_store(), GcsBlobStore)


class TestNoSecondSwitch:
    def test_there_is_no_passport_storage_backend_setting(self) -> None:
        """The trap the teaching feature has, deliberately not repeated.

        ``TEACHING_STORAGE_BACKEND`` is set in three files and read by
        none, so setting it to "local" while a bucket is configured does
        nothing at all. If a ``PASSPORT_STORAGE_BACKEND`` is ever added,
        it must actually decide the backend — and this test failing is
        the prompt to check that it does.
        """
        assert not hasattr(settings, "PASSPORT_STORAGE_BACKEND")

    def test_the_bucket_alone_decides(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        monkeypatch.setattr(settings, "PASSPORT_LOCAL_ROOT", str(tmp_path))

        monkeypatch.setattr(settings, "PASSPORT_GCS_BUCKET", None)
        assert not passport_storage.using_bucket()

        monkeypatch.setattr(settings, "PASSPORT_GCS_BUCKET", "a-bucket")
        assert passport_storage.using_bucket()


class TestCaching:
    def test_the_store_is_built_once(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        """Building the bucket backend authenticates, so it is cached."""
        monkeypatch.setattr(settings, "PASSPORT_GCS_BUCKET", None)
        monkeypatch.setattr(settings, "PASSPORT_LOCAL_ROOT", str(tmp_path))

        assert (
            passport_storage.get_passport_store()
            is passport_storage.get_passport_store()
        )

    def test_resetting_rebuilds(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        monkeypatch.setattr(settings, "PASSPORT_GCS_BUCKET", None)
        monkeypatch.setattr(settings, "PASSPORT_LOCAL_ROOT", str(tmp_path))

        first = passport_storage.get_passport_store()
        passport_storage.reset_caches()

        assert passport_storage.get_passport_store() is not first
