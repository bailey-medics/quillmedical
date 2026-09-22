"""Tests for what the admin card says about an upload in progress.

The card used to show "No captions" from the moment a file landed until
Whisper finished — a statement of absence where the truth was "not yet".
It sent someone re-uploading a video that was processing perfectly, and
it said the same thing for two days while the caption job was
unconfigured and nothing at all was coming.

What is tested here is the distinction that fixes both: a job running
and a job that will never finish look identical in the completion
columns, and only the start times tell them apart.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from app.features.teaching.media import describe_progress
from app.features.teaching.models import ModuleMediaLink

NOW = datetime(2026, 9, 17, 12, 0, tzinfo=UTC)


def _link(**overrides: object) -> ModuleMediaLink:
    """A freshly linked upload, which individual tests advance."""
    row = ModuleMediaLink(
        organisation_id=1,
        question_bank_id="mod",
        media_key="lecture-01",
        asset_id="asset-1",
        original_filename="lecture.mp4",
        content_type="video/mp4",
        size_bytes=1024,
        uploaded_at=NOW - timedelta(minutes=5),
    )
    for field, value in overrides.items():
        setattr(row, field, value)
    return row


class TestNothingHasStarted:
    """Uploaded, and no job invoked."""

    def test_it_says_processing_has_not_started(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # The state that produced two days of silence. It is not "in
        # progress": nothing is running, and saying otherwise is the
        # error this whole feature exists to correct.
        #
        # A job has to be configured for this to be the right words: it
        # means "something should have started and has not". Where none
        # is configured there is nothing to wait for, which is the test
        # below.
        monkeypatch.setattr(
            "app.config.settings.TEACHING_TRANSCODE_JOB",
            "projects/p/locations/l/jobs/quill-transcode-teaching",
        )
        p = describe_progress(_link(), now=NOW)

        assert p.stage == 1
        assert p.in_progress is False
        assert p.stalled is False
        assert "not started" in p.label

    def test_without_a_job_it_says_the_video_plays_as_uploaded(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Development, where no transcode is coming and none is needed.

        "Processing has not started" describes a wait that is not
        happening: the learner gate serves the upload itself here, so
        the card should say the video works rather than imply it is
        stuck behind a job nobody configured.
        """
        monkeypatch.setattr("app.config.settings.TEACHING_TRANSCODE_JOB", None)
        p = describe_progress(_link(), now=NOW)

        assert p.in_progress is False
        assert p.stalled is False
        assert "without processing" in p.label
        # Final, so the card drops the bar rather than drawing one a
        # quarter full for the rest of the video's life.
        assert p.is_final is True


class TestTranscodeRunning:
    """Invoked, and within the time it plausibly needs."""

    def test_it_says_the_video_is_being_prepared(self) -> None:
        p = describe_progress(
            _link(transcode_started_at=NOW - timedelta(minutes=3)), now=NOW
        )

        assert p.stage == 1
        assert p.in_progress is True
        assert p.stalled is False

    def test_a_long_overrun_is_called_a_failure(self) -> None:
        # The job's own timeout is twenty minutes, so past this it has
        # certainly failed rather than been unlucky. Saying "preparing"
        # forever is how someone waits all afternoon for nothing.
        p = describe_progress(
            _link(transcode_started_at=NOW - timedelta(hours=3)), now=NOW
        )

        assert p.in_progress is False
        assert p.stalled is True
        assert "failed" in p.label
        # Not final, though nothing is running: a job that should have
        # finished and did not is unfinished work, and the bar says so.
        assert p.is_final is False


class TestCaptionsOutstanding:
    """Renditions exist, so the video plays; captions do not."""

    def test_captions_not_started_is_not_in_progress(self) -> None:
        # Exactly the state that lasted two days. The video works, and
        # the card must say the captions are not coming rather than
        # implying they are on their way.
        p = describe_progress(
            _link(
                transcode_started_at=NOW - timedelta(minutes=20),
                transcoded_at=NOW - timedelta(minutes=15),
            ),
            now=NOW,
        )

        assert p.stage == 2
        assert p.in_progress is False
        assert "have not started" in p.label

    def test_captions_running_says_so(self) -> None:
        p = describe_progress(
            _link(
                transcoded_at=NOW - timedelta(minutes=15),
                caption_started_at=NOW - timedelta(minutes=2),
            ),
            now=NOW,
        )

        assert p.stage == 2
        assert p.in_progress is True
        assert p.stalled is False

    def test_captions_overrunning_are_called_failed(self) -> None:
        p = describe_progress(
            _link(
                transcoded_at=NOW - timedelta(hours=5),
                caption_started_at=NOW - timedelta(hours=4),
            ),
            now=NOW,
        )

        assert p.in_progress is False
        assert p.stalled is True
        assert "failed" in p.label
        # Not final, though nothing is running: a job that should have
        # finished and did not is unfinished work, and the bar says so.
        assert p.is_final is False

    def test_the_video_is_described_as_ready_either_way(self) -> None:
        # Renditions exist, so a learner can watch it. Whatever the
        # caption state, the card should not imply the video is broken.
        for caption_started in (None, NOW - timedelta(hours=4)):
            p = describe_progress(
                _link(
                    transcoded_at=NOW - timedelta(hours=5),
                    caption_started_at=caption_started,
                ),
                now=NOW,
            )
            assert "Video ready" in p.label


class TestFinished:
    """Both jobs done."""

    def test_captions_present_but_unchecked(self) -> None:
        p = describe_progress(
            _link(transcoded_at=NOW, has_captions=True), now=NOW
        )

        assert p.stage == 3
        assert p.in_progress is False
        assert "need checking" in p.label
        # Not final: somebody still has to read what Whisper wrote, so
        # the bar stays to say the row is not done with.
        assert p.is_final is False

    def test_captions_checked_is_the_last_stage(self) -> None:
        # Whisper mishears clinical terminology, so a reviewed track is
        # a genuinely different state from a produced one.
        p = describe_progress(
            _link(
                transcoded_at=NOW,
                has_captions=True,
                captions_reviewed_at=NOW,
            ),
            now=NOW,
        )

        assert p.stage == p.total_stages
        assert p.in_progress is False
        assert p.stalled is False
        # The one production state where nothing further is expected,
        # so the card drops the bar.
        assert p.is_final is True


class TestNaiveTimestamps:
    """SQLite hands back timestamps with no timezone."""

    def test_a_naive_start_time_does_not_crash(self) -> None:
        # The unit-test database drops tzinfo, so comparing against an
        # aware `now` would raise. Treated as UTC rather than blowing up
        # the admin card in the one environment the tests run in.
        p = describe_progress(
            _link(transcode_started_at=datetime(2026, 9, 17, 11, 58)),
            now=NOW,
        )

        assert p.in_progress is True
