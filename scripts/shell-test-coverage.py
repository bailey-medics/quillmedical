#!/usr/bin/env python3
"""Print how much of the shell scripts the bats tests run.

kcov watches the bats suites run and writes a report of the lines each
shell script executed. This reads that report and prints the ten scripts
with the least cover, the scripts no test ran at all, and a total.

Usage:
    just test-coverage sh

**The total counts the scripts kcov never saw.** kcov's own figure covers
only the scripts some test ran, so a script with no test at all is simply
missing from it, and the more scripts go untested the better it looks.
Here every line of such a script counts as not run.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

#: Where the shell scripts live: the folders CI runs bats over, and
#: ``scripts/`` itself.
SCRIPT_DIRS = (".github/scripts", ".claude/hooks", "scripts")

#: How many of the least-covered scripts to list.
LOWEST = 10


def shell_scripts(root: Path = ROOT) -> list[Path]:
    """Every shell script under the folders this checks, sorted."""
    found: set[Path] = set()

    for folder in SCRIPT_DIRS:
        found.update(
            path
            for path in (root / folder).rglob("*.sh")
            if "node_modules" not in path.parts
        )

    return sorted(found)


def code_lines(script: Path) -> int:
    """Roughly how many lines of a script could be run.

    Used only for a script kcov never saw, where there is no better
    count: every line that is not blank and not a comment. kcov is
    stricter about what is a line of code, so this errs towards
    counting too many, which errs towards a lower total.
    """
    lines = script.read_text(encoding="utf-8").splitlines()

    return sum(
        1
        for line in lines
        if line.strip() and not line.strip().startswith("#")
    )


def measured(
    report: dict[str, object], root: Path = ROOT
) -> dict[Path, tuple[int, int]]:
    """Lines run and lines in all, for each script in kcov's report.

    Some tests copy a script into a throwaway repository and run the
    copy, so kcov reports it under a temporary path. A copy is matched
    back to its script by the end of its path, such as
    ``.github/scripts/ci/check.sh``. Where several copies ran, each in
    its own test, the one with the most lines run is taken: kcov's
    summary gives a count for each copy and not which lines, so the
    copies cannot be added together. That errs low.

    Args:
        report: kcov's ``coverage.json``, parsed.
        root: The repository, as kcov saw it.

    Returns:
        Script path to (lines run, lines of code).
    """
    scripts = shell_scripts(root)
    found: dict[Path, tuple[int, int]] = {}
    files = report.get("files", [])
    assert isinstance(files, list)

    for entry in files:
        script = _script_for(Path(entry["file"]), scripts, root)
        if script is None:
            continue

        lines = (int(entry["covered_lines"]), int(entry["total_lines"]))
        if script not in found or lines[0] > found[script][0]:
            found[script] = lines

    return found


def _script_for(path: Path, scripts: list[Path], root: Path) -> Path | None:
    """The repository's script that *path* is, or is a copy of."""
    if path in scripts:
        return path

    for script in scripts:
        relative = script.relative_to(root).as_posix()
        if path.as_posix().endswith(f"/{relative}"):
            return script

    return None


def percent(run: int, total: int) -> float:
    """*run* as a percentage of *total*, or 0 where there is nothing."""
    return 100 * run / total if total else 0.0


def main(argv: list[str], root: Path = ROOT) -> int:
    """Print the report.

    Args:
        argv: The path to kcov's ``coverage.json``.
        root: The repository, as kcov saw it.

    Returns:
        0 when the report was read, 1 when it could not be.
    """
    if len(argv) != 1:
        print("Usage: shell-test-coverage.py <coverage.json>", file=sys.stderr)

        return 1

    try:
        report = json.loads(Path(argv[0]).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"✗ Could not read kcov's report: {exc}", file=sys.stderr)

        return 1

    seen = measured(report, root)
    unseen = [script for script in shell_scripts(root) if script not in seen]
    rows = sorted(seen.items(), key=lambda item: percent(*item[1]))

    print(f"Least covered, of the {len(seen)} scripts a test ran:")

    for script, (run, total) in rows[:LOWEST]:
        print(f"  {percent(run, total):5.1f}%  {script.relative_to(root)}")

    if unseen:
        print(f"\nRun by no test at all ({len(unseen)}):")

        for script in unseen:
            print(f"    0.0%  {script.relative_to(root)}")

    run = sum(lines[0] for lines in seen.values())
    total = sum(lines[1] for lines in seen.values())
    total += sum(code_lines(script) for script in unseen)

    print(
        f"\nTOTAL  {percent(run, total):.0f}%  "
        f"({run} of {total} lines, in {len(seen) + len(unseen)} scripts)"
    )

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
