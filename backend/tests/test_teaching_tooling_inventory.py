"""Validating content whose images are not on disk.

Second unit of collapsing the two validators. When a bank is sourced from
GCS, ``download_bank_from_gcs`` fetches **only YAML** — images stay in the
bucket, because downloading them just to check a filename would mean paying
for the bytes twice. A plain directory listing therefore reports every
declared image as missing.

The inventory closes that: a mapping of item directory name to the
filenames present, with ``"."`` for the assessment root. These tests build
banks with the images genuinely absent from disk, which is the situation
sync is actually in.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.features.teaching.tooling.validate import (
    CERTIFICATE_BACKGROUND,
    ValidationResult,
    _validate_assessment_dir,
    validate_module_dir,
)


def _bank(
    tmp_path: Path,
    *,
    images_on_disk: bool,
    declared: tuple[str, ...] = ("wli.png", "nbi.png"),
) -> Path:
    """A uniform bank declaring *declared*, optionally without the files."""
    assessment = tmp_path / "my-bank" / "assessment"
    question = assessment / "question_001"
    question.mkdir(parents=True)

    (tmp_path / "my-bank" / "module.yaml").write_text(
        yaml.dump(
            {
                "moduleId": "my-bank",
                "title": "My bank",
                "order": 1,
                "status": "live",
            }
        )
    )
    (assessment / "assessment.yaml").write_text(
        yaml.dump(
            {
                "version": 1,
                "title": "My bank",
                "type": "uniform",
                "images_per_item": len(declared),
                "images": [{"key": k} for k in declared],
            }
        )
    )
    (question / "question.yaml").write_text(yaml.dump({"diagnosis": "x"}))

    if images_on_disk:
        for name in declared:
            (question / name).write_bytes(b"")
    return assessment


class TestWithoutAnInventory:
    """The existing behaviour: read the directory."""

    def test_images_present_on_disk_pass(self, tmp_path: Path) -> None:
        assessment = _bank(tmp_path, images_on_disk=True)
        result = ValidationResult()
        _validate_assessment_dir(assessment, result)
        assert result.is_valid, result.summary()

    def test_images_absent_from_disk_fail(self, tmp_path: Path) -> None:
        """This is exactly what sync would see in GCS mode without one."""
        assessment = _bank(tmp_path, images_on_disk=False)
        result = ValidationResult()
        _validate_assessment_dir(assessment, result)
        assert not result.is_valid
        assert any("wli.png" in e.message for e in result.errors)


class TestWithAnInventory:
    """The GCS case: images are declared in the inventory, not on disk."""

    def test_inventory_satisfies_declared_images(self, tmp_path: Path) -> None:
        assessment = _bank(tmp_path, images_on_disk=False)
        inventory = {"question_001": {"wli.png", "nbi.png"}}

        result = ValidationResult()
        _validate_assessment_dir(assessment, result, inventory)

        assert result.is_valid, result.summary()

    def test_missing_from_inventory_is_reported(self, tmp_path: Path) -> None:
        assessment = _bank(tmp_path, images_on_disk=False)
        inventory = {"question_001": {"wli.png"}}  # nbi.png absent

        result = ValidationResult()
        _validate_assessment_dir(assessment, result, inventory)

        assert not result.is_valid
        assert any("nbi.png" in e.message for e in result.errors)

    def test_undeclared_image_in_inventory_is_reported(
        self, tmp_path: Path
    ) -> None:
        assessment = _bank(tmp_path, images_on_disk=False)
        inventory = {"question_001": {"wli.png", "nbi.png", "stray.png"}}

        result = ValidationResult()
        _validate_assessment_dir(assessment, result, inventory)

        assert not result.is_valid
        assert any(
            "stray.png" in e.message and "undeclared" in e.message
            for e in result.errors
        )

    def test_the_inventory_wins_over_the_disk(self, tmp_path: Path) -> None:
        """Files on disk must not mask an inventory that lacks them.

        Otherwise a stale temp directory could make a bank look valid when
        the bucket does not actually hold the images.
        """
        assessment = _bank(tmp_path, images_on_disk=True)
        inventory: dict[str, set[str]] = {"question_001": set()}

        result = ValidationResult()
        _validate_assessment_dir(assessment, result, inventory)

        assert not result.is_valid


class TestVariableBanksUseTheInventoryToo:
    def _variable_bank(self, tmp_path: Path) -> Path:
        assessment = tmp_path / "my-bank" / "assessment"
        question = assessment / "question_001"
        question.mkdir(parents=True)
        (assessment / "assessment.yaml").write_text(
            yaml.dump({"version": 1, "title": "B", "type": "variable"})
        )
        (question / "question.yaml").write_text(
            yaml.dump(
                {
                    "question_type": "single",
                    "options": [
                        {"id": "a", "label": "A", "tags": ["correct"]},
                        {"id": "b", "label": "B", "tags": ["incorrect"]},
                    ],
                    "correct_option_id": "a",
                    "images": [{"key": "chest.png"}],
                }
            )
        )
        return assessment

    def test_inventory_satisfies_a_per_question_image(
        self, tmp_path: Path
    ) -> None:
        assessment = self._variable_bank(tmp_path)
        result = ValidationResult()
        _validate_assessment_dir(
            assessment, result, {"question_001": {"chest.png"}}
        )
        assert result.is_valid, result.summary()

    def test_missing_per_question_image_is_reported(
        self, tmp_path: Path
    ) -> None:
        assessment = self._variable_bank(tmp_path)
        result = ValidationResult()
        _validate_assessment_dir(assessment, result, {"question_001": set()})
        assert not result.is_valid
        assert any("chest.png" in e.message for e in result.errors)


class TestCertificateBackground:
    """The root of the assessment is keyed ``"."`` in the inventory."""

    def _bank_with_certificate(self, tmp_path: Path) -> Path:
        assessment = _bank(tmp_path, images_on_disk=False, declared=())
        config = yaml.safe_load((assessment / "assessment.yaml").read_text())
        config["results"] = {"certificate_download": True}
        config["certificate"] = {
            "title": {"size": 14},
            "subtitle": {"size": 14},
            "candidate_name": {"size": 14},
            "pass_summary": {"size": 14},
            "date": {"size": 14},
        }
        (assessment / "assessment.yaml").write_text(yaml.dump(config))
        return assessment

    def test_background_found_via_the_inventory(self, tmp_path: Path) -> None:
        assessment = self._bank_with_certificate(tmp_path)
        result = ValidationResult()
        _validate_assessment_dir(
            assessment, result, {".": {CERTIFICATE_BACKGROUND}}
        )
        assert result.is_valid, result.summary()

    def test_background_missing_from_the_inventory(
        self, tmp_path: Path
    ) -> None:
        assessment = self._bank_with_certificate(tmp_path)
        result = ValidationResult()
        _validate_assessment_dir(assessment, result, {".": set()})
        assert not result.is_valid
        assert any(CERTIFICATE_BACKGROUND in e.message for e in result.errors)


class TestModuleEntryPoint:
    """``validate_module_dir`` is the single-bank entry point sync needs."""

    def test_passes_the_inventory_down(self, tmp_path: Path) -> None:
        _bank(tmp_path, images_on_disk=False)
        module_dir = tmp_path / "my-bank"

        without = validate_module_dir(module_dir)
        with_inventory = validate_module_dir(
            module_dir, {"question_001": {"wli.png", "nbi.png"}}
        )

        assert not without.is_valid
        assert with_inventory.is_valid, with_inventory.summary()

    @pytest.mark.parametrize("inventory", [None, {}])
    def test_absent_or_empty_inventory_still_validates_structure(
        self, tmp_path: Path, inventory: dict[str, set[str]] | None
    ) -> None:
        """An empty inventory is a real answer, not "fall back to disk"."""
        _bank(tmp_path, images_on_disk=True)
        result = validate_module_dir(tmp_path / "my-bank", inventory)
        assert result.is_valid == (inventory is None)
