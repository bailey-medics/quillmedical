"""Module metadata and assessment validation.

Validates the structure of an organisation teaching repo:

- ``module.yaml`` schema (Pydantic, see :mod:`module_schema`)
- ``assessment.yaml`` structure, when present
- image file references
- directory naming conventions

Usage::

    python -m app.features.teaching.content.validate /path/to/modules/

Exit codes: 0 when every module is valid, 1 when any error is found.
"""

from __future__ import annotations

import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path

import pydantic
import yaml

from app.features.teaching.content.module_schema import (
    ALLOWED_IMAGE_EXTENSIONS,
    QUESTION_DIR_RE,
    REQUIRED_ASSESSMENT_FIELDS,
    VALID_ASSESSMENT_TYPES,
    ModuleYaml,
)

#: Accepted assessment config filenames, in preference order.
_ASSESSMENT_FILENAMES = ("assessment.yaml", "config.yaml")


# ------------------------------------------------------------------
# Result types
# ------------------------------------------------------------------


@dataclass
class ValidationError:
    """A single validation error."""

    path: str
    message: str

    def __str__(self) -> str:
        return f"  ERROR [{self.path}]: {self.message}"


@dataclass
class ValidationResult:
    """Aggregate validation result for a modules directory."""

    errors: list[ValidationError] = field(default_factory=list)
    modules_checked: int = 0

    @property
    def is_valid(self) -> bool:
        return len(self.errors) == 0

    def add_error(self, path: str, message: str) -> None:
        self.errors.append(ValidationError(path=path, message=message))

    def summary(self) -> str:
        lines = [f"Checked {self.modules_checked} module(s)."]
        if self.is_valid:
            lines.append("All valid.")
        else:
            lines.append(f"{len(self.errors)} error(s) found:")
            for err in self.errors:
                lines.append(str(err))
        return "\n".join(lines)


# ------------------------------------------------------------------
# YAML reading — narrow untyped input at the boundary
# ------------------------------------------------------------------


def _as_mapping(data: object) -> dict[str, object] | None:
    """Coerce a parsed YAML document to a string-keyed mapping."""
    if not isinstance(data, dict):
        return None
    return {str(key): value for key, value in data.items()}


def _image_key(entry: object) -> str | None:
    """Return the ``key`` of an ``images[]`` entry, or None if malformed."""
    if not isinstance(entry, dict):
        return None
    key = entry.get("key")
    return key if isinstance(key, str) else None


def _image_files(names: set[str]) -> set[str]:
    """Filter *names* down to recognised image files."""
    return {
        name
        for name in names
        if Path(name).suffix.lower() in ALLOWED_IMAGE_EXTENSIONS
    }


# ------------------------------------------------------------------
# Validators
# ------------------------------------------------------------------


def _validate_module_yaml(
    module_dir: Path, result: ValidationResult
) -> ModuleYaml | None:
    """Validate module.yaml exists and conforms to schema."""
    yaml_path = module_dir / "module.yaml"
    rel = str(yaml_path.relative_to(module_dir.parent.parent))

    if not yaml_path.is_file():
        result.add_error(rel, "module.yaml is missing")
        return None

    try:
        with open(yaml_path, encoding="utf-8") as f:
            data = _as_mapping(yaml.safe_load(f))
    except yaml.YAMLError as e:
        result.add_error(rel, f"invalid YAML: {e}")
        return None

    if data is None:
        result.add_error(rel, "module.yaml must be a YAML mapping")
        return None

    try:
        module = ModuleYaml.model_validate(data)
    except pydantic.ValidationError as e:
        result.add_error(rel, str(e))
        return None

    # moduleId must match directory name
    if module.moduleId != module_dir.name:
        result.add_error(
            rel,
            f"moduleId '{module.moduleId}' does not match "
            f"directory name '{module_dir.name}'",
        )

    # coverImage must exist if specified
    if module.coverImage:
        cover_path = module_dir / module.coverImage
        if not cover_path.is_file():
            result.add_error(
                rel,
                f"coverImage '{module.coverImage}' not found in module "
                f"directory",
            )

    return module


def _validate_assessment_dir(
    assessment_dir: Path, result: ValidationResult
) -> None:
    """Validate assessment directory structure."""
    rel_base = str(
        assessment_dir.relative_to(assessment_dir.parent.parent.parent)
    )

    config_path: Path | None = None
    for name in _ASSESSMENT_FILENAMES:
        candidate = assessment_dir / name
        if candidate.is_file():
            config_path = candidate
            break

    if config_path is None:
        result.add_error(
            rel_base, "assessment/ exists but has no assessment.yaml"
        )
        return

    rel_config = f"{rel_base}/{config_path.name}"

    try:
        with open(config_path, encoding="utf-8") as f:
            config = _as_mapping(yaml.safe_load(f))
    except yaml.YAMLError as e:
        result.add_error(rel_config, f"invalid YAML: {e}")
        return

    if config is None:
        result.add_error(rel_config, "must be a YAML mapping")
        return

    for field_name in REQUIRED_ASSESSMENT_FIELDS:
        if field_name not in config:
            result.add_error(
                rel_config, f"missing required field '{field_name}'"
            )

    bank_type = config.get("type")
    if bank_type and bank_type not in VALID_ASSESSMENT_TYPES:
        result.add_error(
            rel_config,
            f"invalid type '{bank_type}' — must be one of "
            f"{VALID_ASSESSMENT_TYPES}",
        )

    question_dirs = sorted(
        d
        for d in assessment_dir.iterdir()
        if d.is_dir() and QUESTION_DIR_RE.match(d.name)
    )
    if not question_dirs:
        result.add_error(rel_base, "no question_NNN directories found")
        return

    if bank_type == "uniform":
        _validate_uniform_images(
            config, question_dirs, rel_base, rel_config, result
        )
    elif bank_type == "variable":
        _validate_variable_images(question_dirs, rel_base, result)


def _validate_uniform_images(
    config: Mapping[str, object],
    question_dirs: Sequence[Path],
    rel_base: str,
    rel_config: str,
    result: ValidationResult,
) -> None:
    """Validate image files in uniform assessment question directories.

    Uniform assessments define images at the assessment level.  Each
    question directory must contain files matching the declared keys.
    """
    images = config.get("images")
    if not images:
        return

    if not isinstance(images, list):
        result.add_error(
            rel_config, "images must be a list of {key, label} objects"
        )
        return

    expected_keys: list[str] = []
    for i, img in enumerate(images):
        key = _image_key(img)
        if key is None:
            result.add_error(
                rel_config, f"images[{i}] must have a 'key' field"
            )
            return
        expected_keys.append(key)

    expected_set = set(expected_keys)

    for question_dir in question_dirs:
        rel_q = f"{rel_base}/{question_dir.name}"
        existing_files = {
            f.name for f in question_dir.iterdir() if f.is_file()
        }
        for key in expected_keys:
            if key not in existing_files:
                result.add_error(
                    rel_q, f"missing image '{key}' (defined in images[])"
                )
        undeclared = _image_files(existing_files) - expected_set
        for name in sorted(undeclared):
            result.add_error(
                rel_q,
                f"undeclared image '{name}' not in assessment.yaml images[]",
            )


def _validate_variable_images(
    question_dirs: Sequence[Path],
    rel_base: str,
    result: ValidationResult,
) -> None:
    """Validate image files in variable assessment question directories.

    Variable assessments define images per question.  Each referenced key
    must exist as a file in the question directory.
    """
    for question_dir in question_dirs:
        rel_q = f"{rel_base}/{question_dir.name}"
        question_yaml = question_dir / "question.yaml"
        if not question_yaml.is_file():
            result.add_error(rel_q, "missing question.yaml")
            continue

        try:
            with open(question_yaml, encoding="utf-8") as f:
                question_data = _as_mapping(yaml.safe_load(f))
        except yaml.YAMLError:
            continue  # YAML errors caught elsewhere

        if question_data is None:
            continue

        images = question_data.get("images")
        if not images or not isinstance(images, list):
            continue

        existing_files = {
            f.name for f in question_dir.iterdir() if f.is_file()
        }
        declared_keys: set[str] = set()
        for i, img in enumerate(images):
            key = _image_key(img)
            if key is None:
                result.add_error(rel_q, f"images[{i}] must have a 'key' field")
                continue
            declared_keys.add(key)
            if key not in existing_files:
                result.add_error(
                    rel_q,
                    f"missing image '{key}' "
                    f"(referenced in question.yaml images[{i}])",
                )
        undeclared = _image_files(existing_files) - declared_keys
        for name in sorted(undeclared):
            result.add_error(
                rel_q,
                f"undeclared image '{name}' not in question.yaml images[]",
            )


def _validate_learning_dir(
    learning_dir: Path, result: ValidationResult
) -> None:
    """Validate learning directory has a non-empty content.mdx."""
    rel_base = str(learning_dir.relative_to(learning_dir.parent.parent.parent))

    content_path = learning_dir / "content.mdx"
    if not content_path.is_file():
        result.add_error(rel_base, "learning/ exists but has no content.mdx")
        return

    if content_path.stat().st_size == 0:
        result.add_error(f"{rel_base}/content.mdx", "file is empty")


def _validate_module(module_dir: Path, result: ValidationResult) -> None:
    """Validate a single module directory."""
    result.modules_checked += 1

    _validate_module_yaml(module_dir, result)

    learning_dir = module_dir / "learning"
    assessment_dir = module_dir / "assessment"

    # Must have at least one of learning/ or assessment/
    if not learning_dir.is_dir() and not assessment_dir.is_dir():
        rel = str(module_dir.relative_to(module_dir.parent.parent))
        result.add_error(
            rel, "module must have at least one of learning/ or assessment/"
        )
        return

    if learning_dir.is_dir():
        _validate_learning_dir(learning_dir, result)

    if assessment_dir.is_dir():
        _validate_assessment_dir(assessment_dir, result)


def validate_modules_dir(modules_dir: Path) -> ValidationResult:
    """Validate every module in a ``modules/`` directory.

    Parameters
    ----------
    modules_dir:
        Path to the top-level ``modules/`` directory.

    Returns
    -------
    A :class:`ValidationResult` carrying any errors found.
    """
    result = ValidationResult()

    if not modules_dir.is_dir():
        result.add_error(str(modules_dir), "modules/ directory not found")
        return result

    module_dirs = sorted(
        d
        for d in modules_dir.iterdir()
        if d.is_dir() and not d.name.startswith(".")
    )

    if not module_dirs:
        result.add_error(str(modules_dir), "no module directories found")
        return result

    for module_dir in module_dirs:
        _validate_module(module_dir, result)

    return result


def main(argv: list[str] | None = None) -> int:
    """CLI entry point. Returns 0 on success, 1 on validation errors."""
    args = argv if argv is not None else sys.argv[1:]

    if not args:
        print(
            "Usage: python -m app.features.teaching.content.validate "
            "<modules-directory>"
        )
        return 1

    result = validate_modules_dir(Path(args[0]))
    print(result.summary())
    return 0 if result.is_valid else 1


if __name__ == "__main__":
    sys.exit(main())
