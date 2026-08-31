"""Command-line entry point for content validation.

Covers the CLI added for the content repos' CI job: argument handling,
exit codes, and the ``--skip-version-lock`` escape hatch used when
validating content that has no git history (a tree pulled from GCS).
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.features.teaching.tooling.cli import main

FIXTURES = Path(__file__).parent / "fixtures" / "teaching_tooling"


def _write_module(
    modules_dir: Path,
    module_id: str,
    *,
    status: str = "live",
    version: int = 1,
) -> Path:
    """Build a minimal valid module under *modules_dir*."""
    module_dir = modules_dir / module_id
    assessment = module_dir / "assessment"
    (assessment / "question_001").mkdir(parents=True)

    (module_dir / "module.yaml").write_text(
        yaml.dump(
            {
                "moduleId": module_id,
                "title": "Test module",
                "order": 1,
                "status": status,
            }
        )
    )
    (assessment / "assessment.yaml").write_text(
        yaml.dump({"version": version, "title": "Test", "type": "variable"})
    )
    (assessment / "question_001" / "question.yaml").write_text(
        yaml.dump({"diagnosis": "adenoma"})
    )
    return module_dir


class TestCliExitCodes:
    def test_valid_content_returns_zero(self, tmp_path: Path) -> None:
        modules = tmp_path / "modules"
        modules.mkdir()
        _write_module(modules, "good-bank")

        assert main([str(modules), "--skip-version-lock"]) == 0

    def test_invalid_content_returns_one(self, tmp_path: Path) -> None:
        modules = tmp_path / "modules"
        modules.mkdir()
        module_dir = _write_module(modules, "bad-bank")
        # moduleId no longer matches the directory name.
        (module_dir / "module.yaml").write_text(
            yaml.dump(
                {
                    "moduleId": "something-else",
                    "title": "Test module",
                    "order": 1,
                    "status": "live",
                }
            )
        )

        assert main([str(modules), "--skip-version-lock"]) == 1

    def test_missing_modules_dir_returns_one(self, tmp_path: Path) -> None:
        missing = tmp_path / "nope"
        assert main([str(missing), "--skip-version-lock"]) == 1


class TestCliOutput:
    def test_reports_the_failing_module(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        modules = tmp_path / "modules"
        modules.mkdir()
        module_dir = _write_module(modules, "bad-bank")
        (module_dir / "module.yaml").unlink()

        exit_code = main([str(modules), "--skip-version-lock"])
        out = capsys.readouterr().out

        assert exit_code == 1
        assert "module.yaml is missing" in out
        assert "bad-bank" in out

    def test_reports_success(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        modules = tmp_path / "modules"
        modules.mkdir()
        _write_module(modules, "good-bank")

        main([str(modules), "--skip-version-lock"])
        assert "All valid." in capsys.readouterr().out


class TestVersionLockToggle:
    def test_skip_flag_omits_the_lock_section(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        modules = tmp_path / "modules"
        modules.mkdir()
        _write_module(modules, "good-bank")

        main([str(modules), "--skip-version-lock"])
        assert "Version lock" not in capsys.readouterr().out

    def test_lock_runs_by_default(
        self, tmp_path: Path, capsys: pytest.CaptureFixture[str]
    ) -> None:
        """Without the flag the version lock check is attempted.

        ``tmp_path`` is outside any git repository, which is the same
        situation as validating a tree downloaded from GCS.  That must be
        reported as a violation pointing at ``--skip-version-lock``, not
        raised as a traceback — and the two ways it can fail (no repository
        at all, or a directory outside the one git reports) must behave the
        same, since which one occurs depends on where pytest was invoked.
        """
        modules = tmp_path / "modules"
        modules.mkdir()
        _write_module(modules, "good-bank")

        exit_code = main([str(modules)])
        out = capsys.readouterr().out

        assert exit_code == 1
        assert "Version lock" in out
        assert "not inside a git repository" in out
        assert "--skip-version-lock" in out


class TestAgainstFixtures:
    def test_valid_fixture_module_passes(self, tmp_path: Path) -> None:
        """The golden valid fixture must satisfy the CLI."""
        modules = tmp_path / "modules"
        modules.mkdir()
        src = FIXTURES / ".valid-module"
        dest = modules / "valid-module"

        # Fixtures are dot-prefixed so directory scans skip them; copy to a
        # name a scan will pick up, fixing moduleId to match.
        import shutil

        shutil.copytree(src, dest)
        data = yaml.safe_load((dest / "module.yaml").read_text())
        data["moduleId"] = "valid-module"
        (dest / "module.yaml").write_text(yaml.dump(data))

        assert main([str(modules), "--skip-version-lock"]) == 0
