"""Tests for app/api_compatibility.py.

Covers:
- required_client_generation formula (max generation among forces_reload:
  true files, or 1 when none exist)
- Malformed/missing-directory handling
- The Compat-Generation response header
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.api_compatibility import compute_required_client_generation


def _write_decision(
    directory: Path,
    filename: str,
    generation: int,
    forces_reload: bool,
    change: str = "none",
    reason: str = "test reason",
) -> None:
    (directory / filename).write_text(
        f"generation: {generation}\n"
        f"forces_reload: {'true' if forces_reload else 'false'}\n"
        f'change: "{change}"\n'
        f'reason: "{reason}"\n'
    )


class TestComputeRequiredClientGeneration:
    def test_missing_directory_returns_one(self, tmp_path: Path) -> None:
        missing = tmp_path / "does-not-exist"
        assert compute_required_client_generation(missing) == 1

    def test_no_true_files_returns_one(self, tmp_path: Path) -> None:
        _write_decision(
            tmp_path, "20260818000000-init.yaml", 1, forces_reload=False
        )
        assert compute_required_client_generation(tmp_path) == 1

    def test_single_true_file(self, tmp_path: Path) -> None:
        _write_decision(
            tmp_path, "20260818000000-init.yaml", 1, forces_reload=False
        )
        _write_decision(
            tmp_path,
            "20260819000000-breaking.yaml",
            2,
            forces_reload=True,
        )
        assert compute_required_client_generation(tmp_path) == 2

    def test_takes_max_among_true_files(self, tmp_path: Path) -> None:
        _write_decision(
            tmp_path, "20260818000000-a.yaml", 2, forces_reload=True
        )
        _write_decision(
            tmp_path, "20260819000000-b.yaml", 5, forces_reload=True
        )
        _write_decision(
            tmp_path, "20260820000000-c.yaml", 3, forces_reload=True
        )
        assert compute_required_client_generation(tmp_path) == 5

    def test_ignores_false_files_when_computing_max(
        self, tmp_path: Path
    ) -> None:
        _write_decision(
            tmp_path, "20260818000000-a.yaml", 2, forces_reload=True
        )
        _write_decision(
            tmp_path, "20260819000000-b.yaml", 99, forces_reload=False
        )
        assert compute_required_client_generation(tmp_path) == 2

    def test_malformed_yaml_is_skipped(self, tmp_path: Path) -> None:
        (tmp_path / "20260818000000-bad.yaml").write_text(
            "generation: [1, 2\nforces_reload: true\n"
        )
        _write_decision(
            tmp_path, "20260819000000-good.yaml", 3, forces_reload=True
        )
        assert compute_required_client_generation(tmp_path) == 3

    def test_non_mapping_yaml_is_skipped(self, tmp_path: Path) -> None:
        (tmp_path / "20260818000000-list.yaml").write_text("- one\n- two\n")
        assert compute_required_client_generation(tmp_path) == 1

    @pytest.mark.parametrize("bad_generation", ["not-a-number", None])
    def test_non_integer_generation_is_skipped(
        self, tmp_path: Path, bad_generation: object
    ) -> None:
        (tmp_path / "20260818000000-bad-gen.yaml").write_text(
            f"generation: {bad_generation}\n"
            "forces_reload: true\n"
            'change: "none"\n'
            'reason: "test"\n'
        )
        assert compute_required_client_generation(tmp_path) == 1


class TestCompatGenerationHeader:
    def test_header_present_on_response(self, test_client) -> None:
        response = test_client.get("/api/health")
        assert "Compat-Generation" in response.headers
        assert response.headers["Compat-Generation"].isdigit()
