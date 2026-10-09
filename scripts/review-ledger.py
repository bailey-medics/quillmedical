#!/usr/bin/env python3
"""Keep a card of which files have been read, and notice when one changes.

Reading a file and remembering that it was read are two jobs, and the
second is the one that goes wrong: a file read in September and edited in
October is no longer the file that was read. So the card holds, for each
file, the fingerprint git gives its contents. A file whose contents still
match is **read**; one whose contents have moved on is **changed**; one
with no line on the card is **unread**.

The commands:

- `mark <paths>` stamps files, or every file in a folder, as read.
- `unmark <paths>` takes the stamp off again, for a file stamped by
  mistake.
- `status` says how much is read, in two lines. `status f` (or `full`)
  adds the files changed since they were read and the lines left in each
  folder; `status <path>` lists that folder file by file.
- `states` prints every file and its state, one to a line, for a
  program to read.
- `diff <path>` shows what changed in a file since it was stamped, so a
  changed file is caught up on by reading the change and not the file.

The card is one tab-separated file, `review-ledger.tsv`, in the shared
`local/` folder that `local-path.sh` points at. It is kept out of git and
is the same file from every worktree. Paths on it are relative to the
repository root, which is what lets a stamp made in one worktree count in
another.
"""

from __future__ import annotations

import argparse
import fcntl
import os
import subprocess
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date
from pathlib import Path

LEDGER_NAME = "review-ledger.tsv"

# Files that are not read as code: pictures and sounds, lock files, and
# anything a script writes. Prose is left out too; the card is about code.
SKIPPED_SUFFIXES = (
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".svg",
    ".mp3",
    ".mp4",
    ".pdf",
    ".woff",
    ".woff2",
    ".ttf",
    ".md",
    ".snap",
)
SKIPPED_NAMES = ("yarn.lock", "poetry.lock", "package-lock.json")
SKIPPED_FOLDERS = (
    ".vscode/",
    "api-compatibility/",
    "backend/alembic/versions/",
    "docs/",
    "frontend/src/generated/",
    "frontend/src/stories/emails/rendered/",
    "frontend/.yarn/",
)

TEST_FOLDERS = ("backend/tests/", "frontend/e2e/", "scripts/tests/")
TEST_ENDINGS = (
    "_test.py",
    ".test.ts",
    ".test.tsx",
    ".stories.tsx",
    ".spec.ts",
    ".bats",
)

# What to type after `status` for the long form.
FULL_WORDS = ("f", "full")

# How many folders deep the summary groups by: backend/app/cbac, not
# backend, and not every folder beneath it either.
SUMMARY_DEPTH = 3


@dataclass(frozen=True)
class Stamp:
    """One line of the card: what a file's contents were, and when."""

    fingerprint: str
    stamped_on: str


@dataclass(frozen=True)
class FileState:
    """One file as it is now, set against its line on the card."""

    path: str
    lines: int
    state: str  # "read", "changed" or "unread"
    stamp: Stamp | None = None


def git(*args: str, stdin: str | None = None) -> str:
    """Run git from the repository root and hand back what it printed."""
    done = subprocess.run(
        ["git", *args],
        cwd=repo_root(),
        input=stdin,
        capture_output=True,
        text=True,
        check=False,
    )

    if done.returncode != 0:
        raise SystemExit(done.stderr.strip() or f"git {args[0]} failed")

    return done.stdout


_ROOT: Path | None = None


def repo_root() -> Path:
    """The root of the worktree this was run from."""
    global _ROOT

    if _ROOT is None:
        done = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            capture_output=True,
            text=True,
            check=False,
        )

        if done.returncode != 0:
            raise SystemExit("Not inside a git repository.")

        _ROOT = Path(done.stdout.strip()).resolve()

    return _ROOT


def ledger_path() -> Path:
    """Where the card is: the shared local/ folder, from any worktree."""
    helper = Path(__file__).resolve().parent / "local-path.sh"
    done = subprocess.run(
        ["bash", str(helper)],
        cwd=repo_root(),
        capture_output=True,
        text=True,
        check=False,
    )

    if done.returncode != 0:
        raise SystemExit(done.stderr.strip() or "local-path.sh failed")

    return Path(done.stdout.strip()) / LEDGER_NAME


def read_ledger(path: Path) -> dict[str, Stamp]:
    """Read the card. A missing card is an empty one."""
    stamps: dict[str, Stamp] = {}

    if not path.exists():
        return stamps

    for line in path.read_text(encoding="utf-8").splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue
        stamps[parts[0]] = Stamp(fingerprint=parts[1], stamped_on=parts[2])

    return stamps


def write_ledger(path: Path, stamps: dict[str, Stamp]) -> None:
    """Write the card in one step, so a reader never sees half of it."""
    lines = [
        f"{name}\t{stamp.fingerprint}\t{stamp.stamped_on}"
        for name, stamp in sorted(stamps.items())
    ]
    draft = path.with_suffix(".tsv.tmp")

    draft.write_text("\n".join(lines) + "\n", encoding="utf-8")
    os.replace(draft, path)


@contextmanager
def ledger_lock(path: Path) -> Iterator[None]:
    """Hold the card while it is rewritten: two worktrees share it."""
    lock = path.with_suffix(".lock")

    with lock.open("w", encoding="utf-8") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def is_skipped(path: str) -> bool:
    """Whether a file is left off the card: not code, or not written."""
    if path.endswith(SKIPPED_SUFFIXES):
        return True
    if path.rsplit("/", 1)[-1] in SKIPPED_NAMES:
        return True

    return path.startswith(SKIPPED_FOLDERS)


def is_test(path: str) -> bool:
    """Whether a file is a test or a story, counted apart from the code."""
    name = path.rsplit("/", 1)[-1]

    if path.startswith(TEST_FOLDERS) or "/__tests__/" in path:
        return True

    return path.endswith(TEST_ENDINGS) or name == "conftest.py"


def relative(raw: str) -> str:
    """Turn a path as typed, relative or full, into one from the root."""
    root = repo_root()
    full = Path(raw)

    if not full.is_absolute():
        full = Path.cwd() / full

    full = full.resolve()

    if full != root and root not in full.parents:
        raise SystemExit(
            f"{raw} is not inside this worktree ({root}).\n"
            "Run this from the worktree the file is in."
        )

    return "." if full == root else str(full.relative_to(root))


def files_under(path: str) -> list[str]:
    """Every file git knows of, or would add, at or beneath a path."""
    listed = git(
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        path,
    )
    root = repo_root()
    found = [
        name
        for name in listed.split("\0")
        if name and not is_skipped(name) and (root / name).is_file()
    ]

    return sorted(set(found))


def fingerprints(paths: list[str], *, keep: bool) -> dict[str, str]:
    """Git's fingerprint for the contents of each file, as it is on disk.

    With `keep`, git stores the contents too, so `diff` can show them
    later even when the file was stamped before it was committed.
    """
    if not paths:
        return {}

    args = ["hash-object", "--stdin-paths"]
    if keep:
        args.insert(1, "-w")

    hashes = git(*args, stdin="\n".join(paths) + "\n").split()

    if len(hashes) != len(paths):
        raise SystemExit("git gave back the wrong number of fingerprints")

    return {name: hashes[index] for index, name in enumerate(paths)}


def count_lines(path: str) -> int:
    """How many lines a file has."""
    data = (repo_root() / path).read_bytes()
    lines = data.count(b"\n")

    if data and not data.endswith(b"\n"):
        lines += 1

    return lines


def states_under(path: str, stamps: dict[str, Stamp]) -> list[FileState]:
    """Every file beneath a path, set against the card."""
    paths = files_under(path)
    current = fingerprints(paths, keep=False)
    states: list[FileState] = []

    for name in paths:
        stamp = stamps.get(name)

        if stamp is None:
            state = "unread"
        elif stamp.fingerprint == current[name]:
            state = "read"
        else:
            state = "changed"

        states.append(FileState(name, count_lines(name), state, stamp))

    return states


def command_mark(raw_paths: list[str]) -> int:
    """Stamp files, or every file in a folder, as read."""
    if not raw_paths:
        print("Give a file or a folder: just reviewed backend/app/deps.py")
        return 1

    paths: list[str] = []

    for raw in raw_paths:
        found = files_under(relative(raw))
        if not found:
            print(f"Nothing to stamp at {raw}", file=sys.stderr)
            return 1
        paths.extend(found)

    paths = sorted(set(paths))
    current = fingerprints(paths, keep=True)
    today = date.today().isoformat()
    card = ledger_path()

    with ledger_lock(card):
        stamps = read_ledger(card)
        for name in paths:
            stamps[name] = Stamp(fingerprint=current[name], stamped_on=today)
        write_ledger(card, stamps)

    total = sum(count_lines(name) for name in paths)
    noun = "file" if len(paths) == 1 else "files"
    print(f"Stamped {len(paths)} {noun}, {total:,} lines, as read.")

    # The running total straight after, so a stamp shows what it added.
    return command_status(None)


def command_unmark(raw_paths: list[str]) -> int:
    """Take the stamp off files, or off every file in a folder."""
    if not raw_paths:
        print("Give a file or a folder: just unreviewed backend/app/deps.py")
        return 1

    scopes = [relative(raw) for raw in raw_paths]
    card = ledger_path()

    with ledger_lock(card):
        stamps = read_ledger(card)

        # Matched against the card and not the disk, so a stamp can be
        # taken off a file that has since been deleted or renamed.
        gone = [
            name
            for name in stamps
            if any(
                scope == "." or name == scope or name.startswith(f"{scope}/")
                for scope in scopes
            )
        ]

        for name in gone:
            del stamps[name]

        if gone:
            write_ledger(card, stamps)

    if not gone:
        print("None of those had a stamp.")
        return 1

    noun = "file" if len(gone) == 1 else "files"
    print(f"Took the stamp off {len(gone)} {noun}.")

    return command_status(None)


def summary_line(label: str, states: list[FileState]) -> str:
    """One line of the headline: how much of a kind of file is read."""
    total = sum(item.lines for item in states)
    read = sum(item.lines for item in states if item.state == "read")
    files_read = sum(1 for item in states if item.state == "read")
    share = round(100 * read / total) if total else 0

    return (
        f"{label:<6} {read:>9,} of {total:>9,} lines read ({share}%)"
        f"   {files_read:,} of {len(states):,} files"
    )


def folder_of(path: str) -> str:
    """The folder a file is counted under in the summary."""
    parts = path.split("/")[:-1]

    if not parts:
        return "(top level)"

    return "/".join(parts[:SUMMARY_DEPTH])


def command_status(raw_path: str | None) -> int:
    """Say what is read, changed and unread."""
    full = raw_path in FULL_WORDS
    if full:
        raw_path = None

    stamps = read_ledger(ledger_path())
    scope = relative(raw_path) if raw_path else "."
    states = states_under(scope, stamps)

    if not states:
        print(f"No files to read at {raw_path or 'the repository root'}")
        return 1

    code = [item for item in states if not is_test(item.path)]
    tests = [item for item in states if is_test(item.path)]

    print(summary_line("Code", code))
    print(summary_line("Tests", tests))

    changed = [item for item in states if item.state == "changed"]

    if changed and not full and not raw_path:
        # The one thing the short form must not hide: a read file has
        # moved on. Counted here, listed by the full form.
        print(f"Changed since you read them: {len(changed)}")

    if not full and not raw_path:
        return 0

    if changed:
        print(f"\nChanged since you read them ({len(changed)}):")
        for item in changed:
            print(f"  {item.path}")

    if raw_path:
        print(f"\nEvery file in {scope}:")
        for item in states:
            print(f"  {item.state:<8}{item.lines:>7,}  {item.path}")

        return 0

    left: dict[str, int] = {}

    for item in states:
        if item.state != "read":
            folder = folder_of(item.path)
            left[folder] = left.get(folder, 0) + item.lines

    if left:
        width = max(len(folder) for folder in left)
        print("\nLines left to read, by folder:")
        for folder in sorted(left):
            print(f"  {folder:<{width}}  {left[folder]:>9,}")

    return 0


def command_states() -> int:
    """Print every file and its state, one to a line, for a program.

    Tab-separated: state, lines, the date it was stamped, the fingerprint
    it was stamped with, code or test, path. The date and the fingerprint
    are empty for an unread file.
    """
    stamps = read_ledger(ledger_path())

    for item in states_under(".", stamps):
        stamped_on = item.stamp.stamped_on if item.stamp else ""
        fingerprint = item.stamp.fingerprint if item.stamp else ""
        kind = "test" if is_test(item.path) else "code"
        print(
            f"{item.state}\t{item.lines}\t{stamped_on}\t{fingerprint}"
            f"\t{kind}\t{item.path}"
        )

    return 0


def command_diff(raw_path: str) -> int:
    """Show what changed in one file since it was stamped."""
    path = relative(raw_path)
    stamp = read_ledger(ledger_path()).get(path)

    if stamp is None:
        print(f"{path} has not been stamped, so there is nothing to compare.")
        return 1

    if not (repo_root() / path).is_file():
        print(f"{path} is no longer here.")
        return 1

    if fingerprints([path], keep=False)[path] == stamp.fingerprint:
        print(f"{path} has not changed since {stamp.stamped_on}.")
        return 0

    known = subprocess.run(
        ["git", "cat-file", "-e", stamp.fingerprint],
        cwd=repo_root(),
        capture_output=True,
        check=False,
    )

    if known.returncode != 0:
        print(
            f"Git no longer holds {path} as it was on {stamp.stamped_on}.\n"
            "Read the whole file, then stamp it again."
        )
        return 1

    # Exit 1 from `git diff` here means "there are differences".
    subprocess.run(
        ["git", "diff", stamp.fingerprint, "--", path],
        cwd=repo_root(),
        check=False,
    )

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)

    mark = commands.add_parser("mark", help="stamp files or folders as read")
    mark.add_argument("paths", nargs="*")

    unmark = commands.add_parser("unmark", help="take a stamp off again")
    unmark.add_argument("paths", nargs="*")

    status = commands.add_parser("status", help="what is read and unread")
    status.add_argument("path", nargs="?")

    commands.add_parser("states", help="every file's state, for a program")

    diff = commands.add_parser("diff", help="what changed since the stamp")
    diff.add_argument("path")

    args = parser.parse_args()

    if args.command == "mark":
        return command_mark(args.paths)
    if args.command == "unmark":
        return command_unmark(args.paths)
    if args.command == "status":
        return command_status(args.path)
    if args.command == "states":
        return command_states()

    return command_diff(args.path)


if __name__ == "__main__":
    sys.exit(main())
