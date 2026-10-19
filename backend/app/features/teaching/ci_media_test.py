"""What the video jobs' reports record, called directly.

The caption job is never really fired: ``start_caption`` is replaced by
something that notes what it was asked for, and what the row said at
that moment.
"""

from datetime import UTC, datetime
from unittest.mock import patch

import pytest
from sqlalchemy.orm import Session

from app.config import settings
from app.features.teaching import ci_media
from app.features.teaching.ci_media import (
    _media_link,
    after_scan,
    record_captions,
    record_transcode,
)
from app.features.teaching.errors import MediaAssetNotFound, TeachingError
from app.features.teaching.models import ModuleMediaLink

ORG_ID = 1
MODULE_ID = "test-bank"
ASSET_ID = "asset-1"


def _upload(
    db: Session,
    *,
    org_id: int = ORG_ID,
    module_id: str = MODULE_ID,
    asset_id: str = ASSET_ID,
    media_key: str = "lecture-01",
) -> ModuleMediaLink:
    """An upload whose jobs have not yet reported."""
    row = ModuleMediaLink(
        organisation_id=org_id,
        org_unit_id=1,
        question_bank_id=module_id,
        media_key=media_key,
        asset_id=asset_id,
        original_filename="lecture.mp4",
        content_type="video/mp4",
        size_bytes=1024,
        uploaded_at=datetime.now(UTC),
    )
    db.add(row)
    db.flush()

    return row


class _CaptionJob:
    """What the caption job was asked for, and the row as it was then."""

    def __init__(self) -> None:
        self.asked_for: list[tuple[int, str, str]] = []
        self.started_at_when_asked: list[datetime | None] = []
        self.transcoded_at_when_asked: list[datetime | None] = []


@pytest.fixture()
def caption_job(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> _CaptionJob:
    job = _CaptionJob()

    def fake_start(org_id: int, module_id: str, asset_id: str) -> str | None:
        job.asked_for.append((org_id, module_id, asset_id))
        # Read from the database and not from the object in hand, so
        # this sees only what had been flushed by then.
        db_session.expire_all()
        row = _media_link(db_session, org_id, module_id, asset_id)
        job.started_at_when_asked.append(row.caption_started_at)
        job.transcoded_at_when_asked.append(row.transcoded_at)

        return None

    monkeypatch.setattr(ci_media, "start_caption", fake_start)

    return job


class TestMediaLink:
    def test_the_upload_with_all_three_ids_is_found(
        self, db_session: Session
    ) -> None:
        row = _upload(db_session)
        _upload(db_session, asset_id="asset-2", media_key="lecture-02")

        assert _media_link(db_session, ORG_ID, MODULE_ID, ASSET_ID) is row

    def test_an_asset_nobody_uploaded_is_not_found(
        self, db_session: Session
    ) -> None:
        _upload(db_session)

        with pytest.raises(MediaAssetNotFound):
            _media_link(db_session, ORG_ID, MODULE_ID, "never-existed")

    def test_the_same_asset_under_another_organisation_is_not_found(
        self, db_session: Session
    ) -> None:
        _upload(db_session)

        with pytest.raises(MediaAssetNotFound):
            _media_link(db_session, 999, MODULE_ID, ASSET_ID)

    def test_the_same_asset_in_another_module_is_not_found(
        self, db_session: Session
    ) -> None:
        _upload(db_session)

        with pytest.raises(MediaAssetNotFound):
            _media_link(db_session, ORG_ID, "another-bank", ASSET_ID)

    def test_not_found_is_a_404_in_fixed_words(self) -> None:
        refusal = MediaAssetNotFound()

        assert isinstance(refusal, TeachingError)
        assert refusal.status_code == 404
        assert refusal.message == "No such media asset"
        assert str(refusal) == "No such media asset"


class TestRecordTranscode:
    def test_each_file_reported_sets_its_flag(
        self, db_session: Session, caption_job: _CaptionJob
    ) -> None:
        row = _upload(db_session)

        flags = record_transcode(
            db_session,
            ORG_ID,
            MODULE_ID,
            ASSET_ID,
            ["asset-1-720p.mp4", "asset-1-1080p.mp4", "asset-1-poster.jpg"],
        )

        assert flags == ["has_1080p", "has_poster"]
        assert row.has_1080p is True
        assert row.has_poster is True
        assert row.has_captions is False

    def test_the_flags_come_back_in_a_fixed_order_whatever_was_sent(
        self, db_session: Session, caption_job: _CaptionJob
    ) -> None:
        _upload(db_session)

        flags = record_transcode(
            db_session,
            ORG_ID,
            MODULE_ID,
            ASSET_ID,
            ["asset-1.vtt", "asset-1-poster.jpg", "asset-1-1080p.mp4"],
        )

        assert flags == ["has_1080p", "has_poster", "has_captions"]

    def test_a_file_reported_twice_sets_its_flag_once(
        self, db_session: Session, caption_job: _CaptionJob
    ) -> None:
        _upload(db_session)

        flags = record_transcode(
            db_session,
            ORG_ID,
            MODULE_ID,
            ASSET_ID,
            ["asset-1-poster.jpg", "asset-1-poster.jpg"],
        )

        assert flags == ["has_poster"]

    def test_a_report_of_no_files_still_records_the_transcode(
        self, db_session: Session, caption_job: _CaptionJob
    ) -> None:
        row = _upload(db_session)

        flags = record_transcode(db_session, ORG_ID, MODULE_ID, ASSET_ID, [])

        assert flags == []
        assert row.transcoded_at is not None
        assert row.has_1080p is False
        assert row.has_poster is False
        assert row.has_captions is False

    def test_a_flag_no_longer_reported_is_cleared(
        self, db_session: Session, caption_job: _CaptionJob
    ) -> None:
        row = _upload(db_session)
        row.has_1080p = True
        row.has_poster = True
        row.has_captions = True
        db_session.flush()

        record_transcode(
            db_session, ORG_ID, MODULE_ID, ASSET_ID, ["asset-1-720p.mp4"]
        )

        assert row.has_1080p is False
        assert row.has_poster is False
        assert row.has_captions is False

    def test_the_transcode_is_flushed_and_not_committed(
        self, db_session: Session, caption_job: _CaptionJob
    ) -> None:
        row = _upload(db_session)
        db_session.commit()

        record_transcode(
            db_session, ORG_ID, MODULE_ID, ASSET_ID, ["asset-1-poster.jpg"]
        )
        db_session.rollback()
        db_session.refresh(row)

        assert row.transcoded_at is None
        assert row.has_poster is False

    def test_captions_are_asked_for_where_the_720p_file_was_made(
        self, db_session: Session, caption_job: _CaptionJob
    ) -> None:
        row = _upload(db_session)

        record_transcode(
            db_session, ORG_ID, MODULE_ID, ASSET_ID, ["asset-1-720p.mp4"]
        )

        assert caption_job.asked_for == [(ORG_ID, MODULE_ID, ASSET_ID)]
        assert row.caption_started_at is not None

    def test_the_row_is_recorded_before_captions_are_asked_for(
        self, db_session: Session, caption_job: _CaptionJob
    ) -> None:
        """Both the transcode and the moment the caption job started."""
        _upload(db_session)

        record_transcode(
            db_session, ORG_ID, MODULE_ID, ASSET_ID, ["asset-1-720p.mp4"]
        )

        assert caption_job.started_at_when_asked != [None]
        assert caption_job.transcoded_at_when_asked != [None]
        assert len(caption_job.started_at_when_asked) == 1

    def test_captions_are_not_asked_for_without_the_720p_file(
        self, db_session: Session, caption_job: _CaptionJob
    ) -> None:
        row = _upload(db_session)

        record_transcode(
            db_session,
            ORG_ID,
            MODULE_ID,
            ASSET_ID,
            ["asset-1-1080p.mp4", "asset-1-poster.jpg"],
        )

        assert caption_job.asked_for == []
        assert row.caption_started_at is None
        assert row.transcoded_at is not None

    def test_an_upload_that_is_not_there_is_refused_and_nothing_asked_for(
        self, db_session: Session, caption_job: _CaptionJob
    ) -> None:
        with pytest.raises(MediaAssetNotFound):
            record_transcode(
                db_session,
                ORG_ID,
                MODULE_ID,
                "never-existed",
                ["never-existed-720p.mp4"],
            )

        assert caption_job.asked_for == []

    def test_another_upload_in_the_module_is_left_alone(
        self, db_session: Session, caption_job: _CaptionJob
    ) -> None:
        _upload(db_session)
        other = _upload(db_session, asset_id="asset-2", media_key="lecture-02")

        record_transcode(
            db_session,
            ORG_ID,
            MODULE_ID,
            ASSET_ID,
            ["asset-1-720p.mp4", "asset-1-poster.jpg"],
        )

        assert other.transcoded_at is None
        assert other.has_poster is False
        assert other.caption_started_at is None


class TestRecordCaptions:
    def test_the_caption_track_is_recorded(self, db_session: Session) -> None:
        row = _upload(db_session)

        record_captions(db_session, ORG_ID, MODULE_ID, ASSET_ID)

        assert row.has_captions is True

    def test_nothing_else_about_the_upload_changes(
        self, db_session: Session
    ) -> None:
        """Not the renditions, not the transcode, and not the review a
        person gives the text."""
        row = _upload(db_session)
        transcoded = datetime(2026, 10, 1, 9, 0, tzinfo=UTC)
        row.has_1080p = True
        row.has_poster = True
        row.transcoded_at = transcoded
        db_session.flush()

        record_captions(db_session, ORG_ID, MODULE_ID, ASSET_ID)

        assert row.has_1080p is True
        assert row.has_poster is True
        assert row.transcoded_at == transcoded
        assert row.captions_reviewed_at is None
        assert row.caption_started_at is None

    def test_a_review_already_given_is_kept(self, db_session: Session) -> None:
        row = _upload(db_session)
        reviewed = datetime(2026, 10, 2, 9, 0, tzinfo=UTC)
        row.has_captions = True
        row.captions_reviewed_at = reviewed
        db_session.flush()

        record_captions(db_session, ORG_ID, MODULE_ID, ASSET_ID)

        assert row.has_captions is True
        assert row.captions_reviewed_at == reviewed

    def test_the_caption_track_is_flushed_and_not_committed(
        self, db_session: Session
    ) -> None:
        row = _upload(db_session)
        db_session.commit()

        record_captions(db_session, ORG_ID, MODULE_ID, ASSET_ID)
        db_session.rollback()
        db_session.refresh(row)

        assert row.has_captions is False

    def test_an_upload_that_is_not_there_is_refused(
        self, db_session: Session
    ) -> None:
        with pytest.raises(MediaAssetNotFound):
            record_captions(db_session, ORG_ID, MODULE_ID, "never-existed")


class TestAfterScan:
    """A clean verdict on a teaching upload is what fires the transcode."""

    @pytest.fixture()
    def source_bucket(self, monkeypatch: pytest.MonkeyPatch) -> str:
        monkeypatch.setattr(
            settings, "TEACHING_VIDEOS_SOURCE_BUCKET", "source-bucket"
        )
        monkeypatch.setattr(
            settings,
            "TEACHING_TRANSCODE_JOB",
            "projects/p/locations/l/jobs/transcode",
        )

        return "source-bucket"

    def test_another_bucket_is_not_a_teaching_upload(
        self, db_session: Session, source_bucket: str
    ) -> None:
        with patch(
            "app.features.teaching.transcode.start_transcode"
        ) as started:
            handled = after_scan(
                db_session, "passports-bucket", "1/mod/asset-1", "clean"
            )

        assert handled is False
        started.assert_not_called()

    def test_clean_fires_the_transcode_and_records_its_start(
        self, db_session: Session, source_bucket: str
    ) -> None:
        row = _upload(db_session)

        with patch(
            "app.features.teaching.transcode.start_transcode"
        ) as started:
            handled = after_scan(
                db_session,
                source_bucket,
                f"{ORG_ID}/{MODULE_ID}/{ASSET_ID}",
                "clean",
            )

        assert handled is True
        started.assert_called_once_with(row.org_unit_id, MODULE_ID, ASSET_ID)
        assert row.transcode_started_at is not None

    @pytest.mark.parametrize("verdict", ["infected", "failed"])
    def test_anything_but_clean_fires_nothing(
        self, db_session: Session, source_bucket: str, verdict: str
    ) -> None:
        row = _upload(db_session)

        with patch(
            "app.features.teaching.transcode.start_transcode"
        ) as started:
            handled = after_scan(
                db_session,
                source_bucket,
                f"{ORG_ID}/{MODULE_ID}/{ASSET_ID}",
                verdict,
            )

        assert handled is True
        started.assert_not_called()
        assert row.transcode_started_at is None

    def test_an_upload_deleted_while_the_scan_ran_is_let_go(
        self, db_session: Session, source_bucket: str
    ) -> None:
        with patch(
            "app.features.teaching.transcode.start_transcode"
        ) as started:
            handled = after_scan(
                db_session, source_bucket, "1/mod/never-linked", "clean"
            )

        assert handled is True
        started.assert_not_called()

    def test_a_key_that_is_not_an_upload_path_is_let_go(
        self, db_session: Session, source_bucket: str
    ) -> None:
        with patch(
            "app.features.teaching.transcode.start_transcode"
        ) as started:
            handled = after_scan(
                db_session, source_bucket, "not/a/teaching/key/at/all", "clean"
            )

        assert handled is True
        started.assert_not_called()
