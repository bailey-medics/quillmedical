"""Schema for a teaching module's ``module.yaml``, plus shared constants.

Ported from ``teaching-tooling/scripts/validate.py``.  The Pydantic model
lives here rather than beside the validators so that
:mod:`check_version_lock` can share ``ModuleStatus`` without importing the
whole validation module.

Only the standard library, ``pydantic`` and ``pyyaml`` may be imported here
— see the package docstring.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, Field

from app.features.teaching.content.annotations import Whole

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

#: Fields every assessment config must carry.
REQUIRED_ASSESSMENT_FIELDS = frozenset({"version", "title", "type"})

#: Accepted values for an assessment's ``type``.
VALID_ASSESSMENT_TYPES = frozenset({"uniform", "variable"})


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
    coverImage: str | None = None
    coverImageFocus: Whole | None = None
