#!/usr/bin/env python3
"""Drop merged branches from the local gh-stack record.

`gh stack sync --prune` deletes the *local branch* of a merged pull
request, which is the half that frees the name. It does not remove the
branch's entry from the stack, so a stack that has been landing units for
a few days draws more merged rows than live ones, and every one of them
has nothing left behind it — the branch is already gone.

Worse, those entries are not only noise. `gh stack rebase` walks the chain
from the bottom, and an entry whose branch cannot be checked out costs it
the base it should be rebasing onto: it falls back to replaying the
trunk's own history, which arrives as a long run of conflicts against
commits that merged days ago. That is the failure this script exists to
prevent, seen on 2026-09-18 replaying 58 commits.

So an entry is dropped only when both are true:

- its pull request is recorded as merged, and
- no local branch of that name exists any more.

An entry whose branch is still checked out is left alone even when the
pull request merged: the branch is still somebody's working copy, and
this is not the thing that deletes it.

Exit codes: 0 wrote a change or found nothing to do, 1 the record could
not be read.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def stack_file() -> Path | None:
    """Where gh-stack keeps this worktree's record, or None if absent.

    `--git-path` resolves per worktree, which matters here: each worktree
    has its own gh-stack file, and the one for the checkout this is run
    from is the only one it may touch.
    """
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--git-path", "gh-stack"],
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None
    path = Path(out)
    return path if path.is_file() else None


def branch_exists(name: str) -> bool:
    return (
        subprocess.run(
            ["git", "rev-parse", "--verify", "--quiet", name],
            capture_output=True,
        ).returncode
        == 0
    )


def main() -> int:
    path = stack_file()
    if path is None:
        # Not an error: a worktree with no stack has nothing to tidy, and
        # this runs unconditionally after a sync.
        return 0

    try:
        record = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(f"✗ Could not read the stack record: {exc}", file=sys.stderr)
        return 1

    stacks = record.get("stacks")
    if not isinstance(stacks, list):
        return 0

    dropped: list[str] = []
    for stack in stacks:
        branches = stack.get("branches")
        if not isinstance(branches, list):
            continue

        kept = []
        for entry in branches:
            name = str(entry.get("branch", ""))
            pull_request = entry.get("pullRequest") or {}
            merged = bool(pull_request.get("merged"))
            if name and merged and not branch_exists(name):
                dropped.append(name)
                continue
            kept.append(entry)

        # Re-chain what is left: the bottom sits on the trunk, and each
        # branch above on the one below. Without this a dropped entry
        # leaves the branch above it pointing at a commit that is no
        # longer named in the stack, which is the broken chain again by
        # another route.
        trunk = (stack.get("trunk") or {}).get("head")
        previous = trunk
        for entry in kept:
            if previous is not None:
                entry["base"] = previous
            previous = entry.get("head", previous)

        stack["branches"] = kept

    if not dropped:
        return 0

    path.write_text(json.dumps(record, indent=2))
    noun = "branch" if len(dropped) == 1 else "branches"
    print(f"  Forgot {len(dropped)} merged {noun}:")
    for name in dropped:
        print(f"      {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
