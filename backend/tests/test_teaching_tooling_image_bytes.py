"""Images must actually be images, checked at the merge gate.

The validator matched names and extensions and never opened a file, so
anything wearing an image's name passed. The realistic route in was a Git
LFS pointer: both content repos declare ``*.png filter=lfs`` and
``actions/checkout`` does not fetch LFS objects unless asked, so a
~132-byte text file could reach GCS in place of the image. For a
visual-diagnosis bank the image is the question.

Only the merge gate can check this. Sync never has the bytes:
``download_bank_from_gcs`` fetches only YAML and
``download_module_from_gcs`` writes zero-byte placeholders.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from app.features.teaching.tooling.validate import (
    PNG_SIGNATURE,
    validate_module_metadata,
    validate_modules_dir,
)

_FIXTURES = Path(__file__).parent / "fixtures" / "teaching_tooling"
_VALID = _FIXTURES / ".valid-module"
_VALID_ID = "valid-module"

#: What git-lfs leaves in place of a file when objects are not fetched.
LFS_POINTER = (
    b"version https://git-lfs.github.com/spec/v1\n"
    b"oid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393\n"
    b"size 12345\n"
)

JPEG_SIGNATURE = b"\xff\xd8\xff"


def _module(tmp_path: Path, cover: bytes | None = None) -> Path:
    """A copy of the valid module, optionally with a replaced cover image."""
    modules = tmp_path / "modules"
    modules.mkdir(exist_ok=True)
    dest = modules / _VALID_ID
    shutil.copytree(_VALID, dest)
    if cover is not None:
        (dest / "cover.png").write_bytes(cover)
    return modules


class TestTheMergeGateOpensImages:
    def test_a_real_signature_passes(self, tmp_path: Path) -> None:
        result = validate_modules_dir(
            _module(tmp_path, PNG_SIGNATURE + b"whatever")
        )

        assert result.is_valid

    def test_an_lfs_pointer_is_rejected(self, tmp_path: Path) -> None:
        """The failure this whole check exists for."""
        result = validate_modules_dir(_module(tmp_path, LFS_POINTER))

        assert not result.is_valid

    def test_the_lfs_message_names_the_actual_cause(
        self, tmp_path: Path
    ) -> None:
        """ "not a valid png" would send someone to re-export the image;
        the problem is the checkout."""
        result = validate_modules_dir(_module(tmp_path, LFS_POINTER))

        assert any(
            "LFS" in e.message and "fetch" in e.message for e in result.errors
        )

    def test_a_pointer_is_not_caught_by_a_size_check(self) -> None:
        """Why signatures, not st_size: a pointer is not empty."""
        assert len(LFS_POINTER) > 100

    def test_an_empty_file_is_rejected(self, tmp_path: Path) -> None:
        result = validate_modules_dir(_module(tmp_path, b""))

        assert not result.is_valid
        assert any("is empty" in e.message for e in result.errors)

    def test_text_wearing_an_image_name_is_rejected(
        self, tmp_path: Path
    ) -> None:
        result = validate_modules_dir(_module(tmp_path, b"not an image"))

        assert not result.is_valid

    def test_the_wrong_image_format_is_rejected(self, tmp_path: Path) -> None:
        """A JPEG saved as .png still misleads whatever reads it later."""
        result = validate_modules_dir(
            _module(tmp_path, JPEG_SIGNATURE + b"body")
        )

        assert not result.is_valid

    def test_the_error_names_the_file(self, tmp_path: Path) -> None:
        result = validate_modules_dir(_module(tmp_path, LFS_POINTER))

        assert any("cover.png" in e.message for e in result.errors)


class TestOnlyImagesAreChecked:
    @pytest.mark.parametrize("name", ["notes.txt", "data.yaml", "slide.mdx"])
    def test_non_image_files_are_left_alone(
        self, tmp_path: Path, name: str
    ) -> None:
        """The check keys on the extension, so nothing else is opened."""
        modules = _module(tmp_path)
        (modules / _VALID_ID / name).write_bytes(b"not an image at all")

        assert validate_modules_dir(modules).is_valid


class TestSyncIsNotSubjectToThis:
    def test_a_zero_byte_placeholder_still_passes_sync(
        self, tmp_path: Path
    ) -> None:
        """The regression that would break every GCS sync.

        ``download_module_from_gcs`` writes empty placeholders on purpose,
        so applying the signature check on that path would reject content
        that is perfectly fine in the bucket.
        """
        modules = _module(tmp_path, b"")

        result = validate_module_metadata(modules / _VALID_ID)

        assert result.is_valid

    def test_even_a_pointer_passes_the_sync_path(self, tmp_path: Path) -> None:
        """Not an oversight: sync cannot tell, so it must not pretend to.

        A pointer never reaches the bucket anyway — the merge gate above
        rejects it before deploy.
        """
        modules = _module(tmp_path, LFS_POINTER)

        assert validate_module_metadata(modules / _VALID_ID).is_valid


class TestRetiredModulesAreStillSkipped:
    def test_a_retired_module_is_not_byte_checked(
        self, tmp_path: Path
    ) -> None:
        """Frozen content cannot be fixed, images included."""
        modules = _module(tmp_path, LFS_POINTER)
        yaml_path = modules / _VALID_ID / "module.yaml"
        yaml_path.write_text(
            "\n".join(
                "status: retired" if line.startswith("status:") else line
                for line in yaml_path.read_text().splitlines()
            )
            + "\n"
        )

        result = validate_modules_dir(modules)

        assert result.is_valid
        assert result.modules_skipped == 1
