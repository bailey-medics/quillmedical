"""Tests for the caption CLI script (Cloud Run Job).

Whisper itself is never loaded here - it lives in a separate image and
pulls torch, which this test environment does not have. What is tested
is everything around it: the WebVTT the job writes, the object keys it
reads and writes, and the validation that stops one organisation's job
reaching another's prefix.

The formatting functions were deliberately split out of the job's main
body so they can be exercised without any of that machinery.
"""

from __future__ import annotations

import json
import os
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
    only one passes in isolation and fails once any earlier test has
    imported the real module.
    """
    return (
        patch.dict("sys.modules", {"google.cloud.storage": storage_module}),
        patch.object(_gc, "storage", storage_module, create=True),
    )


AUDIENCE = "https://quill-backend-test-123.europe-west2.run.app"


def _stub_urlopen(status: int = 200, side_effect=None):
    """Patch `urlopen` and expose the Request it was handed.

    The callbacks use the standard library rather than `httpx`: the
    caption image carries its own three pinned packages and `httpx` was
    not among them, so the report failed with `No module named 'httpx'`
    after Whisper had already done an hour's work. Asserting on the
    `Request` is what proves the wire format, which is the part a
    missing import silently changed.
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
    "CAPTION_ORG_ID": "7",
    "CAPTION_MODULE_ID": "colonoscopy-basics",
    "CAPTION_ASSET_ID": "a1b2c3d4",
    "TEACHING_VIDEOS_BUCKET": "processed-bucket",
}


class TestTimestampFormatting:
    """WebVTT is strict, and a player that dislikes it says nothing."""

    def test_whole_seconds(self) -> None:
        from scripts.caption_cli import _format_timestamp

        assert _format_timestamp(0) == "00:00:00.000"
        assert _format_timestamp(5) == "00:00:05.000"

    def test_minutes_and_hours_are_zero_padded(self) -> None:
        from scripts.caption_cli import _format_timestamp

        assert _format_timestamp(61.5) == "00:01:01.500"
        assert _format_timestamp(3661.25) == "01:01:01.250"

    def test_milliseconds_use_a_full_stop_not_a_comma(self) -> None:
        """SubRip uses a comma; WebVTT does not, and a player given the
        wrong separator shows no captions at all."""
        from scripts.caption_cli import _format_timestamp

        assert "," not in _format_timestamp(1.234)
        assert _format_timestamp(1.234) == "00:00:01.234"

    def test_rounding_up_carries_into_the_next_second(self) -> None:
        """Rather than emitting the impossible ``.1000``."""
        from scripts.caption_cli import _format_timestamp

        assert _format_timestamp(1.9999) == "00:00:02.000"

    def test_a_negative_start_is_clamped(self) -> None:
        from scripts.caption_cli import _format_timestamp

        assert _format_timestamp(-0.5) == "00:00:00.000"


class TestWebVtt:
    """The document as a whole."""

    def test_it_starts_with_the_webvtt_header(self) -> None:
        """Without it the file is not WebVTT and nothing will play it."""
        from scripts.caption_cli import to_webvtt

        out = to_webvtt([{"start": 0.0, "end": 1.0, "text": "Hello"}])
        assert out.startswith("WEBVTT\n")

    def test_a_cue_carries_its_times_and_text(self) -> None:
        from scripts.caption_cli import to_webvtt

        out = to_webvtt([{"start": 1.5, "end": 3.25, "text": " The caecum. "}])
        assert "00:00:01.500 --> 00:00:03.250" in out
        # Whisper pads its text with spaces; they are stripped.
        assert "\nThe caecum.\n" in out

    def test_several_cues_are_separated_by_blank_lines(self) -> None:
        from scripts.caption_cli import to_webvtt

        out = to_webvtt(
            [
                {"start": 0.0, "end": 1.0, "text": "One"},
                {"start": 1.0, "end": 2.0, "text": "Two"},
            ]
        )
        assert "One\n\n00:00:01.000" in out

    def test_empty_segments_are_dropped(self) -> None:
        """Whisper emits them for silence, and a cue with no body is a
        flicker on screen."""
        from scripts.caption_cli import to_webvtt

        out = to_webvtt(
            [
                {"start": 0.0, "end": 1.0, "text": "   "},
                {"start": 1.0, "end": 2.0, "text": "Real"},
            ]
        )
        assert out.count("-->") == 1
        assert "Real" in out


class TestCaptionJob:
    """The object keys, and what is uploaded where."""

    def _bucket(self, *, source_exists: bool = True) -> MagicMock:
        blobs: dict[str, MagicMock] = {}

        def _blob(path: str) -> MagicMock:
            existing = blobs.get(path)

            if existing is not None:
                return existing

            blob = MagicMock()
            blob.exists.return_value = (
                source_exists if path.endswith(".mp4") else True
            )
            blobs[path] = blob

            return blob

        bucket = MagicMock()
        bucket.blob.side_effect = _blob
        bucket.blobs = blobs

        return bucket

    def _run(
        self, bucket: MagicMock, segments=None, *, has_audio: bool = True
    ) -> int:
        client = MagicMock()
        client.bucket.return_value = bucket
        storage_module = MagicMock()
        storage_module.Client.return_value = client
        modules_patch, attr_patch = _patch_storage(storage_module)

        with patch.dict(os.environ, BASE_ENV, clear=False):
            from scripts.caption_cli import caption

            with modules_patch, attr_patch:
                with (
                    patch(
                        "scripts.caption_cli.has_audio_stream",
                        return_value=has_audio,
                    ),
                    patch(
                        "scripts.caption_cli.transcribe",
                        return_value=(
                            segments
                            if segments is not None
                            else [{"start": 0.0, "end": 1.0, "text": "Hello"}]
                        ),
                    ) as self.transcribe,
                    patch("scripts.caption_cli._report_captions") as report,
                ):
                    self.report = report

                    return caption()

    def test_english_is_asked_for_and_no_prompt_is_given_by_default(
        self,
    ) -> None:
        # Left to guess, Whisper heard the first EoEETA lecture as Welsh.
        with patch.dict(
            os.environ, {"CAPTION_LANGUAGE": "", "CAPTION_PROMPT": ""}
        ):
            assert self._run(self._bucket()) == 0

        kwargs = self.transcribe.call_args.kwargs
        assert kwargs["language"] == "en"
        assert kwargs["prompt"] is None

    def test_the_language_and_prompt_are_taken_from_the_environment(
        self,
    ) -> None:
        env = {
            "CAPTION_LANGUAGE": "cy",
            "CAPTION_PROMPT": "Glossary: colonoscopy, adenoma.",
        }

        with patch.dict(os.environ, env):
            assert self._run(self._bucket()) == 0

        kwargs = self.transcribe.call_args.kwargs
        assert kwargs["language"] == "cy"
        assert kwargs["prompt"] == "Glossary: colonoscopy, adenoma."

    def test_it_reads_the_720p_rendition(self) -> None:
        """Not the source object: the transcode job deletes its master
        once the renditions verify, so it is usually gone by now."""
        bucket = self._bucket()
        assert self._run(bucket) == 0

        assert "7/colonoscopy-basics/a1b2c3d4-720p.mp4" in bucket.blobs

    def test_it_writes_the_vtt_beside_the_renditions(self) -> None:
        # Same prefix as the video, because that is what the signed
        # cookie covers and what base_url addresses.
        bucket = self._bucket()
        assert self._run(bucket) == 0

        assert "7/colonoscopy-basics/a1b2c3d4.vtt" in bucket.blobs

    def test_it_sets_cache_control_on_the_vtt(self) -> None:
        """Without it the CDN revalidates on every request."""
        bucket = self._bucket()
        assert self._run(bucket) == 0

        vtt = bucket.blobs["7/colonoscopy-basics/a1b2c3d4.vtt"]
        assert vtt.cache_control == "public, max-age=86400"

    def test_a_missing_rendition_fails_rather_than_guessing(self) -> None:
        bucket = self._bucket(source_exists=False)
        assert self._run(bucket) == 1

    def test_no_speech_writes_nothing_and_succeeds(self) -> None:
        """A lecture with no speech has no captions, and an empty track
        would claim otherwise."""
        bucket = self._bucket()
        assert self._run(bucket, segments=[]) == 0

        assert "7/colonoscopy-basics/a1b2c3d4.vtt" not in bucket.blobs

    def test_no_speech_is_reported(self) -> None:
        """Unreported, the module waited for captions that cannot exist,
        and the card said captions had failed."""
        bucket = self._bucket()
        assert self._run(bucket, segments=[]) == 0

        self.report.assert_called_once_with(
            7, "colonoscopy-basics", "a1b2c3d4", no_speech=True
        )

    def test_no_audio_track_is_reported_without_running_whisper(
        self,
    ) -> None:
        """Whisper's FFmpeg fails outright on a file with no audio, so
        a silent video read as a broken job."""
        bucket = self._bucket()
        assert self._run(bucket, has_audio=False) == 0

        self.transcribe.assert_not_called()
        self.report.assert_called_once_with(
            7, "colonoscopy-basics", "a1b2c3d4", no_speech=True
        )
        assert "7/colonoscopy-basics/a1b2c3d4.vtt" not in bucket.blobs

    def test_speech_is_reported_as_captions(self) -> None:
        bucket = self._bucket()
        assert self._run(bucket) == 0

        self.report.assert_called_once_with(
            7, "colonoscopy-basics", "a1b2c3d4"
        )

    @pytest.mark.parametrize(
        "field,value",
        [
            ("CAPTION_MODULE_ID", "../secret"),
            ("CAPTION_ASSET_ID", "../../etc/passwd"),
            ("CAPTION_ORG_ID", "0"),
            ("CAPTION_ORG_ID", "not-a-number"),
        ],
    )
    def test_it_refuses_a_traversal_or_bad_org(self, field, value) -> None:
        """Validated by the same helper that guards every other path
        building an object key."""
        env = {**BASE_ENV, field: value}
        storage_module = MagicMock()
        modules_patch, attr_patch = _patch_storage(storage_module)

        with patch.dict(os.environ, env, clear=False):
            from scripts.caption_cli import caption

            with modules_patch, attr_patch:
                assert caption() == 1

    def test_it_exits_on_a_missing_variable(self) -> None:
        env = {k: v for k, v in BASE_ENV.items() if k != "CAPTION_ASSET_ID"}

        with patch.dict(os.environ, env, clear=True):
            from scripts.caption_cli import caption

            with pytest.raises(SystemExit) as exc:
                caption()
            assert exc.value.code == 1


class TestTranscribe:
    """What reaches Whisper itself. Whisper is not installed outside the
    caption image, so a stand-in takes its place."""

    def _transcribe(self, **kwargs) -> MagicMock:
        from pathlib import Path

        whisper = MagicMock()
        model = whisper.load_model.return_value
        model.transcribe.return_value = {"segments": []}

        with patch.dict("sys.modules", {"whisper": whisper}):
            from scripts.caption_cli import transcribe

            transcribe(Path("lecture.mp4"), "small", **kwargs)

        return model.transcribe

    def test_the_language_is_given_not_guessed(self) -> None:
        call = self._transcribe(language="en")

        assert call.call_args.kwargs["language"] == "en"

    def test_each_window_stands_on_its_own(self) -> None:
        # Fed the text before it, one bad window misleads the next, and
        # the first lecture repeated one phrase for minutes.
        call = self._transcribe()

        assert call.call_args.kwargs["condition_on_previous_text"] is False

    def test_the_prompt_is_passed_as_the_initial_prompt(self) -> None:
        call = self._transcribe(prompt="Glossary: colonoscopy.")

        assert call.call_args.kwargs["initial_prompt"] == (
            "Glossary: colonoscopy."
        )

    def test_no_prompt_passes_none(self) -> None:
        call = self._transcribe()

        assert call.call_args.kwargs["initial_prompt"] is None


class TestCaptionReport:
    """The callback that makes the track reachable.

    The player composes the caption URL from `has_captions`, not by
    listing the bucket, so a WebVTT nobody recorded is never offered.
    """

    def test_skips_silently_when_unconfigured(self, capsys) -> None:
        from scripts.caption_cli import _report_captions

        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("CAPTION_CALLBACK_URL", None)
            os.environ.pop("CAPTION_CALLBACK_AUDIENCE", None)
            _report_captions(7, "mod", "asset-1")

        assert "Callback not configured" in capsys.readouterr().err

    def test_posts_the_three_ids(self) -> None:
        from scripts.caption_cli import _report_captions

        env = {
            "CAPTION_CALLBACK_URL": "https://example.test/cb",
            "CAPTION_CALLBACK_AUDIENCE": AUDIENCE,
        }

        with patch.dict(os.environ, env, clear=False):
            stub, captured = _stub_urlopen()
            with stub:
                _report_captions(7, "mod", "asset-1")

        assert captured["json"] == {
            "org_id": 7,
            "module_id": "mod",
            "asset_id": "asset-1",
        }
        assert captured["headers"]["authorization"] == "Bearer signed-id-token"
        assert captured["audience"] == AUDIENCE

    def test_it_uses_its_own_endpoint_not_the_transcode_one(self) -> None:
        """Sending a caption report to the transcode callback would
        clear has_1080p and has_poster, because that endpoint rewrites
        every flag from the list it is given."""
        from scripts.caption_cli import _report_captions

        env = {
            "CAPTION_CALLBACK_URL": "https://example.test/caption-complete",
            "CAPTION_CALLBACK_AUDIENCE": AUDIENCE,
        }

        with patch.dict(os.environ, env, clear=False):
            stub, captured = _stub_urlopen()
            with stub:
                _report_captions(7, "mod", "asset-1")

        assert "caption-complete" in str(captured["url"])
        assert "outputs" not in captured["json"]

    def test_no_speech_goes_to_its_own_endpoint(self) -> None:
        from scripts.caption_cli import _report_captions

        env = {
            "CAPTION_CALLBACK_URL": (
                "https://api.test/api/ci/teaching/caption-complete"
            ),
            "CAPTION_CALLBACK_AUDIENCE": AUDIENCE,
        }

        with patch.dict(os.environ, env, clear=False):
            stub, captured = _stub_urlopen()
            with stub:
                _report_captions(7, "mod", "asset-1", no_speech=True)

        assert captured["url"] == "https://api.test/api/ci/teaching/no-speech"
        assert captured["json"] == {
            "org_id": 7,
            "module_id": "mod",
            "asset_id": "asset-1",
        }
        assert captured["headers"]["authorization"] == "Bearer signed-id-token"

    def test_no_identity_token_means_no_report(self, capsys) -> None:
        """A laptop, or a metadata server that is down: the report is
        skipped and said so, and nothing is posted with no token."""
        from scripts.caption_cli import _report_captions

        env = {
            "CAPTION_CALLBACK_URL": "https://example.test/cb",
            "CAPTION_CALLBACK_AUDIENCE": AUDIENCE,
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
                _report_captions(7, "mod", "asset-1")

        assert "caption report was not sent" in capsys.readouterr().err
        assert "url" not in captured

    def test_a_refusal_does_not_raise(self, capsys) -> None:
        from scripts.caption_cli import _report_captions

        env = {
            "CAPTION_CALLBACK_URL": "https://example.test/cb",
            "CAPTION_CALLBACK_AUDIENCE": AUDIENCE,
        }

        with patch.dict(os.environ, env, clear=False):
            stub, _ = _stub_urlopen(status=401)
            with stub:
                _report_captions(7, "mod", "asset-1")

        assert "refused" in capsys.readouterr().err

    def test_a_network_failure_does_not_raise(self, capsys) -> None:
        """An hour of Whisper must not be re-run over an unreachable
        callback."""
        from scripts.caption_cli import _report_captions

        env = {
            "CAPTION_CALLBACK_URL": "https://example.test/cb",
            "CAPTION_CALLBACK_AUDIENCE": AUDIENCE,
        }

        with patch.dict(os.environ, env, clear=False):
            stub, _ = _stub_urlopen(side_effect=OSError("no route"))
            with stub:
                _report_captions(7, "mod", "asset-1")

        assert "callback failed" in capsys.readouterr().err


class TestHasAudioStream:
    """FFprobe's answer, and what is assumed when it has none."""

    def _probe(self, returncode: int, stdout: str) -> bool:
        from pathlib import Path

        from scripts.caption_cli import has_audio_stream

        result = MagicMock(returncode=returncode, stdout=stdout)

        with patch("subprocess.run", return_value=result):
            return has_audio_stream(Path("video.mp4"))

    def test_an_audio_stream_is_found(self) -> None:
        assert self._probe(0, "1\n") is True

    def test_no_audio_stream_is_found(self) -> None:
        assert self._probe(0, "") is False

    def test_a_probe_that_fails_lets_whisper_try(self) -> None:
        # Whisper's own error is then the one in the log.
        assert self._probe(1, "") is True

    def test_no_ffprobe_lets_whisper_try(self) -> None:
        from pathlib import Path

        from scripts.caption_cli import has_audio_stream

        with patch("subprocess.run", side_effect=FileNotFoundError):
            assert has_audio_stream(Path("video.mp4")) is True
