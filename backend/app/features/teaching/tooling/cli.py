"""Command-line entry point for content validation.

Runs every check a content repo's CI needs, in one invocation::

    python -m app.features.teaching.tooling.cli <modules-directory>

Pass ``--skip-version-lock`` where there is no git history to compare
against — validating a tree downloaded from GCS, for instance, rather than
a checked-out branch.

Exit codes: 0 when everything passes, 1 when any check fails.

Deliberately dependency-light: this must run with only ``pydantic`` and
``pyyaml`` installed and no environment variables set.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from app.features.teaching.tooling.check_version_lock import (
    check_version_lock,
)
from app.features.teaching.tooling.validate import validate_modules_dir


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m app.features.teaching.tooling.cli",
        description="Validate teaching content in a modules/ directory.",
    )
    parser.add_argument(
        "modules_dir",
        type=Path,
        help="Path to the modules/ directory to validate",
    )
    parser.add_argument(
        "--skip-version-lock",
        action="store_true",
        help=(
            "Skip version lock checks. Use when there is no git history to "
            "compare against, e.g. content downloaded from GCS."
        ),
    )
    parser.add_argument(
        "--ref",
        default="origin/main",
        help="Git ref to compare against for version lock (default: %(default)s)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """Run content validation. Returns 0 on success, 1 on any failure."""
    args = _parse_args(argv if argv is not None else sys.argv[1:])

    modules_dir: Path = args.modules_dir

    validation = validate_modules_dir(modules_dir)
    print(validation.summary())

    if args.skip_version_lock:
        return 0 if validation.is_valid else 1

    lock = check_version_lock(modules_dir, ref=args.ref)
    print()
    print(lock.summary())

    return 0 if validation.is_valid and lock.passed else 1


if __name__ == "__main__":
    sys.exit(main())
