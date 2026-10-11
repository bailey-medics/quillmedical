"""What a learner is given of one module, asked of module_content.py itself."""

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy.orm import Session

from app.features.teaching import media, storage
from app.features.teaching.enrolment import enrol
from app.features.teaching.errors import (
    InvalidBankId,
    ModuleNotFound,
    NoLearningContent,
    QuestionBankNotFound,
    TeachingContentNotConfigured,
)
from app.features.teaching.models import (
    ModuleMediaLink,
    QuestionBankConfig,
    QuestionBankOrgStatus,
)
from app.features.teaching.module_content import (
    check_bank_id,
    learning_content,
    module_is_servable,
    question_bank_detail,
)
from app.models import OrgUnit, User

BANK = "polyps"
OTHER_BANK = "bleeding"
CONFIG = {"id": BANK, "options": [{"id": "a", "tags": ["adenoma"]}]}
NO_VIDEO = {
    "video_src": None,
    "video_src_1080p": None,
    "video_poster": None,
    "video_captions": None,
}


def _organisation(db: Session, name: str = "Trust") -> OrgUnit:
    org = OrgUnit(name=name, type="organisation")
    db.add(org)
    db.flush()

    return org


def _person(db: Session, username: str = "learner") -> User:
    user = User(
        username=username,
        email=f"{username}@example.com",
        password_hash="x",
        is_active=True,
        email_verified=True,
        base_profession="teaching_delegate",
    )
    db.add(user)
    db.flush()

    return user


def _serve(
    db: Session,
    org: OrgUnit,
    user: User,
    *,
    active_version: int | None = 1,
    is_live: bool = True,
) -> None:
    """A status row for the bank at *org*, with *user* enrolled on it."""
    db.add(
        QuestionBankOrgStatus(
            org_unit_id=org.id,
            question_bank_id=BANK,
            is_live=is_live,
            active_version=active_version,
        )
    )
    db.flush()
    enrol(
        db,
        user.id,
        org_unit_id=org.id,
        question_bank_id=BANK,
        source="admin",
    )


def _sync(
    db: Session, org: OrgUnit, version: int = 1, title: str = "Polyps"
) -> QuestionBankConfig:
    """One version of the bank, synced into the organisation."""
    config = QuestionBankConfig(
        org_unit_id=org.id,
        question_bank_id=BANK,
        version=version,
        title=title,
        description="A question bank.",
        type="uniform",
        config_yaml=CONFIG,
    )
    db.add(config)
    db.flush()

    return config


def _media(
    monkeypatch: pytest.MonkeyPatch, *, complete: bool = True
) -> list[tuple[int, str]]:
    """Answer the completeness question, and note each time it is asked."""
    asked: list[tuple[int, str]] = []

    def is_complete(db: Session, organisation_id: int, bank_id: str) -> bool:
        asked.append((organisation_id, bank_id))

        return complete

    monkeypatch.setattr(media, "module_media_is_complete", is_complete)

    return asked


def _has_learning(
    monkeypatch: pytest.MonkeyPatch, answer: bool = False
) -> list[tuple[str, str]]:
    asked: list[tuple[str, str]] = []

    def has_it(base_path: str, bank_id: str) -> bool:
        asked.append((base_path, bank_id))

        return answer

    monkeypatch.setattr(storage, "has_learning_content", has_it)

    return asked


# --- module_is_servable -----------------------------------------------------


def test_a_module_with_no_organisation_to_ask_is_not_servable(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    asked = _media(monkeypatch)

    assert module_is_servable(db_session, None, BANK) is False
    assert asked == []


@pytest.mark.parametrize("complete", [True, False])
def test_a_module_is_servable_when_its_media_is_complete_there(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, complete: bool
) -> None:
    asked = _media(monkeypatch, complete=complete)

    assert module_is_servable(db_session, 7, BANK) is complete
    assert asked == [(7, BANK)]


# --- check_bank_id ----------------------------------------------------------


@pytest.mark.parametrize("bank_id", ["polyps", "Polyps-2026", "a_b", "9"])
def test_letters_digits_hyphens_and_underscores_are_a_bank_id(
    bank_id: str,
) -> None:
    check_bank_id(bank_id)


@pytest.mark.parametrize(
    "bank_id", ["", "a b", "a.b", "a/b", "..", "a;b", "polyps%"]
)
def test_anything_else_is_refused_as_a_bank_id(bank_id: str) -> None:
    with pytest.raises(InvalidBankId) as refused:
        check_bank_id(bank_id)

    assert refused.value.status_code == 400
    assert refused.value.message == "Invalid bank_id"


# --- question_bank_detail ---------------------------------------------------


def _detail(db: Session, user: User, *orgs: OrgUnit) -> dict[str, Any]:
    return question_bank_detail(
        db,
        user.id,
        organisation_ids=[org.id for org in orgs],
        bank_id=BANK,
    )


def _refused(db: Session, user: User, *orgs: OrgUnit) -> None:
    with pytest.raises(QuestionBankNotFound) as refused:
        _detail(db, user, *orgs)

    assert refused.value.status_code == 404
    assert refused.value.message == "Question bank not found"


def test_the_detail_says_what_the_promoted_version_says(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _serve(db_session, org, learner)
    config = _sync(db_session, org)
    asked = _media(monkeypatch)
    _has_learning(monkeypatch, True)

    assert _detail(db_session, learner, org) == {
        "id": config.id,
        "question_bank_id": BANK,
        "version": 1,
        "title": "Polyps",
        "description": "A question bank.",
        "type": "uniform",
        "synced_at": config.synced_at,
        "config_yaml": CONFIG,
        "is_live": True,
        "has_learning": True,
    }
    assert asked == [(org.id, BANK)]


def test_the_detail_is_of_the_promoted_version_and_not_the_newest(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _serve(db_session, org, learner)
    _sync(db_session, org, 1, "Promoted")
    _sync(db_session, org, 2, "Only synced")
    _media(monkeypatch)
    _has_learning(monkeypatch)

    detail = _detail(db_session, learner, org)

    assert (detail["version"], detail["title"]) == (1, "Promoted")


def test_a_bank_closed_to_new_attempts_is_still_described(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _serve(db_session, org, learner, is_live=False)
    _sync(db_session, org)
    _media(monkeypatch)
    _has_learning(monkeypatch)

    assert _detail(db_session, learner, org)["is_live"] is False


def test_whether_it_has_learning_pages_is_asked_of_the_content_path(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _serve(db_session, org, learner)
    _sync(db_session, org)
    _media(monkeypatch)
    asked = _has_learning(monkeypatch)
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", "/content"
    )

    assert _detail(db_session, learner, org)["has_learning"] is False
    assert asked == [("/content", BANK)]


def test_with_no_content_path_set_an_empty_one_is_asked(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _serve(db_session, org, learner)
    _sync(db_session, org)
    _media(monkeypatch)
    asked = _has_learning(monkeypatch)
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", None
    )

    _detail(db_session, learner, org)

    assert asked == [("", BANK)]


def test_a_bank_no_organisation_of_theirs_serves_is_not_found(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Elsewhere")
    learner = _person(db_session)
    _serve(db_session, elsewhere, learner)
    _sync(db_session, elsewhere)
    _media(monkeypatch)

    _refused(db_session, learner, org)


def test_a_bank_they_are_not_enrolled_on_is_not_found(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _serve(db_session, org, _person(db_session, "somebody-else"))
    _sync(db_session, org)
    _media(monkeypatch)

    _refused(db_session, _person(db_session), org)


def test_a_bank_with_no_version_promoted_is_not_found(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _serve(db_session, org, learner, active_version=None)
    _sync(db_session, org)
    asked = _media(monkeypatch)

    _refused(db_session, learner, org)
    assert asked == []


def test_a_promoted_version_that_was_never_synced_is_not_found(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _serve(db_session, org, learner, active_version=2)
    _sync(db_session, org, 1)
    asked = _media(monkeypatch)

    _refused(db_session, learner, org)
    assert asked == []


def test_a_bank_missing_some_of_its_media_is_not_found(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    learner = _person(db_session)
    _serve(db_session, org, learner)
    _sync(db_session, org)
    asked = _media(monkeypatch, complete=False)
    learning = _has_learning(monkeypatch)

    _refused(db_session, learner, org)
    assert asked == [(org.id, BANK)]
    assert learning == []


def test_the_synced_copy_read_is_not_asked_whose_it_is(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The content may be owned by an organisation that is not theirs."""
    org = _organisation(db_session)
    owner = _organisation(db_session, "Owner")
    learner = _person(db_session)
    _serve(db_session, org, learner)
    _sync(db_session, owner, 1, "The owner's copy")
    _media(monkeypatch)
    _has_learning(monkeypatch)

    assert _detail(db_session, learner, org)["title"] == "The owner's copy"


# --- learning_content: what hides a module ----------------------------------

TWO_SLIDES = "# Polyps\n\n## Sizing\n\nMeasure against the forceps."


def _bucket(
    monkeypatch: pytest.MonkeyPatch,
    mdx: str | None,
    module_yaml: dict[str, Any] | None = None,
) -> list[str]:
    """A bucket holding one module's pages, and each read made of it."""
    read: list[str] = []

    def yaml_of(bucket: str, module_id: str) -> dict[str, Any] | None:
        read.append(f"yaml {bucket} {module_id}")

        return module_yaml

    def mdx_of(bucket: str, module_id: str) -> str | None:
        read.append(f"mdx {bucket} {module_id}")

        return mdx

    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", "bucket")
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", "/not/read"
    )
    monkeypatch.setattr(storage, "download_module_yaml_from_gcs", yaml_of)
    monkeypatch.setattr(storage, "download_learning_mdx_from_gcs", mdx_of)
    monkeypatch.setattr(
        storage,
        "get_learning_image_url_gcs",
        lambda b, m, f: f"https://signed.example/{b}/{m}/{f}",
    )

    return read


def _on_disk(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    *,
    slides: str | None = TWO_SLIDES,
    module_yaml: str = "title: On disk\n",
) -> Path:
    """One module in a content repository on disk, and no bucket."""
    module = tmp_path / "content-repo" / "modules" / BANK
    module.mkdir(parents=True)
    (module / "module.yaml").write_text(module_yaml, encoding="utf-8")

    if slides is not None:
        (module / "learning").mkdir()
        (module / "learning" / "content.mdx").write_text(
            slides, encoding="utf-8"
        )

    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", None)
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", str(tmp_path)
    )

    return module


def _pages(db: Session, organisation_id: int = 1) -> dict[str, Any]:
    return learning_content(
        db, organisation_id=organisation_id, module_id=BANK
    )


def test_a_module_missing_some_of_its_media_is_not_found_and_nothing_is_read(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    read = _bucket(monkeypatch, TWO_SLIDES)
    asked = _media(monkeypatch, complete=False)

    with pytest.raises(ModuleNotFound) as refused:
        _pages(db_session, 7)

    assert refused.value.status_code == 404
    assert refused.value.message == "Module not found"
    assert asked == [(7, BANK)]
    assert read == []


@pytest.mark.parametrize("mdx", [None, ""])
def test_a_module_with_no_pages_in_the_bucket_has_no_learning_content(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, mdx: str | None
) -> None:
    _bucket(monkeypatch, mdx, {"title": "Polyps"})
    _media(monkeypatch)

    with pytest.raises(NoLearningContent) as refused:
        _pages(db_session)

    assert refused.value.status_code == 404
    assert refused.value.message == "No learning content for this module"


def test_a_module_that_is_not_on_the_content_path_is_not_found(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", None)
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", str(tmp_path)
    )
    _media(monkeypatch)

    with pytest.raises(ModuleNotFound):
        _pages(db_session)


def test_a_module_on_disk_with_no_pages_has_no_learning_content(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _on_disk(monkeypatch, tmp_path, slides=None)
    _media(monkeypatch)

    with pytest.raises(NoLearningContent):
        _pages(db_session)


def test_pages_on_disk_that_make_no_slide_are_no_learning_content(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _on_disk(monkeypatch, tmp_path, slides="Words under no heading.")
    _media(monkeypatch)

    with pytest.raises(NoLearningContent):
        _pages(db_session)


def test_pages_in_the_bucket_that_make_no_slide_are_an_empty_list(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Where the bucket and the disk differ: refused from disk, not here."""
    _bucket(monkeypatch, "Words under no heading.", {"title": "Polyps"})
    _media(monkeypatch)

    assert _pages(db_session) == {
        "module_id": BANK,
        "title": "Polyps",
        "slides": [],
    }


def test_with_neither_a_bucket_nor_a_path_the_content_is_not_configured(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.config.settings.TEACHING_GCS_BUCKET", None)
    monkeypatch.setattr(
        "app.config.settings.TEACHING_QUESTION_BANK_PATH", None
    )
    _media(monkeypatch)

    with pytest.raises(TeachingContentNotConfigured) as refused:
        _pages(db_session)

    assert refused.value.status_code == 404
    assert refused.value.message == "Teaching content not configured"


# --- learning_content: the slides -------------------------------------------


def test_the_pages_from_the_bucket_are_given_slide_by_slide(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    read = _bucket(monkeypatch, TWO_SLIDES, {"title": "Polyps"})
    _media(monkeypatch)

    assert _pages(db_session) == {
        "module_id": BANK,
        "title": "Polyps",
        "slides": [
            {
                "slide_index": 0,
                "layout": "section-title",
                "title": "Polyps",
                "body": None,
                "callout_type": None,
                "callout_body": None,
                "youtube_id": None,
                "duration_seconds": None,
                "image_src": None,
                "image_alt": None,
                "image_caption": None,
                "image_position": None,
                **NO_VIDEO,
            },
            {
                "slide_index": 1,
                "layout": "default",
                "title": "Sizing",
                "body": "Measure against the forceps.",
                "callout_type": None,
                "callout_body": None,
                "youtube_id": None,
                "duration_seconds": None,
                "image_src": None,
                "image_alt": None,
                "image_caption": None,
                "image_position": None,
                **NO_VIDEO,
            },
        ],
    }
    assert read == [f"yaml bucket {BANK}", f"mdx bucket {BANK}"]


@pytest.mark.parametrize("module_yaml", [None, {}, {"order": 3}])
def test_a_module_whose_yaml_gives_no_title_is_titled_by_its_id(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    module_yaml: dict[str, Any] | None,
) -> None:
    _bucket(monkeypatch, TWO_SLIDES, module_yaml)
    _media(monkeypatch)

    assert _pages(db_session)["title"] == BANK


def test_the_pages_on_disk_are_titled_by_module_yaml(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _on_disk(monkeypatch, tmp_path)
    _media(monkeypatch)

    pages = _pages(db_session)

    assert pages["title"] == "On disk"
    assert [slide["title"] for slide in pages["slides"]] == [
        "Polyps",
        "Sizing",
    ]


FIGURE = '## Seen\n\n<Figure src="polyp.png" alt="A polyp" caption="Is" />'


def test_an_image_from_the_bucket_is_given_the_address_storage_signs(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    _bucket(monkeypatch, FIGURE)
    _media(monkeypatch)

    (slide,) = _pages(db_session)["slides"]

    assert (
        slide["image_src"] == f"https://signed.example/bucket/{BANK}/polyp.png"
    )
    assert slide["image_alt"] == "A polyp"
    assert slide["image_caption"] == "Is"
    assert slide["image_position"] == "above"


def test_an_image_on_disk_is_given_the_local_route(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _on_disk(monkeypatch, tmp_path, slides=FIGURE)
    _media(monkeypatch)

    (slide,) = _pages(db_session)["slides"]

    assert slide["image_src"] == (
        f"/api/teaching/images/learning/{BANK}/polyp.png"
    )


# --- learning_content: which file a video is ---------------------------------

VIDEO = '## Watch\n\n<Video ref="lecture-01" duration={90} />'


def _link(
    db: Session,
    org: OrgUnit,
    *,
    transcoded: bool = True,
    content_type: str = "video/mp4",
    has_1080p: bool = False,
    has_poster: bool = False,
    has_captions: bool = False,
    media_key: str = "lecture-01",
    asset_id: str = "asset1",
) -> None:
    db.add(
        ModuleMediaLink(
            org_unit_id=org.id,
            question_bank_id=BANK,
            media_key=media_key,
            asset_id=asset_id,
            original_filename="lecture.mp4",
            content_type=content_type,
            size_bytes=1024,
            uploaded_at=datetime.now(UTC),
            transcoded_at=datetime.now(UTC) if transcoded else None,
            has_1080p=has_1080p,
            has_poster=has_poster,
            has_captions=has_captions,
        )
    )
    db.flush()


def _video(db: Session, org: OrgUnit) -> dict[str, Any]:
    (slide,) = _pages(db, org.id)["slides"]

    assert slide["layout"] == "video-slide"
    assert slide["duration_seconds"] == 90

    return {key: slide[key] for key in NO_VIDEO}


def test_a_transcoded_video_plays_at_720p_with_nothing_else_claimed(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _link(db_session, org)
    _bucket(monkeypatch, VIDEO)
    _media(monkeypatch)

    assert _video(db_session, org) == {
        **NO_VIDEO,
        "video_src": "asset1-720p.mp4",
    }


def test_each_other_file_is_named_only_where_the_link_records_it(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    _link(db_session, org, has_1080p=True, has_poster=True, has_captions=True)
    _bucket(monkeypatch, VIDEO)
    _media(monkeypatch)

    assert _video(db_session, org) == {
        "video_src": "asset1-720p.mp4",
        "video_src_1080p": "asset1-1080p.mp4",
        "video_poster": "asset1-poster.jpg",
        "video_captions": "asset1.vtt",
    }


@pytest.mark.parametrize(
    ("content_type", "suffix"),
    [
        ("video/mp4", ".mp4"),
        ("video/webm", ".webm"),
        ("video/quicktime", ".mov"),
        ("video/unheard-of", ".mp4"),
    ],
)
def test_a_video_not_yet_transcoded_plays_as_it_was_uploaded(
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
    content_type: str,
    suffix: str,
) -> None:
    org = _organisation(db_session)
    _link(
        db_session,
        org,
        transcoded=False,
        content_type=content_type,
        has_1080p=True,
        has_poster=True,
        has_captions=True,
    )
    _bucket(monkeypatch, VIDEO)
    _media(monkeypatch)

    assert _video(db_session, org) == {
        **NO_VIDEO,
        "video_src": f"asset1{suffix}",
    }


def test_a_video_with_no_link_and_no_file_resolves_to_nothing(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    org = _organisation(db_session)
    _link(db_session, org, media_key="another-lecture")
    _on_disk(monkeypatch, tmp_path, slides=VIDEO)
    _media(monkeypatch)

    assert _video(db_session, org) == NO_VIDEO


def test_another_organisations_link_is_not_this_ones(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    org = _organisation(db_session)
    elsewhere = _organisation(db_session, "Elsewhere")
    _link(db_session, elsewhere)
    _bucket(monkeypatch, VIDEO)
    _media(monkeypatch)

    assert _video(db_session, org) == NO_VIDEO


def test_a_video_placed_on_disk_by_hand_plays_under_its_ref(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    org = _organisation(db_session)
    module = _on_disk(monkeypatch, tmp_path, slides=VIDEO)
    (module / "learning" / "lecture-01.mp4").write_bytes(b"video")
    _media(monkeypatch)

    assert _video(db_session, org) == {
        **NO_VIDEO,
        "video_src": "lecture-01.mp4",
    }


def test_a_link_is_used_before_a_file_placed_by_hand(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    org = _organisation(db_session)
    _link(db_session, org)
    module = _on_disk(monkeypatch, tmp_path, slides=VIDEO)
    (module / "learning" / "lecture-01.mp4").write_bytes(b"video")
    _media(monkeypatch)

    assert _video(db_session, org)["video_src"] == "asset1-720p.mp4"
