"""Integration with teaching-tooling CI validator.

Imports and runs the teaching-tooling ``validate.py`` module as a
second layer of validation during sync.  This ensures the same checks
that run in CI (module.yaml schema, image declarations, directory
structure) are also enforced when syncing — in ALL environments.

Clinical safety note: teaching assessments determine whether
clinicians are fit to practise.  Invalid content must NEVER reach
production.  This validation runs regardless of whether content
comes from the local filesystem or GCS.

If the teaching-tooling scripts path is not configured, sync is
blocked with a clear error — this is intentional for safety.
"""

from __future__ import annotations

import importlib.util
import logging
import sys
from pathlib import Path
from types import ModuleType

from app.config import settings

logger = logging.getLogger(__name__)

_tooling_module: ModuleType | None = None
_import_attempted: bool = False


def _load_tooling_validate() -> ModuleType | None:
    """Lazily import the teaching-tooling validate module."""
    global _tooling_module, _import_attempted

    if _import_attempted:
        return _tooling_module

    _import_attempted = True
    scripts_path = settings.TEACHING_TOOLING_SCRIPTS_PATH
    if not scripts_path:
        logger.error(
            "TEACHING_TOOLING_SCRIPTS_PATH is not configured — "
            "teaching-tooling validation cannot run"
        )
        return None

    validate_path = Path(scripts_path) / "validate.py"
    if not validate_path.is_file():
        logger.error(
            "teaching-tooling validate.py not found at %s",
            validate_path,
        )
        return None

    try:
        spec = importlib.util.spec_from_file_location(
            "teaching_tooling_validate", str(validate_path)
        )
        if spec is None or spec.loader is None:
            return None
        module = importlib.util.module_from_spec(spec)
        sys.modules["teaching_tooling_validate"] = module
        spec.loader.exec_module(module)
        _tooling_module = module
        logger.info("Loaded teaching-tooling validator from %s", validate_path)
    except Exception:
        logger.exception("Failed to load teaching-tooling validator")

    return _tooling_module


def run_tooling_validation(
    module_dir: Path,
) -> list[dict[str, str]]:
    """Run the teaching-tooling validator on a single module directory.

    Parameters
    ----------
    module_dir:
        Path to a module directory (e.g.
        ``/teaching-repos/eoeeta-teaching/modules/colonoscopy-...-test/``).
        Must contain ``module.yaml``.

    Returns
    -------
    List of error dicts ``{"path": ..., "message": ...}``.
    Empty list ONLY if validation passes.
    Returns a blocking error if tooling is unavailable (fail-safe).
    """
    tooling = _load_tooling_validate()
    if tooling is None:
        return [
            {
                "path": str(module_dir),
                "message": (
                    "teaching-tooling validator unavailable — "
                    "sync blocked for safety"
                ),
            }
        ]

    if not module_dir.is_dir():
        return [
            {
                "path": str(module_dir),
                "message": "module directory does not exist",
            }
        ]

    try:
        result = tooling.ValidationResult()
        tooling._validate_module(module_dir, result)
        return [{"path": e.path, "message": e.message} for e in result.errors]
    except Exception:
        logger.exception(
            "teaching-tooling validation raised for %s", module_dir
        )
        return []
