"""Schema for a teaching module's ``module.yaml``, plus shared constants.

The Pydantic model lives here rather than beside the validators so that
:mod:`check_version_lock` can share ``ModuleStatus`` without importing the
whole validation module.

Only the standard library, ``pydantic`` and ``pyyaml`` may be imported here
- see the package docstring.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.features.teaching.tooling.annotations import Whole
from app.features.teaching.tooling.caption_languages import CAPTION_LANGUAGES

#: Lifecycle states a module may declare.
ModuleStatus = Literal["draft", "live", "retired"]

#: Question bank shapes.
AssessmentType = Literal["uniform", "variable"]

#: Identifiers are kebab-case.
KEBAB_CASE_PATTERN = r"^[a-z0-9]+(-[a-z0-9]+)*$"
KEBAB_CASE_RE = re.compile(KEBAB_CASE_PATTERN)

#: Question directories are ``question_001`` and friends.
QUESTION_DIR_RE = re.compile(r"^question_(\d+)$")

#: Image extensions recognised when looking for undeclared files.
ALLOWED_IMAGE_EXTENSIONS = frozenset({".png", ".jpg", ".jpeg", ".webp"})

#: Top-level fields every assessment config must carry.
#: Named for the file, not the ``assessment:`` block inside it - the two
#: were both called REQUIRED_ASSESSMENT_FIELDS before the merge, meaning
#: different things in each validator.
REQUIRED_CONFIG_FIELDS = frozenset({"version", "title", "description", "type"})

#: Fields the nested ``assessment:`` block must carry.
REQUIRED_ASSESSMENT_SECTION_FIELDS = frozenset(
    {"items_per_attempt", "time_limit_minutes", "min_pool_size"}
)

#: Fields an email template section must carry when emails are enabled.
EMAIL_REQUIRED_FIELDS = frozenset({"subject", "body"})

#: Accepted values for an assessment's ``type``.
VALID_ASSESSMENT_TYPES = frozenset({"uniform", "variable"})

#: Question shapes a variable bank may declare.
QuestionType = Literal["single", "multiple"]
ALLOWED_QUESTION_TYPES = frozenset({"single", "multiple"})

#: Image filenames must be safe to put in a URL path.
IMAGE_FILENAME_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")


#: How many words a module may list for its captions, how long each may
#: be, and how long the list may be in all. Whisper is handed the list as
#: text it has already heard, and reads only about the last 220 tokens of
#: it, so a longer list would lose its first words without saying so.
#: 600 characters stays inside that.
CAPTION_VOCABULARY_MAX_TERMS = 40
CAPTION_VOCABULARY_MAX_TERM_LENGTH = 40
CAPTION_VOCABULARY_MAX_TOTAL = 600


def caption_vocabulary_problem(terms: list[str]) -> str | None:
    """What is wrong with a ``captionVocabulary`` list, or None.

    Shared by the schema, which refuses a bad list in the teaching
    repository, and by the backend, which will not hand Whisper one that
    never went through it.
    """
    if len(terms) > CAPTION_VOCABULARY_MAX_TERMS:
        return (
            f"captionVocabulary lists {len(terms)} terms; "
            f"at most {CAPTION_VOCABULARY_MAX_TERMS} are read"
        )

    for term in terms:
        if not term.strip():
            return "captionVocabulary has an empty term"

        if "\n" in term or "\r" in term:
            return f"captionVocabulary term {term!r} runs over one line"

        if len(term) > CAPTION_VOCABULARY_MAX_TERM_LENGTH:
            return (
                f"captionVocabulary term {term!r} is longer than "
                f"{CAPTION_VOCABULARY_MAX_TERM_LENGTH} characters"
            )

    total = len(", ".join(terms))

    if total > CAPTION_VOCABULARY_MAX_TOTAL:
        return (
            f"captionVocabulary is {total} characters in all; at most "
            f"{CAPTION_VOCABULARY_MAX_TOTAL} are read"
        )

    return None


def caption_language_problem(code: str) -> str | None:
    """What is wrong with a ``captionLanguage``, or None.

    It must be one of Whisper's codes, such as ``cy``. A full name such
    as ``welsh`` is refused, with the code it should have been, so the
    mistake is fixed in the teaching repository rather than found on the
    first video.
    """
    if code in CAPTION_LANGUAGES:
        return None

    by_name = {name: key for key, name in CAPTION_LANGUAGES.items()}
    suggestion = by_name.get(code.strip().lower())

    if suggestion is not None:
        return f"captionLanguage {code!r} should be the code {suggestion!r}"

    return (
        f"captionLanguage {code!r} is not a language Whisper knows; use a "
        f"code such as 'cy' for Welsh"
    )


class ModuleYaml(BaseModel):
    """Schema for ``module.yaml``.

    Field names are camelCase because that is the on-disk contract content
    repos already author against; renaming them would be a breaking change
    for every existing bank.
    """

    moduleId: str = Field(pattern=KEBAB_CASE_PATTERN)
    title: str
    description: str = ""
    order: Whole
    status: ModuleStatus
    renewalMonths: Whole | None = Field(default=None, gt=0)
    #: How many days apart to remind somebody who is enrolled and has not
    #: finished an attempt, and how many reminders to send before
    #: stopping. Both or neither: a module with neither sends none.
    enrolmentReminderEveryDays: Whole | None = Field(default=None, gt=0)
    enrolmentReminderCount: Whole | None = Field(default=None, gt=0)
    coverImage: str | None = None
    coverImageFocus: Whole | None = None
    #: Words the module's video captions should spell right, such as
    #: "colonoscopy" or "adenoma". Handed to Whisper as text it has
    #: already heard. Left out, captions are made without it.
    captionVocabulary: list[str] = Field(default_factory=list)
    #: The language spoken in the module's videos, as Whisper's code,
    #: such as ``cy`` for Welsh. Left out, they are English. The word
    #: list above should be in the same language.
    captionLanguage: str | None = None

    @model_validator(mode="after")
    def _reminders_are_both_or_neither(self) -> ModuleYaml:
        """Refuse one reminder setting without the other.

        How often with no limit would remind somebody for ever, and a
        limit with no interval says nothing about when. Either is a
        mistake in the file, not a default to guess at.
        """
        every = self.enrolmentReminderEveryDays
        count = self.enrolmentReminderCount

        if (every is None) != (count is None):
            raise ValueError(
                "enrolmentReminderEveryDays and enrolmentReminderCount "
                "must be set together, or both left out"
            )

        return self

    @model_validator(mode="after")
    def _caption_language_is_known(self) -> ModuleYaml:
        """Refuse a language Whisper would not accept."""
        if self.captionLanguage is None:
            return self

        problem = caption_language_problem(self.captionLanguage)

        if problem is not None:
            raise ValueError(problem)

        return self

    @model_validator(mode="after")
    def _caption_vocabulary_fits(self) -> ModuleYaml:
        """Refuse a list Whisper would not read in full."""
        problem = caption_vocabulary_problem(self.captionVocabulary)

        if problem is not None:
            raise ValueError(problem)

        return self
