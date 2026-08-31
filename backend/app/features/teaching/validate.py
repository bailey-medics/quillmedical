"""Question bank validation.

Validates the structure and content of question bank directories
before syncing items to the database. Runs in three contexts:

1. CI on the question bank repo (catches errors before merge)
2. Dry-run API endpoint (educators check content without importing)
3. Pre-sync gate (sync aborts on any error)
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any

import yaml

from app.features.teaching.tooling.validate import (
    CERTIFICATE_BACKGROUND,
    ValidationResult,
    certificate_enabled,
    validate_certificate_config,
)

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
QUESTION_DIR_PATTERN = re.compile(r"^question_(\d+)$")
IMAGE_FILENAME_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")
ALLOWED_QUESTION_TYPES = {"single", "multiple"}


# ------------------------------------------------------------------
# Config schema (lightweight — validates YAML structure)
# ------------------------------------------------------------------


REQUIRED_CONFIG_FIELDS = {"version", "title", "description", "type"}
VALID_TYPES = {"uniform", "variable"}
REQUIRED_ASSESSMENT_FIELDS = {
    "items_per_attempt",
    "time_limit_minutes",
    "min_pool_size",
}

EMAIL_REQUIRED_FIELDS = {"subject", "body"}


def _validate_config(
    config: dict[str, Any], config_path: str, result: ValidationResult
) -> bool:
    """Validate the top-level config.yaml structure.

    Returns True if config is valid enough to continue item validation.
    """
    for field_name in REQUIRED_CONFIG_FIELDS:
        if field_name not in config:
            result.add_error(
                config_path,
                f"missing required field '{field_name}'",
            )

    bank_type = config.get("type")
    if bank_type and bank_type not in VALID_TYPES:
        result.add_error(
            config_path,
            f"invalid type '{bank_type}' — must be one of {VALID_TYPES}",
        )

    assessment = config.get("assessment", {})
    if isinstance(assessment, dict):
        for af in REQUIRED_ASSESSMENT_FIELDS:
            if af not in assessment:
                result.add_error(
                    config_path,
                    f"assessment section missing '{af}'",
                )
    else:
        result.add_error(config_path, "assessment must be a mapping")

    # Uniform-specific checks
    if bank_type == "uniform":
        if "options" not in config:
            result.add_error(
                config_path,
                "uniform type requires 'options' list",
            )
        if "images_per_item" not in config:
            result.add_error(
                config_path,
                "uniform type requires 'images_per_item'",
            )

    return result.is_valid


def _validate_certificate_section(
    config: dict[str, Any],
    bank_dir: Path,
    config_path: str,
    result: ValidationResult,
    *,
    image_inventory: dict[str, set[str]] | None = None,
) -> None:
    """Validate the certificate section and required files.

    The block itself is checked by
    :func:`app.features.teaching.tooling.validate.validate_certificate_config`,
    the same function the merge gate runs, so sync and CI cannot disagree
    about what a valid certificate looks like.  Only the background-image
    lookup stays here, because it differs by source: sync may be reading a
    GCS inventory rather than a directory on disk.
    """
    if not certificate_enabled(config):
        return

    if image_inventory is not None:
        present = CERTIFICATE_BACKGROUND in image_inventory.get(".", set())
    else:
        present = (bank_dir / CERTIFICATE_BACKGROUND).is_file()

    if not present:
        result.add_error(
            config_path,
            f"certificate_download is enabled but "
            f"{CERTIFICATE_BACKGROUND} is missing",
        )

    cert = config.get("certificate")
    if cert is None:
        result.add_error(
            config_path,
            "certificate_download is enabled but "
            "'certificate' section is missing",
        )
        return

    for message in validate_certificate_config(cert):
        result.add_error(config_path, message)


def _validate_email_section(
    config: dict[str, Any],
    section_name: str,
    config_path: str,
    result: ValidationResult,
) -> None:
    """Validate a coordinator_email or student_email section."""
    data = config.get(section_name)
    if not isinstance(data, dict):
        result.add_error(
            config_path,
            f"'{section_name}' section is missing",
        )
        return

    for req_field in EMAIL_REQUIRED_FIELDS:
        if req_field not in data or not data[req_field]:
            result.add_error(
                config_path,
                f"{section_name} missing required field '{req_field}'",
            )


def _validate_email_sections(
    config: dict[str, Any],
    config_path: str,
    result: ValidationResult,
) -> None:
    """Validate email template sections when emails are enabled."""
    results = config.get("results", {})

    if results.get("email_coordinator_on_pass", False):
        _validate_email_section(
            config, "coordinator_email", config_path, result
        )

    if results.get("email_student_on_pass", False):
        _validate_email_section(config, "student_email", config_path, result)


# ------------------------------------------------------------------
# Item validation
# ------------------------------------------------------------------


def _get_image_files(
    item_dir: Path,
    image_inventory: dict[str, set[str]] | None = None,
) -> list[str]:
    """Return image filenames in the item directory.

    When *image_inventory* is provided (GCS sync), look up files
    from the pre-built inventory rather than the local filesystem.
    """
    if image_inventory is not None:
        return sorted(image_inventory.get(item_dir.name, set()))
    return sorted(
        f.name
        for f in item_dir.iterdir()
        if f.is_file() and f.suffix.lower() in ALLOWED_IMAGE_EXTENSIONS
    )


def _check_image_naming(
    item_dir: Path,
    result: ValidationResult,
    image_inventory: dict[str, set[str]] | None = None,
) -> None:
    """Check all image files use valid naming (alphanumeric, hyphens, underscores)."""
    for name in _get_image_files(item_dir, image_inventory):
        stem = Path(name).stem
        if not IMAGE_FILENAME_PATTERN.match(stem):
            result.add_error(
                str(item_dir),
                f"image '{name}' has invalid name — use only "
                f"letters, digits, hyphens, and underscores",
            )


def _validate_uniform_item(
    item_dir: Path,
    question_data: dict[str, Any],
    config: dict[str, Any],
    result: ValidationResult,
    *,
    image_inventory: dict[str, set[str]] | None = None,
) -> None:
    """Validate a single item in a uniform-type bank."""
    rel_path = str(item_dir)

    # Image naming
    _check_image_naming(item_dir, result, image_inventory)

    # Image count
    expected_images = config.get("images_per_item", 0)
    actual_images = _get_image_files(item_dir, image_inventory)
    if len(actual_images) != expected_images:
        result.add_error(
            rel_path,
            f"expected {expected_images} images, found {len(actual_images)}",
        )

    # Correct answer field
    answer_field = config.get("correct_answer_field")
    if answer_field:
        if answer_field not in question_data:
            result.add_error(
                f"{rel_path}/question.yaml",
                f"missing required field '{answer_field}'",
            )
        else:
            valid_values = config.get("correct_answer_values", [])
            if (
                valid_values
                and question_data[answer_field] not in valid_values
            ):
                result.add_error(
                    f"{rel_path}/question.yaml",
                    f"'{answer_field}' value "
                    f"'{question_data[answer_field]}' "
                    f"not in {valid_values}",
                )

    # Item text
    item_text_cfg = config.get("item_text", {})
    if isinstance(item_text_cfg, dict) and item_text_cfg.get("required"):
        if "text" not in question_data or not question_data["text"]:
            result.add_error(
                f"{rel_path}/question.yaml",
                "missing required 'text' field",
            )


def _validate_variable_item(
    item_dir: Path,
    question_data: dict[str, Any],
    config: dict[str, Any],
    result: ValidationResult,
    *,
    image_inventory: dict[str, set[str]] | None = None,
) -> None:
    """Validate a single item in a variable-type bank."""
    rel_path = str(item_dir)

    # Question type
    question_type = question_data.get("question_type")
    if not question_type:
        result.add_error(
            f"{rel_path}/question.yaml",
            "missing required 'question_type' field",
        )
    elif question_type not in ALLOWED_QUESTION_TYPES:
        result.add_error(
            f"{rel_path}/question.yaml",
            f"question_type '{question_type}' not in "
            f"allowed types {sorted(ALLOWED_QUESTION_TYPES)}",
        )

    # Options
    options = question_data.get("options")
    if not isinstance(options, list) or len(options) == 0:
        result.add_error(
            f"{rel_path}/question.yaml",
            "variable item must have an 'options' list",
        )
        return

    option_ids = [o.get("id") for o in options if isinstance(o, dict)]
    if len(option_ids) != len(set(option_ids)):
        result.add_error(
            f"{rel_path}/question.yaml",
            "duplicate option IDs found",
        )

    for opt in options:
        if not isinstance(opt, dict):
            result.add_error(
                f"{rel_path}/question.yaml",
                "each option must be a mapping with id, label, tags",
            )
            continue
        for required in ("id", "label", "tags"):
            if required not in opt:
                result.add_error(
                    f"{rel_path}/question.yaml",
                    f"option missing '{required}'",
                )

    # correct_option_id
    correct_id = question_data.get("correct_option_id")
    if not correct_id:
        result.add_error(
            f"{rel_path}/question.yaml",
            "missing 'correct_option_id'",
        )
    elif correct_id not in option_ids:
        result.add_error(
            f"{rel_path}/question.yaml",
            f"correct_option_id '{correct_id}' "
            f"not in item options {option_ids}",
        )

    # Images — list is required (may be empty)
    images = question_data.get("images")
    if images is None:
        result.add_error(
            f"{rel_path}/question.yaml",
            "variable item must have an 'images' list "
            "(use [] for no images)",
        )
        return

    if not isinstance(images, list):
        result.add_error(
            f"{rel_path}/question.yaml",
            "'images' must be a list",
        )
        return

    # Image naming
    _check_image_naming(item_dir, result, image_inventory)

    # Check each declared image file exists and follows naming convention
    for img in images:
        if not isinstance(img, dict) or "key" not in img:
            result.add_error(
                f"{rel_path}/question.yaml",
                "each image must be a mapping with 'key' "
                "(and optional 'label')",
            )
            continue
        key_stem = Path(img["key"]).stem
        if not IMAGE_FILENAME_PATTERN.match(key_stem):
            result.add_error(
                f"{rel_path}/question.yaml",
                f"image key '{img['key']}' has invalid name — use "
                f"only letters, digits, hyphens, and underscores",
            )
        if image_inventory is not None:
            bucket_files = image_inventory.get(item_dir.name, set())
            if img["key"] not in bucket_files:
                result.add_error(
                    rel_path,
                    f"declared image '{img['key']}' not found in GCS",
                )
        else:
            img_path = item_dir / img["key"]
            if not img_path.is_file():
                result.add_error(
                    rel_path,
                    f"declared image '{img['key']}' not found",
                )

    # Check no undeclared image files
    declared_keys = {
        img["key"] for img in images if isinstance(img, dict) and "key" in img
    }
    for name in _get_image_files(item_dir, image_inventory):
        if name not in declared_keys:
            source = "GCS" if image_inventory is not None else "disk"
            result.add_error(
                rel_path,
                f"undeclared image file '{name}' "
                f"(found on {source} but not listed in "
                f"question.yaml images)",
            )

    # Item text
    item_text_cfg = config.get("item_text", {})
    if isinstance(item_text_cfg, dict) and item_text_cfg.get("required"):
        if "text" not in question_data or not question_data["text"]:
            result.add_error(
                f"{rel_path}/question.yaml",
                "missing required 'text' field",
            )


# ------------------------------------------------------------------
# Cross-item checks
# ------------------------------------------------------------------


def _cross_item_checks(
    config: dict[str, Any],
    items: list[dict[str, Any]],
    bank_dir: str,
    result: ValidationResult,
) -> None:
    """Run checks across all items in the bank."""
    assessment = config.get("assessment", {})
    min_pool = assessment.get("min_pool_size", 0)

    if result.item_count < min_pool:
        result.add_error(
            bank_dir,
            f"only {result.item_count} items but "
            f"min_pool_size requires {min_pool}",
        )

    # Answer distribution warning (uniform only)
    if config.get("type") == "uniform":
        answer_field = config.get("correct_answer_field")
        if answer_field and items:
            counts: dict[str, int] = {}
            for item in items:
                val = item.get(answer_field, "")
                counts[val] = counts.get(val, 0) + 1
            total = len(items)
            for val, count in counts.items():
                if total > 0 and count / total > 0.80:
                    result.add_warning(
                        bank_dir,
                        f"{count / total:.0%} of items have "
                        f"{answer_field} '{val}' "
                        f"(distribution skew)",
                    )


# ------------------------------------------------------------------
# Public API
# ------------------------------------------------------------------


def validate_question_bank(
    bank_dir: Path,
    *,
    image_inventory: dict[str, set[str]] | None = None,
) -> ValidationResult:
    """Validate a question bank directory.

    Parameters
    ----------
    bank_dir:
        Path to the question bank directory (e.g.
        ``questions/colonoscopy-optical-diagnosis/``).
    image_inventory:
        Optional mapping of item directory names to sets of image
        filenames.  When provided (GCS sync), image existence is
        checked against this inventory instead of the local
        filesystem.  Build with
        :func:`~app.features.teaching.storage.list_bank_images_in_gcs`.

    Returns
    -------
    ValidationResult with errors, warnings, and summary.
    """
    result = ValidationResult(bank_id="unknown", version=0)

    # --- Config ---
    config_path = bank_dir / "assessment.yaml"
    if not config_path.is_file():
        config_path = bank_dir / "config.yaml"
    if not config_path.is_file():
        config_path = bank_dir / "config.yml"
    if not config_path.is_file():
        result.add_error(
            str(bank_dir), "assessment.yaml or config.yaml not found"
        )
        return result

    with open(config_path) as f:
        config: dict[str, Any] = yaml.safe_load(f) or {}

    # Derive bank_id from config "id" field or directory name
    derived_id = config.get("id") or bank_dir.name
    if derived_id == "assessment":
        derived_id = bank_dir.parent.name
    result.bank_id = derived_id
    result.version = config.get("version", 0)

    config_ok = _validate_config(config, str(config_path), result)
    if not config_ok:
        return result

    # --- Certificate and email validation ---
    _validate_certificate_section(
        config,
        bank_dir,
        str(config_path),
        result,
        image_inventory=image_inventory,
    )
    _validate_email_sections(config, str(config_path), result)

    bank_type = config["type"]

    # --- Stray file check ---
    allowed_root_files = {
        "config.yaml",
        "config.yml",
        "certificate-blank.png",
    }
    for entry in bank_dir.iterdir():
        if entry.is_file() and entry.name not in allowed_root_files:
            result.add_warning(
                str(entry),
                f"unexpected file '{entry.name}' in bank root",
            )
        if entry.is_dir() and not QUESTION_DIR_PATTERN.match(entry.name):
            result.add_warning(
                str(entry),
                f"unexpected directory '{entry.name}' "
                f"(expected question_NNN pattern)",
            )

    # --- Item directories ---
    item_dirs = sorted(
        d
        for d in bank_dir.iterdir()
        if d.is_dir() and QUESTION_DIR_PATTERN.match(d.name)
    )

    all_item_data: list[dict[str, Any]] = []

    for item_dir in item_dirs:
        q_yaml = item_dir / "question.yaml"
        if not q_yaml.is_file():
            result.add_error(
                str(item_dir),
                "missing question.yaml",
            )
            continue

        with open(q_yaml) as f:
            question_data: dict[str, Any] = yaml.safe_load(f) or {}

        all_item_data.append(question_data)

        if bank_type == "uniform":
            _validate_uniform_item(
                item_dir,
                question_data,
                config,
                result,
                image_inventory=image_inventory,
            )
        elif bank_type == "variable":
            _validate_variable_item(
                item_dir,
                question_data,
                config,
                result,
                image_inventory=image_inventory,
            )

    result.item_count = len(item_dirs)

    # --- Cross-item checks ---
    _cross_item_checks(config, all_item_data, str(bank_dir), result)

    return result
