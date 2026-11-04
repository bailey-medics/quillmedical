"""Validate a framework repository's files with the catalogue's own rules.

A framework repository holds one file per framework, in ``frameworks/``,
and nothing else. This runs Quill's loader over that folder, so a file the
backend would refuse is refused on the pull request instead: a missing
prefix, a duplicate id, a level list that is empty, a specialty that is
not listed, and the rest of what :func:`app.cbac.competencies._load_catalogue`
checks. Two more rules apply to a framework repository alone:

- **Every file declares a framework.** A permission lives in Quill's code,
  never in a content repository.
- **No id is one of Quill's permissions.** The sync refuses that too, but
  the pull request is where it can be fixed.

Run by the framework pipeline from a narrow checkout of Quill, so it needs
only pydantic, PyYAML and ``shared/``::

    cd backend
    python -m app.features.passport.tooling.validate_frameworks \\
        <framework-repository>/frameworks

Exit codes: 0 when every file passes, 1 when any does not.
"""

from __future__ import annotations

import sys
from pathlib import Path

import yaml
from pydantic import ValidationError

from app.cbac.competencies import COMPETENCIES, _load_catalogue


def _files_without_a_framework(directory: Path) -> list[str]:
    """The files in *directory* that declare no framework."""
    found: list[str] = []

    for path in sorted(directory.glob("*.yaml")):
        data = yaml.safe_load(path.read_text())
        if not isinstance(data, dict) or "framework" not in data:
            found.append(path.name)

    return found


def validate(directory: Path) -> list[str]:
    """Every reason the folder's files would be refused.

    Args:
        directory: The repository's ``frameworks/`` folder.

    Returns:
        One message per problem, empty when the folder passes.
    """
    if not directory.is_dir():
        return [f"No folder at {directory}."]

    unframed = _files_without_a_framework(directory)

    if unframed:
        return [
            f"{name} declares no framework. Every file in a framework "
            "repository is a framework; a permission lives in Quill's code."
            for name in unframed
        ]

    try:
        entries, _ = _load_catalogue(directory)
    except (FileNotFoundError, ValueError, ValidationError) as error:
        return [str(error)]

    permissions = {c.id for c in COMPETENCIES if c.framework_id is None}
    clashes = sorted({e.id for e in entries} & permissions)

    return [
        f"{competency_id} is one of Quill's permissions. A framework "
        "competency needs an id of its own."
        for competency_id in clashes
    ]


def main(argv: list[str] | None = None) -> int:
    """CLI entry point: validate the folder and say what was found."""
    args = argv if argv is not None else sys.argv[1:]

    if len(args) != 1:
        print(
            "Usage: python -m app.features.passport.tooling."
            "validate_frameworks <frameworks-folder>"
        )
        return 2

    problems = validate(Path(args[0]))

    for problem in problems:
        print(problem)

    if problems:
        return 1

    print("Every framework file passes.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
