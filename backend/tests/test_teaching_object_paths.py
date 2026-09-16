"""Tests for the teaching object-path helpers.

The paths themselves are covered by ``test_teaching_storage.py``, which
reaches them through ``storage``'s re-export. What is tested *here* is
the property this module exists for: that importing it does not
construct ``Settings``.

That property is not decoration. The transcode job holds no JWT secret
and no database password, and should hold neither — it encodes video and
talks to one bucket. It crashed on startup for want of them, twenty
seconds in, because the five-line path helper it needed lived in a
module that imports ``settings`` at scope. Nothing local caught it: the
test suite runs with a full environment, so every import succeeds there
whatever it drags in.
"""

from __future__ import annotations

import subprocess
import sys

import pytest

from app.features.teaching.object_paths import (
    SAFE_ID,
    caption_object_path,
    media_object_path,
)


class TestImportsWithoutConfiguration:
    """The reason this module is separate from ``storage``."""

    def test_importing_does_not_load_app_config(self) -> None:
        """A subprocess, because ``app.config`` is already imported here.

        The test suite has a full environment and imports the whole
        application, so asserting on ``sys.modules`` in-process would
        pass whatever this module did. A fresh interpreter with the two
        settings unset is the only way to ask the question the Cloud Run
        job asks.
        """
        script = (
            "import sys\n"
            "from app.features.teaching.object_paths import "
            "media_object_path\n"
            "assert 'app.config' not in sys.modules, 'app.config loaded'\n"
            "print(media_object_path(7, 'mod', 'abc'))\n"
        )
        result = subprocess.run(  # noqa: S603
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            cwd="/app",
            env={"PATH": "/usr/local/bin:/usr/bin:/bin"},
        )

        assert result.returncode == 0, (
            f"importing object_paths needed configuration:\n"
            f"{result.stderr[-2000:]}"
        )
        assert result.stdout.strip() == "7/mod/abc"

    def test_storage_still_re_exports_them(self) -> None:
        """Existing callers of ``storage`` must be unaffected.

        The split is meant to be invisible to everything that already
        worked: one definition, imported back where it used to live.
        """
        from app.features.teaching import object_paths, storage

        assert storage.media_object_path is object_paths.media_object_path
        assert storage.caption_object_path is object_paths.caption_object_path
        assert storage._SAFE_BANK_ID is object_paths.SAFE_ID


class TestPathValidation:
    """The traversal guard, restated at its new home."""

    @pytest.mark.parametrize(
        "module_id",
        ["../other", "mod/sub", "", "mod id", "mod;rm"],
    )
    def test_an_unsafe_module_id_is_refused(self, module_id: str) -> None:
        # These strings are concatenated into a bucket key, so a slash or
        # a `..` would let one organisation's job reach another's objects.
        with pytest.raises(ValueError):
            media_object_path(1, module_id, "abc123")

    @pytest.mark.parametrize("org_id", [0, -1])
    def test_a_non_positive_org_id_is_refused(self, org_id: int) -> None:
        with pytest.raises(ValueError):
            media_object_path(org_id, "mod-1", "abc123")

    def test_captions_inherit_the_same_guard(self) -> None:
        # Built on media_object_path precisely so the validation cannot
        # drift apart between the two.
        with pytest.raises(ValueError):
            caption_object_path(1, "../other", "abc123")

    def test_the_pattern_accepts_what_ids_actually_look_like(self) -> None:
        assert SAFE_ID.match("colonoscopy-optical-diagnosis-test")
        assert SAFE_ID.match("5c403a488ae44d7a96c72c206f76d387")
        assert not SAFE_ID.match("has/slash")
