#!/usr/bin/env python3
"""Draw the current gh-stack stack, with worktree and pull request state.

`gh stack view` already draws a chain of branches. This adds the two things
it cannot know, both of which matter in this repository:

- **Which branches are checked out in another worktree.** `gh stack rebase`
  prints an error for such a branch, skips it, and still exits 0 — see
  github/gh-stack#35, reproduced here on 2026-09-14. A stack operation that
  half-runs is the same silent-success failure class as the stale-worktree
  test runs in CLAUDE.md, so the branches are named before anything runs.
- **The pull request and its checks** (`--prs` only). One `gh pr list` call
  joined onto the stack, so "is this one green yet" does not mean opening a
  browser.

Exit codes: 0 drew the stack, 1 no stack here, 2 a branch is checked out in
another worktree (`--check` only, so `just str` can refuse).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

# Box-drawing and status glyphs. Kept together so the drawing below reads as
# layout rather than punctuation.
GLYPH_MERGED = "✓"
GLYPH_QUEUED = "◎"
GLYPH_CURRENT = "●"
GLYPH_OPEN = "○"
GLYPH_WARN = "⚠"
PIPE = "│"
ELBOW = "└"


# ANSI colours, blanked when stdout is not a terminal so piped output stays
# plain. `--no-colour` forces the same.
class Palette:
    def __init__(self, enabled: bool) -> None:
        self.enabled = enabled

    def _wrap(self, code: str, text: str) -> str:
        return f"\033[{code}m{text}\033[0m" if self.enabled else text

    def dim(self, text: str) -> str:
        return self._wrap("2", text)

    def bold(self, text: str) -> str:
        return self._wrap("1", text)

    def green(self, text: str) -> str:
        return self._wrap("32", text)

    def red(self, text: str) -> str:
        return self._wrap("31", text)

    def yellow(self, text: str) -> str:
        return self._wrap("33", text)

    def blue(self, text: str) -> str:
        return self._wrap("34", text)


@dataclass
class Branch:
    """One layer of the stack, with everything joined onto it."""

    name: str
    is_current: bool
    is_merged: bool
    is_queued: bool
    needs_rebase: bool
    worktree: str | None = None
    pr: dict[str, object] = field(default_factory=dict)


def run(cmd: list[str], *, check: bool = True) -> str:
    """Run a command and return its stdout, or "" when it fails and may."""
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=30
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        if check:
            print(f"✗ {cmd[0]} failed: {exc}", file=sys.stderr)
            raise SystemExit(1) from exc
        return ""
    if result.returncode != 0 and check:
        # gh prints its own diagnostics; passing them through is more use
        # than restating them.
        sys.stderr.write(result.stderr)
        raise SystemExit(1)
    return result.stdout if result.returncode == 0 else ""


def read_stack() -> dict[str, object] | None:
    """Parse `gh stack view --json`, or None when this branch has no stack.

    `gh stack view` exits 0 and prints a human message to stdout when the
    branch is not stacked, so the JSON parse is what distinguishes the two
    cases rather than the exit code.
    """
    raw = run(["gh", "stack", "view", "--json"], check=False)
    if not raw.strip():
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) and data.get("branches") else None


def stack_entries(stack: dict[str, object]) -> list[dict[str, object]]:
    """Return the branch entries from parsed stack JSON, typed.

    `stack` holds `object` values because it came from `json.loads`, so
    iterating `stack["branches"]` directly does not type-check. Narrowing it
    once here keeps the two call sites free of repeated isinstance noise.
    """
    raw = stack.get("branches")
    if not isinstance(raw, list):
        return []
    return [entry for entry in raw if isinstance(entry, dict)]


def read_worktrees() -> dict[str, str]:
    """Map branch name to the worktree checking it out, excluding this one.

    Only branches held by *another* worktree matter: a branch checked out
    here is the ordinary case and blocks nothing.
    """
    porcelain = run(["git", "worktree", "list", "--porcelain"], check=False)
    here = Path.cwd().resolve()
    occupied: dict[str, str] = {}
    path: Path | None = None

    for line in porcelain.splitlines():
        if line.startswith("worktree "):
            path = Path(line.split(" ", 1)[1]).resolve()
        elif line.startswith("branch ") and path is not None:
            branch = line.split(" ", 1)[1].removeprefix("refs/heads/")
            if path != here:
                occupied[branch] = path.name

    return occupied


def read_pull_requests(branches: list[str]) -> dict[str, dict[str, object]]:
    """Join open and recently merged pull requests onto the stack branches.

    One `gh pr list` call rather than one `gh pr view` per branch: a
    six-deep stack would otherwise be six round trips. Checks come back in
    the same response via statusCheckRollup.
    """
    raw = run(
        [
            "gh",
            "pr",
            "list",
            "--state",
            "all",
            "--limit",
            "60",
            "--json",
            "number,headRefName,isDraft,state,statusCheckRollup,url",
        ],
        check=False,
    )
    if not raw.strip():
        return {}
    try:
        pull_requests = json.loads(raw)
    except json.JSONDecodeError:
        return {}

    wanted = set(branches)
    found: dict[str, dict[str, object]] = {}
    for pr in pull_requests:
        head = pr.get("headRefName")
        # First match wins: `gh pr list` returns newest first, so a branch
        # reused across pull requests shows its current one.
        if head in wanted and head not in found:
            found[head] = pr
    return found


def summarise_checks(pr: dict[str, object], palette: Palette) -> str:
    """Condense statusCheckRollup into one short cell."""
    rollup = pr.get("statusCheckRollup") or []
    if not isinstance(rollup, list) or not rollup:
        return palette.dim("no checks")

    passed = failed = running = 0
    for check in rollup:
        if not isinstance(check, dict):
            continue
        status = check.get("status")
        # A CheckRun reports status/conclusion; a StatusContext reports
        # state. SKIPPED and NEUTRAL are not failures.
        conclusion = check.get("conclusion") or check.get("state") or ""
        if status in {"QUEUED", "IN_PROGRESS", "PENDING", "WAITING"}:
            running += 1
        elif conclusion in {"SUCCESS", "SKIPPED", "NEUTRAL"}:
            passed += 1
        elif conclusion in {"FAILURE", "ERROR", "TIMED_OUT", "CANCELLED"}:
            failed += 1
        else:
            running += 1

    total = passed + failed + running
    if failed:
        return palette.red(f"✗ {failed} failed")
    if running:
        return palette.yellow(f"● {running} running")
    return palette.green(f"✓ {passed}/{total}")


def build_branches(
    stack: dict[str, object],
    occupied: dict[str, str],
    pull_requests: dict[str, dict[str, object]],
) -> list[Branch]:
    """Assemble the branch list, top of stack first."""
    branches = [
        Branch(
            name=str(entry.get("name", "")),
            is_current=bool(entry.get("isCurrent")),
            is_merged=bool(entry.get("isMerged")),
            is_queued=bool(entry.get("isQueued")),
            needs_rebase=bool(entry.get("needsRebase")),
            worktree=occupied.get(str(entry.get("name", ""))),
            pr=pull_requests.get(str(entry.get("name", "")), {}),
        )
        for entry in stack_entries(stack)
    ]
    # gh reports bottom-to-top; drawn top-down so the trunk sits at the
    # foot, matching `gh stack view` and how a stack is talked about.
    branches.reverse()
    return branches


def draw(
    branches: list[Branch],
    trunk: str,
    palette: Palette,
    show_prs: bool,
) -> None:
    """Print the stack."""
    print()
    for branch in branches:
        if branch.is_merged:
            glyph = palette.green(GLYPH_MERGED)
        elif branch.is_queued:
            glyph = palette.blue(GLYPH_QUEUED)
        elif branch.is_current:
            glyph = palette.bold(GLYPH_CURRENT)
        else:
            glyph = GLYPH_OPEN

        name = palette.bold(branch.name) if branch.is_current else branch.name

        cells: list[str] = []
        if show_prs and branch.pr:
            number = branch.pr.get("number")
            state = str(branch.pr.get("state", ""))
            if state == "MERGED":
                cells.append(palette.green(f"#{number} merged"))
            elif state == "CLOSED":
                cells.append(palette.red(f"#{number} closed"))
            elif branch.pr.get("isDraft"):
                cells.append(palette.dim(f"#{number} draft"))
            else:
                cells.append(f"#{number} ready")
            cells.append(summarise_checks(branch.pr, palette))
        elif show_prs:
            cells.append(palette.dim("no pull request"))

        if branch.is_merged and not show_prs:
            cells.append(palette.green("merged"))

        suffix = "   ".join(cells)
        line = f"  {glyph} {name}"
        if suffix:
            line = f"{line}   {suffix}"
        if branch.is_current:
            line = f"{line}   {palette.dim('← you are here')}"
        print(line)

        notes: list[str] = []
        if branch.needs_rebase:
            notes.append(palette.yellow(f"{GLYPH_WARN} needs rebase"))
        if branch.worktree:
            held = f"{GLYPH_WARN} checked out in {branch.worktree}"
            notes.append(palette.yellow(held))
        for note in notes:
            print(f"  {PIPE}   {note}")
        print(f"  {PIPE}")

    print(f"  {ELBOW}─ {palette.dim(trunk)}")
    print()


def draw_files(
    stack: dict[str, object],
    occupied: dict[str, str],
    palette: Palette,
    patch: bool,
) -> None:
    """List what each branch changes, against its own parent.

    The parent, not the trunk: that is what makes a stack reviewable. A
    branch three layers up diffed against `main` replays everything below
    it, while diffed against its parent it shows only the unit it adds.
    `base` in the stack JSON is the parent commit, so it is exactly the
    left-hand side wanted here.
    """
    entries = stack_entries(stack)
    print()
    for entry in entries:
        name = str(entry.get("name", ""))
        base = str(entry.get("base", ""))
        if not name or not base:
            continue

        marker = GLYPH_CURRENT if entry.get("isCurrent") else GLYPH_OPEN
        heading = palette.bold(name) if entry.get("isCurrent") else name
        print(f"  {marker} {heading}")

        held = occupied.get(name)
        if held:
            note = f"{GLYPH_WARN} checked out in {held}"
            print(f"      {palette.yellow(note)}")

        # --stat for the summary, or the full patch when asked. Both are
        # plain git, so the output is what any other review tool shows.
        args = ["git", "diff", "--stat" if not patch else "--patch"]
        body = run([*args, f"{base}..{name}"], check=False)
        text = body.rstrip("\n")
        if not text:
            print(f"      {palette.dim('no changes')}")
        else:
            for line in text.split("\n"):
                print(f"      {line}")
        print()

    print(f"  {ELBOW}─ {palette.dim(str(stack.get('trunk', 'main')))}")
    print()


def report_blockers(branches: list[Branch], palette: Palette) -> bool:
    """Name branches held by another worktree. True when any were found."""
    blocked = [b for b in branches if b.worktree]
    if not blocked:
        return False

    count = len(blocked)
    noun = "branch is" if count == 1 else "branches are"
    print(
        palette.yellow(
            f"  {GLYPH_WARN} {count} stack {noun} checked out in another "
            "worktree:"
        ),
        file=sys.stderr,
    )
    for branch in blocked:
        print(f"      {branch.name} → {branch.worktree}", file=sys.stderr)
    print(file=sys.stderr)
    print(
        "    gh stack rebase prints an error for these, skips them, and\n"
        "    still exits 0 (github/gh-stack#35), leaving the stack\n"
        "    inconsistent. A stack lives in one worktree here.",
        file=sys.stderr,
    )
    print(file=sys.stderr)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Draw the current stack with worktree and PR state."
    )
    parser.add_argument(
        "--prs",
        action="store_true",
        help="join pull request and CI state from GitHub (one network call)",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit 2 if a stack branch is checked out in another worktree",
    )
    parser.add_argument(
        "--files",
        action="store_true",
        help="list what each branch changes against its own parent",
    )
    parser.add_argument(
        "--patch",
        action="store_true",
        help="with --files, show the full diff rather than a summary",
    )
    parser.add_argument(
        "--no-colour", action="store_true", help="disable ANSI colour"
    )
    args = parser.parse_args()

    palette = Palette(sys.stdout.isatty() and not args.no_colour)

    stack = read_stack()
    if stack is None:
        print(
            "  No stack on this branch.\n"
            "    start one:      gh stack init <branch>\n"
            "    or check one out: gh stack checkout",
            file=sys.stderr,
        )
        return 1

    occupied = read_worktrees()
    branch_names = [
        str(entry.get("name", "")) for entry in stack_entries(stack)
    ]
    pull_requests = read_pull_requests(branch_names) if args.prs else {}
    branches = build_branches(stack, occupied, pull_requests)
    trunk = str(stack.get("trunk", "main"))

    if args.files:
        draw_files(stack, occupied, palette, patch=args.patch)
    elif not args.check:
        draw(branches, trunk, palette, show_prs=args.prs)
        # The drawing goes to stdout and the warning to stderr; flushing
        # between them keeps the warning under the stack it refers to
        # rather than above it when both land on a terminal.
        sys.stdout.flush()

    blocked = report_blockers(branches, palette)
    return 2 if (blocked and args.check) else 0


if __name__ == "__main__":
    sys.exit(main())
