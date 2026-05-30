"""Tests for the teaching-tooling validator integration."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from app.config import settings
from app.features.teaching.tooling_validate import run_tooling_validation


def _find_scripts_path() -> str | None:
    """Locate teaching-tooling scripts in Docker or CI environments."""
    candidates = [
        settings.TEACHING_TOOLING_SCRIPTS_PATH,  # Docker (env var)
        # CI: repo root relative to this test file
        str(
            Path(__file__).resolve().parent.parent.parent
            / "teaching-tooling"
            / "scripts"
        ),
    ]
    return next(
        (p for p in candidates if p and (Path(p) / "validate.py").is_file()),
        None,
    )


@pytest.fixture(autouse=True)
def _reset_tooling_cache() -> None:  # type: ignore[misc]
    """Reset the module-level cache and ensure scripts path is configured."""
    import app.features.teaching.tooling_validate as tv

    tv._import_attempted = False
    tv._tooling_module = None

    scripts_path = _find_scripts_path()
    if scripts_path is None:
        pytest.skip("teaching-tooling scripts not available")

    with patch(
        "app.features.teaching.tooling_validate.settings"
    ) as mock_settings:
        mock_settings.TEACHING_TOOLING_SCRIPTS_PATH = scripts_path
        yield


class TestRunToolingValidation:
    """Tests for run_tooling_validation."""

    def test_valid_module_passes(self, tmp_path: Path) -> None:
        """A well-formed module directory should return no errors."""
        module_dir = tmp_path / "good-module"
        module_dir.mkdir()
        (module_dir / "module.yaml").write_text(
            "moduleId: good-module\n"
            "title: Good Module\n"
            "order: 1\n"
            "status: draft\n"
        )
        assessment_dir = module_dir / "assessment"
        assessment_dir.mkdir()
        (assessment_dir / "assessment.yaml").write_text(
            "version: 1\n"
            "title: Test\n"
            "type: uniform\n"
            "images_per_item: 1\n"
            "options:\n"
            "  - id: a\n"
            "    label: A\n"
            "images:\n"
            "  - key: image_1.png\n"
            "    label: Image\n"
            "assessment:\n"
            "  items_per_attempt: 1\n"
            "  time_limit_minutes: 5\n"
            "  min_pool_size: 1\n"
        )
        q_dir = assessment_dir / "question_001"
        q_dir.mkdir()
        (q_dir / "question.yaml").write_text("diagnosis: adenoma\n")
        (q_dir / "image_1.png").write_bytes(b"fake")

        errors = run_tooling_validation(module_dir)
        assert errors == []

    def test_missing_module_yaml_fails(self, tmp_path: Path) -> None:
        """A module without module.yaml should return errors."""
        module_dir = tmp_path / "bad-module"
        module_dir.mkdir()
        (module_dir / "assessment").mkdir()
        (module_dir / "assessment" / "assessment.yaml").write_text(
            "version: 1\ntitle: X\ntype: uniform\n"
        )

        errors = run_tooling_validation(module_dir)
        assert len(errors) > 0
        assert any("module.yaml" in e["message"] for e in errors)

    def test_bad_module_id_fails(self, tmp_path: Path) -> None:
        """A moduleId that doesn't match the directory name fails."""
        module_dir = tmp_path / "my-module"
        module_dir.mkdir()
        (module_dir / "module.yaml").write_text(
            "moduleId: WRONG_NAME\n"
            "title: Bad\n"
            "order: 1\n"
            "status: draft\n"
        )
        (module_dir / "assessment").mkdir()
        (module_dir / "assessment" / "assessment.yaml").write_text(
            "version: 1\ntitle: X\ntype: uniform\n"
        )

        errors = run_tooling_validation(module_dir)
        assert len(errors) > 0

    def test_tooling_unavailable_blocks_sync(self, tmp_path: Path) -> None:
        """When tooling scripts path is not configured, sync is blocked."""
        with patch("app.features.teaching.tooling_validate.settings") as mock:
            mock.TEACHING_TOOLING_SCRIPTS_PATH = None
            errors = run_tooling_validation(tmp_path / "any")
            assert len(errors) == 1
            assert "blocked for safety" in errors[0]["message"]

    def test_nonexistent_directory_returns_error(self) -> None:
        """A module_dir that doesn't exist should return an error."""
        errors = run_tooling_validation(Path("/nonexistent/path"))
        assert len(errors) == 1
        assert "does not exist" in errors[0]["message"]

    def test_descriptive_image_names_pass(self, tmp_path: Path) -> None:
        """Images with descriptive names (nbi.png, wli.png) should pass."""
        module_dir = tmp_path / "polyp-test"
        module_dir.mkdir()
        (module_dir / "module.yaml").write_text(
            "moduleId: polyp-test\n"
            "title: Polyp Test\n"
            "order: 1\n"
            "status: draft\n"
        )
        assessment_dir = module_dir / "assessment"
        assessment_dir.mkdir()
        (assessment_dir / "assessment.yaml").write_text(
            "version: 1\n"
            "title: Polyp\n"
            "type: uniform\n"
            "images_per_item: 2\n"
            "options:\n"
            "  - id: a\n"
            "    label: A\n"
            "images:\n"
            "  - key: nbi.png\n"
            "    label: NBI\n"
            "  - key: wli.png\n"
            "    label: WLI\n"
            "assessment:\n"
            "  items_per_attempt: 1\n"
            "  time_limit_minutes: 5\n"
            "  min_pool_size: 1\n"
        )
        q_dir = assessment_dir / "question_001"
        q_dir.mkdir()
        (q_dir / "question.yaml").write_text("diagnosis: adenoma\n")
        (q_dir / "nbi.png").write_bytes(b"fake")
        (q_dir / "wli.png").write_bytes(b"fake")

        errors = run_tooling_validation(module_dir)
        assert errors == []
