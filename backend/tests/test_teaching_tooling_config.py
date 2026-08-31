"""Assessment config and email template validation.

The email checks are conditional by design: a bank need only carry a
template for the emails it actually sends.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.features.teaching.tooling.validate import (
    ValidationResult,
    _validate_assessment_dir,
)

VALID_QUESTION: dict[str, object] = {
    "question_type": "single",
    "options": [
        {"id": "a", "label": "A", "tags": ["correct"]},
        {"id": "b", "label": "B", "tags": ["incorrect"]},
    ],
    "correct_option_id": "a",
    "images": [],
}

EMAIL: dict[str, object] = {"subject": "Passed", "body": "Well done"}


def _base_config(**overrides: object) -> dict[str, object]:
    """A config that validates cleanly, before overrides."""
    config: dict[str, object] = {
        "version": 1,
        "title": "A bank",
        "description": "A bank for tests",
        "type": "variable",
        "assessment": {
            "items_per_attempt": 1,
            "time_limit_minutes": 10,
            "min_pool_size": 1,
        },
    }
    config.update(overrides)
    return config


def _errors(tmp_path: Path, config: dict[str, object]) -> list[str]:
    assessment = tmp_path / "bank" / "assessment"
    (assessment / "question_001").mkdir(parents=True)
    (assessment / "assessment.yaml").write_text(yaml.dump(config))
    (assessment / "question_001" / "question.yaml").write_text(
        yaml.dump(VALID_QUESTION)
    )
    result = ValidationResult()
    _validate_assessment_dir(assessment, result)
    return [e.message for e in result.errors]


class TestRequiredTopLevelFields:
    def test_a_complete_config_passes(self, tmp_path: Path) -> None:
        assert _errors(tmp_path, _base_config()) == []

    @pytest.mark.parametrize(
        "field", ["version", "title", "description", "type"]
    )
    def test_each_required_field_is_enforced(
        self, tmp_path: Path, field: str
    ) -> None:
        config = _base_config()
        del config[field]
        assert any(
            f"missing required field '{field}'" in e
            for e in _errors(tmp_path, config)
        )

    def test_unknown_bank_type_is_reported(self, tmp_path: Path) -> None:
        errors = _errors(tmp_path, _base_config(type="freeform"))
        assert any("invalid type 'freeform'" in e for e in errors)


class TestAssessmentSection:
    @pytest.mark.parametrize(
        "field", ["items_per_attempt", "time_limit_minutes", "min_pool_size"]
    )
    def test_each_field_is_enforced(self, tmp_path: Path, field: str) -> None:
        section: dict[str, object] = {
            "items_per_attempt": 1,
            "time_limit_minutes": 10,
            "min_pool_size": 1,
        }
        del section[field]
        config = _base_config(assessment=section)
        assert any(
            f"assessment section missing '{field}'" in e
            for e in _errors(tmp_path, config)
        )

    def test_a_non_mapping_assessment_is_reported(
        self, tmp_path: Path
    ) -> None:
        errors = _errors(tmp_path, _base_config(assessment="ten minutes"))
        assert any("assessment must be a mapping" in e for e in errors)


class TestUniformRequirements:
    """Uniform banks declare their options and image count up front."""

    def _uniform(self, **overrides: object) -> dict[str, object]:
        config = _base_config(
            type="uniform",
            options=["A", "B"],
            images_per_item=0,
            correct_answer_field="diagnosis",
        )
        config.update(overrides)
        return config

    def test_a_complete_uniform_config_passes(self, tmp_path: Path) -> None:
        assessment = tmp_path / "bank" / "assessment"
        (assessment / "question_001").mkdir(parents=True)
        (assessment / "assessment.yaml").write_text(yaml.dump(self._uniform()))
        (assessment / "question_001" / "question.yaml").write_text(
            yaml.dump({"diagnosis": "adenoma"})
        )
        result = ValidationResult()
        _validate_assessment_dir(assessment, result)
        assert result.is_valid, result.summary()

    @pytest.mark.parametrize("field", ["options", "images_per_item"])
    def test_missing_uniform_field_is_reported(
        self, tmp_path: Path, field: str
    ) -> None:
        config = self._uniform()
        del config[field]
        assert any(
            f"uniform type requires '{field}'" in e
            for e in _errors(tmp_path, config)
        )

    def test_variable_banks_are_not_asked_for_them(
        self, tmp_path: Path
    ) -> None:
        assert _errors(tmp_path, _base_config()) == []


class TestEmailSections:
    """Only required for the emails a bank is configured to send."""

    def test_no_email_flags_means_no_template_needed(
        self, tmp_path: Path
    ) -> None:
        assert _errors(tmp_path, _base_config(results={})) == []

    def test_coordinator_email_required_when_enabled(
        self, tmp_path: Path
    ) -> None:
        config = _base_config(results={"email_coordinator_on_pass": True})
        errors = _errors(tmp_path, config)
        assert any(
            "'coordinator_email' section is missing" in e for e in errors
        )

    def test_student_email_required_when_enabled(self, tmp_path: Path) -> None:
        config = _base_config(results={"email_student_on_pass": True})
        errors = _errors(tmp_path, config)
        assert any("'student_email' section is missing" in e for e in errors)

    def test_only_the_enabled_one_is_required(self, tmp_path: Path) -> None:
        """A bank emailing only the student needs only that template."""
        config = _base_config(
            results={"email_student_on_pass": True},
            student_email=EMAIL,
        )
        assert _errors(tmp_path, config) == []

    @pytest.mark.parametrize("field", ["subject", "body"])
    def test_template_fields_are_enforced(
        self, tmp_path: Path, field: str
    ) -> None:
        template = dict(EMAIL)
        del template[field]
        config = _base_config(
            results={"email_student_on_pass": True},
            student_email=template,
        )
        assert any(
            f"student_email missing required field '{field}'" in e
            for e in _errors(tmp_path, config)
        )

    def test_an_empty_field_counts_as_missing(self, tmp_path: Path) -> None:
        """A blank subject is as broken as an absent one."""
        config = _base_config(
            results={"email_student_on_pass": True},
            student_email={"subject": "", "body": "Well done"},
        )
        assert any(
            "student_email missing required field 'subject'" in e
            for e in _errors(tmp_path, config)
        )

    def test_a_non_mapping_results_block_is_ignored(
        self, tmp_path: Path
    ) -> None:
        """Malformed results must not crash the email check."""
        assert _errors(tmp_path, _base_config(results="nonsense")) == []
