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
            "question_type": "single",
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

    # --- Image inventory (GCS-sourced) checks ---

    def test_uniform_valid_with_image_inventory(self, tmp_path: Path) -> None:
        """Uniform bank passes when GCS image inventory is provided."""
        bank = self._make_uniform_bank(tmp_path)
        # Remove local images (simulates GCS download: YAML only)
        for q_dir in bank.iterdir():
            if q_dir.is_dir():
                for img in q_dir.glob("*.png"):
                    img.unlink()

        inventory = {
            "question_001": {"image_1.png", "image_2.png"},
            "question_002": {"image_1.png", "image_2.png"},
        }
        result = validate_question_bank(bank, image_inventory=inventory)
        assert result.is_valid
        assert result.item_count == 2

    def test_uniform_fails_missing_gcs_images(self, tmp_path: Path) -> None:
        """Uniform bank fails when GCS inventory has wrong count."""
        bank = self._make_uniform_bank(tmp_path)
        for q_dir in bank.iterdir():
            if q_dir.is_dir():
                for img in q_dir.glob("*.png"):
                    img.unlink()

        # Only 1 image per item, but config expects 2
        inventory = {
            "question_001": {"image_1.png"},
            "question_002": {"image_1.png"},
        }
        result = validate_question_bank(bank, image_inventory=inventory)
        assert not result.is_valid
        assert any("expected 2 images" in e.message for e in result.errors)

    def test_variable_valid_with_image_inventory(self, tmp_path: Path) -> None:
        """Variable bank validates images from GCS inventory."""
        bank = self._make_variable_bank(tmp_path)
        # Add image reference to the question
        q_yaml = bank / "question_001" / "question.yaml"
        question = yaml.safe_load(q_yaml.read_text())
        question["images"] = [{"key": "image_1.png", "label": "Img"}]
        q_yaml.write_text(yaml.dump(question, default_flow_style=False))

        inventory = {"question_001": {"image_1.png"}}
        result = validate_question_bank(bank, image_inventory=inventory)
        assert result.is_valid

    def test_variable_fails_missing_gcs_image(self, tmp_path: Path) -> None:
        """Variable bank fails when declared image not in GCS."""
        bank = self._make_variable_bank(tmp_path)
        q_yaml = bank / "question_001" / "question.yaml"
        question = yaml.safe_load(q_yaml.read_text())
        question["images"] = [{"key": "image_1.png", "label": "Img"}]
        q_yaml.write_text(yaml.dump(question, default_flow_style=False))

        inventory: dict[str, set[str]] = {
            "question_001": set(),
        }  # No images in GCS
        result = validate_question_bank(bank, image_inventory=inventory)
        assert not result.is_valid
        assert any("not found in GCS" in e.message for e in result.errors)

    def test_variable_undeclared_gcs_image(self, tmp_path: Path) -> None:
        """Variable bank flags undeclared images found in GCS."""
        bank = self._make_variable_bank(tmp_path)
        # question has images: [] but GCS has an image file
        inventory = {"question_001": {"image_1.png"}}
        result = validate_question_bank(bank, image_inventory=inventory)
        assert not result.is_valid
        assert any("undeclared image file" in e.message for e in result.errors)

    # --- Certificate section validation ---

    def test_certificate_enabled_missing_png(self, tmp_path: Path) -> None:
        """Fails when certificate_download is true but PNG is missing."""
        bank = self._make_uniform_bank(tmp_path)
        config = yaml.safe_load((bank / "config.yaml").read_text())
        config["results"] = {"certificate_download": True}
        config["certificate"] = {
            "orientation": "portrait",
            "title": {
                "font": "Helvetica",
                "size": 22,
                "bold": True,
                "colour": "#404040",
                "y": 0.62,
            },
            "subtitle": {
                "font": "Helvetica",
                "size": 13,
                "bold": False,
                "colour": "#666666",
                "y": 0.56,
                "text": "This certifies that",
            },
            "candidate_name": {
                "font": "Helvetica",
                "size": 26,
                "bold": True,
                "colour": "#262626",
                "y": 0.50,
            },
            "pass_summary": {
                "font": "Helvetica",
                "size": 15,
                "bold": False,
                "colour": "#338033",
                "y": 0.44,
            },
            "date": {
                "font": "Helvetica",
                "size": 12,
                "bold": False,
                "colour": "#666666",
                "y": 0.39,
            },
            "margin": 30,
        }
        self._write_config(bank, config)
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any(
            "certificate-blank.png is missing" in e.message
            for e in result.errors
        )

    def test_certificate_enabled_missing_section(self, tmp_path: Path) -> None:
        """Fails when certificate_download is true but section is missing."""
        bank = self._make_uniform_bank(tmp_path)
        config = yaml.safe_load((bank / "config.yaml").read_text())
        config["results"] = {"certificate_download": True}
        self._write_config(bank, config)
        (bank / "certificate-blank.png").write_bytes(b"fake")
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any(
            "'certificate' section is missing" in e.message
            for e in result.errors
        )

    def test_certificate_invalid_orientation(self, tmp_path: Path) -> None:
        bank = self._make_uniform_bank(tmp_path)
        config = yaml.safe_load((bank / "config.yaml").read_text())
        config["results"] = {"certificate_download": True}
        config["certificate"] = {
            "orientation": "diagonal",
            "title": {
                "font": "Helvetica",
                "size": 22,
                "bold": True,
                "colour": "#404040",
                "y": 0.62,
            },
            "subtitle": {
                "font": "Helvetica",
                "size": 13,
                "bold": False,
                "colour": "#666666",
                "y": 0.56,
            },
            "candidate_name": {
                "font": "Helvetica",
                "size": 26,
                "bold": True,
                "colour": "#262626",
                "y": 0.50,
            },
            "pass_summary": {
                "font": "Helvetica",
                "size": 15,
                "bold": False,
                "colour": "#338033",
                "y": 0.44,
            },
            "date": {
                "font": "Helvetica",
                "size": 12,
                "bold": False,
                "colour": "#666666",
                "y": 0.39,
            },
        }
        self._write_config(bank, config)
        (bank / "certificate-blank.png").write_bytes(b"fake")
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any("orientation" in e.message for e in result.errors)

    def test_certificate_invalid_colour(self, tmp_path: Path) -> None:
        bank = self._make_uniform_bank(tmp_path)
        config = yaml.safe_load((bank / "config.yaml").read_text())
        config["results"] = {"certificate_download": True}
        config["certificate"] = {
            "orientation": "portrait",
            "title": {
                "font": "Helvetica",
                "size": 22,
                "bold": True,
                "colour": "red",
                "y": 0.62,
            },
            "subtitle": {
                "font": "Helvetica",
                "size": 13,
                "bold": False,
                "colour": "#666666",
                "y": 0.56,
            },
            "candidate_name": {
                "font": "Helvetica",
                "size": 26,
                "bold": True,
                "colour": "#262626",
                "y": 0.50,
            },
            "pass_summary": {
                "font": "Helvetica",
                "size": 15,
                "bold": False,
                "colour": "#338033",
                "y": 0.44,
            },
            "date": {
                "font": "Helvetica",
                "size": 12,
                "bold": False,
                "colour": "#666666",
                "y": 0.39,
            },
        }
        self._write_config(bank, config)
        (bank / "certificate-blank.png").write_bytes(b"fake")
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any("hex colour" in e.message for e in result.errors)

    def test_certificate_disabled_skips_validation(
        self, tmp_path: Path
    ) -> None:
        """No errors when certificate_download is false/absent."""
        bank = self._make_uniform_bank(tmp_path)
        result = validate_question_bank(bank)
        assert result.is_valid

    # --- Email section validation ---

    def test_email_coordinator_missing_section(self, tmp_path: Path) -> None:
        bank = self._make_uniform_bank(tmp_path)
        config = yaml.safe_load((bank / "config.yaml").read_text())
        config["results"] = {"email_coordinator_on_pass": True}
        self._write_config(bank, config)
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any(
            "'coordinator_email' section is missing" in e.message
            for e in result.errors
        )

    def test_email_student_missing_section(self, tmp_path: Path) -> None:
        bank = self._make_uniform_bank(tmp_path)
        config = yaml.safe_load((bank / "config.yaml").read_text())
        config["results"] = {"email_student_on_pass": True}
        self._write_config(bank, config)
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any(
            "'student_email' section is missing" in e.message
            for e in result.errors
        )

    def test_email_section_missing_subject(self, tmp_path: Path) -> None:
        bank = self._make_uniform_bank(tmp_path)
        config = yaml.safe_load((bank / "config.yaml").read_text())
        config["results"] = {"email_student_on_pass": True}
        config["student_email"] = {"body": "Some body text"}
        self._write_config(bank, config)
        result = validate_question_bank(bank)
        assert not result.is_valid
        assert any(
            "missing required field 'subject'" in e.message
            for e in result.errors
        )

    def test_email_valid_section_passes(self, tmp_path: Path) -> None:
        bank = self._make_uniform_bank(tmp_path)
        config = yaml.safe_load((bank / "config.yaml").read_text())
        config["results"] = {"email_student_on_pass": True}
        config["student_email"] = {
            "subject": "Your cert",
            "body": "Well done!",
        }
        self._write_config(bank, config)
        result = validate_question_bank(bank)
        assert result.is_valid
