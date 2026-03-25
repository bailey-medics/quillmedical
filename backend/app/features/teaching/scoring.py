"""Scoring engine for teaching assessments.

Scores individual answers and evaluates compound pass criteria.
"""

from __future__ import annotations

from typing import Any


def score_answer_uniform(
    selected_option_id: str,
    config: dict[str, Any],
    item_metadata: dict[str, Any],
) -> tuple[bool, list[str]]:
    """Score a single answer for a uniform-type question bank.

    Returns (is_correct, resolved_tags).
    """
    options = config.get("options", [])
    selected = next(
        (o for o in options if o.get("id") == selected_option_id),
        None,
    )
    if selected is None:
        return False, []

    tags: list[str] = selected.get("tags", [])

    # Determine correctness: strip confidence tags and compare
    # remaining tag against the correct answer field
    answer_field = config.get("correct_answer_field", "")
    correct_value = item_metadata.get(answer_field, "")

    # Non-confidence tags are the "diagnosis" tags
    confidence_tags = {"high_confidence", "low_confidence"}
    diagnosis_tags = [t for t in tags if t not in confidence_tags]

    is_correct = correct_value in diagnosis_tags
    return is_correct, tags


def score_answer_variable(
    selected_option_id: str,
    item_options: list[dict[str, Any]],
    correct_option_id: str,
) -> tuple[bool, list[str]]:
    """Score a single answer for a variable-type question bank.

    Returns (is_correct, resolved_tags).
    """
    selected = next(
        (o for o in item_options if o.get("id") == selected_option_id),
        None,
    )
    if selected is None:
        return False, []

    tags: list[str] = selected.get("tags", [])
    is_correct = selected_option_id == correct_option_id
    return is_correct, tags


def evaluate_pass_criteria(
    criteria: list[dict[str, Any]],
    answers: list[dict[str, Any]],
    total_items: int,
) -> list[dict[str, Any]]:
    """Evaluate compound pass criteria against scored answers.

    Parameters
    ----------
    criteria:
        List of criterion dicts from config (``pass_criteria``).
    answers:
        List of answer dicts, each with ``is_correct``, ``resolved_tags``,
        and ``selected_option`` (None if unanswered).
    total_items:
        Total items in the assessment (includes unanswered).

    Returns
    -------
    List of criterion result dicts with ``name``, ``value``,
    ``threshold``, ``passed``.
    """
    results: list[dict[str, Any]] = []

    for criterion in criteria:
        rule = criterion.get("rule", "")
        tag = criterion.get("tag", "")
        threshold = criterion.get("threshold", 0.0)
        name = criterion.get("name", rule)

        if rule == "tag_percentage":
            # Of all items (including unanswered), how many answers
            # have the specified tag?
            tagged_count = sum(
                1
                for a in answers
                if a.get("resolved_tags") and tag in a["resolved_tags"]
            )
            value = tagged_count / total_items if total_items > 0 else 0.0
            results.append(
                {
                    "name": name,
                    "value": round(value, 4),
                    "threshold": threshold,
                    "passed": value >= threshold,
                }
            )

        elif rule == "tag_accuracy":
            # Of answers that have the specified tag, how many are
            # correct?
            tagged_answers = [
                a
                for a in answers
                if a.get("resolved_tags") and tag in a["resolved_tags"]
            ]
            correct_count = sum(
                1 for a in tagged_answers if a.get("is_correct")
            )
            value = (
                correct_count / len(tagged_answers) if tagged_answers else 0.0
            )
            results.append(
                {
                    "name": name,
                    "value": round(value, 4),
                    "threshold": threshold,
                    "passed": value >= threshold,
                }
            )

        else:
            # Unknown rule type — fail-safe: treat as not passed
            results.append(
                {
                    "name": name,
                    "value": 0.0,
                    "threshold": threshold,
                    "passed": False,
                }
            )

    return results
