#!/usr/bin/env python3
"""Compare two versions of one migration: code frozen, prose free.

Usage: compare_migration_code.py <before> <after>

Exit 0 when the two versions differ only in comment text, 1 when the code or
an allow-destructive marker changed, 2 on a usage or parse error.

This mirrors the rule the `api-compatibility/` decision files already follow.
There, `generation`, `forces_reload` and `change` are frozen once merged
because they *are* the decision, while `reason` stays editable because it is
prose explaining the decision and cannot alter it. The same split applies to a
migration:

  frozen    everything the AST captures - the DDL calls, the revision
            identifiers, the docstring - plus whether each destructive call
            carries its `# migration-check: allow-destructive` marker
  editable  every other comment, including the rationale beside a marker

So a rationale can be clarified or corrected later, but the operation it
vouches for cannot change and the marker cannot quietly disappear.

Only ever compares two versions of the same migration. Deletions and renames
are rejected by the caller before it gets here, since a migration's filename
carries its revision id and the chain's ordering.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

if __package__ in (None, ""):  # invoked as a script, not imported
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.check_migrations import (  # noqa: E402
    DESTRUCTIVE_MARKER,
    DESTRUCTIVE_OPS,
    _call_name,
    _marker_attached_to,
)

EXIT_OK = 0
EXIT_CODE_CHANGED = 1
EXIT_USAGE = 2


def marker_vector(source: str) -> list[bool]:
    """Whether each destructive call in `source` carries its marker.

    Ordered by `ast.walk`, which is deterministic, so two versions with
    identical ASTs produce vectors that line up call for call. Comparing them
    catches a marker stripped under cover of a comment edit - the one way an
    otherwise comment-only diff can change what was approved.

    Line numbers shift when comments are added or removed, which is why each
    version is measured against its own lines rather than a shared offset.
    """
    tree = ast.parse(source)
    lines = source.splitlines()

    return [
        _marker_attached_to(lines, node.lineno)
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and _call_name(node) in DESTRUCTIVE_OPS
    ]


def describe_difference(before: str, after: str) -> str | None:
    """Say what changed beyond comments, or None if nothing did.

    `ast.dump` omits line numbers by default, so a pure comment edit - which
    shifts every following statement down - still compares equal.
    """
    try:
        before_tree = ast.dump(ast.parse(before))
        after_tree = ast.dump(ast.parse(after))
    except SyntaxError as exc:
        return f"does not parse as Python: {exc}"

    if before_tree != after_tree:
        return (
            "its code changed. Only comments may be edited after merge - "
            "not the DDL, the revision identifiers, or the docstring"
        )

    if marker_vector(before) != marker_vector(after):
        return (
            f"a '{DESTRUCTIVE_MARKER}' marker was added or removed. The "
            "marker records a decision a human approved at the gate, so it "
            "is frozen even though it is a comment"
        )

    return None


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv

    if len(args) != 2:
        print(
            "Usage: compare_migration_code.py <before> <after>",
            file=sys.stderr,
        )
        return EXIT_USAGE

    before_path, after_path = Path(args[0]), Path(args[1])

    for path in (before_path, after_path):
        if not path.is_file():
            print(f"No such file: {path}", file=sys.stderr)
            return EXIT_USAGE

    difference = describe_difference(
        before_path.read_text(encoding="utf-8"),
        after_path.read_text(encoding="utf-8"),
    )

    if difference is None:
        return EXIT_OK

    print(difference, file=sys.stderr)
    return EXIT_CODE_CHANGED


if __name__ == "__main__":
    raise SystemExit(main())
