#!/usr/bin/env python3
"""
Create a new API compatibility decision file under api-compatibility/.

This script records a human's judgement about whether a specific,
oasdiff-flagged API change requires an immediate forced reload
(forces_reload: true) or can be handled by the existing silent
background-update mechanism (forces_reload: false).

Usage: python backend/scripts/new_compat_decision.py
       (run from anywhere in the repo)

Prompts interactively for:
- oasdiff change ID and operation (e.g. "api-path-removed DELETE /api/v1/foo")
- Whether the change requires forced reload (y/n)
- Reasoning for the decision (free text)

Automatically:
- Derives a kebab-case slug from the reason
- Computes the generation number (incremented for forces_reload: true,
  reused-current-max for false)
- Detects collision on generation number for forces_reload: true files
- Writes the YAML file with UTC timestamp prefix

Exit code 0 on success, non-zero on validation failure.
"""

from __future__ import annotations

import re
import sys
from datetime import UTC, datetime
from pathlib import Path


def find_repo_root() -> Path:
    """Walk up from this script's location to find the repo root (.git)."""
    current = Path(__file__).resolve().parent
    while current != current.parent:
        if (current / ".git").exists():
            return current
        current = current.parent
    raise RuntimeError("Could not find repo root (.git directory)")


def ensure_compat_dir(repo_root: Path) -> Path:
    """Ensure api-compatibility/ exists at repo root, create if needed."""
    compat_dir = repo_root / "api-compatibility"
    compat_dir.mkdir(exist_ok=True)
    return compat_dir


def derive_slug(reason: str, max_length: int = 60) -> str:
    """
    Derive a kebab-case slug from reason text.

    Rules:
    - Lowercase the input
    - Replace non-alphanumeric runs with single dashes
    - Trim leading/trailing dashes
    - Cap at ~60 characters
    """
    # Lowercase
    slug = reason.lower()

    # Replace non-alphanumeric runs (including spaces) with single dash
    slug = re.sub(r"[^a-z0-9]+", "-", slug)

    # Trim leading/trailing dashes
    slug = slug.strip("-")

    # Cap at max_length
    if len(slug) > max_length:
        slug = slug[:max_length].rstrip("-")

    return slug


def read_change_and_reason() -> tuple[str, str]:
    """
    Read and validate change and reason from user input.

    - change: oasdiff change ID + operation, must not be empty or contain newlines
    - reason: free text, must not be empty or contain newlines

    Returns (change, reason) or exits non-zero on validation failure.
    """
    print("\nEnter the oasdiff-flagged change:")
    print(
        "(e.g. 'api-path-removed-without-deprecation DELETE /api/v1/encounters/{id}')"
    )
    change = input("change> ").strip()

    if not change:
        print("Error: change must not be empty", file=sys.stderr)
        sys.exit(1)

    if "\n" in change:
        print(
            "Error: change must be a single line (no newlines)",
            file=sys.stderr,
        )
        sys.exit(1)

    print("\nExplain why you made this forces_reload decision:")
    reason = input("reason> ").strip()

    if not reason:
        print("Error: reason must not be empty", file=sys.stderr)
        sys.exit(1)

    if "\n" in reason:
        print(
            "Error: reason must be a single line (no newlines)",
            file=sys.stderr,
        )
        sys.exit(1)

    return change, reason


def read_forces_reload() -> bool:
    """Read y/n prompt for forces_reload boolean."""
    print("\nDoes this change require a forced reload of open tabs? (y/n)")
    while True:
        response = input("forces_reload> ").strip().lower()
        if response in ("y", "yes"):
            return True
        elif response in ("n", "no"):
            return False
        else:
            print("Please enter y or n")


def compute_generation(compat_dir: Path, forces_reload: bool) -> int:
    """
    Compute generation number for the new decision file.

    For forces_reload: true:
    - Scan existing true files, take max generation, return max + 1
    - Fail on collision (indicates stale checkout)

    For forces_reload: false:
    - Return current max(generation for true files), or 1 if none exist
    - No uniqueness check for false files
    """
    yaml_files = sorted(compat_dir.glob("*.yaml"))

    # Parse generation from all files
    true_generations = []
    false_generations = []

    for file_path in yaml_files:
        generation = parse_generation_from_file(file_path)
        if generation is None:
            continue

        forces_reload_val = parse_forces_reload_from_file(file_path)
        if forces_reload_val is None:
            continue

        if forces_reload_val:
            true_generations.append(generation)
        else:
            false_generations.append(generation)

    if forces_reload:
        # Increment max true generation
        max_true = max(true_generations) if true_generations else 0
        new_generation = max_true + 1

        # Collision check: ensure no existing true file has this generation
        if new_generation in true_generations:
            print(
                f"Error: generation {new_generation} already used by an existing "
                "forces_reload: true file. "
                "Your checkout may be stale — try 'git pull' or 'git rebase main' "
                "and run this script again.",
                file=sys.stderr,
            )
            sys.exit(1)

        return new_generation
    else:
        # Reuse current max of true files (or 1 if none exist)
        max_true = max(true_generations) if true_generations else 1
        return max_true


def parse_generation_from_file(file_path: Path) -> int | None:
    """Extract generation number from a YAML file, return None on parse error."""
    try:
        content = file_path.read_text()
        for line in content.split("\n"):
            if line.startswith("generation:"):
                # Extract the integer after 'generation:'
                match = re.search(r"generation:\s*(\d+)", line)
                if match:
                    return int(match.group(1))
        return None
    except Exception:
        return None


def parse_forces_reload_from_file(file_path: Path) -> bool | None:
    """Extract forces_reload boolean from a YAML file, return None on parse error."""
    try:
        content = file_path.read_text()
        for line in content.split("\n"):
            if line.startswith("forces_reload:"):
                if "true" in line.lower():
                    return True
                elif "false" in line.lower():
                    return False
        return None
    except Exception:
        return None


def build_filename_and_path(compat_dir: Path, slug: str) -> Path:
    """
    Build filename with UTC timestamp prefix and check for collisions.

    Format: YYYYMMDDHHMMSS-<slug>.yaml

    If collision detected (extremely unlikely but possible), sleep briefly
    and regenerate with random suffix.
    """
    utc_now = datetime.now(UTC)
    timestamp = utc_now.strftime("%Y%m%d%H%M%S")
    filename = f"{timestamp}-{slug}.yaml"
    file_path = compat_dir / filename

    if file_path.exists():
        # Collision (extremely unlikely). Append random suffix.
        import random
        import time

        time.sleep(0.1)
        suffix = "".join(random.choices("0123456789", k=4))
        filename = f"{timestamp}-{slug}-{suffix}.yaml"
        file_path = compat_dir / filename

    # Final validation: filename must match the regex
    if not re.match(r"^\d{14}-[a-z0-9]+(-[a-z0-9]+)*\.yaml$", filename):
        print(
            f"Error: generated filename '{filename}' does not match expected pattern",
            file=sys.stderr,
        )
        sys.exit(1)

    return file_path


def yaml_escape(value: str) -> str:
    """Escape a string for YAML double-quoted string literal."""
    # In YAML double-quoted strings, only " and \ need escaping
    value = value.replace("\\", "\\\\")
    value = value.replace('"', '\\"')
    return value


def write_decision_file(
    file_path: Path,
    generation: int,
    forces_reload: bool,
    change: str,
    reason: str,
) -> None:
    """Write the YAML decision file."""
    yaml_content = (
        f"generation: {generation}\n"
        f"forces_reload: {'true' if forces_reload else 'false'}\n"
        f'change: "{yaml_escape(change)}"\n'
        f'reason: "{yaml_escape(reason)}"\n'
    )

    file_path.write_text(yaml_content)


def print_success_message(
    file_path: Path,
    generation: int,
    forces_reload: bool,
    yaml_content: str,
) -> None:
    """Print success message and warnings about merging."""
    print(f"\n✓ Decision file created: {file_path}")
    print("\n---")
    print(yaml_content)
    print("---\n")

    if forces_reload:
        print(
            f"⚠️  This file has forces_reload: true with generation {generation}."
        )
        print(
            "   Once merged, required_client_generation will become {generation}."
        )
        print(
            "   Every open browser tab will force-reload to pick up the new bundle."
        )
        print()

    print(
        "Reminder: this PR must be approved via the 'api-breaking-change-review' "
        "GitHub Actions environment before merge."
    )
    print(
        "          The repo requires branches to be up to date with main before "
        "merging (strict status checks)."
    )
    if forces_reload:
        print(
            "          If another forces_reload: true change lands first, your "
            "generation number may need to be bumped."
        )


def main() -> None:
    """Main entry point."""
    repo_root = find_repo_root()
    compat_dir = ensure_compat_dir(repo_root)

    # Read inputs
    change, reason = read_change_and_reason()
    forces_reload = read_forces_reload()

    # Derive slug
    slug = derive_slug(reason)

    # Compute generation
    generation = compute_generation(compat_dir, forces_reload)

    # Build filename and path
    file_path = build_filename_and_path(compat_dir, slug)

    # Write file
    write_decision_file(file_path, generation, forces_reload, change, reason)

    # Print success message with the written content
    yaml_content = file_path.read_text()
    print_success_message(file_path, generation, forces_reload, yaml_content)


if __name__ == "__main__":
    main()
