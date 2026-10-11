"""What a learner is given of one module: its question bank, its pages.

Who may be given it is not decided here. ``app.features.teaching.access``
answers that for a question bank, and the router's
``resolve_visible_module`` for the learning pages, and each hands its
answer in. These functions take that answer, ask the one thing left
that can hide a module, whether its media is complete, and build what
the learner is sent.

Every refusal is a 404 with words that give nothing away: a module
whose media is incomplete, or whose content is missing, is refused as
one that was never theirs is.

The content store is reached through the ``storage``, ``media`` and
``mdx_parser`` modules by name, never by importing a function out of
them, so a test that replaces one of their functions replaces it here.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.features.teaching import mdx_parser, media, storage
from app.features.teaching.access import bank_status_on_show
from app.features.teaching.errors import (
    InvalidBankId,
    ModuleNotFound,
    NoLearningContent,
    QuestionBankNotFound,
    TeachingContentNotConfigured,
)
from app.features.teaching.models import ModuleMediaLink, QuestionBankConfig

_SAFE_BANK_ID = re.compile(r"^[a-zA-Z0-9_-]+$")


def module_is_servable(
    db: Session,
    organisation_id: int | None,
    module_id: str,
) -> bool:
    """Whether a module may be shown to a learner at all.

    A module missing any of its media is not served - not the learning
    half of it, the whole thing, assessment included. Half a module is
    not a lesser version of the module: it is a module whose author
    intended a video the learner would never see, and the assessment
    may well examine exactly that content.

    Per organisation, because media links are. The same module can be
    servable for one organisation and hidden from another.

    A module referencing no media is servable, which is most of them -
    this gate is invisible to content that never had video.
    """
    if organisation_id is None:
        return False

    return media.module_media_is_complete(db, organisation_id, module_id)


def check_bank_id(bank_id: str) -> None:
    """Refuse a question bank id that could not be one.

    Asked before anybody's organisations are, so a caller with nowhere
    to take modules who sends a bad id is told of the id.

    Raises:
        InvalidBankId: If *bank_id* is empty, or holds anything but
            letters, digits, hyphens and underscores.
    """
    if not bank_id or not _SAFE_BANK_ID.match(bank_id):
        raise InvalidBankId()


def question_bank_detail(
    db: Session,
    user_id: int,
    *,
    organisation_ids: list[int],
    bank_id: str,
) -> dict[str, Any]:
    """Full detail of one question bank, as one learner is shown it.

    The version described is the one promoted at the organisation whose
    status row ``bank_status_on_show`` gives, and never a newer one that
    has only been synced. The synced copy read is whichever the database
    gives first for that bank and version: it is not asked whose copy
    it is, since the content may be owned by another organisation.

    A bank closed to new attempts is still described, with ``is_live``
    false. The whole of ``config_yaml`` is handed back as it was synced.

    Args:
        db: Core database session.
        user_id: The learner.
        organisation_ids: The organisations whose modules they may
            take, as ``organisations_open_for_modules`` gives them.
        bank_id: The question bank, already through ``check_bank_id``.

    Returns:
        The fields of ``QuestionBankDetailOut``, as plain values.

    Raises:
        QuestionBankNotFound: If the bank is not on show to them, has
            no version promoted, has no synced copy of the promoted
            version, or is missing any of its media.
    """
    # Check the bank is visible to the user's orgs via status
    status_row = bank_status_on_show(
        db, user_id, organisation_ids=organisation_ids, bank_id=bank_id
    )

    if not status_row:
        raise QuestionBankNotFound()

    # A bank with nothing promoted has nothing to show: describing a
    # version this organisation does not serve would be worse than
    # saying it is not there.
    if status_row.active_version is None:
        raise QuestionBankNotFound()

    # Fetch the promoted version from whichever org owns the content.
    config = (
        db.execute(
            select(QuestionBankConfig).where(
                QuestionBankConfig.question_bank_id == bank_id,
                QuestionBankConfig.version == status_row.active_version,
            )
        )
        .scalars()
        .first()
    )

    if not config:
        raise QuestionBankNotFound()

    # Missing media hides the whole module, assessment included. Same
    # 404 as every other refusal here, so "incomplete" is
    # indistinguishable from "not yours" and "no such bank".
    if not module_is_servable(db, status_row.org_unit_id, bank_id):
        raise QuestionBankNotFound()

    return {
        "id": config.id,
        "question_bank_id": config.question_bank_id,
        "version": config.version,
        "title": config.title,
        "description": config.description,
        "type": config.type,
        "synced_at": config.synced_at,
        "config_yaml": config.config_yaml,
        "is_live": status_row.is_live,
        "has_learning": storage.has_learning_content(
            settings.TEACHING_QUESTION_BANK_PATH or "",
            config.question_bank_id,
        ),
    }


def learning_content(
    db: Session, *, organisation_id: int, module_id: str
) -> dict[str, Any]:
    """The parsed learning slides of one module, for one organisation.

    The caller has already found that the learner may be given the
    module, and through which organisation: this reads nothing from the
    bucket or the content path for anybody else. The organisation
    matters twice, because media links are per organisation: once for
    whether the module's media is complete, and once for which file
    each video on a slide resolves to.

    Read from the bucket where one is configured, and otherwise from
    the content path on disk. The two differ in one thing: pages that
    are there and parse to no slides are answered with an empty list
    from the bucket, and refused from disk.

    Args:
        db: Core database session.
        organisation_id: The organisation that makes the module visible
            to the learner.
        module_id: The module.

    Returns:
        The fields of ``LearningContentOut``, as plain values.

    Raises:
        ModuleNotFound: If the module is missing any of its media for
            that organisation, or is not on the content path.
        NoLearningContent: If the module has no learning pages.
        TeachingContentNotConfigured: If neither a bucket nor a content
            path is set.
    """
    # A module missing any of its media is not served at all. Same 404
    # as every other refusal here, so "incomplete" is indistinguishable
    # from "not yours" and "no such module" from outside.
    if not media.module_media_is_complete(db, organisation_id, module_id):
        raise ModuleNotFound()

    bucket = settings.TEACHING_GCS_BUCKET
    base_path = settings.TEACHING_QUESTION_BANK_PATH

    # Bound on both branches: only the local one sets it below, and the
    # fallback in _video_files reads it either way.
    module_dir: Path | None = None

    if bucket:
        # Production: load from GCS
        meta = storage.download_module_yaml_from_gcs(bucket, module_id) or {}
        mdx_content = storage.download_learning_mdx_from_gcs(bucket, module_id)
        if not mdx_content:
            raise NoLearningContent()
        slides = mdx_parser.parse_mdx_to_slides(mdx_content)
    elif base_path:
        # Local dev: load from filesystem
        module_dir = storage.resolve_module_dir(base_path, module_id)
        if not module_dir:
            raise ModuleNotFound()
        meta = mdx_parser.load_module_yaml(module_dir)
        slides = mdx_parser.load_learning_content(module_dir)
        if not slides:
            raise NoLearningContent()
    else:
        raise TeachingContentNotConfigured()

    # Every link this module has, so resolving a ref below is a dict
    # lookup rather than a query per slide.
    links = {
        row.media_key: row
        for row in db.execute(
            select(ModuleMediaLink).where(
                ModuleMediaLink.org_unit_id == organisation_id,
                ModuleMediaLink.question_bank_id == module_id,
            )
        )
        .scalars()
        .all()
    }

    return {
        "module_id": module_id,
        "title": meta.get("title", module_id),
        "slides": [
            _slide_row(slide, module_id, bucket, links, module_dir)
            for slide in slides
        ],
    }


def _image_url(bucket: str | None, module_id: str, filename: str) -> str:
    """Build a URL for a learning image."""
    if bucket:
        return storage.get_learning_image_url_gcs(bucket, module_id, filename)

    return f"/api/teaching/images/learning/{module_id}/{filename}"


def _no_video() -> dict[str, str | None]:
    """The four video fields of a slide with nothing to play."""
    return {
        "src": None,
        "src_1080p": None,
        "poster": None,
        "captions": None,
    }


def _video_files(
    video_ref: str,
    links: dict[str, ModuleMediaLink],
    module_dir: Path | None,
) -> dict[str, str | None]:
    """Resolve an MDX ``ref`` to the files under the module prefix.

    Filenames, not URLs: the player composes each full address from
    the ``base_url`` that ``/video-access`` returns, which differs
    between the CDN and the local development route. Splitting it
    this way is what lets the frontend stay blind to the difference.

    An uploaded asset is named for its generated id, never for the
    ref or the uploader's filename, so this is a link lookup. The
    old ``<ref>.mp4`` convention survives only as a fallback, for
    content whose video was dropped on disk by hand before there
    was an upload path - the plan sanctions that for local work and
    it still plays.

    ``src`` is what plays by default. The rest are what the
    transcode and caption jobs produce, and each appears only where
    the link records that job having produced it - never inferred
    from the naming convention, because a name that resolves to a
    file nobody wrote is a 404 the player cannot explain.

    Every value is None where a ref has no link at all, which the
    availability gate has already made unreachable for a learner: an
    incomplete module is not served at all.

    Args:
        video_ref: The ``ref`` a slide's video names.
        links: The module's media links for the organisation, by key.
        module_dir: The module's directory on the content path, or
            None when the content came from the bucket, where the
            hand-placed fallback does not apply at all.
    """
    link = links.get(video_ref)

    if link is not None:
        asset = link.asset_id

        # Before the transcode job has run there are no renditions,
        # only the original upload - so the default rendition falls
        # back to it and the alternatives stay absent. A module in
        # that state is hidden from learners anyway, but the shape
        # has to be right for the admin card and for a dev machine
        # with no job configured at all.
        if link.transcoded_at is None:
            suffix = next(
                (
                    ext
                    for ext, mime in storage.ALLOWED_MEDIA_TYPES.items()
                    if mime == link.content_type
                ),
                ".mp4",
            )

            return {**_no_video(), "src": f"{asset}{suffix}"}

        # Deterministic names, matching what the job writes. The
        # flags say which of them exist; the cookie covers the
        # prefix rather than each file, so nothing has to ask the
        # bucket what is there.
        return {
            "src": f"{asset}-720p.mp4",
            "src_1080p": (f"{asset}-1080p.mp4" if link.has_1080p else None),
            "poster": (f"{asset}-poster.jpg" if link.has_poster else None),
            "captions": f"{asset}.vtt" if link.has_captions else None,
        }

    # Hand-placed file, the convention from before uploads existed.
    # Guarded before use rather than after: module_dir is None on the
    # GCS branch, where this fallback does not apply at all.
    if module_dir is not None:
        candidate = module_dir / "learning" / f"{video_ref}.mp4"
        if candidate.is_file():
            return {**_no_video(), "src": f"{video_ref}.mp4"}

    return _no_video()


def _slide_row(
    slide: mdx_parser.ParsedSlide,
    module_id: str,
    bucket: str | None,
    links: dict[str, ModuleMediaLink],
    module_dir: Path | None,
) -> dict[str, Any]:
    """One slide as the API returns it.

    A function rather than a comprehension because video now
    resolves to four fields from one lookup, and doing that inline
    would call the resolver once per field.
    """
    video = (
        _video_files(slide.video_ref, links, module_dir)
        if slide.video_ref
        else _no_video()
    )

    return {
        "slide_index": slide.slide_index,
        "layout": slide.layout,
        "title": slide.title,
        "body": slide.body,
        "callout_type": slide.callout_type,
        "callout_body": slide.callout_body,
        "youtube_id": slide.youtube_id,
        "duration_seconds": slide.duration_seconds,
        "image_src": (
            _image_url(bucket, module_id, slide.figure_src)
            if slide.figure_src
            else None
        ),
        "image_alt": slide.figure_alt,
        "image_caption": slide.figure_caption,
        "image_position": slide.figure_position,
        "video_src": video["src"],
        "video_src_1080p": video["src_1080p"],
        "video_poster": video["poster"],
        "video_captions": video["captions"],
    }
