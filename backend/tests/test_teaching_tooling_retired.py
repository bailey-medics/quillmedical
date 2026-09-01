"""Retired modules are skipped by content validation.

``check_version_lock`` freezes a retired module permanently, so it can
never be brought into line with a stricter validator. The deploy re-uploads
every module regardless of status, so without this one retired module makes
every future deploy fail with nothing anyone is allowed to fix.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from app.features.teaching.tooling.validate import (
    validate_module_metadata,
    validate_modules_dir,
)

_FIXTURES = Path(__file__).parent / "fixtures" / "teaching_tooling"
_VALID = _FIXTURES / ".valid-module"
_VALID_ID = "valid-module"


def _module(tmp_path: Path, *, status: str, broken: bool = False) -> Path:
    """A copy of the valid module, at the given lifecycle status."""
    modules = tmp_path / "modules"
    modules.mkdir(exist_ok=True)
    dest = modules / _VALID_ID
    shutil.copytree(_VALID, dest)

    yaml_path = dest / "module.yaml"
    text = yaml_path.read_text()
    assert "status:" in text, "fixture no longer declares a status"
    text = "\n".join(
        f"status: {status}" if line.startswith("status:") else line
        for line in text.splitlines()
    )
    yaml_path.write_text(text + "\n")

    if broken:
        # A failure a stricter validator would raise on frozen content.
        (dest / "assessment" / "assessment.yaml").write_text("id: nope\n")

    return modules


class TestRetiredIsSkipped:
    def test_a_retired_module_is_not_validated(self, tmp_path: Path) -> None:
        result = validate_modules_dir(_module(tmp_path, status="retired"))

        assert result.modules_skipped == 1
        assert result.modules_checked == 0

    def test_a_broken_retired_module_still_passes(
        self, tmp_path: Path
    ) -> None:
        """The whole point: frozen content cannot be fixed, so it must not
        be able to fail the build."""
        result = validate_modules_dir(
            _module(tmp_path, status="retired", broken=True)
        )

        assert result.is_valid
        assert result.errors == []

    def test_the_same_break_fails_while_live(self, tmp_path: Path) -> None:
        """Proves the previous test passes because of the status, not
        because the break is unnoticed."""
        result = validate_modules_dir(
            _module(tmp_path, status="live", broken=True)
        )

        assert not result.is_valid

    @pytest.mark.parametrize("status", ["draft", "live"])
    def test_other_statuses_are_still_validated(
        self, tmp_path: Path, status: str
    ) -> None:
        result = validate_modules_dir(_module(tmp_path, status=status))

        assert result.modules_checked == 1
        assert result.modules_skipped == 0

    def test_the_skip_is_reported_not_silent(self, tmp_path: Path) -> None:
        """A module that vanishes from validation without a word is a
        module nobody remembers is unvalidated."""
        result = validate_modules_dir(_module(tmp_path, status="retired"))

        assert "skipped 1 retired" in result.summary()


class TestUnreadableStatusIsNotRetired:
    def test_a_module_with_no_module_yaml_is_still_validated(
        self, tmp_path: Path
    ) -> None:
        modules = _module(tmp_path, status="retired")
        (modules / _VALID_ID / "module.yaml").unlink()

        result = validate_modules_dir(modules)

        assert result.modules_skipped == 0
        assert not result.is_valid

    def test_unparseable_yaml_is_still_validated(self, tmp_path: Path) -> None:
        """Cannot be trusted to say it is retired, so it is not."""
        modules = _module(tmp_path, status="retired")
        (modules / _VALID_ID / "module.yaml").write_text("{[not yaml\n")

        result = validate_modules_dir(modules)

        assert result.modules_skipped == 0
        assert not result.is_valid


class TestSyncPathSkipsToo:
    def test_validate_module_metadata_skips_retired(
        self, tmp_path: Path
    ) -> None:
        """Sync re-imports every module, so it needs the same rule as the
        merge gate or a retired bank fails the sync instead."""
        modules = _module(tmp_path, status="retired", broken=True)

        result = validate_module_metadata(modules / _VALID_ID)

        assert result.is_valid
        assert result.modules_skipped == 1

    def test_validate_module_metadata_still_checks_live(
        self, tmp_path: Path
    ) -> None:
        modules = _module(tmp_path, status="live")

        result = validate_module_metadata(modules / _VALID_ID)

        assert result.modules_checked == 1
        assert result.modules_skipped == 0
