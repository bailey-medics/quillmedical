"""Tests for the framework version check, against real git repositories."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest

from app.features.passport.tooling.check_framework_version import (
    check_framework_versions,
    main,
)

# These build real repositories and shell out to git, as the teaching
# version lock's do. The dev image installs git, so a skip here means an
# environment problem rather than a gap in the suite.
pytestmark = pytest.mark.skipif(
    shutil.which("git") is None,
    reason="git is not installed; the framework version check needs it",
)

_SHEET = """\
# A comment.
framework:
  id: sheet
  name: "A sign-off sheet"
  publisher: "A trust"
  version: {version}
  description: "Pilot edition."
  specialties: [oncology]

competencies:
  - id: sheet_refer
    display_name: "Refer a patient"
    assessable: true
    scopes:
      - id: lung
        name: "Lung"
      - id: other
        name: "Other"
"""


def _git(repo: Path, *args: str) -> str:
    """Run a git command in *repo*."""
    result = subprocess.run(
        ["git", *args],
        cwd=repo,
        capture_output=True,
        text=True,
        check=True,
    )

    return result.stdout.strip()


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A repository whose main holds one framework at version 1."""
    root = tmp_path / "repo"
    definitions = root / "definitions"
    definitions.mkdir(parents=True)

    _git(root, "init", "--initial-branch=main")
    _git(root, "config", "user.email", "test@example.com")
    _git(root, "config", "user.name", "Test")

    (definitions / "sheet.yaml").write_text(_SHEET.format(version=1))
    (definitions / "permissions.yaml").write_text(
        'competencies:\n  - id: manage\n    display_name: "Manage"\n'
    )

    _git(root, "add", ".")
    _git(root, "commit", "-m", "Initial")
    _git(root, "checkout", "-b", "feature/change")

    return root


def _write(repo: Path, text: str, name: str = "sheet.yaml") -> None:
    (repo / "definitions" / name).write_text(text)


def test_an_unchanged_framework_passes(repo: Path) -> None:
    result = check_framework_versions(repo / "definitions", ref="main")

    assert result.passed
    assert result.checked == 1


def test_an_added_competency_needs_a_new_version(repo: Path) -> None:
    _write(
        repo,
        _SHEET.format(version=1)
        + '  - id: sheet_plan\n    display_name: "Plan"\n'
        + "    assessable: true\n",
    )

    result = check_framework_versions(repo / "definitions", ref="main")

    assert not result.passed
    assert "Move it to 2" in result.violations[0]


def test_a_reordered_scope_needs_a_new_version_and_passes_with_one(
    repo: Path,
) -> None:
    reordered = _SHEET.replace(
        '      - id: lung\n        name: "Lung"\n'
        '      - id: other\n        name: "Other"\n',
        '      - id: other\n        name: "Other"\n'
        '      - id: lung\n        name: "Lung"\n',
    )

    _write(repo, reordered.format(version=1))
    assert not check_framework_versions(repo / "definitions", "main").passed

    _write(repo, reordered.format(version=2))
    assert check_framework_versions(repo / "definitions", "main").passed


def test_a_renamed_framework_needs_a_new_version(repo: Path) -> None:
    _write(
        repo,
        _SHEET.format(version=1).replace(
            "A sign-off sheet", "A sign-off sheet - A trust"
        ),
    )

    assert not check_framework_versions(repo / "definitions", "main").passed


def test_a_jump_of_two_is_refused_and_names_the_stack(repo: Path) -> None:
    _write(
        repo,
        _SHEET.format(version=3).replace("Refer a patient", "Refer"),
    )

    result = check_framework_versions(repo / "definitions", "main")

    assert not result.passed
    assert "jumped from 1 to 3" in result.violations[0]
    assert "stack" in result.violations[0]


def test_a_version_going_down_is_refused(repo: Path) -> None:
    _write(repo, _SHEET.format(version=2))
    _git(repo, "commit", "-am", "Version 2")
    _git(repo, "checkout", "main")
    _git(repo, "merge", "feature/change")
    _git(repo, "checkout", "-b", "feature/back")
    _write(repo, _SHEET.format(version=1))

    result = check_framework_versions(repo / "definitions", "main")

    assert "went down from 2 to 1" in result.violations[0]


def test_a_comment_alone_needs_no_new_version(repo: Path) -> None:
    _write(
        repo,
        _SHEET.format(version=1).replace("# A comment.", "# Another."),
    )

    assert check_framework_versions(repo / "definitions", "main").passed


def test_the_description_alone_needs_no_new_version(repo: Path) -> None:
    """It is internal, shown to nobody signing anything."""
    _write(
        repo,
        _SHEET.format(version=1).replace("Pilot edition.", "Second print."),
    )

    assert check_framework_versions(repo / "definitions", "main").passed


def test_the_version_moving_alone_is_refused(repo: Path) -> None:
    _write(repo, _SHEET.format(version=2))

    result = check_framework_versions(repo / "definitions", "main")

    assert "nothing else" in result.violations[0]


def test_a_new_framework_starts_at_version_one(repo: Path) -> None:
    second = _SHEET.replace("id: sheet\n", "id: other\n").replace(
        "sheet_refer", "other_refer"
    )

    _write(repo, second.format(version=1), "other.yaml")
    assert check_framework_versions(repo / "definitions", "main").passed

    _write(repo, second.format(version=2), "other.yaml")
    result = check_framework_versions(repo / "definitions", "main")
    assert "starts at version 1" in result.violations[0]


def test_a_file_declaring_no_framework_is_not_checked(repo: Path) -> None:
    _write(
        repo,
        'competencies:\n  - id: manage\n    display_name: "Run it"\n',
        "permissions.yaml",
    )

    result = check_framework_versions(repo / "definitions", "main")

    assert result.passed
    assert result.checked == 1


def test_a_reworded_competency_is_listed_when_it_fails(repo: Path) -> None:
    _write(
        repo,
        _SHEET.format(version=1).replace("Refer a patient", "Refer patients"),
    )

    result = check_framework_versions(repo / "definitions", "main")

    assert not result.passed
    assert [(r.where, r.old, r.new) for r in result.rewordings] == [
        ("sheet_refer", "Refer a patient", "Refer patients")
    ]


def test_a_reworded_scope_is_listed_when_it_passes(repo: Path) -> None:
    """The reviewer needs both wordings even once the version is right."""
    _write(
        repo,
        _SHEET.format(version=2).replace('name: "Lung"', 'name: "Lungs"'),
    )

    result = check_framework_versions(repo / "definitions", "main")

    assert result.passed
    assert [(r.where, r.old, r.new) for r in result.rewordings] == [
        ("sheet_refer, scope lung", "Lung", "Lungs")
    ]
    assert "Lungs" in result.summary()


def test_a_label_version_on_main_is_not_compared(repo: Path) -> None:
    """Main's files held an edition label until 2 November 2026."""
    _write(repo, _SHEET.replace("{version}", '"Pilot"'))
    _git(repo, "commit", "-am", "A label")
    _git(repo, "checkout", "main")
    _git(repo, "merge", "feature/change")
    _git(repo, "checkout", "-b", "feature/number")
    _write(repo, _SHEET.format(version=1))

    assert check_framework_versions(repo / "definitions", "main").passed


def test_main_writes_the_job_summary(
    repo: Path, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    summary = tmp_path / "summary.md"
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary))
    _write(repo, _SHEET.format(version=1).replace("Refer a patient", "R"))

    code = main([str(repo / "definitions"), "main"])

    assert code == 1
    assert "## Framework versions" in summary.read_text()
    assert "was: Refer a patient" in summary.read_text()
