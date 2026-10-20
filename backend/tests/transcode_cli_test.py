"""Tests for the transcode CLI script (Cloud Run Job).

FFmpeg itself is not exercised here - the encode is stubbed. What is
tested is everything around it that can go wrong silently: the object
keys the job reads and writes, the validation that stops one
organisation's job reaching another's prefix, and the cache header
without which the CDN caches nothing.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs, urlparse

import google.cloud as _gc
import pytest

from app.features.teaching.job_identity import METADATA_IDENTITY_URL


def _patch_storage(storage_module: MagicMock):
    """Make ``from google.cloud import storage`` resolve to a mock.

    Both the ``sys.modules`` entry and the attribute on the parent
    package, because once ``google.cloud`` has been imported that import
    form reads the attribute and never consults ``sys.modules``. Patching
    only the latter passes in isolation and fails once any earlier test
    has imported the real module - which is exactly what happened here,
    with ``app/features/teaching/storage_test.py`` running first in the full suite.
    """
    return (
        patch.dict("sys.modules", {"google.cloud.storage": storage_module}),
        patch.object(_gc, "storage", storage_module, create=True),
    )


AUDIENCE = "https://quill-backend-test-123.europe-west2.run.app"


def _stub_urlopen(status: int = 200, side_effect=None):
    """Patch `urlopen` and expose the Request it was handed.

    The callback uses the standard library rather than `httpx`, matching
    the caption job: that image carries its own pinned packages and
    `httpx` was not among them, so its report died with
    `No module named 'httpx'` after an hour of Whisper. Asserting on the
    `Request` proves the wire format, which is what a missing import
    silently changed.
    """
    captured: dict[str, object] = {}

    def _fake(request, timeout=None):  # noqa: ANN001
        # The first call is to the metadata server, for the identity
        # token the report carries. Played here so the report's own
        # headers can be asserted on; a failure of this call has a test
        # of its own and is stubbed differently there.
        if request.full_url.startswith(METADATA_IDENTITY_URL):
            captured["audience"] = parse_qs(urlparse(request.full_url).query)[
                "audience"
            ][0]
            metadata = MagicMock()
            metadata.read.return_value = b"signed-id-token"
            metadata.__enter__ = lambda s: s
            metadata.__exit__ = lambda *a: False

            return metadata

        captured["url"] = request.full_url
        captured["headers"] = {k.lower(): v for k, v in request.header_items()}
        captured["json"] = json.loads(request.data.decode())

        if side_effect is not None:
            raise side_effect

        response = MagicMock()
        response.status = status
        response.__enter__ = lambda s: s
        response.__exit__ = lambda *a: False

        return response

    return patch("urllib.request.urlopen", side_effect=_fake), captured


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
            # blob twice - once to upload, once to verify it is readable
            # - and a fresh mock on the second call would discard what
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


def _write_renditions(
    source: Path, renditions: list[tuple[Path, int, str]]
) -> None:
    """Stand in for the encode: write a placeholder for every output."""
    for dest, _height, _bitrate in renditions:
        dest.write_bytes(b"encoded")


def _write_poster(*args) -> None:
    """Stand in for the poster grab: its destination is the second."""
    Path(args[1]).write_bytes(b"encoded")


@pytest.fixture
def stub_ffmpeg():
    """Replace both encode helpers, writing a placeholder output file,
    and the probe, answering that the source is an MP4 with video."""

    with (
        patch(
            "scripts.transcode_cli.build_renditions",
            side_effect=_write_renditions,
        ) as r,
        patch(
            "scripts.transcode_cli.build_poster", side_effect=_write_poster
        ) as p,
        patch(
            "scripts.transcode_cli.probe_container",
            return_value=("mov,mp4,m4a,3gp,3g2,mj2", True),
        ),
    ):
        yield r, p


class TestProbeBeforeEncoding:
    """A file that only claimed to be a video is refused by name, not
    left to fail inside the 720p encode."""

    def _run(self, probed) -> tuple[int, MagicMock]:
        with patch.dict(os.environ, BASE_ENV, clear=False):
            from scripts.transcode_cli import transcode

            with (
                patch(
                    "scripts.transcode_cli.build_renditions",
                    side_effect=_write_renditions,
                ) as rendition,
                patch(
                    "scripts.transcode_cli.build_poster",
                    side_effect=_write_poster,
                ),
                patch(
                    "scripts.transcode_cli.probe_container",
                    return_value=probed,
                ),
            ):
                return transcode(), rendition

    def test_an_mp4_with_video_is_encoded(self, fake_gcs) -> None:
        code, rendition = self._run(("mov,mp4,m4a,3gp,3g2,mj2", True))

        assert code == 0
        assert rendition.called

    def test_a_webm_with_video_is_encoded(self, fake_gcs) -> None:
        code, rendition = self._run(("matroska,webm", True))

        assert code == 0
        assert rendition.called

    def test_an_image_is_refused_before_any_encode(
        self, fake_gcs, capsys
    ) -> None:
        code, rendition = self._run(("image2", False))

        assert code == 1
        assert not rendition.called
        assert (
            "Not a supported video (format: image2" in capsys.readouterr().err
        )

    def test_a_container_with_no_video_stream_is_refused(
        self, fake_gcs, capsys
    ) -> None:
        # An audio-only MP4, say: the right container, nothing to show.
        code, rendition = self._run(("mov,mp4,m4a,3gp,3g2,mj2", False))

        assert code == 1
        assert not rendition.called
        assert "video stream: no" in capsys.readouterr().err

    def test_a_probe_that_cannot_answer_lets_the_encode_try(
        self, fake_gcs
    ) -> None:
        """FFmpeg's own error is then the one in the log."""
        code, rendition = self._run(None)

        assert code == 0
        assert rendition.called


class TestProbeContainer:
    """FFprobe's answer, and what is assumed when it has none."""

    def _probe(self, returncode: int, stdout: str):
        from scripts.transcode_cli import probe_container

        result = MagicMock(returncode=returncode, stdout=stdout)

        with patch("subprocess.run", return_value=result):
            return probe_container(Path("video.mp4"))

    def test_reads_the_container_and_the_video_stream(self) -> None:
        report = (
            '{"streams": [{"codec_type": "video"}, {"codec_type": "audio"}],'
            ' "format": {"format_name": "mov,mp4,m4a,3gp,3g2,mj2"}}'
        )

        assert self._probe(0, report) == ("mov,mp4,m4a,3gp,3g2,mj2", True)

    def test_an_audio_only_file_has_no_video_stream(self) -> None:
        report = (
            '{"streams": [{"codec_type": "audio"}],'
            ' "format": {"format_name": "matroska,webm"}}'
        )

        assert self._probe(0, report) == ("matroska,webm", False)

    def test_a_probe_that_fails_answers_nothing(self) -> None:
        assert self._probe(1, "") is None

    def test_a_report_that_is_not_json_answers_nothing(self) -> None:
        assert self._probe(0, "not json") is None

    def test_no_ffprobe_answers_nothing(self) -> None:
        from scripts.transcode_cli import probe_container

        with patch("subprocess.run", side_effect=FileNotFoundError):
            assert probe_container(Path("video.mp4")) is None


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

        # No extension on the source key - media_object_path does not add
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
        build_renditions, _ = stub_ffmpeg

        with patch.dict(os.environ, BASE_ENV, clear=False):
            from scripts.transcode_cli import transcode

            assert transcode() == 0

        # One call for both, so the source is decoded once.
        build_renditions.assert_called_once()
        renditions = build_renditions.call_args.args[1]
        assert [height for _dest, height, _rate in renditions] == [720, 1080]


class TestSourceCleanup:
    """The master is deleted on success, and only on success.

    Once renditions exist the source's sole remaining use is
    re-encoding, wanted within days rather than months - so the job
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
        # test - see _patch_storage.
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
                "scripts.transcode_cli.build_renditions",
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
        # fault that broke the full-suite run - see _patch_storage.
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
                "scripts.transcode_cli.build_renditions",
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


class TestCompletionReport:
    """The callback that tells the backend the renditions exist.

    Until this lands, `transcoded_at` stays null and the module stays
    hidden - so what matters is that it is attempted, that it carries
    filenames rather than paths, and above all that it can never fail
    the job. The encode has succeeded and the source is about to be
    deleted by the time it runs.
    """

    def test_skips_silently_when_unconfigured(self, capsys) -> None:
        from scripts.transcode_cli import _report_complete

        # Development: no backend to tell. Not an error.
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("TRANSCODE_CALLBACK_URL", None)
            os.environ.pop("TRANSCODE_CALLBACK_AUDIENCE", None)
            _report_complete(7, "mod", "asset-1", ["7/mod/asset-1.mp4"])

        assert "Callback not configured" in capsys.readouterr().err

    def test_posts_names_not_paths(self) -> None:
        from scripts.transcode_cli import _report_complete

        env = {
            "TRANSCODE_CALLBACK_URL": "https://example.test/cb",
            "TRANSCODE_CALLBACK_AUDIENCE": AUDIENCE,
        }

        with patch.dict(os.environ, env, clear=False):
            stub, captured = _stub_urlopen()
            with stub:
                _report_complete(
                    7,
                    "mod",
                    "asset-1",
                    ["7/mod/asset-1-720p.mp4", "7/mod/asset-1-poster.jpg"],
                )

        # The backend rebuilds the prefix from the ids, so a report
        # cannot name a path outside its own module.
        sent = captured["json"]
        assert sent["outputs"] == [
            "asset-1-720p.mp4",
            "asset-1-poster.jpg",
        ]
        assert sent["org_id"] == 7
        assert captured["headers"]["authorization"] == "Bearer signed-id-token"
        assert captured["audience"] == AUDIENCE

    def test_no_identity_token_means_no_report(self, capsys) -> None:
        """A laptop, or a metadata server that is down: the report is
        skipped and said so, and nothing is posted with no token."""
        from scripts.transcode_cli import _report_complete

        env = {
            "TRANSCODE_CALLBACK_URL": "https://example.test/cb",
            "TRANSCODE_CALLBACK_AUDIENCE": AUDIENCE,
        }

        with patch.dict(os.environ, env, clear=False):
            stub, captured = _stub_urlopen()
            with (
                stub,
                patch(
                    "app.features.teaching.job_identity.mint_identity_token",
                    return_value=None,
                ),
            ):
                _report_complete(7, "mod", "asset-1", ["7/mod/a.mp4"])

        assert "completion report was not sent" in capsys.readouterr().err
        assert "url" not in captured

    def test_a_refusal_does_not_raise(self, capsys) -> None:
        from scripts.transcode_cli import _report_complete

        env = {
            "TRANSCODE_CALLBACK_URL": "https://example.test/cb",
            "TRANSCODE_CALLBACK_AUDIENCE": AUDIENCE,
        }

        with patch.dict(os.environ, env, clear=False):
            stub, _ = _stub_urlopen(status=401)
            with stub:
                _report_complete(7, "mod", "asset-1", ["7/mod/a.mp4"])

        assert "refused" in capsys.readouterr().err

    def test_a_network_failure_does_not_raise(self, capsys) -> None:
        from scripts.transcode_cli import _report_complete

        env = {
            "TRANSCODE_CALLBACK_URL": "https://example.test/cb",
            "TRANSCODE_CALLBACK_AUDIENCE": AUDIENCE,
        }

        with patch.dict(os.environ, env, clear=False):
            stub, _ = _stub_urlopen(side_effect=OSError("no route"))
            with stub:
                _report_complete(7, "mod", "asset-1", ["7/mod/a.mp4"])

        assert "callback failed" in capsys.readouterr().err


PREFIX = "processed-bucket/7/colonoscopy-basics/a1b2c3d4"


class TestPosterSecond:
    """The second the poster is taken from, on an ordinary transcode."""

    def test_takes_the_default_when_none_is_chosen(
        self, fake_gcs, stub_ffmpeg
    ) -> None:
        _, build_poster = stub_ffmpeg

        with patch.dict(os.environ, BASE_ENV, clear=False):
            os.environ.pop("TRANSCODE_POSTER_AT", None)
            from scripts.transcode_cli import transcode

            assert transcode() == 0

        assert build_poster.call_args.args[2] == 5

    def test_takes_the_chosen_second(self, fake_gcs, stub_ffmpeg) -> None:
        _, build_poster = stub_ffmpeg
        env = {**BASE_ENV, "TRANSCODE_POSTER_AT": "42"}

        with patch.dict(os.environ, env, clear=False):
            from scripts.transcode_cli import transcode

            assert transcode() == 0

        assert build_poster.call_args.args[2] == 42

    @pytest.mark.parametrize("value", ["-3", "4.5", "soon"])
    def test_refuses_a_second_that_is_not_a_whole_number(
        self, fake_gcs, value: str
    ) -> None:
        # Taking the default instead would hide a typo in a job run by
        # hand, and the poster would quietly be the wrong frame.
        env = {**BASE_ENV, "TRANSCODE_POSTER_AT": value}

        with patch.dict(os.environ, env, clear=False):
            from scripts.transcode_cli import transcode

            assert transcode() == 1


class TestRetakePoster:
    """`TRANSCODE_MODE=poster`: a new poster, and nothing else."""

    ENV = {**BASE_ENV, "TRANSCODE_MODE": "poster", "TRANSCODE_POSTER_AT": "42"}

    def test_takes_the_poster_from_the_1080p_rendition(
        self, fake_gcs, stub_ffmpeg
    ) -> None:
        build_renditions, build_poster = stub_ffmpeg

        with patch.dict(os.environ, self.ENV, clear=False):
            from scripts.transcode_cli import transcode

            assert transcode() == 0

        fake_gcs[f"{PREFIX}-1080p.mp4"].download_to_filename.assert_called()
        assert build_poster.call_args.args[2] == 42
        # The source is gone by now, so nothing is encoded and nothing
        # is read from the source bucket.
        build_renditions.assert_not_called()
        assert not any(key.startswith("source-bucket/") for key in fake_gcs)

    def test_falls_back_to_720p_without_a_1080p_rendition(
        self, fake_gcs, stub_ffmpeg
    ) -> None:
        missing = MagicMock()
        missing.exists.return_value = False
        fake_gcs[f"{PREFIX}-1080p.mp4"] = missing

        with patch.dict(os.environ, self.ENV, clear=False):
            from scripts.transcode_cli import transcode

            assert transcode() == 0

        fake_gcs[f"{PREFIX}-720p.mp4"].download_to_filename.assert_called()

    def test_writes_the_poster_over_the_old_one(
        self, fake_gcs, stub_ffmpeg
    ) -> None:
        with patch.dict(os.environ, self.ENV, clear=False):
            from scripts.transcode_cli import transcode

            assert transcode() == 0

        poster = fake_gcs[f"{PREFIX}-poster.jpg"]
        poster.upload_from_filename.assert_called_once()
        assert poster.cache_control == "public, max-age=86400"

    def test_fails_and_keeps_the_old_poster_when_there_is_no_frame(
        self, fake_gcs
    ) -> None:
        with (
            patch.dict(os.environ, self.ENV, clear=False),
            patch(
                "scripts.transcode_cli.build_poster",
                side_effect=RuntimeError("no frame at 42 seconds"),
            ),
        ):
            from scripts.transcode_cli import transcode

            assert transcode() == 1

        assert f"{PREFIX}-poster.jpg" not in fake_gcs

    def test_reports_to_the_poster_callback(
        self, fake_gcs, stub_ffmpeg
    ) -> None:
        # The transcode report rewrites every rendition flag from what it
        # is told, so a poster sent there would clear the 1080p flag.
        env = {
            **self.ENV,
            "TRANSCODE_CALLBACK_URL": (
                "https://api.test/api/ci/teaching/transcode-complete"
            ),
            "TRANSCODE_CALLBACK_AUDIENCE": AUDIENCE,
        }

        with patch.dict(os.environ, env, clear=False):
            stub, captured = _stub_urlopen()
            with stub:
                from scripts.transcode_cli import transcode

                assert transcode() == 0

        assert captured["url"] == (
            "https://api.test/api/ci/teaching/poster-complete"
        )
        assert captured["json"]["outputs"] == ["a1b2c3d4-poster.jpg"]


class TestBuildPoster:
    """FFmpeg says nothing useful about a second past the end."""

    def test_refuses_when_no_frame_was_written(self, tmp_path: Path) -> None:
        from scripts.transcode_cli import build_poster

        with patch("scripts.transcode_cli._run_ffmpeg"):
            with pytest.raises(RuntimeError, match="no frame at 900"):
                build_poster(tmp_path / "in.mp4", tmp_path / "out.jpg", 900)

    def test_passes_the_second_to_ffmpeg(self, tmp_path: Path) -> None:
        from scripts.transcode_cli import build_poster

        dest = tmp_path / "out.jpg"

        def _write(args: list[str]) -> None:
            dest.write_bytes(b"jpeg")

        with patch(
            "scripts.transcode_cli._run_ffmpeg", side_effect=_write
        ) as run:
            build_poster(tmp_path / "in.mp4", dest, 42)

        assert run.call_args.args[0][:2] == ["-ss", "42"]


class TestBuildRenditions:
    """Both renditions come from one FFmpeg run, each with its own
    settings, so a 4K source is decoded once rather than twice."""

    def _args(self, tmp_path: Path) -> list[str]:
        from scripts.transcode_cli import build_renditions

        with patch("scripts.transcode_cli._run_ffmpeg") as run:
            build_renditions(
                tmp_path / "in.mov",
                [
                    (tmp_path / "a-720p.mp4", 720, "2500k"),
                    (tmp_path / "a-1080p.mp4", 1080, "5000k"),
                ],
            )

        run.assert_called_once()

        return list(run.call_args.args[0])

    def test_reads_the_source_once(self, tmp_path: Path) -> None:
        args = self._args(tmp_path)

        assert args.count("-i") == 1
        assert args[args.index("-i") + 1] == str(tmp_path / "in.mov")

    def test_splits_the_video_and_scales_each_branch(
        self, tmp_path: Path
    ) -> None:
        args = self._args(tmp_path)
        graph = args[args.index("-filter_complex") + 1]

        assert graph == (
            "[0:v]split=2[v0][v1];"
            "[v0]scale=-2:720[o0];[v1]scale=-2:1080[o1]"
        )

    def test_gives_each_output_its_own_bitrate_and_the_old_settings(
        self, tmp_path: Path
    ) -> None:
        args = self._args(tmp_path)
        first = args.index(str(tmp_path / "a-720p.mp4"))
        second = args.index(str(tmp_path / "a-1080p.mp4"))
        for_720 = args[args.index("-map") : first]
        for_1080 = args[first + 1 : second]

        for options, label, bitrate in (
            (for_720, "[o0]", "2500k"),
            (for_1080, "[o1]", "5000k"),
        ):
            assert options[:4] == ["-map", label, "-map", "0:a:0?"]
            assert options[options.index("-b:v") + 1] == bitrate
            assert options[options.index("-c:v") + 1] == "libx264"
            assert options[options.index("-preset") + 1] == "medium"
            assert options[options.index("-c:a") + 1] == "aac"
            assert options[options.index("-movflags") + 1] == "+faststart"

    def test_refuses_an_empty_list(self, tmp_path: Path) -> None:
        from scripts.transcode_cli import build_renditions

        with pytest.raises(ValueError, match="no renditions"):
            build_renditions(tmp_path / "in.mov", [])


class TestMountedSource:
    """A lecture is read from the mounted bucket rather than copied into
    a filesystem that is memory, and downloaded only without a mount."""

    SOURCE_KEY = "7/colonoscopy-basics/a1b2c3d4"

    def test_reads_in_place_from_the_mount(
        self, fake_gcs, stub_ffmpeg, tmp_path: Path
    ) -> None:
        build_renditions, _ = stub_ffmpeg
        mounted = tmp_path / self.SOURCE_KEY
        mounted.parent.mkdir(parents=True)
        mounted.write_bytes(b"lecture")
        env = {**BASE_ENV, "TEACHING_VIDEOS_SOURCE_MOUNT": str(tmp_path)}

        with patch.dict(os.environ, env, clear=False):
            from scripts.transcode_cli import transcode

            assert transcode() == 0

        source_blob = fake_gcs[f"source-bucket/{self.SOURCE_KEY}"]
        source_blob.download_to_filename.assert_not_called()
        assert build_renditions.call_args.args[0] == mounted

    def test_downloads_when_the_mount_does_not_hold_it(
        self, fake_gcs, stub_ffmpeg, tmp_path: Path
    ) -> None:
        env = {**BASE_ENV, "TEACHING_VIDEOS_SOURCE_MOUNT": str(tmp_path)}

        with patch.dict(os.environ, env, clear=False):
            from scripts.transcode_cli import transcode

            assert transcode() == 0

        source_blob = fake_gcs[f"source-bucket/{self.SOURCE_KEY}"]
        source_blob.download_to_filename.assert_called_once()

    def test_downloads_without_a_mount(self, fake_gcs, stub_ffmpeg) -> None:
        env = {**BASE_ENV, "TEACHING_VIDEOS_SOURCE_MOUNT": ""}

        with patch.dict(os.environ, env, clear=False):
            from scripts.transcode_cli import transcode

            assert transcode() == 0

        source_blob = fake_gcs[f"source-bucket/{self.SOURCE_KEY}"]
        source_blob.download_to_filename.assert_called_once()

    def test_still_deletes_the_source_through_storage(
        self, fake_gcs, stub_ffmpeg, tmp_path: Path
    ) -> None:
        # The mount is read-only. The source goes the way it always
        # has, once the renditions verify.
        mounted = tmp_path / self.SOURCE_KEY
        mounted.parent.mkdir(parents=True)
        mounted.write_bytes(b"lecture")
        env = {**BASE_ENV, "TEACHING_VIDEOS_SOURCE_MOUNT": str(tmp_path)}

        with patch.dict(os.environ, env, clear=False):
            from scripts.transcode_cli import transcode

            assert transcode() == 0

        fake_gcs[
            f"source-bucket/{self.SOURCE_KEY}"
        ].delete.assert_called_once()
