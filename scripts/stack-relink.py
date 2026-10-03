#!/usr/bin/env python3
"""Put a stack's open pull requests into a stack on GitHub by linking.

`just stack-refresh` rebuilds the local record with `gh stack unstack`
and then adopts the branches again. That unstack is also asked of
GitHub, which refuses once any pull request in the stack has merged ("Pull
requests #1356, #1358 cannot be removed from this stack"). On
2026-10-02 that left the open pull requests in no stack on GitHub at
all, and they were put back by hand. This script is that repair.

It leaves the old stack on GitHub alone. The recipe rebuilds the local
record without touching GitHub (`gh stack unstack --local`, then
`gh stack init`), and then calls this to:

- find the open pull request for each branch, by asking GitHub rather
  than trusting the number in the record, which is wrong for a pull
  request that was closed and replaced;
- `gh stack link` them, bottom to top. That makes a new stack when
  they are in none, and changes nothing when they are still in one;
- write that stack's `id` and `number` into the local record, so
  gh-stack treats the two as the same stack.

Pull requests are linked by number, never by branch name: given a
branch, `gh stack link` pushes it first, and a refresh must not push.

Two modes:

    stack-relink.py --needed            exit 0 when GitHub's stack for
                                        the current branch holds a merged
                                        pull request, 1 when it does not
    stack-relink.py --link <branch>...  link and repoint, as above

Exit codes for `--link`: 0 linked and recorded, 1 it could not be done.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


def record_path() -> Path | None:
    """Where gh-stack keeps this worktree's record, or None if absent."""
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


def read_record(path: Path) -> dict[str, object] | None:
    try:
        record = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        print(f"✗ Could not read the stack record: {exc}", file=sys.stderr)
        return None
    return record if isinstance(record, dict) else None


def stack_holding(
    record: dict[str, object], branch: str
) -> dict[str, object] | None:
    """The stack in the record that this branch belongs to.

    The record keeps every stack this worktree has had, most of them
    empty by now. The last match wins: a branch name can be reused once
    its stack has finished, and the newest stack is the live one.
    """
    stacks = record.get("stacks")
    if not isinstance(stacks, list):
        return None
    found = None
    for stack in stacks:
        if not isinstance(stack, dict):
            continue
        branches = stack.get("branches")
        if not isinstance(branches, list):
            continue
        for entry in branches:
            if isinstance(entry, dict) and entry.get("branch") == branch:
                found = stack
    return found


def holds_merged(github_stack: dict[str, object]) -> bool:
    """Whether a stack, as GitHub's API returns it, holds a merged PR."""
    pull_requests = github_stack.get("pull_requests")
    if not isinstance(pull_requests, list):
        return False
    return any(
        isinstance(pr, dict) and pr.get("merged_at") for pr in pull_requests
    )


def point_record(
    record: dict[str, object], branch: str, stack_id: object, number: object
) -> bool:
    """Set the id and number of the stack holding a branch. False if none.

    gh-stack keeps the id as a string and the number as an integer, and
    the id GitHub's API gives is the same numeric id as an integer.
    """
    if not isinstance(number, int) or not isinstance(stack_id, (int, str)):
        return False
    stack = stack_holding(record, branch)
    if stack is None:
        return False
    stack["id"] = str(stack_id)
    stack["number"] = number
    return True


def gh(args: list[str]) -> str | None:
    """Run gh and return its stdout, or None when it failed."""
    try:
        result = subprocess.run(
            ["gh", *args], capture_output=True, text=True, timeout=60
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        print(f"✗ gh failed: {exc}", file=sys.stderr)
        return None
    if result.returncode != 0:
        sys.stderr.write(result.stderr)
        return None
    return result.stdout


def gh_json(args: list[str]) -> object | None:
    out = gh(args)
    if out is None:
        return None
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return None


def current_branch() -> str:
    result = subprocess.run(
        ["git", "branch", "--show-current"], capture_output=True, text=True
    )
    return result.stdout.strip() if result.returncode == 0 else ""


def open_pull_request(branch: str) -> int | None:
    """The one open pull request for a branch, or None."""
    found = gh_json(
        ["pr", "list", "--head", branch, "--state", "open", "--json", "number"]
    )
    if not isinstance(found, list) or len(found) != 1:
        return None
    number = found[0].get("number") if isinstance(found[0], dict) else None
    return number if isinstance(number, int) else None


def needed() -> int:
    path = record_path()
    record = read_record(path) if path is not None else None
    if record is None:
        return 1
    stack = stack_holding(record, current_branch())
    number = stack.get("number") if stack is not None else None
    if not isinstance(number, int):
        # Never submitted, so there is no stack on GitHub to refuse.
        return 1
    github_stack = gh_json(
        ["api", f"repos/{{owner}}/{{repo}}/stacks/{number}"]
    )
    if not isinstance(github_stack, dict):
        return 1
    return 0 if holds_merged(github_stack) else 1


def link(branches: list[str]) -> int:
    if not branches:
        print("✗ No branches to link.", file=sys.stderr)
        return 1

    numbers: list[int] = []
    for branch in branches:
        number = open_pull_request(branch)
        if number is None:
            print(
                f"✗ {branch} does not have exactly one open pull request, "
                "so the stack cannot be linked on GitHub.",
                file=sys.stderr,
            )
            return 1
        numbers.append(number)

    if len(numbers) > 1:
        # A stack is two or more pull requests: one on its own is in no
        # stack on GitHub, and there is nothing to link it to.
        if gh(["stack", "link", *[str(n) for n in numbers]]) is None:
            print("✗ gh stack link failed.", file=sys.stderr)
            return 1

    pull_request = gh_json(
        ["api", f"repos/{{owner}}/{{repo}}/pulls/{numbers[0]}"]
    )
    github_stack = (
        pull_request.get("stack") if isinstance(pull_request, dict) else None
    )
    if not isinstance(github_stack, dict):
        if len(numbers) == 1:
            print("  One open pull request: no stack on GitHub to point at.")
            return 0
        print(
            "✗ Linked, but GitHub did not say which stack "
            f"#{numbers[0]} is now in.",
            file=sys.stderr,
        )
        return 1

    path = record_path()
    record = read_record(path) if path is not None else None
    if path is None or record is None:
        print("✗ No local stack record to point at it.", file=sys.stderr)
        return 1
    if not point_record(
        record, branches[0], github_stack.get("id"), github_stack.get("number")
    ):
        print(
            "✗ The local record holds no stack for "
            f"{branches[0]}, or GitHub gave no stack number.",
            file=sys.stderr,
        )
        return 1

    path.write_text(json.dumps(record, indent=2))
    print(
        f"  The local record now points at stack #{github_stack.get('number')} "
        f"on GitHub ({len(numbers)} open)."
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--needed",
        action="store_true",
        help="exit 0 when GitHub's stack holds a merged pull request",
    )
    group.add_argument(
        "--link",
        nargs="+",
        metavar="BRANCH",
        help="the stack's unmerged branches, bottom to top",
    )
    args = parser.parse_args()
    return needed() if args.needed else link(args.link)


if __name__ == "__main__":
    sys.exit(main())
