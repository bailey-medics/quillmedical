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
    # `--state open` and a small limit, deliberately. Asking for
    # statusCheckRollup across 60 pull requests makes one GraphQL query large
    # enough that GitHub answers HTTP 504, and the empty result then rendered
    # as "no pull request" against every branch — a wrong answer that looked
    # like an answer. A stack's branches are open by definition; a merged one
    # is reported by `isMerged` in the stack data itself.
    raw = run(
        [
            "gh",
            "pr",
            "list",
            "--state",
            "open",
            "--limit",
            "30",
            "--json",
            "number,headRefName,isDraft,state,statusCheckRollup,url",
        ],
        check=False,
    )
    if not raw.strip():
        # Say so rather than returning silently: every branch would otherwise
        # be labelled "no pull request", which is indistinguishable from the
        # truth and is how this went unnoticed for two runs.
        print(
            "  ⚠ Could not read pull requests from GitHub — "
            "showing the stack without them.",
            file=sys.stderr,
        )
        return {}
    try:
        pull_requests = json.loads(raw)
    except json.JSONDecodeError:
        print(
            "  ⚠ Unreadable response from `gh pr list` — "
            "showing the stack without pull requests.",
            file=sys.stderr,
        )
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


# The heavy tier: the jobs in ci.yml gated on `draft == false`, which a
# draft pull request skips and the merge queue runs regardless. Held as
# names because that is what statusCheckRollup reports; a job renamed in
# ci.yml has to be renamed here too, and the roll-up then shows it as fast
# rather than silently vanishing.
HEAVY_CHECKS = frozenset(
    {
        "Storybook interaction tests",
        "Semgrep (frontend SAST)",
        "E2E image build",
        "E2E (Playwright)",
        "Competency catalogue check",
        "DB migration immutability check",
    }
)

PASSING = frozenset({"SUCCESS", "SKIPPED", "NEUTRAL"})
FAILING = frozenset({"FAILURE", "ERROR", "TIMED_OUT", "CANCELLED"})
PENDING = frozenset({"QUEUED", "IN_PROGRESS", "PENDING", "WAITING"})


def best_conclusion_per_check(
    rollup: list[object],
) -> dict[str, tuple[str, str]]:
    """Reduce the roll-up to one status and conclusion per check name.

    A check name appears more than once: the run fired while the pull
    request was a draft skips the heavy tier, and a later run does it, so
    the same name carries both SKIPPED and SUCCESS. Taking the last, or the
    worst, would report every heavy job as skipped forever. The best
    outcome per name is the true one — a job that has succeeded once on
    this head has succeeded.
    """
    # Ranked so the most important outcome for the same name wins, which is
    # not the same as the best one:
    #
    # - **failing** beats everything. A job that failed on this head has
    #   failed, whatever a sibling entry says.
    # - **pending** beats both finished states. A name with a run still in
    #   flight is not settled, and reporting it as passed — which ranking
    #   pending below passing did — showed a tick while the heavy tier was
    #   visibly still running.
    # - **passing** beats **skipped**, because a job that actually ran and
    #   passed is the truer account of the same name than the draft run
    #   that skipped it. Ranking those two equal reported every heavy job
    #   as skipped even after it had run.
    rank = {
        "skipped": 0,
        "passing": 1,
        "pending": 2,
        "failing": 3,
    }
    best: dict[str, tuple[str, str]] = {}

    for check in rollup:
        if not isinstance(check, dict):
            continue
        name = str(check.get("name") or check.get("context") or "")
        if not name:
            continue
        status = str(check.get("status") or "")
        conclusion = str(check.get("conclusion") or check.get("state") or "")

        if status in PENDING:
            kind = "pending"
        elif conclusion == "SKIPPED":
            kind = "skipped"
        elif conclusion in PASSING:
            kind = "passing"
        elif conclusion in FAILING:
            kind = "failing"
        else:
            kind = "pending"

        previous = best.get(name)
        if previous is None or rank[kind] > rank[previous[0]]:
            best[name] = (kind, conclusion)

    return best


def summarise_checks(pr: dict[str, object], palette: Palette) -> str:
    """Report the fast and heavy tiers separately, as two marks.

    Two marks rather than one count, because they answer different
    questions. The fast tier runs on every push and says whether the code
    compiles and its tests pass. The heavy tier — Storybook, Semgrep, E2E
    — is gated on the pull request not being a draft, so on a stack it is
    usually not run at all, and one combined tick would hide that.
    """
    rollup = pr.get("statusCheckRollup") or []
    if not isinstance(rollup, list) or not rollup:
        return palette.dim("no checks")

    best = best_conclusion_per_check(rollup)

    def mark(names: dict[str, tuple[str, str]]) -> str:
        if not names:
            # No heavy check has reported at all: the ordinary state of a
            # draft pull request, and not a failure — hence green, like the
            # tick, rather than dim. Nothing is wrong; nothing has run.
            return palette.green("–")
        kinds = {kind for kind, _ in names.values()}
        if "failing" in kinds:
            return palette.red("✗")
        if "pending" in kinds:
            # Green like the tick and the dash: a tier still running is not
            # a problem, and only ✗ should draw the eye.
            return palette.green("●")
        # Every job skipped means the tier has not run — the ordinary state
        # of a draft's heavy tier. Say so rather than showing a tick nobody
        # earned. One job having actually run is enough to call it a pass,
        # since the rest skipped on their own conditions.
        if kinds == {"skipped"}:
            return palette.green("–")
        return palette.green("✓")

    heavy = {n: v for n, v in best.items() if n in HEAVY_CHECKS}
    fast = {n: v for n, v in best.items() if n not in HEAVY_CHECKS}

    # Fast tier first, heavy second, always in that order and unlabelled:
    # two marks in a fixed position are read at a glance, where the words
    # only made the line longer.
    return f"{mark(fast)} {mark(heavy)}"


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
    parser.add_argument(
        "--colour",
        action="store_true",
        help="force ANSI colour even when stdout is not a terminal",
    )
    args = parser.parse_args()

    # `--colour` forces it on for a caller that captures the output and
    # prints it itself — `just stack-watch` does exactly that, to fetch the
    # new stack before clearing the screen rather than after. Without it the
    # capture looks like a pipe and the colour is dropped.
    coloured = args.colour or sys.stdout.isatty()
    palette = Palette(coloured and not args.no_colour)

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
