"""An administrator's uploads, asked of media_uploads.py itself.

Neither a bucket nor a job is ever really reached. The store's
functions and ``start_transcode`` are replaced by ones that note what
they were asked for, and uploads to disk go to a folder the test made.
"""

import logging
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.features.teaching import media, storage, transcode
from app.features.teaching.errors import (
    CaptionsCannotBeSaved,
    CaptionsNotWebVTT,
    InvalidAssetId,
    LocalUploadNotOffered,
    MediaAssetNotHeldHere,
    MediaCannotBeDeleted,
    MediaUploadNotConfigured,
    NoModuleToUploadTo,
    TeachingError,
)
from app.features.teaching.media_uploads import (
    StoredVideo,
    delete_upload,
    delete_video_files,
    link_upload,
    local_upload_file,
    local_upload_root,
    looks_like_video,
    new_upload_target,
    save_captions,
    upload_held_by,
)
from app.features.teaching.models import ModuleMediaLink
from app.features.teaching.schemas import CaptionsOut
from app.models import OrgUnit, User

MODULE = "polyps"
OTHER_MODULE = "bleeding"
KEY = "lecture-01"
ASSET = "asset1"
CAPTIONS = "WEBVTT\n\n00:00.000 --> 00:02.000\nThe caecum."

#: Each transcode asked for: the three ids, and the start time on the row.
Transcodes = list[tuple[int, str, str, datetime | None]]

#: Each file the store was asked to remove: the bucket, the three ids,
#: and the end of the file's name ("" for the upload itself).
Removed = list[tuple[str, int, str, str, str]]

#: What the jobs make of one upload, in the order it is removed.
MADE_FROM_IT = ("-720p.mp4", "-1080p.mp4", "-poster.jpg", ".vtt")


def _organisation(db: Session, name: str = "Trust") -> OrgUnit:
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
    db.flush()

    return org


def _person(db: Session, username: str = "coordinator") -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        password_hash="x",
        is_active=True,
        email_verified=True,
        base_profession="teaching_admin",
    )
    db.add(user)
    db.flush()

    return user


def _upload(
    db: Session,
    org: OrgUnit,
    *,
    module_id: str = MODULE,
    media_key: str = KEY,
    asset_id: str = ASSET,
    content_type: str = "video/mp4",
) -> ModuleMediaLink:
    """An upload already linked, whose jobs have not reported."""
    row = ModuleMediaLink(
        org_unit_id=org.id,
        question_bank_id=module_id,
        media_key=media_key,
        asset_id=asset_id,
        original_filename="lecture.mp4",
        content_type=content_type,
        size_bytes=1024,
        uploaded_at=datetime.now(UTC),
    )
    db.add(row)
    db.flush()

    return row


def _links(db: Session) -> list[ModuleMediaLink]:
    return list(
        db.execute(select(ModuleMediaLink).order_by(ModuleMediaLink.id))
        .scalars()
        .all()
    )


def _source_bucket(
    monkeypatch: pytest.MonkeyPatch, name: str | None = "source"
) -> None:
    monkeypatch.setattr(settings, "TEACHING_VIDEOS_SOURCE_BUCKET", name)


def _content_path(monkeypatch: pytest.MonkeyPatch, path: str | None) -> None:
    monkeypatch.setattr(settings, "TEACHING_QUESTION_BANK_PATH", path)


def _captions_bucket(
    monkeypatch: pytest.MonkeyPatch, name: str | None = "processed"
) -> None:
    monkeypatch.setattr(settings, "TEACHING_VIDEOS_BUCKET", name)


def _transcode_job(monkeypatch: pytest.MonkeyPatch, job: str | None) -> None:
    monkeypatch.setattr(settings, "TEACHING_TRANSCODE_JOB", job)


def _module_on_disk(tmp_path: Path, module_id: str = MODULE) -> Path:
    """A content repository holding one module, and the module's folder."""
    module = tmp_path / "content-repo" / "modules" / module_id
    module.mkdir(parents=True)
    (module / "module.yaml").write_text("title: Polyps\n", encoding="utf-8")

    return module


@pytest.fixture()
def transcodes(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> Transcodes:
    """Each transcode asked for, and the row's start time at that moment."""
    asked: Transcodes = []

    def fake_start(org_id: int, module_id: str, asset_id: str) -> str | None:
        started = db_session.execute(
            select(ModuleMediaLink.transcode_started_at).where(
                ModuleMediaLink.asset_id == asset_id
            )
        ).scalar_one()
        asked.append((org_id, module_id, asset_id, started))

        return None

    monkeypatch.setattr(transcode, "start_transcode", fake_start)
    _transcode_job(monkeypatch, None)

    return asked


@pytest.fixture()
def removed(monkeypatch: pytest.MonkeyPatch) -> Removed:
    """Each file either bucket was asked to remove, with both buckets set."""
    asked: Removed = []

    def fake_delete(
        bucket: str, org_id: int, module_id: str, asset_id: str
    ) -> None:
        asked.append((bucket, org_id, module_id, asset_id, ""))

    def fake_delete_processed(
        bucket: str, org_id: int, module_id: str, asset_id: str, suffix: str
    ) -> None:
        asked.append((bucket, org_id, module_id, asset_id, suffix))

    monkeypatch.setattr(storage, "delete_media_object", fake_delete)
    monkeypatch.setattr(
        storage, "delete_processed_media_object", fake_delete_processed
    )
    _source_bucket(monkeypatch, "source")
    _captions_bucket(monkeypatch, "processed")

    return asked


def _every_file(org_id: int, asset_id: str = ASSET) -> Removed:
    """Every file of one video: the upload, then what was made from it."""
    return [
        ("source", org_id, MODULE, asset_id, ""),
        *(
            ("processed", org_id, MODULE, asset_id, suffix)
            for suffix in MADE_FROM_IT
        ),
    ]


def _link(
    db: Session,
    org: OrgUnit,
    user: User,
    *,
    module_id: str = MODULE,
    media_key: str = KEY,
    asset_id: str = ASSET,
    content_type: str = "video/mp4",
) -> ModuleMediaLink:
    return link_upload(
        db,
        user_id=user.id,
        org_unit_id=org.id,
        module_id=module_id,
        media_key=media_key,
        asset_id=asset_id,
        original_filename="Colonoscopy FINAL v3.mp4",
        content_type=content_type,
        size_bytes=943718400,
    )


# --- new_upload_target ------------------------------------------------------


def test_an_upload_for_an_organisation_that_is_not_there_is_refused(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _source_bucket(monkeypatch)

    with pytest.raises(NoModuleToUploadTo) as refused:
        new_upload_target(db_session, 999_999)

    assert isinstance(refused.value, TeachingError)
    assert refused.value.status_code == 404
    assert refused.value.message == "Module not found"


def test_an_upload_with_neither_a_bucket_nor_a_content_path_is_refused(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, None)

    with pytest.raises(MediaUploadNotConfigured) as refused:
        new_upload_target(db_session, org.id)

    assert refused.value.status_code == 503
    assert refused.value.message == "Media upload is not configured"


def test_a_missing_organisation_is_reported_before_missing_configuration(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, None)

    with pytest.raises(NoModuleToUploadTo):
        new_upload_target(db_session, 999_999)


def test_with_a_bucket_an_upload_goes_to_it_under_the_organisations_id(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _source_bucket(monkeypatch, "source")
    _content_path(monkeypatch, None)

    target = new_upload_target(db_session, org.id)

    assert target.bucket == "source"
    assert target.storage_prefix_id == org.id


def test_an_upload_is_filed_under_the_prefix_the_organisation_records(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    org.media_prefix_id = 4242
    db_session.flush()
    _source_bucket(monkeypatch)

    assert new_upload_target(db_session, org.id).storage_prefix_id == 4242


@pytest.mark.parametrize("bucket", [None, ""])
def test_with_no_bucket_and_a_content_path_an_upload_goes_to_disk(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    bucket: str | None,
) -> None:
    org = _organisation(db_session)
    _source_bucket(monkeypatch, bucket)
    _content_path(monkeypatch, str(tmp_path))

    assert new_upload_target(db_session, org.id).bucket is None


def test_each_upload_is_given_an_id_of_its_own_that_can_be_a_file_name(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _source_bucket(monkeypatch)

    first = new_upload_target(db_session, org.id).asset_id
    second = new_upload_target(db_session, org.id).asset_id

    assert first != second
    assert len(first) == 32
    assert set(first) <= set("0123456789abcdef")


# --- link_upload ------------------------------------------------------------


def test_linking_records_the_upload_and_who_made_it(
    db_session: Session, transcodes: Transcodes
) -> None:
    org = _organisation(db_session)
    user = _person(db_session)

    link = _link(db_session, org, user)

    assert _links(db_session) == [link]
    assert link.org_unit_id == org.id
    assert link.question_bank_id == MODULE
    assert link.media_key == KEY
    assert link.asset_id == ASSET
    assert link.original_filename == "Colonoscopy FINAL v3.mp4"
    assert link.content_type == "video/mp4"
    assert link.size_bytes == 943718400
    assert link.uploaded_by == user.id
    assert link.uploaded_at is not None
    assert link.transcoded_at is None
    assert link.has_captions is False


def test_a_link_is_filed_under_the_prefix_its_organisation_records(
    db_session: Session, transcodes: Transcodes
) -> None:
    org = _organisation(db_session)
    org.media_prefix_id = 4242
    db_session.flush()

    link = _link(db_session, org, _person(db_session))

    assert link.organisation_id == 4242


def test_linking_a_reference_again_points_it_at_the_new_upload(
    db_session: Session, transcodes: Transcodes
) -> None:
    org = _organisation(db_session)
    first = _person(db_session, "first")
    second = _person(db_session, "second")
    old = _upload(db_session, org, asset_id="old")
    old.uploaded_by = first.id
    db_session.flush()

    link = _link(db_session, org, second, asset_id="new")

    assert _links(db_session) == [link]
    assert link.id == old.id
    assert link.asset_id == "new"
    assert link.original_filename == "Colonoscopy FINAL v3.mp4"
    assert link.size_bytes == 943718400
    assert link.uploaded_by == second.id


def test_linking_again_forgets_what_the_jobs_made_of_the_old_upload(
    db_session: Session, transcodes: Transcodes
) -> None:
    org = _organisation(db_session)
    old = _upload(db_session, org, asset_id="old")
    old.transcoded_at = datetime.now(UTC)
    old.has_1080p = True
    old.has_poster = True
    old.has_captions = True
    old.transcode_started_at = datetime.now(UTC)
    old.caption_started_at = datetime.now(UTC)
    db_session.flush()

    link = _link(db_session, org, _person(db_session), asset_id="new")

    assert link.transcoded_at is None
    assert link.has_1080p is False
    assert link.has_poster is False
    assert link.has_captions is False
    assert link.transcode_started_at is None
    assert link.caption_started_at is None


def test_linking_again_forgets_that_the_old_uploads_captions_were_checked(
    db_session: Session, transcodes: Transcodes
) -> None:
    """The review was of the old video's captions, so it goes with them.

    Left behind, the new video would count as having had its captions
    checked by a person before any exist for it.
    """
    org = _organisation(db_session)
    old = _upload(db_session, org, asset_id="old")
    old.captions_reviewed_at = datetime(2026, 1, 1, tzinfo=UTC)
    db_session.flush()

    link = _link(db_session, org, _person(db_session), asset_id="new")

    assert link.asset_id == "new"
    assert link.captions_reviewed_at is None


def test_linking_again_forgets_that_the_old_upload_had_no_speech(
    db_session: Session, transcodes: Transcodes
) -> None:
    """The new video may have speech, so it must be captioned afresh.

    Left behind, it would reach learners with no captions at all.
    """
    org = _organisation(db_session)
    old = _upload(db_session, org, asset_id="old")
    old.no_speech_found_at = datetime(2026, 1, 1, tzinfo=UTC)
    db_session.flush()

    link = _link(db_session, org, _person(db_session), asset_id="new")

    assert link.asset_id == "new"
    assert link.no_speech_found_at is None


def test_a_new_video_is_hidden_until_its_own_jobs_and_review_are_done(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    transcodes: Transcodes,
) -> None:
    org = _organisation(db_session)
    old = _upload(db_session, org, asset_id="old")
    old.transcoded_at = datetime(2026, 1, 1, tzinfo=UTC)
    old.has_captions = True
    old.captions_reviewed_at = datetime(2026, 1, 2, tzinfo=UTC)
    db_session.flush()
    _transcode_job(monkeypatch, "projects/p/locations/l/jobs/transcode")
    monkeypatch.setattr(
        settings, "TEACHING_CAPTION_JOB", "projects/p/locations/l/jobs/cc"
    )
    monkeypatch.setattr(media, "get_referenced_media_keys", lambda _id: [KEY])

    assert media.module_media_is_complete(db_session, org.id, MODULE) is True

    link = _link(db_session, org, _person(db_session), asset_id="new")

    assert media.module_media_is_complete(db_session, org.id, MODULE) is False

    # Its own renditions are not enough: nobody has read its captions.
    link.transcoded_at = datetime.now(UTC)
    link.has_captions = True
    db_session.flush()

    assert media.module_media_is_complete(db_session, org.id, MODULE) is False

    link.captions_reviewed_at = datetime.now(UTC)
    db_session.flush()

    assert media.module_media_is_complete(db_session, org.id, MODULE) is True


def test_linking_over_an_old_video_removes_the_old_videos_files_only(
    db_session: Session, transcodes: Transcodes, removed: Removed
) -> None:
    org = _organisation(db_session)
    _upload(db_session, org, asset_id="old")

    link = _link(db_session, org, _person(db_session), asset_id="new")

    assert link.asset_id == "new"
    assert removed == _every_file(org.id, "old")


def test_the_old_videos_files_go_only_once_the_new_link_is_written(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    transcodes: Transcodes,
    removed: Removed,
) -> None:
    org = _organisation(db_session)
    _upload(db_session, org, asset_id="old")
    linked_when_asked: list[list[str]] = []

    def fake_delete(*args: object) -> None:
        linked_when_asked.append([row.asset_id for row in _links(db_session)])

    monkeypatch.setattr(storage, "delete_media_object", fake_delete)

    _link(db_session, org, _person(db_session), asset_id="new")

    assert linked_when_asked == [["new"]]
    # The new video's job was asked for before the old files went.
    assert [asked[2] for asked in transcodes] == ["new"]


def test_a_store_that_will_not_remove_the_old_files_still_links_the_new_video(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    transcodes: Transcodes,
    removed: Removed,
    caplog: pytest.LogCaptureFixture,
) -> None:
    org = _organisation(db_session)
    old = _upload(db_session, org, asset_id="old")
    old.captions_reviewed_at = datetime(2026, 1, 1, tzinfo=UTC)
    db_session.flush()

    def refuse(*args: object) -> None:
        raise RuntimeError("the bucket said no")

    monkeypatch.setattr(storage, "delete_media_object", refuse)

    with caplog.at_level(logging.ERROR):
        link = _link(db_session, org, _person(db_session), asset_id="new")

    assert [row.asset_id for row in _links(db_session)] == ["new"]
    assert link.captions_reviewed_at is None
    assert [asked[2] for asked in transcodes] == ["new"]
    assert "replaced media not deleted" in caplog.text
    assert "asset=old" in caplog.text


def test_linking_the_upload_a_reference_already_has_removes_no_files(
    db_session: Session, transcodes: Transcodes, removed: Removed
) -> None:
    """A request sent twice must not delete the files it is linking.

    The columns are cleared all the same: the transcode is asked for
    again, and its captions will be written over what a person read.
    """
    org = _organisation(db_session)
    row = _upload(db_session, org)
    row.transcoded_at = datetime(2026, 1, 1, tzinfo=UTC)
    row.captions_reviewed_at = datetime(2026, 1, 2, tzinfo=UTC)
    db_session.flush()

    link = _link(db_session, org, _person(db_session))

    assert link.id == row.id
    assert removed == []
    assert link.transcoded_at is None
    assert link.captions_reviewed_at is None


def test_a_first_link_removes_no_files(
    db_session: Session, transcodes: Transcodes, removed: Removed
) -> None:
    org = _organisation(db_session)

    _link(db_session, org, _person(db_session))

    assert removed == []


def test_an_old_upload_another_reference_still_names_keeps_its_files(
    db_session: Session, transcodes: Transcodes, removed: Removed
) -> None:
    org = _organisation(db_session)
    _upload(db_session, org, asset_id="old")
    other = _upload(db_session, org, media_key="lecture-02", asset_id="old")

    link = _link(db_session, org, _person(db_session), asset_id="new")

    assert _links(db_session) == [link, other]
    assert other.asset_id == "old"
    assert removed == []


def test_an_old_upload_whose_id_cannot_be_a_path_is_replaced_without_asking(
    db_session: Session, transcodes: Transcodes, removed: Removed
) -> None:
    org = _organisation(db_session)
    _upload(db_session, org, asset_id="not.safe")

    link = _link(db_session, org, _person(db_session), asset_id="new")

    assert link.asset_id == "new"
    assert removed == []


def test_with_no_bucket_the_old_upload_is_removed_from_the_modules_folder(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    transcodes: Transcodes,
) -> None:
    org = _organisation(db_session)
    _upload(db_session, org, asset_id="old", content_type="video/webm")
    module = _module_on_disk(tmp_path)
    (module / "learning").mkdir()
    old_file = module / "learning" / "old.webm"
    old_file.write_bytes(b"old video")
    new_file = module / "learning" / "new.mp4"
    new_file.write_bytes(b"new video")
    _source_bucket(monkeypatch, None)
    _captions_bucket(monkeypatch, None)
    _content_path(monkeypatch, str(tmp_path))

    _link(db_session, org, _person(db_session), asset_id="new")

    assert not old_file.exists()
    assert new_file.exists()


def test_linking_leaves_another_organisations_link_for_the_same_reference(
    db_session: Session, transcodes: Transcodes
) -> None:
    ours = _organisation(db_session, "Ours")
    theirs = _organisation(db_session, "Theirs")
    their_link = _upload(db_session, theirs, asset_id="theirs")

    link = _link(db_session, ours, _person(db_session), asset_id="ours")

    assert _links(db_session) == [their_link, link]
    assert their_link.asset_id == "theirs"
    assert their_link.org_unit_id == theirs.id
    assert link.org_unit_id == ours.id


def test_linking_leaves_another_modules_link_for_the_same_reference(
    db_session: Session, transcodes: Transcodes
) -> None:
    org = _organisation(db_session)
    other = _upload(db_session, org, module_id=OTHER_MODULE, asset_id="other")

    link = _link(db_session, org, _person(db_session))

    assert _links(db_session) == [other, link]
    assert other.asset_id == "other"


def test_with_no_job_set_no_start_is_recorded_and_the_job_is_still_asked(
    db_session: Session, transcodes: Transcodes
) -> None:
    org = _organisation(db_session)

    link = _link(db_session, org, _person(db_session))

    assert link.transcode_started_at is None
    # ``start_transcode`` is what decides there is no job to fire.
    assert transcodes == [(org.id, MODULE, ASSET, None)]


def test_with_a_job_set_the_start_is_recorded_before_the_job_is_asked(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    transcodes: Transcodes,
) -> None:
    org = _organisation(db_session)
    _transcode_job(monkeypatch, "projects/p/locations/l/jobs/transcode")

    link = _link(db_session, org, _person(db_session))

    assert link.transcode_started_at is not None
    assert len(transcodes) == 1
    assert transcodes[0][:3] == (org.id, MODULE, ASSET)
    assert transcodes[0][3] is not None


def test_the_job_is_given_the_organisations_id_and_not_its_storage_prefix(
    db_session: Session, transcodes: Transcodes
) -> None:
    """Found, and not changed: the job is not told where the file is.

    The file is uploaded under the organisation's storage prefix. The
    job is given the organisation's own id. They are the same number
    unless an older prefix is recorded for the organisation.
    """
    org = _organisation(db_session)
    org.media_prefix_id = 4242
    db_session.flush()

    link = _link(db_session, org, _person(db_session))

    assert link.organisation_id == 4242
    assert transcodes == [(org.id, MODULE, ASSET, None)]


@pytest.mark.parametrize("asset_id", ["../escape", "a/b", "never-handed-out"])
def test_an_asset_id_is_recorded_as_sent_whatever_it_is(
    db_session: Session,
    transcodes: Transcodes,
    asset_id: str,
) -> None:
    """Found, and not changed: linking does not check the id it is sent.

    Not that it could be part of a path, and not that it was ever handed
    out. The path builders check it when the file is reached for.
    """
    org = _organisation(db_session)

    link = _link(db_session, org, _person(db_session), asset_id=asset_id)

    assert link.asset_id == asset_id


# --- upload_held_by ---------------------------------------------------------


def test_an_upload_the_organisation_holds_is_found(
    db_session: Session,
) -> None:
    org = _organisation(db_session)
    row = _upload(db_session, org)

    assert upload_held_by(db_session, org.id, MODULE, ASSET) is row


def test_an_upload_only_another_organisation_holds_is_not_found(
    db_session: Session,
) -> None:
    ours = _organisation(db_session, "Ours")
    theirs = _organisation(db_session, "Theirs")
    _upload(db_session, theirs)

    with pytest.raises(MediaAssetNotHeldHere) as refused:
        upload_held_by(db_session, ours.id, MODULE, ASSET)

    assert isinstance(refused.value, TeachingError)
    assert refused.value.status_code == 404
    assert refused.value.message == "No such media asset"


def test_an_upload_of_another_module_is_not_found(db_session: Session) -> None:
    org = _organisation(db_session)
    _upload(db_session, org, module_id=OTHER_MODULE)

    with pytest.raises(MediaAssetNotHeldHere):
        upload_held_by(db_session, org.id, MODULE, ASSET)


def test_an_upload_nobody_holds_is_not_found(db_session: Session) -> None:
    org = _organisation(db_session)
    _upload(db_session, org)

    with pytest.raises(MediaAssetNotHeldHere):
        upload_held_by(db_session, org.id, MODULE, "no-such-asset")


# --- delete_upload ----------------------------------------------------------


@pytest.fixture()
def deleted(
    monkeypatch: pytest.MonkeyPatch,
) -> list[tuple[str, int, str, str]]:
    """Each object the bucket was asked to remove."""
    asked: list[tuple[str, int, str, str]] = []

    def fake_delete(
        bucket: str, org_id: int, module_id: str, asset_id: str
    ) -> None:
        asked.append((bucket, org_id, module_id, asset_id))

    monkeypatch.setattr(storage, "delete_media_object", fake_delete)

    return asked


def _delete(db: Session, org: OrgUnit, asset_id: str = ASSET) -> None:
    delete_upload(
        db,
        user_id=1,
        org_unit_id=org.id,
        module_id=MODULE,
        asset_id=asset_id,
    )


def test_deleting_removes_the_row_the_upload_and_everything_made_from_it(
    db_session: Session, removed: Removed
) -> None:
    org = _organisation(db_session)
    _upload(db_session, org)

    _delete(db_session, org)

    assert _links(db_session) == []
    # The upload from its own bucket, then each rendition, the poster
    # and the captions from the bucket the jobs write to.
    assert removed == [
        ("source", org.id, MODULE, ASSET, ""),
        ("processed", org.id, MODULE, ASSET, "-720p.mp4"),
        ("processed", org.id, MODULE, ASSET, "-1080p.mp4"),
        ("processed", org.id, MODULE, ASSET, "-poster.jpg"),
        ("processed", org.id, MODULE, ASSET, ".vtt"),
    ]


def test_every_file_is_asked_for_whatever_the_row_says_was_made(
    db_session: Session, removed: Removed
) -> None:
    """The row's flags are not trusted to say what is in the bucket."""
    org = _organisation(db_session)
    row = _upload(db_session, org)

    assert (row.has_1080p, row.has_poster, row.has_captions) == (
        False,
        False,
        False,
    )

    _delete(db_session, org)

    assert removed == _every_file(org.id)


def test_what_was_made_is_looked_for_under_the_prefix_and_the_own_id(
    db_session: Session, removed: Removed
) -> None:
    """Each file is looked for where it was written.

    The upload is under the storage prefix. A job that reported wrote
    under the prefix too, and captions a person saved are under the
    organisation's own id, so both are asked and nothing is missed.
    """
    org = _organisation(db_session)
    org.media_prefix_id = 4242
    db_session.flush()
    _upload(db_session, org)

    _delete(db_session, org)

    assert removed == [
        *_every_file(4242),
        *_every_file(org.id)[1:],
    ]


def test_with_no_bucket_of_processed_video_only_the_upload_is_asked_for(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, removed: Removed
) -> None:
    org = _organisation(db_session)
    _upload(db_session, org)
    _captions_bucket(monkeypatch, None)

    _delete(db_session, org)

    assert removed == [("source", org.id, MODULE, ASSET, "")]


def test_the_files_of_one_video_are_removed_from_where_it_says_they_are(
    removed: Removed,
) -> None:
    delete_video_files(
        StoredVideo(
            storage_prefix_id=7,
            org_unit_id=7,
            module_id=MODULE,
            asset_id=ASSET,
            content_type="video/mp4",
        )
    )

    assert removed == _every_file(7)


def test_the_file_is_removed_from_under_the_prefix_the_row_records(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    deleted: list[tuple[str, int, str, str]],
) -> None:
    org = _organisation(db_session)
    org.media_prefix_id = 4242
    db_session.flush()
    _upload(db_session, org)
    _source_bucket(monkeypatch, "source")

    _delete(db_session, org)

    assert deleted == [("source", 4242, MODULE, ASSET)]


def test_an_upload_only_another_organisation_holds_is_not_deleted(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    deleted: list[tuple[str, int, str, str]],
) -> None:
    ours = _organisation(db_session, "Ours")
    theirs = _organisation(db_session, "Theirs")
    their_row = _upload(db_session, theirs)
    _source_bucket(monkeypatch, "source")

    with pytest.raises(MediaAssetNotHeldHere):
        _delete(db_session, ours)

    assert _links(db_session) == [their_row]
    assert deleted == []


def test_deleting_leaves_the_same_upload_id_held_by_another_organisation(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    deleted: list[tuple[str, int, str, str]],
) -> None:
    ours = _organisation(db_session, "Ours")
    theirs = _organisation(db_session, "Theirs")
    _upload(db_session, ours)
    their_row = _upload(db_session, theirs)
    _source_bucket(monkeypatch, "source")

    _delete(db_session, ours)

    assert _links(db_session) == [their_row]
    assert deleted == [("source", ours.id, MODULE, ASSET)]


def test_the_row_is_removed_before_the_bucket_is_asked(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _upload(db_session, org)
    _source_bucket(monkeypatch, "source")
    rows_when_asked: list[int] = []

    def fake_delete(*args: object) -> None:
        rows_when_asked.append(len(_links(db_session)))

    monkeypatch.setattr(storage, "delete_media_object", fake_delete)

    _delete(db_session, org)

    assert rows_when_asked == [0]


def test_a_bucket_that_refuses_is_reported_and_the_row_comes_back(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, removed: Removed
) -> None:
    org = _organisation(db_session)
    _upload(db_session, org)
    db_session.commit()

    def refuse(*args: object) -> None:
        raise RuntimeError("the bucket said no")

    monkeypatch.setattr(storage, "delete_media_object", refuse)

    with pytest.raises(MediaCannotBeDeleted) as refused:
        _delete(db_session, org)

    assert isinstance(refused.value, TeachingError)
    assert refused.value.status_code == 502
    assert refused.value.message == "The video could not be deleted"
    assert "the bucket said no" not in refused.value.message

    # What the session the route was handed does when a route raises.
    db_session.rollback()

    assert [row.asset_id for row in _links(db_session)] == [ASSET]


def test_a_refusal_from_the_bucket_of_processed_video_is_reported_the_same(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, removed: Removed
) -> None:
    org = _organisation(db_session)
    _upload(db_session, org)
    db_session.commit()

    def refuse(*args: object) -> None:
        raise RuntimeError("the bucket said no")

    monkeypatch.setattr(storage, "delete_processed_media_object", refuse)

    with pytest.raises(MediaCannotBeDeleted):
        _delete(db_session, org)

    db_session.rollback()

    assert [row.asset_id for row in _links(db_session)] == [ASSET]
    # The upload had gone before the store refused. Deleting again
    # finds it gone, which is not an error, and carries on.
    assert removed == [("source", org.id, MODULE, ASSET, "")]


@pytest.mark.parametrize("asset_id", ["not.safe", "../escape", "a/b"])
def test_an_upload_whose_id_cannot_be_a_path_is_deleted_without_the_store(
    db_session: Session, removed: Removed, asset_id: str
) -> None:
    """Such an upload has no files, so its row goes and nothing is asked.

    Linking records whatever id it is sent, and every writer's path
    builder refuses one of the wrong shape, so nothing can have been
    written under it. Asking the store would be refused the same way
    every time, and the row could never be removed.
    """
    org = _organisation(db_session)
    _upload(db_session, org, asset_id=asset_id)

    _delete(db_session, org, asset_id)

    assert _links(db_session) == []
    assert removed == []


@pytest.mark.parametrize(
    ("content_type", "suffix"),
    [("video/mp4", ".mp4"), ("video/webm", ".webm"), ("text/plain", ".mp4")],
)
def test_with_no_bucket_the_file_is_removed_from_the_modules_folder(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    deleted: list[tuple[str, int, str, str]],
    content_type: str,
    suffix: str,
) -> None:
    org = _organisation(db_session)
    _upload(db_session, org, content_type=content_type)
    module = _module_on_disk(tmp_path)
    (module / "learning").mkdir()
    video = module / "learning" / f"{ASSET}{suffix}"
    video.write_bytes(b"video")
    beside_it = module / "learning" / "content.mdx"
    beside_it.write_text("# Slide\n", encoding="utf-8")
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, str(tmp_path))

    _delete(db_session, org)

    assert _links(db_session) == []
    assert not video.exists()
    assert beside_it.exists()
    assert deleted == []


def test_with_no_bucket_a_file_already_gone_still_clears_the_row(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    org = _organisation(db_session)
    _upload(db_session, org)
    _module_on_disk(tmp_path)
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, str(tmp_path))

    _delete(db_session, org)

    assert _links(db_session) == []


def test_with_no_bucket_a_module_not_on_disk_still_clears_the_row(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    org = _organisation(db_session)
    _upload(db_session, org)
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, str(tmp_path))

    _delete(db_session, org)

    assert _links(db_session) == []


def test_with_neither_a_bucket_nor_a_content_path_the_row_is_still_cleared(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _upload(db_session, org)
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, None)

    _delete(db_session, org)

    assert _links(db_session) == []


def test_with_no_bucket_an_id_that_cannot_be_a_file_name_removes_no_file(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    org = _organisation(db_session)
    _upload(db_session, org, asset_id="../escape")
    module = _module_on_disk(tmp_path)
    (module / "learning").mkdir()
    outside = module / "escape.mp4"
    outside.write_bytes(b"not an upload")
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, str(tmp_path))

    _delete(db_session, org, "../escape")

    assert _links(db_session) == []
    assert outside.exists()


# --- save_captions ----------------------------------------------------------


@pytest.fixture()
def written(
    monkeypatch: pytest.MonkeyPatch,
) -> list[tuple[str, int, str, str, str]]:
    """Each caption file the bucket was asked to take."""
    asked: list[tuple[str, int, str, str, str]] = []

    def fake_write(
        bucket: str, org_id: int, module_id: str, asset_id: str, text: str
    ) -> None:
        asked.append((bucket, org_id, module_id, asset_id, text))

    monkeypatch.setattr(storage, "write_caption_object", fake_write)

    return asked


def _save(
    db: Session, org: OrgUnit, webvtt: str = CAPTIONS, asset_id: str = ASSET
) -> CaptionsOut:
    return save_captions(
        db,
        user_id=1,
        org_unit_id=org.id,
        module_id=MODULE,
        asset_id=asset_id,
        webvtt=webvtt,
    )


def test_saving_captions_writes_them_and_records_that_they_were_checked(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    written: list[tuple[str, int, str, str, str]],
) -> None:
    org = _organisation(db_session)
    row = _upload(db_session, org)
    _captions_bucket(monkeypatch, "processed")

    saved = _save(db_session, org)

    assert written == [("processed", org.id, MODULE, ASSET, CAPTIONS)]
    assert row.has_captions is True
    assert row.captions_reviewed_at is not None
    assert saved == CaptionsOut(
        asset_id=ASSET,
        webvtt=CAPTIONS,
        reviewed_at=row.captions_reviewed_at,
    )


def test_the_space_around_the_captions_is_removed_before_they_are_saved(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    written: list[tuple[str, int, str, str, str]],
) -> None:
    org = _organisation(db_session)
    _upload(db_session, org)
    _captions_bucket(monkeypatch)

    saved = _save(db_session, org, f"\n\n  {CAPTIONS}\n\n")

    assert written[0][4] == CAPTIONS
    assert saved.webvtt == CAPTIONS


def test_captions_are_written_under_the_organisations_id_not_its_prefix(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    written: list[tuple[str, int, str, str, str]],
) -> None:
    """Found, and not changed: captions are not filed where the video is.

    The video is stored under the organisation's storage prefix, which
    is what a learner's grant covers. The captions are written under the
    organisation's own id. They are the same number unless an older
    prefix is recorded for the organisation.
    """
    org = _organisation(db_session)
    org.media_prefix_id = 4242
    db_session.flush()
    row = _upload(db_session, org)
    _captions_bucket(monkeypatch, "processed")

    _save(db_session, org)

    assert row.organisation_id == 4242
    assert written == [("processed", org.id, MODULE, ASSET, CAPTIONS)]


def test_captions_for_an_upload_another_organisation_holds_are_not_saved(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    written: list[tuple[str, int, str, str, str]],
) -> None:
    ours = _organisation(db_session, "Ours")
    theirs = _organisation(db_session, "Theirs")
    their_row = _upload(db_session, theirs)
    _captions_bucket(monkeypatch)

    with pytest.raises(MediaAssetNotHeldHere):
        _save(db_session, ours)

    assert written == []
    assert their_row.captions_reviewed_at is None


@pytest.mark.parametrize(
    "text", ["", "   ", "1\n00:00 --> 00:02\nHello", "webvtt\n\nlower case"]
)
def test_captions_that_do_not_begin_webvtt_are_refused_and_nothing_is_saved(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    written: list[tuple[str, int, str, str, str]],
    text: str,
) -> None:
    org = _organisation(db_session)
    row = _upload(db_session, org)
    _captions_bucket(monkeypatch)

    with pytest.raises(CaptionsNotWebVTT) as refused:
        _save(db_session, org, text)

    assert refused.value.status_code == 400
    assert (
        refused.value.message
        == "Captions must be WebVTT, beginning with the line WEBVTT"
    )
    assert written == []
    assert row.captions_reviewed_at is None
    assert row.has_captions is False


def test_with_no_bucket_captions_are_refused_and_no_review_is_recorded(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    written: list[tuple[str, int, str, str, str]],
) -> None:
    org = _organisation(db_session)
    row = _upload(db_session, org)
    _captions_bucket(monkeypatch, None)

    with pytest.raises(CaptionsCannotBeSaved) as refused:
        _save(db_session, org)

    assert refused.value.status_code == 503
    assert (
        refused.value.message
        == "No video bucket configured; captions cannot be saved"
    )
    assert written == []
    assert row.captions_reviewed_at is None


def test_an_upload_not_held_is_reported_before_the_text_is_looked_at(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _captions_bucket(monkeypatch, None)

    with pytest.raises(MediaAssetNotHeldHere):
        _save(db_session, org, "not captions")


def test_text_that_is_not_webvtt_is_reported_before_a_missing_bucket(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _upload(db_session, org)
    _captions_bucket(monkeypatch, None)

    with pytest.raises(CaptionsNotWebVTT):
        _save(db_session, org, "not captions")


def test_a_bucket_that_refuses_the_captions_records_no_review(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    row = _upload(db_session, org)
    _captions_bucket(monkeypatch)

    def refuse(*args: object) -> None:
        raise RuntimeError("the bucket said no")

    monkeypatch.setattr(storage, "write_caption_object", refuse)

    with pytest.raises(RuntimeError):
        _save(db_session, org)

    assert row.captions_reviewed_at is None
    assert row.has_captions is False


# --- local_upload_root ------------------------------------------------------


def test_an_upload_through_the_application_is_not_offered_beside_a_bucket(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _source_bucket(monkeypatch, "source")
    _content_path(monkeypatch, str(tmp_path))

    with pytest.raises(LocalUploadNotOffered) as refused:
        local_upload_root()

    assert refused.value.status_code == 404
    assert refused.value.message == "Not found"


def test_a_bucket_is_reported_before_a_missing_content_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _source_bucket(monkeypatch, "source")
    _content_path(monkeypatch, None)

    with pytest.raises(LocalUploadNotOffered):
        local_upload_root()


def test_an_upload_through_the_application_needs_a_content_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, None)

    with pytest.raises(MediaUploadNotConfigured) as refused:
        local_upload_root()

    assert refused.value.status_code == 503
    assert refused.value.message == "Media upload is not configured"


def test_with_no_bucket_uploads_land_under_the_content_path(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _source_bucket(monkeypatch, None)
    _content_path(monkeypatch, str(tmp_path))

    assert local_upload_root() == str(tmp_path)


# --- local_upload_file ------------------------------------------------------


@pytest.mark.parametrize(
    "asset_id", ["", "../escape", "a/b", "a b", "a.b", "abc\n"]
)
def test_an_asset_id_that_cannot_be_a_file_name_is_refused(
    tmp_path: Path, asset_id: str
) -> None:
    module = _module_on_disk(tmp_path)

    with pytest.raises(InvalidAssetId) as refused:
        local_upload_file(str(tmp_path), MODULE, asset_id, "video/mp4")

    assert refused.value.status_code == 400
    assert refused.value.message == "Invalid asset id"
    # Refused before anything on disk is touched.
    assert not (module / "learning").exists()


def test_an_upload_to_a_module_that_is_not_on_disk_is_refused(
    tmp_path: Path,
) -> None:
    _module_on_disk(tmp_path)

    with pytest.raises(NoModuleToUploadTo) as refused:
        local_upload_file(str(tmp_path), OTHER_MODULE, ASSET, "video/mp4")

    assert refused.value.status_code == 404
    assert refused.value.message == "Module not found"


def test_a_bad_asset_id_is_reported_before_a_missing_module(
    tmp_path: Path,
) -> None:
    with pytest.raises(InvalidAssetId):
        local_upload_file(str(tmp_path), OTHER_MODULE, "a/b", "video/mp4")


@pytest.mark.parametrize(
    ("content_type", "suffix"),
    [
        ("video/mp4", ".mp4"),
        ("video/webm", ".webm"),
        ("video/quicktime", ".mov"),
        ("text/plain", ".mp4"),
    ],
)
def test_the_file_is_named_for_the_asset_and_suffixed_for_its_type(
    tmp_path: Path, content_type: str, suffix: str
) -> None:
    module = _module_on_disk(tmp_path)

    destination = local_upload_file(str(tmp_path), MODULE, ASSET, content_type)

    assert destination == module / "learning" / f"{ASSET}{suffix}"
    # The folder is made ready; the file itself is the caller's to write.
    assert (module / "learning").is_dir()
    assert not destination.exists()


def test_a_module_id_of_two_dots_is_looked_for_like_any_other(
    tmp_path: Path,
) -> None:
    """Found, and not changed: the module id's shape is not checked.

    It is looked for on the content path, so two dots name the
    repository's own folder, and are found only where that folder
    itself holds a ``module.yaml``. Then the file would be written to a
    ``learning`` folder at the top of the repository.
    """
    _module_on_disk(tmp_path)
    repo = tmp_path / "content-repo"

    with pytest.raises(NoModuleToUploadTo):
        local_upload_file(str(tmp_path), "..", ASSET, "video/mp4")

    (repo / "module.yaml").write_text("title: Not one\n", encoding="utf-8")

    destination = local_upload_file(str(tmp_path), "..", ASSET, "video/mp4")

    assert destination.resolve() == (repo / "learning").resolve() / (
        f"{ASSET}.mp4"
    )


class TestLooksLikeVideo:
    """The first bytes, against the declared type."""

    def test_an_mp4_begins_with_a_box_length_then_ftyp(self) -> None:
        assert looks_like_video(b"\x00\x00\x00\x18ftypmp42", "video/mp4")
        assert looks_like_video(b"\x00\x00\x00\x14ftypqt  ", "video/quicktime")

    def test_a_webm_begins_with_the_ebml_header(self) -> None:
        assert looks_like_video(b"\x1a\x45\xdf\xa3\x01", "video/webm")

    def test_the_wrong_signature_for_the_type_is_refused(self) -> None:
        assert not looks_like_video(b"\x1a\x45\xdf\xa3", "video/mp4")
        assert not looks_like_video(b"\x00\x00\x00\x18ftypmp42", "video/webm")

    def test_anything_else_is_refused(self) -> None:
        assert not looks_like_video(b"<html>", "video/mp4")
        assert not looks_like_video(b"", "video/mp4")
        assert not looks_like_video(b"\x00\x00\x00\x18ftypmp42", "image/png")
