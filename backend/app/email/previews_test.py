"""The committed email previews match what the templates render now.

Storybook's Foundations/Emails stories show the committed renders in
``frontend/src/stories/emails/rendered/``. CI's Storybook build has no
Python to render them itself, so this test is what stops the stories
quietly showing an old design. Run ``just email-preview`` and commit the
result when it fails.
"""

import json

import pytest

from app.email.previews import THEMES, build, previews
from app.paths import EMAIL_PREVIEWS_DIR

_FIX = "Run `just email-preview` and commit the result."


def test_the_previews_folder_is_there() -> None:
    assert (
        EMAIL_PREVIEWS_DIR.is_dir()
    ), f"{EMAIL_PREVIEWS_DIR} is missing. {_FIX}"


@pytest.mark.parametrize("name", sorted(build()))
def test_committed_render_matches_a_fresh_one(name: str) -> None:
    path = EMAIL_PREVIEWS_DIR / name

    assert path.is_file(), f"{name} has not been rendered. {_FIX}"
    assert (
        path.read_text(encoding="utf-8") == build()[name]
    ), f"{name} is out of date. {_FIX}"


def test_no_committed_render_is_left_over() -> None:
    expected = set(build())
    committed = {p.name for p in EMAIL_PREVIEWS_DIR.iterdir() if p.is_file()}

    assert committed <= expected, (
        f"Left over from a removed preview: {sorted(committed - expected)}. "
        f"{_FIX}"
    )


def test_index_lists_every_preview_in_every_theme() -> None:
    index = json.loads(build()["index.json"])

    assert [entry["id"] for entry in index] == [p.id for p in previews()]
    for entry in index:
        for theme in THEMES:
            assert entry[theme]["file"] == f"{entry['id']}--{theme}.html"


def test_previews_use_relative_image_paths() -> None:
    # Storybook serves the images from frontend/public/, not the live site.
    for name, contents in build().items():
        if name.endswith(".html"):
            assert 'src="https://' not in contents, name


def test_certificate_is_sent_for_eoeeta_with_replies_to_them() -> None:
    index = {entry["id"]: entry for entry in json.loads(build()["index.json"])}

    certificate = index["certificate"]["quill"]
    assert certificate["fromName"] == "EoEETA via Quill Medical"
    assert certificate["replyTo"] == "coordinator@eoeeta.example"
    assert index["password-reset"]["quill"]["replyTo"] is None
