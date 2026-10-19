"""What the video jobs report when they finish, and what is recorded.

The backend fires the transcode job and does not wait for it: encoding
takes minutes, and an admin's request cannot be held open that long. So
the job calls back when its outputs verify, and the caption job that
follows it does the same. This module is what each of those reports
writes to the upload's row.

Two reports, and deliberately two functions. A transcode report
rewrites every rendition flag from the list of files it names, so a
caption report sent through it, naming only a ``.vtt``, would clear
``has_1080p`` and ``has_poster`` and stamp a ``transcoded_at`` for a
transcode that never ran.

One refusal, shared by both: no upload is recorded under the ids the
job gave.

Everything here is flushed, not committed. The session the route was
handed commits when the route returns.

Checking the job's token is not here. That is a question about the
request, and the route answers it before calling this.
"""

import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.teaching.errors import (
    MediaAssetNotFound,
    PosterNotReported,
)
from app.features.teaching.models import ModuleMediaLink
from app.features.teaching.transcode import RENDITION_FLAGS, start_caption

logger = logging.getLogger(__name__)

#: The rendition the caption job transcribes. Captions are asked for
#: only where a report names it.
_CAPTION_SOURCE_SUFFIX = "-720p.mp4"


def record_transcode(
    db: Session,
    org_id: int,
    module_id: str,
    asset_id: str,
    outputs: list[str],
) -> list[str]:
    """Record what the transcode job produced, and ask for captions.

    Idempotent: a job run again for the same asset reports the same
    outputs and rewrites the same columns, which is what makes running
    one again by hand a safe remedy. The flags say what is in the bucket
    now, so a rendition no longer reported has its flag cleared.

    The row is flushed, not committed.

    Args:
        db: Core database session.
        org_id: The number the upload is stored under in the bucket.
        module_id: The module the upload belongs to.
        asset_id: The upload's own id.
        outputs: The names of the files the job wrote.

    Returns:
        The rendition flags that were set, in the order
        ``RENDITION_FLAGS`` lists them.

    Raises:
        MediaAssetNotFound: no upload is recorded under those ids.
    """
    link = _media_link(db, org_id, module_id, asset_id)

    # The job reports filenames; the mapping from suffix to column
    # lives here, in the one place that already owns it. A job that
    # knew column names would need redeploying whenever one was renamed.
    names = set(outputs)
    set_flags: list[str] = []

    for field, suffix in RENDITION_FLAGS:
        present = any(name.endswith(suffix) for name in names)
        setattr(link, field, present)
        if present:
            set_flags.append(field)

    # Last, and only once the flags are right: this is what the
    # availability gate reads, so setting it before them would open a
    # window where a module is servable and its renditions unrecorded.
    link.transcoded_at = datetime.now(UTC)
    db.flush()

    logger.info(
        "transcode recorded org=%s module=%s asset=%s outputs=%d",
        org_id,
        module_id,
        asset_id,
        len(names),
    )

    # Captions follow the renditions, and only now can they: Whisper
    # transcribes the 720p file, so firing at upload would race a job
    # that takes minutes and lose. Fired after the flush, so a caption
    # job that starts immediately finds the row already recorded.
    #
    # Never allowed to fail this report. The renditions are what was
    # being recorded here, and losing `transcoded_at` over an
    # unreachable caption job would keep the module hidden - a missing
    # subtitle track is a smaller fault than a video nobody can watch.
    if any(name.endswith(_CAPTION_SOURCE_SUFFIX) for name in names):
        # Recorded before firing, as the transcode invocation is: a card
        # that says nothing is running over a job that is would be the
        # worse mistake of the two.
        link.caption_started_at = datetime.now(UTC)
        db.flush()
        start_caption(org_id, module_id, asset_id)

    return set_flags


def after_scan(
    db: Session, bucket: str, object_key: str, verdict: str
) -> bool:
    """What a scan verdict means for a teaching upload, if it is one.

    Where a scan job is configured, ``link_upload`` asks for the scan
    and leaves the transcode to this: a ``clean`` verdict on an object
    in the source bucket fires the transcode, so FFmpeg never reads a
    file that was not scanned clean. Any other verdict fires nothing,
    and the card says why through ``describe_progress``.

    Returns:
        Whether the object was a teaching upload at all. False for any
        other bucket, so the caller can hand the verdict on.
    """
    from app.config import settings

    if not bucket or bucket != settings.TEACHING_VIDEOS_SOURCE_BUCKET:
        return False

    # The key the upload was stored under: ``{org}/{module}/{asset}``.
    parts = object_key.split("/")

    if len(parts) != 3 or not parts[0].isdigit():
        logger.warning(
            "scan verdict for an unrecognised teaching key bucket=%s key=%s",
            bucket,
            object_key,
        )
        return True

    org_id, module_id, asset_id = int(parts[0]), parts[1], parts[2]

    try:
        link = _media_link(db, org_id, module_id, asset_id)
    except MediaAssetNotFound:
        # Deleted while the scan ran. Nothing to start, and the object
        # the job scanned is swept by the lifecycle rule.
        return True

    if verdict != "clean":
        return True

    # Recorded before firing, as `link_upload` records it: a card that
    # says nothing is running over a job that is would be the worse
    # mistake of the two.
    from app.features.teaching.media import transcode_is_configured

    if transcode_is_configured():
        link.transcode_started_at = datetime.now(UTC)
        db.flush()

    from app.features.teaching.transcode import start_transcode

    start_transcode(link.org_unit_id, module_id, asset_id)

    return True


def record_captions(
    db: Session, org_id: int, module_id: str, asset_id: str
) -> None:
    """Record that a caption track exists for one upload.

    The row is flushed, not committed.

    Args:
        db: Core database session.
        org_id: The number the upload is stored under in the bucket.
        module_id: The module the upload belongs to.
        asset_id: The upload's own id.

    Raises:
        MediaAssetNotFound: no upload is recorded under those ids.
    """
    link = _media_link(db, org_id, module_id, asset_id)

    # This column only. `captions_reviewed_at` is a human's statement
    # that they read the text, and a job running again must not erase
    # it - nor claim it, which is why this never sets it either.
    link.has_captions = True
    db.flush()

    # No caption text here or anywhere near this log: it is a transcript
    # of a lecture and this log is not PHI-safe.
    logger.info(
        "captions recorded org=%s module=%s asset=%s",
        org_id,
        module_id,
        asset_id,
    )


def record_no_speech(
    db: Session, org_id: int, module_id: str, asset_id: str
) -> None:
    """Record that the caption job found no speech in one upload.

    A video with no audio track, or one whose sound has no words in it,
    has nothing to caption. This is what lets its module reach learners
    without a review of captions that can never exist.

    Nothing else changes: ``has_captions`` stays as it was, since no
    track was written.

    The row is flushed, not committed.

    Args:
        db: Core database session.
        org_id: The number the upload is stored under in the bucket.
        module_id: The module the upload belongs to.
        asset_id: The upload's own id.

    Raises:
        MediaAssetNotFound: no upload is recorded under those ids.
    """
    link = _media_link(db, org_id, module_id, asset_id)

    link.no_speech_found_at = datetime.now(UTC)
    db.flush()

    logger.info(
        "no speech recorded org=%s module=%s asset=%s",
        org_id,
        module_id,
        asset_id,
    )


def record_poster(
    db: Session,
    org_id: int,
    module_id: str,
    asset_id: str,
    outputs: list[str],
) -> None:
    """Record that a retaken poster is in the bucket.

    Its own recorder, not :func:`record_transcode` with a shorter list:
    that one sets every rendition flag from the names it is given, so a
    report naming only the poster would clear the 1080p and caption
    flags of a video that still has both.

    The row is flushed, not committed.

    Args:
        db: Core database session.
        org_id: The number the upload is stored under in the bucket.
        module_id: The module the upload belongs to.
        asset_id: The upload's own id.
        outputs: The names of the files the job wrote.

    Raises:
        MediaAssetNotFound: no upload is recorded under those ids.
        PosterNotReported: the report does not name this upload's poster.
    """
    if f"{asset_id}-poster.jpg" not in outputs:
        raise PosterNotReported

    link = _media_link(db, org_id, module_id, asset_id)

    # The version the learner's poster address carries. Set only now,
    # once the file is there: set when the admin saved, a learner in
    # between would fetch the old poster under the new address, and the
    # CDN would keep it there for a day.
    link.has_poster = True
    link.poster_taken_at = datetime.now(UTC)
    db.flush()

    logger.info(
        "poster recorded org=%s module=%s asset=%s",
        org_id,
        module_id,
        asset_id,
    )


def _media_link(
    db: Session, org_id: int, module_id: str, asset_id: str
) -> ModuleMediaLink:
    """Find the upload a job is reporting on.

    All three ids must match: they are the ones the job was invoked
    with, so a report naming another organisation finds nothing and
    writes to no row it was not about.

    Raises:
        MediaAssetNotFound: no upload is recorded under those ids.
    """
    link = db.execute(
        select(ModuleMediaLink).where(
            ModuleMediaLink.organisation_id == org_id,
            ModuleMediaLink.question_bank_id == module_id,
            ModuleMediaLink.asset_id == asset_id,
        )
    ).scalar_one_or_none()

    if link is None:
        # A job whose row was deleted while it ran. Not an error the
        # job can act on, and it must not retry: the bytes it wrote are
        # orphaned and the lifecycle rule will sweep them.
        raise MediaAssetNotFound

    return link
