#!/usr/bin/env python3
"""Add one dog name to every file in `stack-tests/text-files/`.

The last of the test plan's scripts. It writes to *all* the files in the
folder, including the ones phases 1 to 3 added, which is what makes this
branch depend on the three below it.

Usage: add_dog_name.py [name]

With no argument a name is picked from the list below, cycling by how many
lines a file already has, so running it repeatedly does not repeat one name
until the list is exhausted.
"""

from __future__ import annotations

import sys
from pathlib import Path

# The folder every script in this directory writes to, resolved relative to
# this file rather than the working directory, so the script behaves the
# same however it is invoked.
TEXT_FILES = Path(__file__).resolve().parent.parent / "text-files"

DOG_NAMES = (
    "Bracken",
    "Nell",
    "Tam",
    "Biscuit",
    "Moss",
)


def name_for(path: Path, names: tuple[str, ...]) -> str:
    """Pick the next name for a file, cycling through the list.

    Keyed on how many names the file already holds, so a file written to
    several times collects different names rather than the same one.
    """
    existing = [
        line
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.startswith("- ")
    ]
    return names[len(existing) % len(names)]


def add_name(path: Path, name: str) -> None:
    """Append one name to a file, as a markdown list item."""
    text = path.read_text(encoding="utf-8")
    separator = "" if text.endswith("\n") else "\n"
    path.write_text(f"{text}{separator}- {name}\n", encoding="utf-8")


def main(argv: list[str]) -> int:
    if not TEXT_FILES.is_dir():
        print(f"No such folder: {TEXT_FILES}", file=sys.stderr)
        return 1

    files = sorted(TEXT_FILES.glob("*.md"))
    if not files:
        print(f"No .md files in {TEXT_FILES}", file=sys.stderr)
        return 1

    chosen = argv[1] if len(argv) > 1 else None

    for path in files:
        name = chosen if chosen else name_for(path, DOG_NAMES)
        add_name(path, name)
        print(f"{path.name}: added {name}")

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
