"""Tests for the teaching feature — validation module."""

from __future__ import annotations

from pathlib import Path

import yaml

from app.features.teaching.validate import (
    validate_question_bank,
)


class TestValidateQuestionBank:
    """Structural and content validation of question banks."""

    def _write_config(self, bank_dir: Path, config: dict) -> None:
        (bank_dir / "config.yaml").write_text(
            yaml.dump(config, default_flow_style=False)
        )

    def _make_uniform_bank(self, tmp_path: Path) -> Path:
        """Create a minimal valid uniform question bank."""
        bank = tmp_path / "test-bank"
        bank.mkdir()
        config = {
            "id": "test-bank",
            "version": 1,
            "title": "Test Bank",
            "description": "A test question bank",
            "type": "uniform",
            "images_per_item": 2,
            "image_labels": ["Image 1", "Image 2"],
            "options": [
                {"id": "opt_a", "label": "A", "tags": ["tag_a"]},
                {"id": "opt_b", "label": "B", "tags": ["tag_b"]},
            ],
            "correct_answer_field": "diagnosis",
            "correct_answer_values": ["adenoma", "serrated"],
            "assessment": {
                "items_per_attempt": 2,
                "time_limit_minutes": 10,
                "min_pool_size": 2,
            },
        }
        self._write_config(bank, config)

        for i in range(1, 3):
            q_dir = bank / f"question_{i:03d}"
            q_dir.mkdir()
            (q_dir / "question.yaml").write_text(
                yaml.dump({"diagnosis": "adenoma"})
            )
            (q_dir / "image_1.png").write_bytes(b"fake")
            (q_dir / "image_2.png").write_bytes(b"fake")

        return bank

    def _make_variable_bank(self, tmp_path: Path) -> Path:
        """Create a minimal valid variable question bank."""
        bank = tmp_path / "var-bank"
        bank.mkdir()
        config = {
            "id": "var-bank",
            "version": 1,
            "title": "Variable Bank",
            "description": "A variable question bank",
            "type": "variable",
            "assessment": {
                "items_per_attempt": 1,
                "time_limit_minutes": 5,
                "min_pool_size": 1,
            },
        }
        self._write_config(bank, config)

        q_dir = bank / "question_001"
        q_dir.mkdir()
        question = {
            "text": "What is this?",
            "images": [],
            "options": [
                {"id": "a", "label": "A", "tags": ["correct"]},
                {"id": "b", "label": "B", "tags": ["incorrect"]},
            ],
            "correct_option_id": "a",
        }
        (q_dir / "question.yaml").write_text(
            yaml.dump(question, default_flow_style=False)
        )
        return bank

    # --- Structural checks ---

    def test_valid_uniform_bank(self, tmp_path: Path) -> None:
        bank = self._make_uniform_bank(tmp_path)
        result = validate_question_bank(bank)
        assert result.is_valid
        assert result.item_count == 2
        assert len(result.errors) == 0

    def test_valid_variable_bank(self, tmp_path: Path) -> None:
        bank = self._make_variable_bank(tmp_path)
        result = validate_question_bank(bank)
        assert result.is_valid
        assert result.item_count == 1

    def test_missing_config(self, tmp_path: Path) -> None:
        bank = tmp_path / "no-config"
        bank.mkdir()
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any("config.yaml not found" in e.message for e in result.errors)

    def test_missing_required_config_fields(self, tmp_path: Path) -> None:
        bank = tmp_path / "bad-config"
        bank.mkdir()
        self._write_config(bank, {"id": "bad"})
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any("version" in e.message for e in result.errors)
        assert any("title" in e.message for e in result.errors)

    def test_invalid_type(self, tmp_path: Path) -> None:
        bank = tmp_path / "bad-type"
        bank.mkdir()
        self._write_config(
            bank,
            {
                "id": "bad-type",
                "version": 1,
                "title": "Bad",
                "description": "Bad type",
                "type": "invalid_type",
                "assessment": {
                    "items_per_attempt": 1,
                    "time_limit_minutes": 5,
                    "min_pool_size": 0,
                },
            },
        )
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any("invalid type" in e.message for e in result.errors)

    def test_missing_question_yaml(self, tmp_path: Path) -> None:
        bank = self._make_uniform_bank(tmp_path)
        # Remove question.yaml from one item
        (bank / "question_001" / "question.yaml").unlink()
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any("missing question.yaml" in e.message for e in result.errors)

    # --- Uniform content checks ---

    def test_uniform_wrong_image_count(self, tmp_path: Path) -> None:
        bank = self._make_uniform_bank(tmp_path)
        # Delete one image
        (bank / "question_001" / "image_2.png").unlink()
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any("expected 2 images" in e.message for e in result.errors)

    def test_uniform_wrong_metadata_value(self, tmp_path: Path) -> None:
        bank = self._make_uniform_bank(tmp_path)
        (bank / "question_001" / "question.yaml").write_text(
            yaml.dump({"diagnosis": "invalid_value"})
        )
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any("not in" in e.message for e in result.errors)

    def test_uniform_missing_metadata_field(self, tmp_path: Path) -> None:
        bank = self._make_uniform_bank(tmp_path)
        (bank / "question_001" / "question.yaml").write_text(
            yaml.dump({"something_else": "value"})
        )
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any(
            "missing required field 'diagnosis'" in e.message
            for e in result.errors
        )

    # --- Variable content checks ---

    def test_variable_missing_options(self, tmp_path: Path) -> None:
        bank = self._make_variable_bank(tmp_path)
        (bank / "question_001" / "question.yaml").write_text(
            yaml.dump({"text": "No options", "images": []})
        )
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any("options" in e.message for e in result.errors)

    def test_variable_invalid_correct_option_id(self, tmp_path: Path) -> None:
        bank = self._make_variable_bank(tmp_path)
        (bank / "question_001" / "question.yaml").write_text(
            yaml.dump(
                {
                    "text": "Test",
                    "images": [],
                    "options": [
                        {"id": "a", "label": "A", "tags": ["t"]},
                    ],
                    "correct_option_id": "nonexistent",
                }
            )
        )
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any("correct_option_id" in e.message for e in result.errors)

    def test_variable_missing_image_file(self, tmp_path: Path) -> None:
        bank = self._make_variable_bank(tmp_path)
        (bank / "question_001" / "question.yaml").write_text(
            yaml.dump(
                {
                    "text": "Test",
                    "images": [{"key": "missing.png", "label": "Gone"}],
                    "options": [
                        {"id": "a", "label": "A", "tags": ["t"]},
                    ],
                    "correct_option_id": "a",
                }
            )
        )
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any("not found" in e.message for e in result.errors)

    # --- Cross-item checks ---

    def test_pool_size_too_small(self, tmp_path: Path) -> None:
        bank = self._make_uniform_bank(tmp_path)
        # Update config to require more items
        config = yaml.safe_load((bank / "config.yaml").read_text())
        config["assessment"]["min_pool_size"] = 100
        self._write_config(bank, config)
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any("min_pool_size" in e.message for e in result.errors)

    def test_answer_distribution_warning(self, tmp_path: Path) -> None:
        bank = tmp_path / "skewed"
        bank.mkdir()
        config = {
            "id": "skewed",
            "version": 1,
            "title": "Skewed",
            "description": "Skewed distribution",
            "type": "uniform",
            "images_per_item": 1,
            "options": [{"id": "a", "label": "A", "tags": []}],
            "correct_answer_field": "diagnosis",
            "correct_answer_values": ["adenoma", "serrated"],
            "assessment": {
                "items_per_attempt": 1,
                "time_limit_minutes": 5,
                "min_pool_size": 0,
            },
        }
        self._write_config(bank, config)
        # All 5 items have the same answer
        for i in range(1, 6):
            q_dir = bank / f"question_{i:03d}"
            q_dir.mkdir()
            (q_dir / "question.yaml").write_text(
                yaml.dump({"diagnosis": "adenoma"})
            )
            (q_dir / "image_1.png").write_bytes(b"fake")

        result = validate_question_bank(bank)
        assert result.is_valid  # Warnings don't block
        assert len(result.warnings) > 0
        assert any("distribution skew" in w.message for w in result.warnings)

    def test_stray_file_warning(self, tmp_path: Path) -> None:
        bank = self._make_uniform_bank(tmp_path)
        (bank / "README.md").write_text("stray file")
        result = validate_question_bank(bank)
        assert result.is_valid  # Warnings don't block
        assert any("unexpected file" in w.message for w in result.warnings)

    def test_finalise_summary(self, tmp_path: Path) -> None:
        bank = self._make_uniform_bank(tmp_path)
        result = validate_question_bank(bank)
        assert "test-bank" in result.summary
        assert "VALID" in result.summary
