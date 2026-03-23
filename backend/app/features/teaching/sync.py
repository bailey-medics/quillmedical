"""Sync question bank content from filesystem/GCS to the database.

The sync process:
1. Reads config.yaml from the bank directory
2. Validates the bank structure (see validate.py)
3. Upserts the QuestionBankConfig row
4. Creates/updates QuestionBankItem rows
5. Records the result in QuestionBankSync
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.features.teaching.models import (
    QuestionBankConfig,
    QuestionBankItem,
    QuestionBankSync,
)
from app.features.teaching.validate import (
    ValidationResult,
    validate_question_bank,
)

logger = logging.getLogger(__name__)


def _load_config(bank_dir: Path) -> dict[str, Any]:
    """Load and return the config YAML from a bank directory."""
    for name in ("config.yaml", "config.yml"):
        path = bank_dir / name
        if path.is_file():
            with open(path) as f:
                return yaml.safe_load(f) or {}
    msg = f"No config.yaml found in {bank_dir}"
    raise FileNotFoundError(msg)


def _parse_uniform_item(
    item_dir: Path,
    question_data: dict[str, Any],
    config: dict[str, Any],
) -> dict[str, Any]:
    """Parse a uniform-type item directory into DB field values."""
    images_per_item = config.get("images_per_item", 0)
    images: list[dict[str, str]] = []
    for i in range(1, images_per_item + 1):
        # Find the image file (any allowed extension)
        for ext in (".png", ".jpg", ".jpeg", ".webp"):
            candidate = item_dir / f"image_{i}{ext}"
            if candidate.is_file():
                images.append({"key": f"image_{i}{ext}"})
                break

    return {
        "images": images,
        "text": question_data.get("text"),
        "options": None,  # uniform: options come from config
        "correct_option_id": None,  # uniform: uses metadata field
        "metadata_json": question_data,
    }


def _parse_variable_item(
    item_dir: Path,
    question_data: dict[str, Any],
) -> dict[str, Any]:
    """Parse a variable-type item directory into DB field values."""
    return {
        "images": question_data.get("images", []),
        "text": question_data.get("text"),
        "options": question_data.get("options"),
        "correct_option_id": question_data.get("correct_option_id"),
        "metadata_json": {
            k: v
            for k, v in question_data.items()
            if k not in ("images", "text", "options", "correct_option_id")
        },
    }


def sync_question_bank(
    bank_dir: Path,
    organisation_id: int,
    user_id: int,
    db: Session,
    *,
    validate_only: bool = False,
    image_inventory: dict[str, set[str]] | None = None,
) -> tuple[ValidationResult, QuestionBankSync | None]:
    """Sync a question bank from the filesystem to the database.

    Parameters
    ----------
    bank_dir:
        Path to the question bank directory.
    organisation_id:
        Owning organisation ID.
    user_id:
        User triggering the sync (for audit).
    db:
        SQLAlchemy session.
    validate_only:
        If True, run validation only — do not import items.
    image_inventory:
        Optional mapping of item directory names to sets of image
        filenames (from GCS).  Passed through to validation so
        image existence can be checked against the bucket.

    Returns
    -------
    Tuple of (ValidationResult, QuestionBankSync or None).
    The sync record is None when validate_only is True.
    """
    # Step 1: Validate
    validation = validate_question_bank(
        bank_dir, image_inventory=image_inventory
    )

    if validate_only:
        return validation, None

    config = _load_config(bank_dir)
    bank_id = config["id"]
    version = config["version"]
    bank_type = config["type"]

    # Create sync record
    sync_record = QuestionBankSync(
        organisation_id=organisation_id,
        question_bank_id=bank_id,
        version=version,
        status="in_progress",
        triggered_by=user_id,
    )
    db.add(sync_record)
    db.flush()

    if not validation.is_valid:
        sync_record.status = "failed"
        sync_record.errors = [e.to_dict() for e in validation.errors]
        sync_record.warnings = [w.to_dict() for w in validation.warnings]
        sync_record.completed_at = datetime.now(UTC)
        db.commit()
        return validation, sync_record

    # Step 2: Upsert QuestionBankConfig
    existing_config = db.execute(
        select(QuestionBankConfig).where(
            QuestionBankConfig.organisation_id == organisation_id,
            QuestionBankConfig.question_bank_id == bank_id,
            QuestionBankConfig.version == version,
        )
    ).scalar_one_or_none()

    if existing_config:
        existing_config.title = config.get("title", "")
        existing_config.description = config.get("description", "")
        existing_config.type = bank_type
        existing_config.config_yaml = config
        existing_config.synced_at = datetime.now(UTC)
        existing_config.synced_by = user_id
    else:
        db.add(
            QuestionBankConfig(
                organisation_id=organisation_id,
                question_bank_id=bank_id,
                version=version,
                title=config.get("title", ""),
                description=config.get("description", ""),
                type=bank_type,
                config_yaml=config,
                synced_by=user_id,
            )
        )

    # Step 3: Import items
    items_created = 0
    items_updated = 0

    import re

    question_dir_pattern = re.compile(r"^question_(\d+)$")
    item_dirs = sorted(
        d
        for d in bank_dir.iterdir()
        if d.is_dir() and question_dir_pattern.match(d.name)
    )

    # Build a set of existing items for this bank+version
    existing_items = (
        db.execute(
            select(QuestionBankItem).where(
                QuestionBankItem.organisation_id == organisation_id,
                QuestionBankItem.question_bank_id == bank_id,
                QuestionBankItem.bank_version == version,
            )
        )
        .scalars()
        .all()
    )

    # Index by metadata for matching (use directory name as key)
    existing_by_dir: dict[str, QuestionBankItem] = {}
    for item in existing_items:
        # We store the source directory name in metadata
        dir_name = item.metadata_json.get("_source_dir", "")
        if dir_name:
            existing_by_dir[dir_name] = item

    for item_dir in item_dirs:
        q_yaml = item_dir / "question.yaml"
        if not q_yaml.is_file():
            continue

        with open(q_yaml) as f:
            question_data: dict[str, Any] = yaml.safe_load(f) or {}

        if bank_type == "uniform":
            fields = _parse_uniform_item(item_dir, question_data, config)
        else:
            fields = _parse_variable_item(item_dir, question_data)

        # Add source directory to metadata for future matching
        fields["metadata_json"]["_source_dir"] = item_dir.name

        existing_item = existing_by_dir.get(item_dir.name)
        if existing_item:
            # Update
            for key, value in fields.items():
                setattr(existing_item, key, value)
            items_updated += 1
        else:
            # Create
            db.add(
                QuestionBankItem(
                    organisation_id=organisation_id,
                    question_bank_id=bank_id,
                    bank_version=version,
                    created_by=user_id,
                    status="draft",
                    **fields,
                )
            )
            items_created += 1

    # Step 4: Finalise sync record
    sync_record.status = "success"
    sync_record.items_created = items_created
    sync_record.items_updated = items_updated
    sync_record.warnings = [w.to_dict() for w in validation.warnings]
    sync_record.completed_at = datetime.now(UTC)

    db.commit()
    return validation, sync_record
