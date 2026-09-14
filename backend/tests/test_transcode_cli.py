"""Tests for the transcode CLI script (Cloud Run Job).

FFmpeg itself is not exercised here — the encode is stubbed. What is
tested is everything around it that can go wrong silently: the object
keys the job reads and writes, the validation that stops one
organisation's job reaching another's prefix, and the cache header
without which the CDN caches nothing.
"""

from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import google.cloud as _gc
import pytest


def _patch_storage(storage_module: MagicMock):
    """Make ``from google.cloud import storage`` resolve to a mock.

    Both the ``sys.modules`` entry and the attribute on the parent
    package, because once ``google.cloud`` has been imported that import
    form reads the attribute and never consults ``sys.modules``. Patching
    only the latter passes in isolation and fails once any earlier test
    has imported the real module — which is exactly what happened here,
    with ``test_teaching_storage.py`` running first in the full suite.
    """
    return (
        patch.dict("sys.modules", {"google.cloud.storage": storage_module}),
        patch.object(_gc, "storage", storage_module, create=True),
    )


BASE_ENV = {
    "TRANSCODE_ORG_ID": "7",
    "TRANSCODE_MODULE_ID": "colonoscopy-basics",
    "TRANSCODE_ASSET_ID": "a1b2c3d4",
    "TEACHING_VIDEOS_SOURCE_BUCKET": "source-bucket",
    "TEACHING_VIDEOS_BUCKET": "processed-bucket",
}


@pytest.fixture
def fake_gcs():
    """A storage client whose blobs record what was asked of them."""
    uploaded: dict[str, MagicMock] = {}

    def _blob_for(bucket_name: str):
        def _make(path: str) -> MagicMock:
            # One mock per path, not per call. The job asks for the same
            # blob twice — once to upload, once to verify it is readable
            # — and a fresh mock on the second call would discard what
            # the upload set on the first.
            key = f"{bucket_name}/{path}"
            existing = uploaded.get(key)
            if existing is not None:
                return existing

            blob = MagicMock()
            blob.exists.return_value = True
            blob.download_to_filename.side_effect = lambda dest: Path(
                dest
            ).write_bytes(b"fake source")
            uploaded[key] = blob
            return blob

        return _make

    client = MagicMock()

    def _bucket(name: str) -> MagicMock:
        bucket = MagicMock()
        bucket.blob.side_effect = _blob_for(name)
        return bucket

    client.bucket.side_effect = _bucket

    storage_module = MagicMock()
    storage_module.Client.return_value = client

    modules_patch, attr_patch = _patch_storage(storage_module)
    with modules_patch, attr_patch:
        yield uploaded


@pytest.fixture
def stub_ffmpeg():
    """Replace both encode helpers, writing a placeholder output file."""

    def _write(*args) -> None:
        # Both helpers take the destination as their second argument.
        Path(args[1]).write_bytes(b"encoded")

    with (
        patch(
            "scripts.transcode_cli.build_rendition", side_effect=_write
        ) as r,
        patch("scripts.transcode_cli.build_poster", side_effect=_write) as p,
    ):
        yield r, p


class TestTranscode:
    """The happy path, and what it writes where."""

    def test_writes_both_renditions_and_a_poster(
        self, fake_gcs, stub_ffmpeg
    ) -> None:
        with patch.dict(os.environ, BASE_ENV, clear=False):
            from scripts.transcode_cli import transcode

            assert transcode() == 0

        # The object-key contract: output shares the source's
        # {org_id}/{module_id}/ prefix, because that is what the signed
        # cookie covers and what base_url addresses.
        assert (
            "processed-bucket/7/colonoscopy-basics/a1b2c3d4-720p.mp4"
            in fake_gcs
        )
        assert (
            "processed-bucket/7/colonoscopy-basics/a1b2c3d4-1080p.mp4"
            in fake_gcs
        )
        assert (
            "processed-bucket/7/colonoscopy-basics/a1b2c3d4-poster.jpg"
            in fake_gcs
        )

    def test_reads_the_source_object_by_asset_id(
        self, fake_gcs, stub_ffmpeg
    ) -> None:
        with patch.dict(os.environ, BASE_ENV, clear=False):
            from scripts.transcode_cli import transcode

            assert transcode() == 0

        # No extension on the source key — media_object_path does not add
        # one, because the upload is keyed by generated id alone.
        assert "source-bucket/7/colonoscopy-basics/a1b2c3d4" in fake_gcs

    def test_sets_cache_control_on_every_output(
        self, fake_gcs, stub_ffmpeg
    ) -> None:
        with patch.dict(os.environ, BASE_ENV, clear=False):
            from scripts.transcode_cli import transcode

            assert transcode() == 0

        outputs = [
            blob
            for path, blob in fake_gcs.items()
            if path.startswith("processed-bucket/")
        ]
        assert outputs
        for blob in outputs:
            # Without this the CDN revalidates every request and the
            # backend bucket buys us nothing.
            assert blob.cache_control == "public, max-age=86400"

    def test_encodes_720p_and_1080p(self, fake_gcs, stub_ffmpeg) -> None:
        build_rendition, _ = stub_ffmpeg
        with patch.dict(os.environ, BASE_ENV, clear=False):
            from scripts.transcode_cli import transcode

            assert transcode() == 0

        heights = [call.args[2] for call in build_rendition.call_args_list]
        assert heights == [720, 1080]


class TestSourceCleanup:
    """The master is deleted on success, and only on success.

    Once renditions exist the source's sole remaining use is
    re-encoding, wanted within days rather than months — so the job
    cleans up after itself and the 7-day lifecycle rule is only a
    backstop for uploads whose job never ran.
    """

    SOURCE = "source-bucket/7/colonoscopy-basics/a1b2c3d4"

    def test_deletes_the_source_once_outputs_verify(
        self, fake_gcs, stub_ffmpeg
    ) -> None:
        with patch.dict(os.environ, BASE_ENV, clear=False):
            from scripts.transcode_cli import transcode

            assert transcode() == 0

        fake_gcs[self.SOURCE].delete.assert_called_once()

    def test_keeps_the_source_when_an_output_is_missing(
        self, stub_ffmpeg
    ) -> None:
        """An upload that reported success but left nothing readable.

        Deleting here would cost the master as well as the rendition,
        and there is no second copy of either.
        """
        source_blob = MagicMock()
        source_blob.exists.return_value = True
        source_blob.download_to_filename.side_effect = lambda dest: Path(
            dest
        ).write_bytes(b"fake source")

        # The verification pass re-reads each written object. Make the
        # poster unreadable and nothing else.
        def _processed_blob(path: str) -> MagicMock:
            blob = MagicMock()
            blob.exists.return_value = not path.endswith("-poster.jpg")
            return blob

        source = MagicMock()
        source.blob.return_value = source_blob
        processed = MagicMock()
        processed.blob.side_effect = _processed_blob

        client = MagicMock()
        client.bucket.side_effect = lambda name: (
            source if name == "source-bucket" else processed
        )

        # Patched the same way as the fake_gcs fixture. Patching
        # `google.cloud.storage.Client` by name would force a real
        # import of that module, which is what contaminates every later
        # test — see _patch_storage.
        storage_module = MagicMock()
        storage_module.Client.return_value = client
        modules_patch, attr_patch = _patch_storage(storage_module)

        with patch.dict(os.environ, BASE_ENV, clear=False):
            from scripts.transcode_cli import transcode

            with modules_patch, attr_patch:
                assert transcode() == 1

        source_blob.delete.assert_not_called()

    def test_keeps_the_source_when_an_encode_fails(self, fake_gcs) -> None:
        """Nothing was uploaded, so nothing has replaced the master."""
        with patch.dict(os.environ, BASE_ENV, clear=False):
            from scripts.transcode_cli import transcode

            with patch(
                "scripts.transcode_cli.build_rendition",
                side_effect=RuntimeError("ffmpeg failed (1): bad codec"),
            ):
                assert transcode() == 1

        fake_gcs[self.SOURCE].delete.assert_not_called()

    def test_a_delete_failure_does_not_fail_the_job(
        self, fake_gcs, stub_ffmpeg
    ) -> None:
        """The transcode genuinely succeeded by that point.

        A master left behind is swept by the lifecycle rule within a
        week; failing here would re-run an encode that already worked.
        """
        with patch.dict(os.environ, BASE_ENV, clear=False):
            from scripts.transcode_cli import transcode

            # First run populates the fixture's blob for the source and
            # deletes it; arm the failure and run again.
            assert transcode() == 0
            fake_gcs[self.SOURCE].delete.side_effect = RuntimeError(
                "permission"
            )
            assert transcode() == 0


class TestValidation:
    """Refusals, each before anything is read or written."""

    @pytest.mark.parametrize(
        "field,value",
        [
            ("TRANSCODE_MODULE_ID", "../secret"),
            ("TRANSCODE_ASSET_ID", "../../etc/passwd"),
            ("TRANSCODE_MODULE_ID", "has a space"),
        ],
    )
    def test_rejects_a_traversal(self, fake_gcs, field, value) -> None:
        env = {**BASE_ENV, field: value}
        with patch.dict(os.environ, env, clear=False):
            from scripts.transcode_cli import transcode

            # A traversal here would let one organisation's job reach
            # another's prefix, so it fails rather than sanitising.
            assert transcode() == 1

    def test_rejects_a_non_integer_org_id(self, fake_gcs) -> None:
        env = {**BASE_ENV, "TRANSCODE_ORG_ID": "not-a-number"}
        with patch.dict(os.environ, env, clear=False):
            from scripts.transcode_cli import transcode

            assert transcode() == 1

    def test_rejects_a_non_positive_org_id(self, fake_gcs) -> None:
        env = {**BASE_ENV, "TRANSCODE_ORG_ID": "0"}
        with patch.dict(os.environ, env, clear=False):
            from scripts.transcode_cli import transcode

            assert transcode() == 1

    def test_exits_on_a_missing_variable(self) -> None:
        env = {k: v for k, v in BASE_ENV.items() if k != "TRANSCODE_ASSET_ID"}
        with patch.dict(os.environ, env, clear=True):
            from scripts.transcode_cli import transcode

            with pytest.raises(SystemExit) as exc:
                transcode()
            assert exc.value.code == 1

    def test_fails_when_the_source_object_is_absent(self) -> None:
        blob = MagicMock()
        blob.exists.return_value = False
        bucket = MagicMock()
        bucket.blob.return_value = blob
        client = MagicMock()
        client.bucket.return_value = bucket

        # Not `patch("google.cloud.storage.Client")`: patching by name
        # imports the real module to reach the attribute, and leaves it
        # bound on the parent package for every later test. That is the
        # fault that broke the full-suite run — see _patch_storage.
        storage_module = MagicMock()
        storage_module.Client.return_value = client
        modules_patch, attr_patch = _patch_storage(storage_module)

        with patch.dict(os.environ, BASE_ENV, clear=False):
            from scripts.transcode_cli import transcode

            with modules_patch, attr_patch:
                assert transcode() == 1


class TestFfmpegFailure:
    """A failed encode reports FFmpeg's own diagnostics, not just a code."""

    def test_returns_one_when_a_rendition_fails(self, fake_gcs) -> None:
        with patch.dict(os.environ, BASE_ENV, clear=False):
            from scripts.transcode_cli import transcode

            with patch(
                "scripts.transcode_cli.build_rendition",
                side_effect=RuntimeError("ffmpeg failed (1): bad codec"),
            ):
                assert transcode() == 1

    def test_surfaces_stderr_from_ffmpeg(self) -> None:
        from scripts.transcode_cli import _run_ffmpeg

        with patch("subprocess.run") as run:
            run.return_value = MagicMock(
                returncode=1, stderr="Invalid data found"
            )
            with pytest.raises(RuntimeError, match="Invalid data found"):
                _run_ffmpeg(["-i", "x.mp4", "out.mp4"])
