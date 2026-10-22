"""Tests for ``captionVocabulary`` in a module's ``module.yaml``.

Whisper reads only about the last 220 tokens of the words it is handed,
so a list longer than that would lose its first terms without anyone
finding out. The schema refuses such a list in the teaching repository,
where it can be fixed, rather than letting captions quietly ignore it.
"""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from app.features.teaching.tooling.module_schema import (
    CAPTION_VOCABULARY_MAX_TERM_LENGTH,
    CAPTION_VOCABULARY_MAX_TERMS,
    ModuleYaml,
    caption_vocabulary_problem,
)


def _module(**over: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "moduleId": "colonoscopy-optical-diagnosis",
        "title": "Optical diagnosis",
        "order": 1,
        "status": "live",
    }
    body.update(over)

    return body


def test_a_module_without_a_list_has_none() -> None:
    assert ModuleYaml(**_module()).captionVocabulary == []


def test_a_good_list_is_kept_as_written() -> None:
    terms = ["colonoscopy", "adenoma", "resect and discard", "NBI"]

    assert ModuleYaml(
        **_module(captionVocabulary=terms)
    ).captionVocabulary == (terms)


def test_too_many_terms_are_refused() -> None:
    terms = [
        f"term{index}" for index in range(CAPTION_VOCABULARY_MAX_TERMS + 1)
    ]

    with pytest.raises(ValidationError, match="at most"):
        ModuleYaml(**_module(captionVocabulary=terms))


def test_a_term_too_long_is_refused() -> None:
    term = "x" * (CAPTION_VOCABULARY_MAX_TERM_LENGTH + 1)

    with pytest.raises(ValidationError, match="longer than"):
        ModuleYaml(**_module(captionVocabulary=[term]))


def test_a_term_over_two_lines_is_refused() -> None:
    with pytest.raises(ValidationError, match="one line"):
        ModuleYaml(**_module(captionVocabulary=["serrated\nlesion"]))


def test_an_empty_term_is_refused() -> None:
    with pytest.raises(ValidationError, match="empty term"):
        ModuleYaml(**_module(captionVocabulary=["adenoma", "  "]))


def test_a_list_too_long_in_all_is_refused() -> None:
    # Each term short enough, and few enough of them, but together past
    # what Whisper reads.
    term = "x" * CAPTION_VOCABULARY_MAX_TERM_LENGTH
    terms = [term] * 16

    assert caption_vocabulary_problem(terms) is not None
    with pytest.raises(ValidationError, match="characters in all"):
        ModuleYaml(**_module(captionVocabulary=terms))


def test_a_list_that_is_not_strings_is_refused() -> None:
    with pytest.raises(ValidationError):
        ModuleYaml(**_module(captionVocabulary=[{"term": "adenoma"}]))
