"""Module metadata and assessment validation.

Validates the structure of an organisation teaching repo:

- ``module.yaml`` schema (Pydantic, see :mod:`module_schema`)
- ``assessment.yaml`` structure, when present
- image file references
- directory naming conventions

Usage::

    python -m app.features.teaching.tooling.validate /path/to/modules/

Exit codes: 0 when every module is valid, 1 when any error is found.
"""

from __future__ import annotations

import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path

import pydantic
import yaml
from pydantic_core import ErrorDetails

from app.features.teaching.tooling.certificate_schema import (
    CertificateStyle,
)
from app.features.teaching.tooling.module_schema import (
    ALLOWED_IMAGE_EXTENSIONS,
    ALLOWED_QUESTION_TYPES,
    EMAIL_REQUIRED_FIELDS,
    IMAGE_FILENAME_PATTERN,
    QUESTION_DIR_RE,
    REQUIRED_ASSESSMENT_SECTION_FIELDS,
    REQUIRED_CONFIG_FIELDS,
    VALID_ASSESSMENT_TYPES,
    ModuleYaml,
)

#: Accepted assessment config filenames, in preference order.
_ASSESSMENT_FILENAMES = ("assessment.yaml", "config.yaml")

#: Text fields a certificate must declare explicitly once enabled.
#: The model supplies defaults for all of them, but a certificate whose
#: title silently falls back to a default is almost certainly a mistake,
#: so presence is required separately from validity.
REQUIRED_CERTIFICATE_FIELDS = (
    "title",
    "subtitle",
    "candidate_name",
    "pass_summary",
    "date",
)

#: The background image a certificate is composited onto.
CERTIFICATE_BACKGROUND = "certificate-blank.png"

#: Item directory name to the filenames it contains, with "." for the
#: assessment root. Supplied when content lives in GCS: only YAML is
#: downloaded there, so images are never on disk and a directory listing
#: would report every declared image as missing.
ImageInventory = dict[str, set[str]]


# ------------------------------------------------------------------
# Result types
# ------------------------------------------------------------------


@dataclass
class ValidationMessage:
    """A single validation error or warning."""

    path: str
    message: str

    def __str__(self) -> str:
        return f"  ERROR [{self.path}]: {self.message}"

    def to_dict(self) -> dict[str, str]:
        """Shape persisted on ``QuestionBankSync`` rows and returned by the
        sync API."""
        return {"path": self.path, "message": self.message}


#: Retained so existing imports keep working; the two were always the
#: same shape, and the sync name is the more accurate of the pair since
#: the class carries warnings too.
ValidationError = ValidationMessage


@dataclass
class ValidationResult:
    """Aggregate result of validating content.

    Shared by both gates.  ``bank_id``/``version`` are only set on the sync
    path, where a result describes one question bank; a CI run over a
    ``modules/`` tree leaves them empty and counts modules instead.
    """

    bank_id: str = ""
    version: int = 0
    errors: list[ValidationMessage] = field(default_factory=list)
    warnings: list[ValidationMessage] = field(default_factory=list)
    modules_checked: int = 0
    item_count: int = 0

    @property
    def is_valid(self) -> bool:
        """Whether anything blocking was found.

        Derived rather than stored: a flag that must be kept in step with
        the error list is a flag that eventually is not.
        """
        return not self.errors

    def add_error(self, path: str, message: str) -> None:
        self.errors.append(ValidationMessage(path=path, message=message))

    def add_warning(self, path: str, message: str) -> None:
        self.warnings.append(ValidationMessage(path=path, message=message))

    def summary(self) -> str:
        """Human-readable summary, in whichever style suits the caller."""
        if self.bank_id:
            parts = [f"Bank '{self.bank_id}' v{self.version}:"]
            parts.append(f"  {self.item_count} items found")
            if self.errors:
                parts.append(f"  {len(self.errors)} error(s)")
            if self.warnings:
                parts.append(f"  {len(self.warnings)} warning(s)")
            parts.append(
                "  VALID" if self.is_valid else "  INVALID — sync blocked"
            )
            return "\n".join(parts)

        parts = [f"Checked {self.modules_checked} module(s)."]
        if self.is_valid:
            parts.append("All valid.")
        else:
            parts.append(f"{len(self.errors)} error(s) found:")
            parts.extend(str(err) for err in self.errors)
        if self.warnings:
            parts.append(f"{len(self.warnings)} warning(s).")
        return "\n".join(parts)


# ------------------------------------------------------------------
# YAML reading — narrow untyped input at the boundary
# ------------------------------------------------------------------


def _files_in(
    directory: Path,
    inventory: ImageInventory | None,
    *,
    key: str | None = None,
) -> set[str]:
    """Filenames present in *directory*.

    With an inventory the listing comes from it rather than the disk,
    because in GCS mode the images were never downloaded — fetching them
    just to check a name would mean paying for the bytes twice.
    """
    if inventory is not None:
        return set(inventory.get(key or directory.name, set()))
    return {f.name for f in directory.iterdir() if f.is_file()}


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
# Certificate block
# ------------------------------------------------------------------


def certificate_enabled(config: Mapping[str, object]) -> bool:
    """Whether a bank's config turns certificate download on."""
    results = config.get("results")
    if not isinstance(results, dict):
        return False
    return bool(results.get("certificate_download", False))


def validate_certificate_config(cert: object) -> list[str]:
    """Validate a bank's ``certificate:`` block.

    Driven off :class:`CertificateStyle` rather than hand-rolled checks, so
    the merge gate and the PDF renderer agree by construction.  Returns
    human-readable error strings; empty when the block is valid.
    """
    if not isinstance(cert, dict):
        return ["'certificate' section must be a mapping"]

    section = {str(key): value for key, value in cert.items()}
    errors: list[str] = []

    for name in REQUIRED_CERTIFICATE_FIELDS:
        if not isinstance(section.get(name), dict):
            errors.append(f"certificate section missing '{name}' field")

    try:
        CertificateStyle.model_validate(section)
    except pydantic.ValidationError as exc:
        for err in exc.errors():
            loc = ".".join(str(part) for part in err["loc"])
            where = f"certificate.{loc}" if loc else "certificate"
            errors.append(f"{where}: {_readable(loc, err)}")

    return errors


def _readable(loc: str, err: ErrorDetails) -> str:
    """Turn a Pydantic message into something a content author can act on.

    Pydantic reports a colour mismatch as "String should match pattern
    '^#[0-9a-fA-F]{6}$'", which is precise and useless to a clinician
    editing YAML.  Everything else keeps Pydantic's wording, which is
    already clear.
    """
    if err["type"] == "string_pattern_mismatch" and loc.endswith("colour"):
        return "must be a hex colour (e.g. #404040)"
    return str(err["msg"])


# ------------------------------------------------------------------
# Assessment config and email sections
# ------------------------------------------------------------------


def _validate_config(
    config: Mapping[str, object],
    rel_config: str,
    result: ValidationResult,
) -> None:
    """Validate the top-level shape of an assessment config."""
    for field_name in sorted(REQUIRED_CONFIG_FIELDS):
        if field_name not in config:
            result.add_error(
                rel_config, f"missing required field '{field_name}'"
            )

    bank_type = config.get("type")
    if bank_type and bank_type not in VALID_ASSESSMENT_TYPES:
        result.add_error(
            rel_config,
            f"invalid type '{bank_type}' — must be one of "
            f"{sorted(VALID_ASSESSMENT_TYPES)}",
        )

    assessment = config.get("assessment")
    if isinstance(assessment, dict):
        for field_name in sorted(REQUIRED_ASSESSMENT_SECTION_FIELDS):
            if field_name not in assessment:
                result.add_error(
                    rel_config, f"assessment section missing '{field_name}'"
                )
    else:
        result.add_error(rel_config, "assessment must be a mapping")

    if bank_type == "uniform":
        for field_name in ("options", "images_per_item"):
            if field_name not in config:
                result.add_error(
                    rel_config, f"uniform type requires '{field_name}'"
                )


def _validate_email_section(
    config: Mapping[str, object],
    section_name: str,
    rel_config: str,
    result: ValidationResult,
) -> None:
    """Validate one email template section."""
    data = config.get(section_name)
    if not isinstance(data, dict):
        result.add_error(rel_config, f"'{section_name}' section is missing")
        return

    for field_name in sorted(EMAIL_REQUIRED_FIELDS):
        if not data.get(field_name):
            result.add_error(
                rel_config,
                f"{section_name} missing required field '{field_name}'",
            )


def _validate_email_sections(
    config: Mapping[str, object],
    rel_config: str,
    result: ValidationResult,
) -> None:
    """Validate email templates, but only for the emails a bank sends."""
    results = config.get("results")
    if not isinstance(results, dict):
        return

    if results.get("email_coordinator_on_pass"):
        _validate_email_section(
            config, "coordinator_email", rel_config, result
        )
    if results.get("email_student_on_pass"):
        _validate_email_section(config, "student_email", rel_config, result)


# ------------------------------------------------------------------
# Per-item checks
# ------------------------------------------------------------------


def _image_files_in(
    question_dir: Path,
    inventory: ImageInventory | None,
) -> list[str]:
    """Image filenames in *question_dir*, sorted."""
    return sorted(
        name
        for name in _files_in(question_dir, inventory)
        if Path(name).suffix.lower() in ALLOWED_IMAGE_EXTENSIONS
    )


def _check_image_naming(
    question_dir: Path,
    rel_q: str,
    result: ValidationResult,
    inventory: ImageInventory | None,
) -> None:
    """Image filenames must be safe to place in a URL path."""
    for name in _image_files_in(question_dir, inventory):
        if not IMAGE_FILENAME_PATTERN.match(Path(name).stem):
            result.add_error(
                rel_q,
                f"image '{name}' has invalid name — use only letters, "
                f"digits, hyphens, and underscores",
            )


def _validate_uniform_item(
    question_dir: Path,
    question_data: Mapping[str, object],
    config: Mapping[str, object],
    rel_q: str,
    result: ValidationResult,
    inventory: ImageInventory | None = None,
) -> None:
    """Validate one item of a uniform bank.

    Complements the assessment-level image check, which reports *which*
    declared key is missing; this reports the count and the answer fields.
    """
    _check_image_naming(question_dir, rel_q, result, inventory)

    expected_images = config.get("images_per_item", 0)
    actual = _image_files_in(question_dir, inventory)
    if isinstance(expected_images, int) and len(actual) != expected_images:
        result.add_error(
            rel_q,
            f"expected {expected_images} images, found {len(actual)}",
        )

    answer_field = config.get("correct_answer_field")
    if isinstance(answer_field, str) and answer_field:
        if answer_field not in question_data:
            result.add_error(
                f"{rel_q}/question.yaml",
                f"missing required field '{answer_field}'",
            )
        else:
            valid_values = config.get("correct_answer_values")
            value = question_data[answer_field]
            if isinstance(valid_values, list) and valid_values:
                if value not in valid_values:
                    result.add_error(
                        f"{rel_q}/question.yaml",
                        f"'{answer_field}' value '{value}' "
                        f"not in {valid_values}",
                    )

    _check_item_text(question_data, config, rel_q, result)


def _check_item_text(
    question_data: Mapping[str, object],
    config: Mapping[str, object],
    rel_q: str,
    result: ValidationResult,
) -> None:
    """Enforce ``item_text.required`` when the bank asks for it."""
    item_text_cfg = config.get("item_text")
    if not isinstance(item_text_cfg, dict):
        return
    if not item_text_cfg.get("required"):
        return
    if not question_data.get("text"):
        result.add_error(
            f"{rel_q}/question.yaml", "missing required 'text' field"
        )


def _option_ids(options: Sequence[object]) -> list[object]:
    """Ids declared by *options*, skipping malformed entries."""
    return [o.get("id") for o in options if isinstance(o, dict)]


def _validate_variable_options(
    question_data: Mapping[str, object],
    rel_q: str,
    result: ValidationResult,
) -> list[object] | None:
    """Validate the options list. Returns the ids, or None if unusable."""
    options = question_data.get("options")
    if not isinstance(options, list) or not options:
        result.add_error(
            f"{rel_q}/question.yaml",
            "variable item must have an 'options' list",
        )
        return None

    ids = _option_ids(options)
    if len(ids) != len(set(ids)):
        result.add_error(
            f"{rel_q}/question.yaml", "duplicate option IDs found"
        )

    for opt in options:
        if not isinstance(opt, dict):
            result.add_error(
                f"{rel_q}/question.yaml",
                "each option must be a mapping with id, label, tags",
            )
            continue
        for required in ("id", "label", "tags"):
            if required not in opt:
                result.add_error(
                    f"{rel_q}/question.yaml", f"option missing '{required}'"
                )

    return ids


def _validate_variable_images_declared(
    question_dir: Path,
    question_data: Mapping[str, object],
    rel_q: str,
    result: ValidationResult,
    inventory: ImageInventory | None,
) -> None:
    """Every declared image must exist, and every file must be declared."""
    images = question_data.get("images")
    if images is None:
        result.add_error(
            f"{rel_q}/question.yaml",
            "variable item must have an 'images' list "
            "(use [] for no images)",
        )
        return
    if not isinstance(images, list):
        result.add_error(f"{rel_q}/question.yaml", "'images' must be a list")
        return

    _check_image_naming(question_dir, rel_q, result, inventory)

    present = _files_in(question_dir, inventory)
    source = "GCS" if inventory is not None else "disk"

    for img in images:
        key = _image_key(img)
        if key is None:
            result.add_error(
                f"{rel_q}/question.yaml",
                "each image must be a mapping with 'key' "
                "(and optional 'label')",
            )
            continue
        if not IMAGE_FILENAME_PATTERN.match(Path(key).stem):
            result.add_error(
                f"{rel_q}/question.yaml",
                f"image key '{key}' has invalid name — use only letters, "
                f"digits, hyphens, and underscores",
            )
        if key not in present:
            result.add_error(
                rel_q, f"declared image '{key}' not found in {source}"
            )

    declared = {k for k in (_image_key(i) for i in images) if k is not None}
    for name in _image_files_in(question_dir, inventory):
        if name not in declared:
            result.add_error(
                rel_q,
                f"undeclared image file '{name}' (found on {source} but "
                f"not listed in question.yaml images)",
            )


def _validate_variable_item(
    question_dir: Path,
    question_data: Mapping[str, object],
    config: Mapping[str, object],
    rel_q: str,
    result: ValidationResult,
    inventory: ImageInventory | None = None,
) -> None:
    """Validate one item of a variable bank."""
    question_type = question_data.get("question_type")
    if not question_type:
        result.add_error(
            f"{rel_q}/question.yaml",
            "missing required 'question_type' field",
        )
    elif question_type not in ALLOWED_QUESTION_TYPES:
        result.add_error(
            f"{rel_q}/question.yaml",
            f"question_type '{question_type}' not in allowed types "
            f"{sorted(ALLOWED_QUESTION_TYPES)}",
        )

    ids = _validate_variable_options(question_data, rel_q, result)
    if ids is None:
        return

    correct_id = question_data.get("correct_option_id")
    if not correct_id:
        result.add_error(
            f"{rel_q}/question.yaml", "missing 'correct_option_id'"
        )
    elif correct_id not in ids:
        result.add_error(
            f"{rel_q}/question.yaml",
            f"correct_option_id '{correct_id}' not in item options {ids}",
        )

    _validate_variable_images_declared(
        question_dir, question_data, rel_q, result, inventory
    )
    _check_item_text(question_data, config, rel_q, result)


def _cross_item_checks(
    config: Mapping[str, object],
    items: Sequence[Mapping[str, object]],
    rel_base: str,
    result: ValidationResult,
) -> None:
    """Checks that only make sense across the whole bank."""
    assessment = config.get("assessment")
    min_pool = 0
    if isinstance(assessment, dict):
        raw = assessment.get("min_pool_size", 0)
        if isinstance(raw, int) and not isinstance(raw, bool):
            min_pool = raw

    if result.item_count < min_pool:
        result.add_error(
            rel_base,
            f"only {result.item_count} items but min_pool_size requires "
            f"{min_pool}",
        )

    if config.get("type") != "uniform":
        return

    answer_field = config.get("correct_answer_field")
    if not isinstance(answer_field, str) or not items:
        return

    counts: dict[object, int] = {}
    for item in items:
        value = item.get(answer_field, "")
        counts[value] = counts.get(value, 0) + 1

    total = len(items)
    for value, count in counts.items():
        if count / total > 0.80:
            result.add_warning(
                rel_base,
                f"{count / total:.0%} of items have {answer_field} "
                f"'{value}' (distribution skew)",
            )


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
    assessment_dir: Path,
    result: ValidationResult,
    image_inventory: ImageInventory | None = None,
) -> dict[str, object] | None:
    """Validate assessment directory structure.

    Returns the parsed config so a caller can label the result with the
    bank it describes; None when the config could not be read.
    """
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
        result.add_error(rel_base, "assessment.yaml or config.yaml not found")
        return None

    rel_config = f"{rel_base}/{config_path.name}"

    try:
        with open(config_path, encoding="utf-8") as f:
            config = _as_mapping(yaml.safe_load(f))
    except yaml.YAMLError as e:
        result.add_error(rel_config, f"invalid YAML: {e}")
        return None

    if config is None:
        result.add_error(rel_config, "must be a YAML mapping")
        return None

    _validate_config(config, rel_config, result)
    _validate_email_sections(config, rel_config, result)

    bank_type = config.get("type")

    question_dirs = sorted(
        d
        for d in assessment_dir.iterdir()
        if d.is_dir() and QUESTION_DIR_RE.match(d.name)
    )
    _check_stray_entries(assessment_dir, rel_base, result)

    if not question_dirs:
        result.add_error(rel_base, "no question_NNN directories found")
        return config

    if bank_type == "uniform":
        # Assessment-level: reports *which* declared key is missing.
        _validate_uniform_images(
            config,
            question_dirs,
            rel_base,
            rel_config,
            result,
            image_inventory,
        )

    _validate_items(
        config,
        bank_type,
        question_dirs,
        rel_base,
        result,
        image_inventory,
    )

    _validate_certificate(
        config, assessment_dir, rel_config, result, image_inventory
    )
    return config


def _check_stray_entries(
    assessment_dir: Path,
    rel_base: str,
    result: ValidationResult,
) -> None:
    """Warn about files and directories nobody expects to find.

    Advisory only: an unexpected file is usually an editor artefact or a
    leftover, not a reason to block a sync.
    """
    allowed_files = {
        "assessment.yaml",
        "config.yaml",
        "config.yml",
        CERTIFICATE_BACKGROUND,
    }
    for entry in sorted(assessment_dir.iterdir()):
        rel = f"{rel_base}/{entry.name}"
        if entry.is_file() and entry.name not in allowed_files:
            result.add_warning(
                rel, f"unexpected file '{entry.name}' in bank root"
            )
        elif entry.is_dir() and not QUESTION_DIR_RE.match(entry.name):
            result.add_warning(
                rel,
                f"unexpected directory '{entry.name}' "
                f"(expected question_NNN pattern)",
            )


def _validate_items(
    config: Mapping[str, object],
    bank_type: object,
    question_dirs: Sequence[Path],
    rel_base: str,
    result: ValidationResult,
    image_inventory: ImageInventory | None = None,
) -> None:
    """Validate every question directory, then the bank as a whole.

    Variable banks are handled entirely here: the per-item checks subsume
    the assessment-level image pass, so running both would double-report a
    missing or undeclared file.
    """
    items: list[Mapping[str, object]] = []

    for question_dir in question_dirs:
        rel_q = f"{rel_base}/{question_dir.name}"
        question_yaml = question_dir / "question.yaml"

        if not question_yaml.is_file():
            result.add_error(rel_q, "missing question.yaml")
            continue

        try:
            with open(question_yaml, encoding="utf-8") as f:
                question_data = _as_mapping(yaml.safe_load(f))
        except yaml.YAMLError as exc:
            result.add_error(f"{rel_q}/question.yaml", f"invalid YAML: {exc}")
            continue

        if question_data is None:
            result.add_error(
                f"{rel_q}/question.yaml", "must be a YAML mapping"
            )
            continue

        result.item_count += 1
        items.append(question_data)

        if bank_type == "uniform":
            _validate_uniform_item(
                question_dir,
                question_data,
                config,
                rel_q,
                result,
                image_inventory,
            )
        elif bank_type == "variable":
            _validate_variable_item(
                question_dir,
                question_data,
                config,
                rel_q,
                result,
                image_inventory,
            )

    _cross_item_checks(config, items, rel_base, result)


def _validate_certificate(
    config: Mapping[str, object],
    assessment_dir: Path,
    rel_config: str,
    result: ValidationResult,
    image_inventory: ImageInventory | None = None,
) -> None:
    """Validate the certificate block and its background image.

    Only applies when the bank turns certificate download on.  Until this
    ran at merge time, a malformed certificate block reached GCS and failed
    silently at sync — the gap this consolidation exists to close.
    """
    if not certificate_enabled(config):
        return

    root_files = _files_in(assessment_dir, image_inventory, key=".")
    if CERTIFICATE_BACKGROUND not in root_files:
        result.add_error(
            rel_config,
            f"certificate_download is enabled but "
            f"{CERTIFICATE_BACKGROUND} is missing",
        )

    cert = config.get("certificate")
    if cert is None:
        result.add_error(
            rel_config,
            "certificate_download is enabled but "
            "'certificate' section is missing",
        )
        return

    for message in validate_certificate_config(cert):
        result.add_error(rel_config, message)


def _validate_uniform_images(
    config: Mapping[str, object],
    question_dirs: Sequence[Path],
    rel_base: str,
    rel_config: str,
    result: ValidationResult,
    image_inventory: ImageInventory | None = None,
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
        existing_files = _files_in(question_dir, image_inventory)
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


def _mdx_validator() -> Callable[[str], list[str]]:
    """Resolve the MDX validator lazily.

    ``mdx_parser`` sits in the teaching feature rather than in ``content``
    because it is the renderer, not part of the content contract.  Importing
    it here at module scope would be harmless today, but the lazy import
    keeps the boundary obvious: nothing in ``content`` depends on the
    feature package to load.
    """
    from app.features.teaching.mdx_parser import validate_mdx

    return validate_mdx


def _validate_learning_dir(
    learning_dir: Path, result: ValidationResult
) -> None:
    """Validate learning directory has a non-empty content.mdx."""
    rel_base = str(learning_dir.relative_to(learning_dir.parent.parent.parent))

    content_path = learning_dir / "content.mdx"
    if not content_path.is_file():
        result.add_error(rel_base, "learning/ exists but has no content.mdx")
        return

    rel_content = f"{rel_base}/content.mdx"
    if content_path.stat().st_size == 0:
        result.add_error(rel_content, "file is empty")
        return

    try:
        text = content_path.read_text(encoding="utf-8")
    except OSError as exc:
        result.add_error(rel_content, f"cannot read file: {exc}")
        return

    for message in _mdx_validator()(text):
        result.add_error(rel_content, message)


def _validate_module(
    module_dir: Path,
    result: ValidationResult,
    image_inventory: ImageInventory | None = None,
) -> None:
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
        _validate_assessment_dir(assessment_dir, result, image_inventory)


def validate_assessment_dir(
    assessment_dir: Path,
    image_inventory: ImageInventory | None = None,
) -> ValidationResult:
    """Validate an assessment directory on its own.

    The entry point sync uses. Sync resolves a bank to its ``assessment/``
    directory and an image inventory, and never sees the module directory
    above it, so module metadata and learning content are validated
    separately by :func:`validate_module_metadata` where a module directory
    is available.
    """
    result = ValidationResult()
    config = _validate_assessment_dir(assessment_dir, result, image_inventory)

    if config is not None:
        bank_id = config.get("id") or assessment_dir.name
        if bank_id == "assessment":
            bank_id = assessment_dir.parent.name
        result.bank_id = str(bank_id)
        version = config.get("version")
        result.version = version if isinstance(version, int) else 0

    return result


def validate_module_metadata(module_dir: Path) -> ValidationResult:
    """Validate ``module.yaml`` and learning content, but not the assessment.

    The complement of :func:`validate_assessment_dir`.  Sync validates the
    assessment against a GCS inventory, which a module directory cannot
    supply, so the two halves are checked from whichever source can see
    them — together covering everything exactly once.
    """
    result = ValidationResult()
    result.modules_checked += 1

    _validate_module_yaml(module_dir, result)

    learning_dir = module_dir / "learning"
    assessment_dir = module_dir / "assessment"

    if not learning_dir.is_dir() and not assessment_dir.is_dir():
        rel = str(module_dir.relative_to(module_dir.parent.parent))
        result.add_error(
            rel, "module must have at least one of learning/ or assessment/"
        )
        return result

    if learning_dir.is_dir():
        _validate_learning_dir(learning_dir, result)

    return result


def validate_module_dir(
    module_dir: Path,
    image_inventory: ImageInventory | None = None,
) -> ValidationResult:
    """Validate one module directory.

    The entry point sync needs: it validates a single bank rather than a
    whole ``modules/`` tree, and accepts an inventory for the GCS case where
    images were never downloaded.
    """
    result = ValidationResult()
    _validate_module(module_dir, result, image_inventory)
    return result


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
            "Usage: python -m app.features.teaching.tooling.validate "
            "<modules-directory>"
        )
        return 1

    result = validate_modules_dir(Path(args[0]))
    print(result.summary())
    return 0 if result.is_valid else 1


if __name__ == "__main__":
    sys.exit(main())
