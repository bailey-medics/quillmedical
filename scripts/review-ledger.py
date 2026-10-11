#!/usr/bin/env python3
"""Keep an audit card of the code, and notice when an audited file changes.

Auditing a file and remembering that it was audited are two jobs, and the
second is the one that goes wrong: a file audited in September and edited
in October is no longer the file that was audited. So the card holds, for each
file, the fingerprint git gives its contents. A file whose contents still
match is **audited**; one whose contents have moved on is **changed**; one
with no line on the card is **unaudited**.

A stamp also says who made it, taken from the name and email git is
set up with. Several people may stamp the same file, each on a line of
their own, and a file counts as audited when anybody's stamp matches what
it holds now.

The commands:

- `mark <paths>` stamps files, or every file in a folder, as audited by
  you.
- `unmark <paths>` takes your stamp off again, for a file stamped by
  mistake. Nobody else's stamp is touched.
- `adopt` puts your name on stamps that have none, which are the ones
  made before stamps carried a name.
- `status` says how much is audited, in two lines. `status f` (or `full`)
  adds the files changed since their audit and the lines left in each
  folder; `status <path>` lists that folder file by file.
- `states` prints every file and its state, one to a line, for a
  program to read.
- `verify` checks every stamp names a version of its file that was
  committed. It is what CI runs.
- `diff <path>` shows what changed in a file since it was stamped, so a
  changed file is caught up on by auditing the change and not the file.

The card is one tab-separated file, `audit/ledger.tsv`, tracked in the
repository. Each line holds the path, the fingerprint, the date, and the
auditor's name and email. A stamp is a change like any other: it is made
in a worktree, committed on a branch and reaches everybody when that
branch merges, so anybody may audit and git's history says who added
what. Paths on it are relative to the repository root. `.gitattributes`
merges the card by keeping both sides' lines, so two people stamping at
once do not conflict.
"""

from __future__ import annotations

import argparse
import fcntl
import os
import re
import subprocess
import sys
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date
from pathlib import Path

LEDGER_PATH = "audit/ledger.tsv"

#: What git gives a file's contents: forty characters of hexadecimal.
FINGERPRINT = re.compile(r"[0-9a-f]{40}")

# Files that are not audited as code: pictures and sounds, lock files, and
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
    "audit/",
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
    """One line of the card: what a file's contents were, when, and who
    audited them.

    The name and email are empty on a stamp made before stamps carried
    them.
    """

    fingerprint: str
    stamped_on: str
    reviewer: str = ""
    email: str = ""

    @property
    def who(self) -> str:
        """What tells one reviewer from another: the email, or the name
        where there is no email. Empty for a stamp with neither."""
        return (self.email or self.reviewer).lower()


@dataclass(frozen=True)
class Reviewer:
    """Whoever is running this, as git knows them."""

    name: str
    email: str

    @property
    def who(self) -> str:
        return (self.email or self.name).lower()


@dataclass(frozen=True)
class FileState:
    """One file as it is now, set against its line on the card."""

    path: str
    lines: int
    state: str  # "audited", "changed" or "unaudited"
    stamp: Stamp | None = None
    # Who has audited this version, or for a changed file an earlier one.
    readers: tuple[str, ...] = ()


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
    """Where the card is: `audit/ledger.tsv`, in the repository.

    It is a tracked file, so a stamp is a change like any other. It is
    seen in the worktree it was made in, travels with its branch, and
    reaches everybody when that branch merges. Git's history is the
    record of who added each stamp, and the way back from a bad write.
    """
    return repo_root() / LEDGER_PATH


def lock_path() -> Path:
    """A file to hold while the card is rewritten, inside git's own
    folder so it is never something to commit."""
    done = subprocess.run(
        ["git", "rev-parse", "--git-path", "review-ledger.lock"],
        cwd=repo_root(),
        capture_output=True,
        text=True,
        check=True,
    )

    return (repo_root() / done.stdout.strip()).resolve()


def current_reviewer() -> Reviewer:
    """Who is stamping: the name and email git is set up with."""
    name = git_setting("user.name")
    email = git_setting("user.email")

    if not name:
        raise SystemExit(
            "Git has no name for you, so a stamp could not say who made "
            'it.\nSet one with: git config --global user.name "Your Name"'
        )

    return Reviewer(name=name, email=email)


def git_setting(key: str) -> str:
    """One git setting, or an empty string when it is not set."""
    done = subprocess.run(
        ["git", "config", "--get", key],
        cwd=repo_root(),
        capture_output=True,
        text=True,
        check=False,
    )

    # A tab or a line break in a name would break the card's columns.
    return " ".join(done.stdout.split())


Card = dict[str, list[Stamp]]


def read_ledger(path: Path) -> Card:
    """Read the card: for each file, every stamp on it.

    A missing card is an empty one. A line with three columns is from
    before stamps carried a name, and is read as a stamp with none.

    A line of any other shape stops the run. It means the card was
    written by a newer version of this script than the one reading it,
    and every command that stamps writes the whole card back: a line
    skipped here would be a line deleted there. That happened on 11
    October 2026, when a version from before stamps carried a name read
    a card full of named stamps, understood none, and wrote back the one
    stamp it had just made.
    """
    card: Card = {}

    if not path.exists():
        return card

    for number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue

        parts = line.split("\t")
        if len(parts) not in (3, 5):
            raise SystemExit(
                f"Line {number} of {path} is not one this version of "
                "review-ledger.py can read, so the card was written by a "
                "newer one. Nothing has been changed. Bring this "
                "worktree up to date with main and try again."
            )

        named = len(parts) == 5
        card.setdefault(parts[0], []).append(
            Stamp(
                fingerprint=parts[1],
                stamped_on=parts[2],
                reviewer=parts[3] if named else "",
                email=parts[4] if named else "",
            )
        )

    return card


def write_ledger(path: Path, card: Card) -> None:
    """Write the card in one step, so a reader never sees half of it."""
    lines = [
        f"{name}\t{stamp.fingerprint}\t{stamp.stamped_on}"
        f"\t{stamp.reviewer}\t{stamp.email}"
        for name in sorted(card)
        for stamp in sorted(card[name], key=lambda held: held.who)
    ]
    draft = path.with_suffix(".tsv.tmp")
    body = "\n".join(lines) + "\n" if lines else ""

    path.parent.mkdir(parents=True, exist_ok=True)
    draft.write_text(body, encoding="utf-8")
    os.replace(draft, path)


@contextmanager
def ledger_lock() -> Iterator[None]:
    """Hold the card while it is rewritten, so two commands at once in
    one worktree cannot each write over the other."""
    lock = lock_path()

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


def names_of(stamps: list[Stamp]) -> tuple[str, ...]:
    """The reviewers behind some stamps, each once, in name order."""
    return tuple(sorted({held.reviewer for held in stamps if held.reviewer}))


def states_under(path: str, card: Card) -> list[FileState]:
    """Every file beneath a path, set against the card.

    A file is audited when anybody's stamp matches what it holds now. The
    stamp reported is the newest of those that match, or for a changed
    file the newest there is, which is the one to compare against.
    """
    paths = files_under(path)
    current = fingerprints(paths, keep=False)
    states: list[FileState] = []

    for name in paths:
        held = card.get(name, [])
        matching = [
            stamp for stamp in held if stamp.fingerprint == current[name]
        ]

        if not held:
            states.append(FileState(name, count_lines(name), "unaudited"))
            continue

        state = "audited" if matching else "changed"
        counted = matching or held
        newest = max(counted, key=lambda stamp: stamp.stamped_on)

        states.append(
            FileState(
                name, count_lines(name), state, newest, names_of(counted)
            )
        )

    return states


def command_mark(raw_paths: list[str]) -> int:
    """Stamp files, or every file in a folder, as audited by you."""
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

    me = current_reviewer()

    with ledger_lock():
        stamps = read_ledger(card)

        for name in paths:
            # Mine replaces the one I made before, and one with no name
            # on it. Anybody else's stays.
            others = [
                held
                for held in stamps.get(name, [])
                if held.who and held.who != me.who
            ]
            stamps[name] = others + [
                Stamp(
                    fingerprint=current[name],
                    stamped_on=today,
                    reviewer=me.name,
                    email=me.email,
                )
            ]

        write_ledger(card, stamps)

    total = sum(count_lines(name) for name in paths)
    noun = "file" if len(paths) == 1 else "files"
    print(
        f"Stamped {len(paths)} {noun}, {total:,} lines, as audited "
        f"by {me.name}."
    )

    # The running total straight after, so a stamp shows what it added.
    return command_status(None)


def command_unmark(raw_paths: list[str]) -> int:
    """Take your stamp off files, or off every file in a folder.

    Only yours, and any with no name on it. A stamp is one person saying
    they audited something, so nobody else can take it back for them.
    """
    if not raw_paths:
        print("Give a file or a folder: just unreviewed backend/app/deps.py")
        return 1

    scopes = [relative(raw) for raw in raw_paths]
    card = ledger_path()
    me = current_reviewer()
    gone = 0
    kept_for_others = 0

    with ledger_lock():
        stamps = read_ledger(card)

        # Matched against the card and not the disk, so a stamp can be
        # taken off a file that has since been deleted or renamed.
        named = [
            name
            for name in stamps
            if any(
                scope == "." or name == scope or name.startswith(f"{scope}/")
                for scope in scopes
            )
        ]

        for name in named:
            others = [
                held
                for held in stamps[name]
                if held.who and held.who != me.who
            ]

            if len(others) == len(stamps[name]):
                kept_for_others += 1
                continue

            gone += 1
            if others:
                stamps[name] = others
            else:
                del stamps[name]

        if gone:
            write_ledger(card, stamps)

    if not gone:
        if kept_for_others:
            print("None of those had a stamp of yours.")
        else:
            print("None of those had a stamp.")
        return 1

    noun = "file" if gone == 1 else "files"
    print(f"Took your stamp off {gone} {noun}.")

    return command_status(None)


def command_adopt() -> int:
    """Put your name on every stamp that has none.

    For the stamps made before stamps carried a name. Run once, by the
    person who made them. Where you have since stamped the same file
    again, the nameless stamp is simply dropped: yours already says it.
    """
    card = ledger_path()
    me = current_reviewer()
    adopted = 0

    with ledger_lock():
        stamps = read_ledger(card)

        for name, held in stamps.items():
            nameless = [stamp for stamp in held if not stamp.who]

            if not nameless:
                continue

            adopted += 1
            named = [stamp for stamp in held if stamp.who]

            if any(stamp.who == me.who for stamp in named):
                stamps[name] = named
                continue

            newest = max(nameless, key=lambda stamp: stamp.stamped_on)
            stamps[name] = named + [
                Stamp(
                    fingerprint=newest.fingerprint,
                    stamped_on=newest.stamped_on,
                    reviewer=me.name,
                    email=me.email,
                )
            ]

        if adopted:
            write_ledger(card, stamps)

    if not adopted:
        print("Every stamp already has a name on it.")
        return 0

    noun = "stamp" if adopted == 1 else "stamps"
    print(f"Put the name {me.name} on {adopted} {noun} that had none.")

    return 0


def summary_line(label: str, states: list[FileState]) -> str:
    """One line of the headline: how much of a kind of file is audited."""
    total = sum(item.lines for item in states)
    audited = sum(item.lines for item in states if item.state == "audited")
    files_audited = sum(1 for item in states if item.state == "audited")
    share = round(100 * audited / total) if total else 0

    return (
        f"{label:<6} {audited:>9,} of {total:>9,} lines audited ({share}%)"
        f"   {files_audited:,} of {len(states):,} files"
    )


def folder_of(path: str) -> str:
    """The folder a file is counted under in the summary."""
    parts = path.split("/")[:-1]

    if not parts:
        return "(top level)"

    return "/".join(parts[:SUMMARY_DEPTH])


def command_status(raw_path: str | None) -> int:
    """Say what is audited, changed and unaudited."""
    full = raw_path in FULL_WORDS
    if full:
        raw_path = None

    stamps = read_ledger(ledger_path())
    scope = relative(raw_path) if raw_path else "."
    states = states_under(scope, stamps)

    if not states:
        print(f"No files to audit at {raw_path or 'the repository root'}")
        return 1

    code = [item for item in states if not is_test(item.path)]
    tests = [item for item in states if is_test(item.path)]

    print(summary_line("Code", code))
    print(summary_line("Tests", tests))

    changed = [item for item in states if item.state == "changed"]

    if changed and not full and not raw_path:
        # The one thing the short form must not hide: an audited file has
        # moved on. Counted here, listed by the full form.
        print(f"Changed since their audit: {len(changed)}")

    if not full and not raw_path:
        return 0

    if changed:
        print(f"\nChanged since their audit ({len(changed)}):")
        for item in changed:
            print(f"  {item.path}")

    if raw_path:
        print(f"\nEvery file in {scope}:")
        for item in states:
            by = f"  ({', '.join(item.readers)})" if item.readers else ""
            print(f"  {item.state:<10}{item.lines:>7,}  {item.path}{by}")

        return 0

    left: dict[str, int] = {}

    for item in states:
        if item.state != "audited":
            folder = folder_of(item.path)
            left[folder] = left.get(folder, 0) + item.lines

    if left:
        width = max(len(folder) for folder in left)
        print("\nLines left to audit, by folder:")
        for folder in sorted(left):
            print(f"  {folder:<{width}}  {left[folder]:>9,}")

    return 0


def command_states() -> int:
    """Print every file and its state, one to a line, for a program.

    Tab-separated: state, lines, the date it was stamped, the fingerprint
    it was stamped with, code or test, who audited it, path. The date, the
    fingerprint and the names are empty for an unaudited file. The names are
    of everybody whose stamp matches the file now, or for a changed file
    of everybody who audited an earlier version, with ", " between them.
    """
    stamps = read_ledger(ledger_path())

    for item in states_under(".", stamps):
        stamped_on = item.stamp.stamped_on if item.stamp else ""
        fingerprint = item.stamp.fingerprint if item.stamp else ""
        kind = "test" if is_test(item.path) else "code"
        readers = ", ".join(item.readers)
        print(
            f"{item.state}\t{item.lines}\t{stamped_on}\t{fingerprint}"
            f"\t{kind}\t{readers}\t{item.path}"
        )

    return 0


def command_diff(raw_path: str) -> int:
    """Show what changed in one file since it was stamped."""
    path = relative(raw_path)
    held = read_ledger(ledger_path()).get(path, [])

    if not held:
        print(f"{path} has not been stamped, so there is nothing to compare.")
        return 1

    # What changed since I audited it, where I have: otherwise since
    # whoever audited it last.
    me = git_setting("user.email") or git_setting("user.name")
    mine = [stamp for stamp in held if stamp.who == me.lower()]
    stamp = max(mine or held, key=lambda found: found.stamped_on)

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
            "Audit the whole file, then stamp it again."
        )
        return 1

    # Exit 1 from `git diff` here means "there are differences".
    subprocess.run(
        ["git", "diff", stamp.fingerprint, "--", path],
        cwd=repo_root(),
        check=False,
    )

    return 0


def versions_of(path: str) -> set[str]:
    """Every fingerprint a path has had in the history of this branch."""
    done = subprocess.run(
        ["git", "log", "--format=", "--raw", "--no-abbrev", "--", path],
        cwd=repo_root(),
        capture_output=True,
        text=True,
        check=True,
    )
    found: set[str] = set()

    for line in done.stdout.splitlines():
        # ":100644 100644 <before> <after> M\tpath"
        parts = line.split()

        if line.startswith(":") and len(parts) >= 4:
            found.update(parts[2:4])

    return found


def command_verify() -> int:
    """Check every stamp on the card is a stamp, for CI.

    The card is a text file that anybody can edit, and its merge keeps
    both sides' lines without looking at them. So each line must name a
    file this card covers that the branch has held, carry a date and a
    name, and hold something shaped like a fingerprint.

    A fingerprint the file never had in a commit is said, and does not
    fail. It comes about honestly, from stamping a file and then
    editing it before committing, and it costs nothing: such a stamp
    matches no version anybody can check out, so the file reads as
    changed and is audited again. This check cannot tell a real audit
    from a line typed in with the right fingerprint, and does not
    pretend to. Git's history says who added each line.

    Needs the whole history, so the job checks out with fetch-depth: 0.
    """
    card = read_ledger(ledger_path())
    faults: list[str] = []
    never_committed: list[str] = []
    stamps = 0

    for path in sorted(card):
        had = versions_of(path)

        for stamp in card[path]:
            stamps += 1

            if is_skipped(path):
                faults.append(f"{path}: this file is left off the card")
            elif not had:
                faults.append(f"{path}: no such file in this branch's history")
            elif not FINGERPRINT.fullmatch(stamp.fingerprint):
                faults.append(
                    f"{path}: '{stamp.fingerprint}' is not a fingerprint"
                )
            elif stamp.fingerprint not in had:
                never_committed.append(path)

            if not stamp.reviewer:
                faults.append(f"{path}: a stamp with no name on it")

            try:
                date.fromisoformat(stamp.stamped_on)
            except ValueError:
                faults.append(f"{path}: '{stamp.stamped_on}' is not a date")

    for path in never_committed:
        print(
            f"{path}: stamped at a version that was never committed, so "
            "it reads as changed until it is stamped again"
        )

    if faults:
        for fault in faults:
            print(fault)
        print(
            f"\n{len(faults)} of {stamps} stamps do not hold up. Take "
            "the line off with `just ur <path>` and stamp the file again "
            "with `just r <path>`. Never edit the card by hand."
        )

        return 1

    print(f"All {stamps} stamps hold up.")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    commands = parser.add_subparsers(dest="command", required=True)

    mark = commands.add_parser(
        "mark", help="stamp files or folders as audited"
    )
    mark.add_argument("paths", nargs="*")

    unmark = commands.add_parser("unmark", help="take your stamp off again")
    unmark.add_argument("paths", nargs="*")

    commands.add_parser("adopt", help="put your name on stamps with none")

    status = commands.add_parser(
        "status", help="what is audited and what is not"
    )
    status.add_argument("path", nargs="?")

    commands.add_parser("states", help="every file's state, for a program")

    diff = commands.add_parser("diff", help="what changed since the stamp")
    diff.add_argument("path")

    commands.add_parser(
        "verify", help="check every stamp names a committed version"
    )

    args = parser.parse_args()

    if args.command == "mark":
        return command_mark(args.paths)
    if args.command == "unmark":
        return command_unmark(args.paths)
    if args.command == "adopt":
        return command_adopt()
    if args.command == "status":
        return command_status(args.path)
    if args.command == "states":
        return command_states()
    if args.command == "verify":
        return command_verify()

    return command_diff(args.path)


if __name__ == "__main__":
    sys.exit(main())
