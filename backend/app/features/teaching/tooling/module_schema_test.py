"""Tests for the caption fields in a module's ``module.yaml``.

Whisper reads only about the last 220 tokens of the words it is handed,
so a ``captionVocabulary`` longer than that would lose its first terms
without anyone finding out, and it refuses a ``captionLanguage`` it does
not know. The schema refuses both in the teaching repository, where they
can be fixed, rather than letting captions quietly go wrong.
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


def test_a_module_without_a_language_is_english() -> None:
    # English needs nothing set: the caption job's default.
    assert ModuleYaml(**_module()).captionLanguage is None


def test_a_whisper_language_code_is_kept() -> None:
    assert ModuleYaml(**_module(captionLanguage="cy")).captionLanguage == "cy"


def test_an_unknown_code_is_refused() -> None:
    with pytest.raises(ValidationError, match="not a language Whisper knows"):
        ModuleYaml(**_module(captionLanguage="cyy"))


def test_a_full_name_is_refused_with_its_code() -> None:
    # "welsh" is what somebody would write; Whisper wants "cy".
    with pytest.raises(ValidationError, match="should be the code 'cy'"):
        ModuleYaml(**_module(captionLanguage="Welsh"))


def test_the_codes_are_whispers() -> None:
    # A spot check of the copied list. The caption image's build compares
    # all of it with Whisper's own.
    from app.features.teaching.tooling.caption_languages import (
        CAPTION_LANGUAGES,
    )

    assert CAPTION_LANGUAGES["en"] == "english"
    assert CAPTION_LANGUAGES["cy"] == "welsh"
    assert len(CAPTION_LANGUAGES) == 100
