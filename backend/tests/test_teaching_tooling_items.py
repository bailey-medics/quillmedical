"""Per-item and cross-item validation.

Third unit of collapsing the two validators. These checks previously lived
only in the sync-side validator, so the merge gate never saw them: a bank
could reach GCS with a missing ``question_type``, a ``correct_option_id``
naming no option, or an image count that did not match the assessment.

Ported into the tooling validator here, which means they now run at both
gates. The variable per-item check subsumes the old assessment-level image
pass, so that pass was removed rather than left to double-report.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.features.teaching.tooling.validate import (
    ValidationResult,
    _validate_assessment_dir,
)


def _assessment(
    tmp_path: Path,
    config: dict[str, object],
    questions: dict[str, dict[str, object]],
    files: dict[str, tuple[str, ...]] | None = None,
) -> Path:
    """Build an assessment directory from literal config and questions."""
    assessment = tmp_path / "bank" / "assessment"
    assessment.mkdir(parents=True)
    base: dict[str, object] = {
        "version": 1,
        "title": "B",
        "description": "A bank",
        "assessment": {
            "items_per_attempt": len(questions) or 1,
            "time_limit_minutes": 10,
            "min_pool_size": len(questions) or 1,
        },
    }
    base.update(config)
    (assessment / "assessment.yaml").write_text(yaml.dump(base))

    for name, data in questions.items():
        question_dir = assessment / name
        question_dir.mkdir()
        (question_dir / "question.yaml").write_text(yaml.dump(data))
        for filename in (files or {}).get(name, ()):
            (question_dir / filename).write_bytes(b"")
    return assessment


def _errors(assessment: Path) -> list[str]:
    result = ValidationResult()
    _validate_assessment_dir(assessment, result)
    return [e.message for e in result.errors]


def _warnings(assessment: Path) -> list[str]:
    result = ValidationResult()
    _validate_assessment_dir(assessment, result)
    return [w.message for w in result.warnings]


UNIFORM: dict[str, object] = {
    "type": "uniform",
    "options": ["Option A", "Option B"],
    "images_per_item": 1,
    "images": [{"key": "wli.png"}],
    "correct_answer_field": "diagnosis",
}

VARIABLE_QUESTION: dict[str, object] = {
    "question_type": "single",
    "options": [
        {"id": "a", "label": "A", "tags": ["correct"]},
        {"id": "b", "label": "B", "tags": ["incorrect"]},
    ],
    "correct_option_id": "a",
    "images": [{"key": "scan.png"}],
}


class TestQuestionFileHandling:
    def test_missing_question_yaml_is_reported(self, tmp_path: Path) -> None:
        assessment = tmp_path / "bank" / "assessment"
        (assessment / "question_001").mkdir(parents=True)
        (assessment / "assessment.yaml").write_text(
            yaml.dump({"version": 1, "title": "B", "type": "variable"})
        )
        assert any("missing question.yaml" in e for e in _errors(assessment))

    def test_malformed_yaml_is_reported(self, tmp_path: Path) -> None:
        assessment = _assessment(
            tmp_path, {"type": "variable"}, {"question_001": {}}
        )
        (assessment / "question_001" / "question.yaml").write_text(
            "options: [unclosed\n"
        )
        assert any("invalid YAML" in e for e in _errors(assessment))


class TestUniformItems:
    def test_image_count_must_match_the_assessment(
        self, tmp_path: Path
    ) -> None:
        assessment = _assessment(
            tmp_path,
            UNIFORM,
            {"question_001": {"diagnosis": "adenoma"}},
            files={"question_001": ("wli.png", "extra.png")},
        )
        assert any(
            "expected 1 images, found 2" in e for e in _errors(assessment)
        )

    def test_missing_answer_field_is_reported(self, tmp_path: Path) -> None:
        assessment = _assessment(
            tmp_path,
            UNIFORM,
            {"question_001": {"notes": "no diagnosis here"}},
            files={"question_001": ("wli.png",)},
        )
        assert any(
            "missing required field 'diagnosis'" in e
            for e in _errors(assessment)
        )

    def test_answer_outside_the_allowed_values(self, tmp_path: Path) -> None:
        config = dict(UNIFORM)
        config["correct_answer_values"] = ["adenoma", "serrated"]
        assessment = _assessment(
            tmp_path,
            config,
            {"question_001": {"diagnosis": "something-else"}},
            files={"question_001": ("wli.png",)},
        )
        assert any(
            "not in ['adenoma', 'serrated']" in e for e in _errors(assessment)
        )

    def test_required_item_text_is_enforced(self, tmp_path: Path) -> None:
        config = dict(UNIFORM)
        config["item_text"] = {"required": True}
        assessment = _assessment(
            tmp_path,
            config,
            {"question_001": {"diagnosis": "adenoma"}},
            files={"question_001": ("wli.png",)},
        )
        assert any(
            "missing required 'text' field" in e for e in _errors(assessment)
        )

    def test_a_well_formed_item_passes(self, tmp_path: Path) -> None:
        assessment = _assessment(
            tmp_path,
            UNIFORM,
            {"question_001": {"diagnosis": "adenoma"}},
            files={"question_001": ("wli.png",)},
        )
        assert _errors(assessment) == []


class TestImageNaming:
    @pytest.mark.parametrize("bad", ["-leading.png", "has space.png"])
    def test_unsafe_image_names_are_reported(
        self, tmp_path: Path, bad: str
    ) -> None:
        config = dict(UNIFORM)
        config["images"] = [{"key": bad}]
        assessment = _assessment(
            tmp_path,
            config,
            {"question_001": {"diagnosis": "adenoma"}},
            files={"question_001": (bad,)},
        )
        assert any("invalid name" in e for e in _errors(assessment))


class TestVariableItems:
    def test_missing_question_type(self, tmp_path: Path) -> None:
        question = dict(VARIABLE_QUESTION)
        del question["question_type"]
        assessment = _assessment(
            tmp_path,
            {"type": "variable"},
            {"question_001": question},
            files={"question_001": ("scan.png",)},
        )
        assert any(
            "missing required 'question_type'" in e
            for e in _errors(assessment)
        )

    def test_unknown_question_type(self, tmp_path: Path) -> None:
        question = dict(VARIABLE_QUESTION)
        question["question_type"] = "essay"
        assessment = _assessment(
            tmp_path,
            {"type": "variable"},
            {"question_001": question},
            files={"question_001": ("scan.png",)},
        )
        assert any("not in allowed types" in e for e in _errors(assessment))

    def test_options_must_be_mappings(self, tmp_path: Path) -> None:
        """The shape the old fixtures used — plain strings — is invalid."""
        question = dict(VARIABLE_QUESTION)
        question["options"] = ["Normal", "Abnormal"]
        assessment = _assessment(
            tmp_path,
            {"type": "variable"},
            {"question_001": question},
            files={"question_001": ("scan.png",)},
        )
        assert any(
            "must be a mapping with id, label, tags" in e
            for e in _errors(assessment)
        )

    def test_duplicate_option_ids(self, tmp_path: Path) -> None:
        question = dict(VARIABLE_QUESTION)
        question["options"] = [
            {"id": "a", "label": "A", "tags": []},
            {"id": "a", "label": "B", "tags": []},
        ]
        assessment = _assessment(
            tmp_path,
            {"type": "variable"},
            {"question_001": question},
            files={"question_001": ("scan.png",)},
        )
        assert any("duplicate option IDs" in e for e in _errors(assessment))

    def test_correct_option_id_must_name_an_option(
        self, tmp_path: Path
    ) -> None:
        question = dict(VARIABLE_QUESTION)
        question["correct_option_id"] = "nonexistent"
        assessment = _assessment(
            tmp_path,
            {"type": "variable"},
            {"question_001": question},
            files={"question_001": ("scan.png",)},
        )
        assert any("not in item options" in e for e in _errors(assessment))

    def test_images_list_is_required(self, tmp_path: Path) -> None:
        question = dict(VARIABLE_QUESTION)
        del question["images"]
        assessment = _assessment(
            tmp_path, {"type": "variable"}, {"question_001": question}
        )
        assert any("use [] for no images" in e for e in _errors(assessment))

    def test_declared_image_must_exist(self, tmp_path: Path) -> None:
        assessment = _assessment(
            tmp_path,
            {"type": "variable"},
            {"question_001": VARIABLE_QUESTION},
        )
        assert any(
            "declared image 'scan.png' not found" in e
            for e in _errors(assessment)
        )

    def test_undeclared_image_is_reported(self, tmp_path: Path) -> None:
        assessment = _assessment(
            tmp_path,
            {"type": "variable"},
            {"question_001": VARIABLE_QUESTION},
            files={"question_001": ("scan.png", "stray.png")},
        )
        assert any(
            "undeclared image file 'stray.png'" in e
            for e in _errors(assessment)
        )

    def test_errors_are_not_double_reported(self, tmp_path: Path) -> None:
        """The per-item pass replaced the assessment-level image pass.

        Running both would report a missing image twice.
        """
        assessment = _assessment(
            tmp_path,
            {"type": "variable"},
            {"question_001": VARIABLE_QUESTION},
        )
        missing = [e for e in _errors(assessment) if "scan.png" in e]
        assert len(missing) == 1, missing

    def test_a_well_formed_item_passes(self, tmp_path: Path) -> None:
        assessment = _assessment(
            tmp_path,
            {"type": "variable"},
            {"question_001": VARIABLE_QUESTION},
            files={"question_001": ("scan.png",)},
        )
        assert _errors(assessment) == []


class TestCrossItemChecks:
    def test_min_pool_size_is_enforced(self, tmp_path: Path) -> None:
        assessment = _assessment(
            tmp_path,
            {"type": "variable", "assessment": {"min_pool_size": 5}},
            {"question_001": VARIABLE_QUESTION},
            files={"question_001": ("scan.png",)},
        )
        assert any(
            "min_pool_size requires 5" in e for e in _errors(assessment)
        )

    def test_answer_skew_warns_but_does_not_fail(self, tmp_path: Path) -> None:
        """Real content trips this: the eoeeta bank is 100% one answer."""
        questions: dict[str, dict[str, object]] = {
            f"question_00{i}": {"diagnosis": "adenoma"} for i in range(1, 5)
        }
        assessment = _assessment(
            tmp_path,
            UNIFORM,
            questions,
            files={name: ("wli.png",) for name in questions},
        )

        result = ValidationResult()
        _validate_assessment_dir(assessment, result)

        assert result.is_valid, "skew is advisory, not blocking"
        assert any("distribution skew" in w.message for w in result.warnings)

    def test_a_balanced_bank_does_not_warn(self, tmp_path: Path) -> None:
        questions: dict[str, dict[str, object]] = {
            "question_001": {"diagnosis": "adenoma"},
            "question_002": {"diagnosis": "serrated"},
        }
        assessment = _assessment(
            tmp_path,
            UNIFORM,
            questions,
            files={name: ("wli.png",) for name in questions},
        )
        assert _warnings(assessment) == []

    def test_item_count_is_recorded(self, tmp_path: Path) -> None:
        questions: dict[str, dict[str, object]] = {
            f"question_00{i}": {"diagnosis": "adenoma"} for i in range(1, 4)
        }
        assessment = _assessment(
            tmp_path,
            UNIFORM,
            questions,
            files={name: ("wli.png",) for name in questions},
        )
        result = ValidationResult()
        _validate_assessment_dir(assessment, result)
        assert result.item_count == 3
