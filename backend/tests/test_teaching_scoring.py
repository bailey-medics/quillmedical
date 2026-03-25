"""Tests for the teaching feature — scoring engine."""

from __future__ import annotations

from app.features.teaching.scoring import (
    evaluate_pass_criteria,
    score_answer_uniform,
    score_answer_variable,
)


class TestScoreAnswerUniform:
    """Per-answer scoring for uniform-type question banks."""

    CONFIG = {
        "options": [
            {
                "id": "high_confidence_adenoma",
                "label": "HC Adenoma",
                "tags": ["high_confidence", "adenoma"],
            },
            {
                "id": "low_confidence_adenoma",
                "label": "LC Adenoma",
                "tags": ["low_confidence", "adenoma"],
            },
            {
                "id": "high_confidence_serrated",
                "label": "HC Serrated",
                "tags": ["high_confidence", "serrated_polyp"],
            },
            {
                "id": "low_confidence_serrated",
                "label": "LC Serrated",
                "tags": ["low_confidence", "serrated_polyp"],
            },
        ],
        "correct_answer_field": "diagnosis",
    }

    def test_correct_high_confidence(self) -> None:
        is_correct, tags = score_answer_uniform(
            "high_confidence_adenoma",
            self.CONFIG,
            {"diagnosis": "adenoma"},
        )
        assert is_correct is True
        assert "high_confidence" in tags
        assert "adenoma" in tags

    def test_correct_low_confidence(self) -> None:
        is_correct, tags = score_answer_uniform(
            "low_confidence_adenoma",
            self.CONFIG,
            {"diagnosis": "adenoma"},
        )
        assert is_correct is True
        assert "low_confidence" in tags

    def test_incorrect_answer(self) -> None:
        is_correct, tags = score_answer_uniform(
            "high_confidence_serrated",
            self.CONFIG,
            {"diagnosis": "adenoma"},
        )
        assert is_correct is False
        assert "high_confidence" in tags

    def test_invalid_option_id(self) -> None:
        is_correct, tags = score_answer_uniform(
            "nonexistent",
            self.CONFIG,
            {"diagnosis": "adenoma"},
        )
        assert is_correct is False
        assert tags == []


class TestScoreAnswerVariable:
    """Per-answer scoring for variable-type question banks."""

    ITEM_OPTIONS = [
        {"id": "a", "label": "Option A", "tags": ["correct"]},
        {"id": "b", "label": "Option B", "tags": ["incorrect"]},
        {"id": "c", "label": "Option C", "tags": ["incorrect"]},
    ]

    def test_correct_answer(self) -> None:
        is_correct, tags = score_answer_variable("a", self.ITEM_OPTIONS, "a")
        assert is_correct is True
        assert tags == ["correct"]

    def test_incorrect_answer(self) -> None:
        is_correct, tags = score_answer_variable("b", self.ITEM_OPTIONS, "a")
        assert is_correct is False
        assert tags == ["incorrect"]

    def test_invalid_option_id(self) -> None:
        is_correct, tags = score_answer_variable(
            "nonexistent", self.ITEM_OPTIONS, "a"
        )
        assert is_correct is False
        assert tags == []


class TestEvaluatePassCriteria:
    """Compound pass criteria evaluation."""

    def test_tag_percentage_pass(self) -> None:
        criteria = [
            {
                "name": "High confidence rate",
                "rule": "tag_percentage",
                "tag": "high_confidence",
                "threshold": 0.70,
            }
        ]
        answers = [
            {
                "selected_option": "hc",
                "is_correct": True,
                "resolved_tags": ["high_confidence", "adenoma"],
            }
            for _ in range(80)
        ] + [
            {
                "selected_option": "lc",
                "is_correct": True,
                "resolved_tags": ["low_confidence", "adenoma"],
            }
            for _ in range(20)
        ]
        results = evaluate_pass_criteria(criteria, answers, 100)
        assert len(results) == 1
        assert results[0]["passed"] is True
        assert results[0]["value"] == 0.8

    def test_tag_percentage_fail(self) -> None:
        criteria = [
            {
                "name": "High confidence rate",
                "rule": "tag_percentage",
                "tag": "high_confidence",
                "threshold": 0.70,
            }
        ]
        answers = [
            {
                "selected_option": "hc",
                "is_correct": True,
                "resolved_tags": ["high_confidence"],
            }
            for _ in range(50)
        ] + [
            {
                "selected_option": "lc",
                "is_correct": True,
                "resolved_tags": ["low_confidence"],
            }
            for _ in range(50)
        ]
        results = evaluate_pass_criteria(criteria, answers, 100)
        assert results[0]["passed"] is False

    def test_tag_accuracy_pass(self) -> None:
        criteria = [
            {
                "name": "HC accuracy",
                "rule": "tag_accuracy",
                "tag": "high_confidence",
                "threshold": 0.85,
            }
        ]
        # 90 HC answers, 81 correct = 90%
        answers = [
            {
                "selected_option": "hc",
                "is_correct": True,
                "resolved_tags": ["high_confidence"],
            }
            for _ in range(81)
        ] + [
            {
                "selected_option": "hc",
                "is_correct": False,
                "resolved_tags": ["high_confidence"],
            }
            for _ in range(9)
        ]
        results = evaluate_pass_criteria(criteria, answers, 100)
        assert results[0]["passed"] is True

    def test_tag_accuracy_fail(self) -> None:
        criteria = [
            {
                "name": "HC accuracy",
                "rule": "tag_accuracy",
                "tag": "high_confidence",
                "threshold": 0.85,
            }
        ]
        answers = [
            {
                "selected_option": "hc",
                "is_correct": True,
                "resolved_tags": ["high_confidence"],
            }
            for _ in range(70)
        ] + [
            {
                "selected_option": "hc",
                "is_correct": False,
                "resolved_tags": ["high_confidence"],
            }
            for _ in range(30)
        ]
        results = evaluate_pass_criteria(criteria, answers, 100)
        assert results[0]["passed"] is False

    def test_compound_criteria_both_pass(self) -> None:
        criteria = [
            {
                "name": "HC rate",
                "rule": "tag_percentage",
                "tag": "high_confidence",
                "threshold": 0.70,
            },
            {
                "name": "HC accuracy",
                "rule": "tag_accuracy",
                "tag": "high_confidence",
                "threshold": 0.85,
            },
        ]
        # 80 HC answers (80% rate), 72 correct (90% accuracy)
        answers = (
            [
                {
                    "selected_option": "hc",
                    "is_correct": True,
                    "resolved_tags": ["high_confidence"],
                }
                for _ in range(72)
            ]
            + [
                {
                    "selected_option": "hc",
                    "is_correct": False,
                    "resolved_tags": ["high_confidence"],
                }
                for _ in range(8)
            ]
            + [
                {
                    "selected_option": "lc",
                    "is_correct": True,
                    "resolved_tags": ["low_confidence"],
                }
                for _ in range(20)
            ]
        )
        results = evaluate_pass_criteria(criteria, answers, 100)
        assert all(r["passed"] for r in results)

    def test_compound_criteria_one_fails(self) -> None:
        criteria = [
            {
                "name": "HC rate",
                "rule": "tag_percentage",
                "tag": "high_confidence",
                "threshold": 0.70,
            },
            {
                "name": "HC accuracy",
                "rule": "tag_accuracy",
                "tag": "high_confidence",
                "threshold": 0.85,
            },
        ]
        # 80 HC (80% rate) but only 60 correct (75% accuracy)
        answers = (
            [
                {
                    "selected_option": "hc",
                    "is_correct": True,
                    "resolved_tags": ["high_confidence"],
                }
                for _ in range(60)
            ]
            + [
                {
                    "selected_option": "hc",
                    "is_correct": False,
                    "resolved_tags": ["high_confidence"],
                }
                for _ in range(20)
            ]
            + [
                {
                    "selected_option": "lc",
                    "is_correct": True,
                    "resolved_tags": ["low_confidence"],
                }
                for _ in range(20)
            ]
        )
        results = evaluate_pass_criteria(criteria, answers, 100)
        assert results[0]["passed"] is True  # HC rate passes
        assert results[1]["passed"] is False  # HC accuracy fails

    def test_unanswered_items_penalise_tag_percentage(self) -> None:
        criteria = [
            {
                "name": "HC rate",
                "rule": "tag_percentage",
                "tag": "high_confidence",
                "threshold": 0.70,
            }
        ]
        # 60 HC answered out of 100 total items
        answers = [
            {
                "selected_option": "hc",
                "is_correct": True,
                "resolved_tags": ["high_confidence"],
            }
            for _ in range(60)
        ]
        # total_items=100 but only 60 answered
        results = evaluate_pass_criteria(criteria, answers, 100)
        assert results[0]["value"] == 0.6
        assert results[0]["passed"] is False

    def test_unknown_rule_type(self) -> None:
        criteria = [
            {
                "name": "Unknown",
                "rule": "future_rule",
                "tag": "x",
                "threshold": 0.5,
            }
        ]
        results = evaluate_pass_criteria(criteria, [], 10)
        assert results[0]["passed"] is False

    def test_empty_answers(self) -> None:
        criteria = [
            {
                "name": "HC rate",
                "rule": "tag_percentage",
                "tag": "high_confidence",
                "threshold": 0.70,
            }
        ]
        results = evaluate_pass_criteria(criteria, [], 100)
        assert results[0]["value"] == 0.0
        assert results[0]["passed"] is False
