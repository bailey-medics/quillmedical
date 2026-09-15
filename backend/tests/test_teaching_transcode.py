"""Tests for invoking the transcode job.

The backend is the trigger, not Eventarc, so ``link_module_media`` is
what fires the job — and the property that matters most here is what
happens when firing fails. Linking an upload has already succeeded by
that point, so a job that cannot be reached must not turn a successful
upload into a failed request.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


class TestStartTranscode:
    """The helper on its own, without a router around it."""

    def test_returns_none_when_no_job_is_configured(self, monkeypatch) -> None:
        """The normal development case, not an error.

        A developer uploading through the admin card gets their file
        stored and no renditions, and the module stays incomplete —
        the same safe direction as a job that fails.
        """
        from app.features.teaching.transcode import start_transcode

        monkeypatch.setattr("app.config.settings.TEACHING_TRANSCODE_JOB", None)
        assert start_transcode(7, "colonoscopy-basics", "a1b2c3d4") is None

    def test_passes_the_three_ids_as_env_overrides(self, monkeypatch) -> None:
        """The job reads these and nothing else."""
        from app.features.teaching.transcode import start_transcode

        monkeypatch.setattr(
            "app.config.settings.TEACHING_TRANSCODE_JOB",
            "projects/p/locations/l/jobs/quill-transcode-teaching",
        )

        client = MagicMock()
        client.run_job.return_value.operation.name = "operations/abc"

        with patch("google.cloud.run_v2.JobsClient", return_value=client):
            result = start_transcode(7, "colonoscopy-basics", "a1b2c3d4")

        assert result == "operations/abc"
        request = client.run_job.call_args.kwargs["request"]
        assert request.name.endswith("quill-transcode-teaching")

        env = request.overrides.container_overrides[0].env
        passed = {var.name: var.value for var in env}
        assert passed == {
            "TRANSCODE_ORG_ID": "7",
            "TRANSCODE_MODULE_ID": "colonoscopy-basics",
            "TRANSCODE_ASSET_ID": "a1b2c3d4",
        }

    def test_a_failure_is_swallowed_not_raised(self, monkeypatch) -> None:
        """The property the whole design rests on.

        The upload has already succeeded when this runs. Raising here
        would report it as a failure and leave the admin re-uploading
        900 MB over a fault that has nothing to do with their file.
        """
        from app.features.teaching.transcode import start_transcode

        monkeypatch.setattr(
            "app.config.settings.TEACHING_TRANSCODE_JOB",
            "projects/p/locations/l/jobs/quill-transcode-teaching",
        )

        with patch(
            "google.cloud.run_v2.JobsClient",
            side_effect=RuntimeError("Cloud Run unreachable"),
        ):
            # No pytest.raises: returning None is the contract.
            assert start_transcode(7, "mod", "asset") is None

    def test_org_id_reaches_the_job_as_a_string(self, monkeypatch) -> None:
        """Env vars are strings; the CLI parses the int back itself."""
        from app.features.teaching.transcode import start_transcode

        monkeypatch.setattr(
            "app.config.settings.TEACHING_TRANSCODE_JOB",
            "projects/p/locations/l/jobs/j",
        )

        client = MagicMock()
        client.run_job.return_value.operation.name = "operations/x"

        with patch("google.cloud.run_v2.JobsClient", return_value=client):
            start_transcode(42, "mod", "asset")

        env = (
            client.run_job.call_args.kwargs["request"]
            .overrides.container_overrides[0]
            .env
        )
        org = next(v for v in env if v.name == "TRANSCODE_ORG_ID")
        assert org.value == "42"
        assert isinstance(org.value, str)


class TestRenditionFlags:
    """The mapping between an output and the column it sets."""

    def test_every_flag_names_a_real_column(self) -> None:
        from app.features.teaching.models import ModuleMediaLink
        from app.features.teaching.transcode import RENDITION_FLAGS

        for column, _suffix in RENDITION_FLAGS:
            assert hasattr(ModuleMediaLink, column)

    def test_suffixes_match_the_object_key_contract(self) -> None:
        """Deterministic names, so nothing has to list the bucket."""
        from app.features.teaching.transcode import RENDITION_FLAGS

        suffixes = {column: suffix for column, suffix in RENDITION_FLAGS}
        assert suffixes["has_1080p"] == "-1080p.mp4"
        assert suffixes["has_poster"] == "-poster.jpg"
        assert suffixes["has_captions"] == ".vtt"


class TestTranscodeStateDefaults:
    """A freshly linked asset has produced nothing yet."""

    def test_a_new_link_has_no_transcode_state(self, db_session) -> None:
        from datetime import UTC, datetime

        from app.features.teaching.models import ModuleMediaLink

        link = ModuleMediaLink(
            organisation_id=1,
            question_bank_id="test-bank",
            media_key="lecture-01",
            asset_id="asset-1",
            original_filename="lecture.mp4",
            content_type="video/mp4",
            size_bytes=1024,
            uploaded_at=datetime.now(UTC),
        )
        db_session.add(link)
        db_session.commit()
        db_session.refresh(link)

        # None is "uploaded but not yet transcoded" — the state the
        # availability gate needs so a module is not served with a
        # slide whose video has no renditions.
        assert link.transcoded_at is None
        assert link.has_1080p is False
        assert link.has_poster is False
        assert link.has_captions is False


@pytest.mark.parametrize("field", ["has_1080p", "has_poster", "has_captions"])
def test_flags_are_not_nullable(field: str) -> None:
    """False rather than NULL, so a check never has to handle three
    states for a two-state fact."""
    from app.features.teaching.models import ModuleMediaLink

    column = ModuleMediaLink.__table__.columns[field]
    assert column.nullable is False
    assert column.server_default is not None


class TestStartCaption:
    """Firing the caption job, which the transcode report triggers.

    Invoked from the completion callback rather than from the upload,
    because Whisper transcribes the 720p rendition and that does not
    exist until the transcode job has written it.
    """

    def test_returns_none_when_no_job_is_configured(self, monkeypatch) -> None:
        """Development: a module has no captions until someone writes
        them in the admin editor, which is a real workflow."""
        from app.features.teaching.transcode import start_caption

        monkeypatch.setattr("app.config.settings.TEACHING_CAPTION_JOB", None)
        assert start_caption(7, "colonoscopy-basics", "a1b2c3d4") is None

    def test_passes_the_three_ids_as_env_overrides(self, monkeypatch) -> None:
        """Its own variable names, not the transcode job's."""
        from app.features.teaching.transcode import start_caption

        monkeypatch.setattr(
            "app.config.settings.TEACHING_CAPTION_JOB",
            "projects/p/locations/l/jobs/quill-caption-teaching",
        )

        client = MagicMock()
        client.run_job.return_value.operation.name = "operations/xyz"

        with patch("google.cloud.run_v2.JobsClient", return_value=client):
            result = start_caption(7, "colonoscopy-basics", "a1b2c3d4")

        assert result == "operations/xyz"
        request = client.run_job.call_args.kwargs["request"]
        assert request.name.endswith("quill-caption-teaching")

        env = request.overrides.container_overrides[0].env
        passed = {var.name: var.value for var in env}
        assert passed == {
            "CAPTION_ORG_ID": "7",
            "CAPTION_MODULE_ID": "colonoscopy-basics",
            "CAPTION_ASSET_ID": "a1b2c3d4",
        }

    def test_a_failure_is_swallowed_not_raised(self, monkeypatch) -> None:
        """The caller is the transcode completion endpoint, and the
        renditions it is recording are what matter. A caption job that
        cannot be reached must not cost the module its transcoded_at,
        or the video stays hidden over a missing subtitle track."""
        from app.features.teaching.transcode import start_caption

        monkeypatch.setattr(
            "app.config.settings.TEACHING_CAPTION_JOB",
            "projects/p/locations/l/jobs/quill-caption-teaching",
        )

        with patch(
            "google.cloud.run_v2.JobsClient",
            side_effect=RuntimeError("no credentials"),
        ):
            assert start_caption(7, "mod", "asset") is None
