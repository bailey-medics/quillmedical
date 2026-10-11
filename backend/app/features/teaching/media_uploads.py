"""An administrator's uploads to a module: filing, linking, removing.

The media card behind ``manage_teaching``. A video is uploaded under an
id made here, linked to the reference in the module's pages that it
belongs on, and may later be removed or have its captions corrected.

**Everything is for one organisation, and the caller says which.** The
route finds the organisation the administrator belongs to and hands it
in. Every row read or written here is that organisation's, and another
organisation's upload of the same module is not found, never refused.

**The module is not looked up.** Nothing here asks whether the
organisation holds the module it is given: an upload may arrive before
the module's pages do. A module id is only ever a column value and one
part of a storage path, and the path builders check it.

Which organisation that is, the allow-list of file types, and the
signed address an upload is sent to are the route's. The inventory of
what a module references is ``app.features.teaching.media``.

Everything is flushed, not committed. The session the route was handed
commits when the route returns, and rolls back if anything raised.

The content store is reached through the ``storage``, ``media`` and
``transcode`` modules by name, never by importing a function out of
them, so a test that replaces one of their functions replaces it here.
"""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

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
    MediaUploadNotConfigured,
    NoModuleToUploadTo,
)
from app.features.teaching.models import ModuleMediaLink
from app.features.teaching.schemas import CaptionsOut
from app.organisations import media_prefix_of

logger = logging.getLogger(__name__)

#: What a generated asset id may contain before it becomes a filename.
#:
#: The id is minted here with ``uuid4().hex``, so this can never fail in
#: normal use - it is here because the value reaches a path, and a path
#: component is checked rather than trusted regardless of who produced
#: it. The same shape as ``storage._SAFE_BANK_ID``.
_SAFE_ASSET_ID = re.compile(r"[a-zA-Z0-9_-]+")


@dataclass(frozen=True)
class UploadTarget:
    """Where one new upload is to be filed."""

    #: Made here, and what the file is known by from now on. Never the
    #: name the administrator's file had.
    asset_id: str
    #: The number the organisation's media is filed under in the bucket.
    storage_prefix_id: int
    #: The bucket uploads go to, or None where they come through this
    #: application and land on disk.
    bucket: str | None


def new_upload_target(db: Session, org_unit_id: int) -> UploadTarget:
    """Decide where a new upload for one organisation is to go.

    The asset id is made here, so nothing the caller sent becomes part
    of where the file is stored.

    Args:
        db: Core database session.
        org_unit_id: The organisation the caller administers.

    Returns:
        The id, the organisation's storage prefix, and the bucket if
        there is one.

    Raises:
        NoModuleToUploadTo: There is no such organisation.
        MediaUploadNotConfigured: Neither a source bucket nor a content
            path is set.
    """
    # Media objects live at {prefix}/{module}/{asset} in the bucket, so
    # that number addresses a real file rather than filtering a table.
    # The org_unit records which one, because the objects already written
    # are under the organisation id the org_unit used to have.
    storage_prefix_id = media_prefix_of(db, org_unit_id)

    if storage_prefix_id is None:
        raise NoModuleToUploadTo()

    asset_id = uuid.uuid4().hex
    bucket = settings.TEACHING_VIDEOS_SOURCE_BUCKET

    # Development: no bucket, so the bytes come through this API to the
    # module's own learning/ directory instead.
    #
    # Only where content is on disk. A deployment with neither a bucket
    # nor a content path can genuinely not accept an upload, and should
    # say so rather than pretend.
    if not bucket and not settings.TEACHING_QUESTION_BANK_PATH:
        raise MediaUploadNotConfigured()

    return UploadTarget(
        asset_id=asset_id,
        storage_prefix_id=storage_prefix_id,
        bucket=bucket or None,
    )


def link_upload(
    db: Session,
    *,
    user_id: int,
    org_unit_id: int,
    module_id: str,
    media_key: str,
    asset_id: str,
    original_filename: str,
    content_type: str,
    size_bytes: int,
) -> ModuleMediaLink:
    """Attach an upload to one reference in a module, and ask for renditions.

    Re-linking a key that already has an asset replaces the link rather
    than refusing it. One video per reference is the rule the unique
    constraint enforces, and pointing a slide at a different upload is a
    dropdown in the admin card, not a reason to make the admin detach
    first. The previous asset stays in the bucket and reappears as
    unattached, so nothing is lost by re-pointing.

    What is recorded is what the caller said of the file: its id, name,
    type and size. None of it is checked against what is in the bucket,
    and the id is not checked to be one that was handed out. The file
    type is the route's to check, before this is called.

    The transcode job is given the organisation's own id, where the
    file is stored under the organisation's storage prefix. The two are
    the same number unless an older prefix is recorded for it.

    The row is flushed, not committed.

    Args:
        db: Core database session.
        user_id: Who is linking it, recorded as the uploader.
        org_unit_id: The organisation the caller administers.
        module_id: The module the upload belongs to.
        media_key: The reference in the module's pages.
        asset_id: The upload's own id.
        original_filename: What the administrator's file was called.
            Kept to show them, and never part of an address.
        content_type: The file's type.
        size_bytes: The file's size.

    Returns:
        The link, new or re-pointed.
    """
    existing = db.execute(
        select(ModuleMediaLink).where(
            ModuleMediaLink.org_unit_id == org_unit_id,
            ModuleMediaLink.question_bank_id == module_id,
            ModuleMediaLink.media_key == media_key,
        )
    ).scalar_one_or_none()

    if existing:
        existing.asset_id = asset_id
        existing.original_filename = original_filename
        existing.content_type = content_type
        existing.size_bytes = size_bytes
        existing.uploaded_by = user_id
        existing.uploaded_at = datetime.now(UTC)
        link = existing
    else:
        link = ModuleMediaLink(
            org_unit_id=org_unit_id,
            question_bank_id=module_id,
            media_key=media_key,
            asset_id=asset_id,
            original_filename=original_filename,
            content_type=content_type,
            size_bytes=size_bytes,
            uploaded_by=user_id,
            uploaded_at=datetime.now(UTC),
        )
        db.add(link)

    # Re-linking points the key at different bytes, so whatever the old
    # asset's job produced says nothing about this one. Cleared rather
    # than left behind: a stale `has_1080p` would have the player ask
    # for a rendition of a file that no longer backs this reference.
    link.transcoded_at = None
    link.has_1080p = False
    link.has_poster = False
    link.has_captions = False
    # The timings go too. A previous asset's start times would have the
    # card report progress for work that is not happening on this file.
    link.transcode_started_at = None
    link.caption_started_at = None

    db.flush()
    db.refresh(link)
    logger.info(
        "media linked user=%s org=%s module=%s key=%s asset=%s",
        user_id,
        org_unit_id,
        module_id,
        media_key,
        asset_id,
    )

    # The trigger. Fired after the row is flushed, so the link exists
    # before anything can act on it, and deliberately not awaited -
    # encoding a lecture takes minutes. It never raises: the upload the
    # admin asked for has already succeeded, and failing the request now
    # would report that as a failure. A job that never runs leaves the
    # module incomplete and hidden, which is the safe direction.
    # Recorded before firing, not after: if the invocation raises inside
    # its own try/except the job may still have started, and a card
    # saying "nothing is running" over a job that is would be the worse
    # of the two errors. An overstated start shows as "running a long
    # time", which prompts a look; an understated one shows as nothing.
    # Only where a job exists to start. Recording a start time for one
    # that was never configured is what had the card report "Preparing
    # the video" on a developer's machine until the patience ran out and
    # it became "Processing seems to have failed" - a failure that never
    # happened, over a job that was never fired. Asked of the same
    # helper the learner gate uses, so the two cannot disagree.
    if media.transcode_is_configured():
        link.transcode_started_at = datetime.now(UTC)
        db.flush()

    transcode.start_transcode(org_unit_id, module_id, asset_id)

    return link


def upload_held_by(
    db: Session, org_unit_id: int, module_id: str, asset_id: str
) -> ModuleMediaLink:
    """The link for one upload, as the caller's organisation holds it.

    Scoped rather than refused, so another trust's asset is *not found*
    instead of forbidden: whether they hold one is not this caller's to
    learn.

    Raises:
        MediaAssetNotHeldHere: The organisation holds no upload of that
            module by that id, whether or not another organisation does.
    """
    link = db.execute(
        select(ModuleMediaLink).where(
            ModuleMediaLink.org_unit_id == org_unit_id,
            ModuleMediaLink.question_bank_id == module_id,
            ModuleMediaLink.asset_id == asset_id,
        )
    ).scalar_one_or_none()

    if link is None:
        raise MediaAssetNotHeldHere()

    return link


def delete_upload(
    db: Session,
    *,
    user_id: int,
    org_unit_id: int,
    module_id: str,
    asset_id: str,
) -> None:
    """Remove an upload and its link. The destructive one.

    The row goes first and the object second. If the store refuses,
    what it raised is not caught: the request fails and the transaction
    rolls back, so a link never survives without its file - the failure
    mode that would show a learner a broken player. A file the store
    says was already gone is not a refusal.

    Only the uploaded file is removed. The renditions, the poster and
    the captions a job wrote from it are in another bucket, and are
    left there.

    The row is flushed, not committed.

    Args:
        db: Core database session.
        user_id: Who is removing it, for the log.
        org_unit_id: The organisation the caller administers.
        module_id: The module the upload belongs to.
        asset_id: The upload's own id.

    Raises:
        MediaAssetNotHeldHere: The organisation holds no upload of that
            module by that id.
    """
    link = upload_held_by(db, org_unit_id, module_id, asset_id)

    db.delete(link)
    db.flush()

    bucket = settings.TEACHING_VIDEOS_SOURCE_BUCKET

    if bucket:
        # The row remembers which organisation's prefix its object was
        # written under, which is the only thing that can say where the
        # file is.
        storage.delete_media_object(
            bucket, link.organisation_id, module_id, asset_id
        )
    else:
        # Development, where the upload landed on disk rather than in a
        # bucket. Refusing here would leave the admin unable to undo the
        # one thing they can now do locally, and the row would outlive
        # every attempt to clear it.
        _delete_local_upload(module_id, asset_id, link.content_type)

    # Destructive, so the actor and the module are recorded. No
    # filename: this line goes to a log that is not PHI-safe.
    logger.info(
        "media asset deleted user=%s org=%s module=%s asset=%s",
        user_id,
        org_unit_id,
        module_id,
        asset_id,
    )


def save_captions(
    db: Session,
    *,
    user_id: int,
    org_unit_id: int,
    module_id: str,
    asset_id: str,
    webvtt: str,
) -> CaptionsOut:
    """Replace one upload's captions with corrected text, and record it.

    Saving is what records the review. Someone who has edited the text
    has read it, whereas a separate "mark as reviewed" button is a box
    to tick without looking - so ``captions_reviewed_at`` is set here
    rather than by an action of its own.

    The text is checked to begin ``WEBVTT`` and nothing more. That
    catches the common mistake - a paste that lost its header, or the
    wrong file entirely - without pretending to validate a format this
    has no business parsing.

    The captions are written under the organisation's own id, where the
    video is stored under the organisation's storage prefix. The two are
    the same number unless an older prefix is recorded for it.

    The row is flushed, not committed.

    Args:
        db: Core database session.
        user_id: Who is saving, for the log.
        org_unit_id: The organisation the caller administers.
        module_id: The module the upload belongs to.
        asset_id: The upload's own id.
        webvtt: The whole corrected file.

    Returns:
        The text as saved, with the space around it removed, and when
        it was reviewed.

    Raises:
        MediaAssetNotHeldHere: The organisation holds no upload of that
            module by that id.
        CaptionsNotWebVTT: The text does not begin ``WEBVTT``.
        CaptionsCannotBeSaved: No bucket of processed video is set.
    """
    link = upload_held_by(db, org_unit_id, module_id, asset_id)

    text = webvtt.strip()

    if not text.startswith("WEBVTT"):
        raise CaptionsNotWebVTT()

    bucket = settings.TEACHING_VIDEOS_BUCKET

    if not bucket:
        raise CaptionsCannotBeSaved()

    storage.write_caption_object(
        bucket, org_unit_id, module_id, asset_id, text
    )

    # Recorded only once the write succeeded: claiming a review for text
    # that never reached the bucket would tell the next person the
    # captions had been checked when what they will hear is Whisper's.
    link.captions_reviewed_at = datetime.now(UTC)
    link.has_captions = True
    db.flush()

    # No caption text in the log - it is a transcript of a lecture and
    # this log is not PHI-safe.
    logger.info(
        "captions saved user=%s org=%s module=%s asset=%s",
        user_id,
        org_unit_id,
        module_id,
        asset_id,
    )

    return CaptionsOut(
        asset_id=asset_id,
        webvtt=text,
        reviewed_at=link.captions_reviewed_at,
    )


def local_upload_root() -> str:
    """The content path an upload sent through this application lands under.

    Development only. Where a source bucket is set the bytes go straight
    to it, and writing to disk from a request body is not a thing to
    have running there.

    Raises:
        LocalUploadNotOffered: A source bucket is set.
        MediaUploadNotConfigured: No content path is set either.
    """
    if settings.TEACHING_VIDEOS_SOURCE_BUCKET:
        # Not 404: a deployment with a bucket has a real upload path,
        # and this route existing there at all would be the surprise.
        raise LocalUploadNotOffered()

    base_path = settings.TEACHING_QUESTION_BANK_PATH

    if not base_path:
        raise MediaUploadNotConfigured()

    return base_path


def local_upload_file(
    base_path: str, module_id: str, asset_id: str, content_type: str
) -> Path:
    """The file an upload sent through this application is written to.

    ``{module}/learning/{asset_id}{suffix}``, beside the pages that name
    it. The module's ``learning`` directory is made if it is not there.
    Nothing is written to the file here.

    The asset id is checked before it becomes a file name. The module
    id is not checked for its shape: it is looked for on the content
    path, as a directory holding a ``module.yaml``, and refused if there
    is none.

    Args:
        base_path: The content path, from :func:`local_upload_root`.
        module_id: The module the upload belongs to.
        asset_id: The upload's own id.
        content_type: The file's type, which the caller has checked
            against the allow-list. It decides the suffix.

    Raises:
        InvalidAssetId: The id holds anything but letters, digits,
            hyphens and underscores.
        NoModuleToUploadTo: The module is not on the content path.
    """
    # The asset id is generated server-side and lands in a filename, so
    # it is held to the same shape as every other path component rather
    # than trusted because we made it.
    if not _SAFE_ASSET_ID.fullmatch(asset_id):
        raise InvalidAssetId()

    module_dir = storage.resolve_module_dir(base_path, module_id)

    if not module_dir:
        raise NoModuleToUploadTo()

    learning_dir = module_dir / "learning"
    learning_dir.mkdir(parents=True, exist_ok=True)

    return learning_dir / f"{asset_id}{_suffix_for(content_type)}"


def _suffix_for(content_type: str) -> str:
    """The file suffix an upload of one type is stored with.

    ``.mp4`` for a type that is not on the allow-list.
    """
    return next(
        (
            ext
            for ext, mime in storage.ALLOWED_MEDIA_TYPES.items()
            if mime == content_type
        ),
        ".mp4",
    )


def _delete_local_upload(
    module_id: str,
    asset_id: str,
    content_type: str,
) -> None:
    """Remove a locally uploaded asset from the module's directory.

    The development counterpart of ``delete_media_object``. The file is
    named for its asset id, so the id validation that guards the write
    guards the delete too - a traversal here would reach outside the
    module.

    A missing file is not an error, matching the bucket path: the link
    row is what the admin acts on, and a file already gone should still
    let the row be cleared rather than leaving it undeletable.
    """
    base_path = settings.TEACHING_QUESTION_BANK_PATH

    if not base_path:
        return
    if not _SAFE_ASSET_ID.fullmatch(asset_id):
        return

    module_dir = storage.resolve_module_dir(base_path, module_id)

    if not module_dir:
        return

    path = module_dir / "learning" / f"{asset_id}{_suffix_for(content_type)}"
    path.unlink(missing_ok=True)
