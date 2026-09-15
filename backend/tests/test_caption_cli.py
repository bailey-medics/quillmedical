"""Tests for the caption CLI script (Cloud Run Job).

Whisper itself is never loaded here — it lives in a separate image and
pulls torch, which this test environment does not have. What is tested
is everything around it: the WebVTT the job writes, the object keys it
reads and writes, and the validation that stops one organisation's job
reaching another's prefix.

The formatting functions were deliberately split out of the job's main
body so they can be exercised without any of that machinery.
"""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import google.cloud as _gc
import pytest


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

    def _run(self, bucket: MagicMock, segments=None) -> int:
        client = MagicMock()
        client.bucket.return_value = bucket
        storage_module = MagicMock()
        storage_module.Client.return_value = client
        modules_patch, attr_patch = _patch_storage(storage_module)

        with patch.dict(os.environ, BASE_ENV, clear=False):
            from scripts.caption_cli import caption

            with modules_patch, attr_patch:
                with patch(
                    "scripts.caption_cli.transcribe",
                    return_value=(
                        segments
                        if segments is not None
                        else [{"start": 0.0, "end": 1.0, "text": "Hello"}]
                    ),
                ):
                    return caption()

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


class TestCaptionReport:
    """The callback that makes the track reachable.

    The player composes the caption URL from `has_captions`, not by
    listing the bucket, so a WebVTT nobody recorded is never offered.
    """

    def test_skips_silently_when_unconfigured(self, capsys) -> None:
        from scripts.caption_cli import _report_captions

        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("CAPTION_CALLBACK_URL", None)
            os.environ.pop("CAPTION_CALLBACK_TOKEN", None)
            _report_captions(7, "mod", "asset-1")

        assert "Callback not configured" in capsys.readouterr().err

    def test_posts_the_three_ids(self) -> None:
        from scripts.caption_cli import _report_captions

        env = {
            "CAPTION_CALLBACK_URL": "https://example.test/cb",
            "CAPTION_CALLBACK_TOKEN": "tok",
        }
        with patch.dict(os.environ, env, clear=False):
            with patch("httpx.post") as post:
                post.return_value = MagicMock(status_code=200)
                _report_captions(7, "mod", "asset-1")

        sent = post.call_args.kwargs["json"]
        assert sent == {
            "org_id": 7,
            "module_id": "mod",
            "asset_id": "asset-1",
        }
        assert post.call_args.kwargs["headers"]["Authorization"] == (
            "Bearer tok"
        )

    def test_it_uses_its_own_endpoint_not_the_transcode_one(self) -> None:
        """Sending a caption report to the transcode callback would
        clear has_1080p and has_poster, because that endpoint rewrites
        every flag from the list it is given."""
        from scripts.caption_cli import _report_captions

        env = {
            "CAPTION_CALLBACK_URL": "https://example.test/caption-complete",
            "CAPTION_CALLBACK_TOKEN": "tok",
        }
        with patch.dict(os.environ, env, clear=False):
            with patch("httpx.post") as post:
                post.return_value = MagicMock(status_code=200)
                _report_captions(7, "mod", "asset-1")

        assert "caption-complete" in post.call_args.args[0]
        assert "outputs" not in post.call_args.kwargs["json"]

    def test_a_refusal_does_not_raise(self, capsys) -> None:
        from scripts.caption_cli import _report_captions

        env = {
            "CAPTION_CALLBACK_URL": "https://example.test/cb",
            "CAPTION_CALLBACK_TOKEN": "tok",
        }
        with patch.dict(os.environ, env, clear=False):
            with patch("httpx.post") as post:
                post.return_value = MagicMock(status_code=401)
                _report_captions(7, "mod", "asset-1")

        assert "refused" in capsys.readouterr().err

    def test_a_network_failure_does_not_raise(self, capsys) -> None:
        """An hour of Whisper must not be re-run over an unreachable
        callback."""
        from scripts.caption_cli import _report_captions

        env = {
            "CAPTION_CALLBACK_URL": "https://example.test/cb",
            "CAPTION_CALLBACK_TOKEN": "tok",
        }
        with patch.dict(os.environ, env, clear=False):
            with patch("httpx.post", side_effect=OSError("no route")):
                _report_captions(7, "mod", "asset-1")

        assert "callback failed" in capsys.readouterr().err
