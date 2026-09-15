"""Add one name to the end of every Markdown file in a folder.

Each `add_*_name.py` script beside this one contributes a name from a
single category — an animal, a human, a flower, a dog. They all go
through this module, so the rules live in one place: which files count,
how a name is written into one, and what happens when a name is already
there.

Adding a name is idempotent. Running a script a second time reports that
there was nothing to do rather than listing the same name twice, which
matters because these scripts are run by hand and it is easy to lose
track of whether one has already been run.
"""

from __future__ import annotations

import argparse
from collections.abc import Sequence
from pathlib import Path

#: The folder of Markdown files the scripts work on, found relative to
#: this file so that the scripts work from any working directory.
TEXT_FILES_DIR = Path(__file__).resolve().parent.parent / "text-files"

#: The longest a name may be. Generous for a name, short enough that a
#: whole file pasted in by mistake is rejected rather than appended.
MAX_NAME_LENGTH = 64


def _checked_name(name: str) -> str:
    """Return ``name`` trimmed, or raise ``ValueError`` if unusable.

    Called at the top of everything that takes a name, so no file is
    opened on the strength of a name that was never going to be written.
    """
    if "\n" in name or "\r" in name:
        raise ValueError("A name must be on a single line.")

    trimmed = name.strip()
    if not trimmed:
        raise ValueError("A name must not be empty.")
    if len(trimmed) > MAX_NAME_LENGTH:
        raise ValueError(
            f"A name must be {MAX_NAME_LENGTH} characters or fewer, "
            f"but this one is {len(trimmed)}."
        )
    return trimmed


def _checked_directory(directory: Path) -> Path:
    """Return ``directory`` resolved, or raise if it is not a folder."""
    resolved = directory.resolve()
    if not resolved.exists():
        raise FileNotFoundError(f"There is no folder at {resolved}.")
    if not resolved.is_dir():
        raise NotADirectoryError(f"{resolved} is a file, not a folder.")
    return resolved


def markdown_files(directory: Path) -> list[Path]:
    """List the Markdown files directly inside ``directory``, sorted.

    Sub-folders and files with any other extension are left alone, so a
    stray note or a folder of images cannot be written into by mistake.
    """
    resolved = _checked_directory(directory)
    return sorted(
        path
        for path in resolved.iterdir()
        if path.is_file() and path.suffix == ".md"
    )


def has_name(path: Path, name: str) -> bool:
    """Say whether ``path`` already lists ``name``."""
    wanted = f"- {_checked_name(name)}"
    text = path.read_text(encoding="utf-8")
    return any(line.strip() == wanted for line in text.splitlines())


def append_name(path: Path, name: str) -> bool:
    """Add ``name`` to the end of ``path`` as a list item.

    Returns ``True`` when the file was changed and ``False`` when the
    name was already there.
    """
    trimmed = _checked_name(name)
    if not path.is_file():
        raise FileNotFoundError(f"There is no file at {path}.")

    if has_name(path, trimmed):
        return False

    text = path.read_text(encoding="utf-8")
    # A file that does not end in a newline would otherwise get the new
    # name stuck on the end of its last line.
    gap = "" if text == "" or text.endswith("\n") else "\n"
    path.write_text(f"{text}{gap}- {trimmed}\n", encoding="utf-8")
    return True


def add_name_to_all(name: str, directory: Path = TEXT_FILES_DIR) -> list[Path]:
    """Add ``name`` to every Markdown file in ``directory``.

    Returns only the files that changed, so a caller can report what it
    actually did rather than what it looked at.
    """
    trimmed = _checked_name(name)
    return [
        path
        for path in markdown_files(directory)
        if append_name(path, trimmed)
    ]


def run(name: str, argv: Sequence[str] | None = None) -> int:
    """Run one `add_*_name.py` script and return its exit code.

    Every problem is reported as a plain sentence and a non-zero exit
    code rather than a stack trace, because these scripts are run from a
    terminal by someone who wants to know what to fix.
    """
    parser = argparse.ArgumentParser(
        description=(
            f"Add the name {name} to every Markdown file in the "
            "text-files folder."
        )
    )
    parser.add_argument(
        "--directory",
        type=Path,
        default=TEXT_FILES_DIR,
        help="The folder of Markdown files to add the name to.",
    )
    arguments = parser.parse_args(argv)

    try:
        changed = add_name_to_all(name, arguments.directory)
    except (OSError, ValueError) as problem:
        print(f"Could not add {name}: {problem}")
        return 1

    if not changed:
        print(f"Every file already lists {name}. Nothing to do.")
        return 0

    for path in changed:
        print(f"Added {name} to {path.name}")
    return 0
