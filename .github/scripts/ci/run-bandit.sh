#!/usr/bin/env bash
# Runs the Bandit security scan over the backend, and fails if it scanned
# nothing.
#
# Usage: run-bandit.sh
#
# Run by the pre-commit hook "bandit (backend)", which is also how CI runs
# it: the fast tier runs every hook over every file.
#
# Bandit exits 0 when it finds no issues, and it finds none in a folder it
# never opened. For a year the hook passed "r" where "-r" was meant, so
# Bandit looked at a file called "r", scanned no lines and passed every
# commit. So this reads the number of lines Bandit says it scanned and
# fails on too few, whatever Bandit's own verdict. See
# docs/docs/plans/2026-10-09-tests-beside-the-source-plan.md.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "run-bandit"

#: What is left out, and why:
#: - tests and their fixtures assert, hold made-up passwords and are not
#:   in the production image;
#: - merged migrations are frozen, so a finding in one could not be fixed.
readonly EXCLUDE="backend/tests,backend/conftest.py,backend/.venv,backend/alembic/versions,*_test.py"

#: B404 flags the line "import subprocess" whatever is then done with it.
#: Each call is still checked, by B603 and B607.
readonly SKIP="B404"

#: The backend is tens of thousands of lines. Fewer than this means the
#: scan looked somewhere else.
readonly MIN_LINES=10000

# Runs the scan and prints Bandit's report. Its own function so the tests
# can stand in for Bandit.
run_scan() {
  bandit -r backend -x "$EXCLUDE" --skip "$SKIP" 2>&1
}

# Reads a Bandit report on stdin and says how many lines it covered, or
# nothing when the report does not say.
lines_scanned() {
  sed -n 's/^[[:space:]]*Total lines of code: \([0-9][0-9]*\)$/\1/p' | head -n 1
}

# Reads a Bandit report on stdin and says how many files it could not
# read, or nothing when the report does not say.
files_skipped() {
  sed -n 's/^Files skipped (\([0-9][0-9]*\)):$/\1/p' | head -n 1
}

# Reads a Bandit report on stdin and prints the files it could not read,
# each with Bandit's reason.
skipped_files() {
  sed -n '/^Files skipped ([0-9][0-9]*):$/,$p' | sed '1d'
}

# Decides from Bandit's exit code and its report. Prints the report when
# there is something to act on.
check_report() {
  local exit_code="$1"
  local report=""
  report="$(cat)"

  local lines=""
  lines="$(lines_scanned <<<"$report")"

  if [ -z "$lines" ]; then
    printf '%s\n' "$report" >&2
    error "Bandit did not say how many lines it scanned, so nothing can be said to have been checked"
    return 1
  fi

  if [ "$lines" -lt "$MIN_LINES" ]; then
    error "Bandit scanned ${lines} lines, and the backend is far more than ${MIN_LINES}: it looked in the wrong place"
    return 1
  fi

  # Bandit reads a file with the Python it is running on. One written
  # for a newer Python than that is a syntax error to it, and Bandit
  # leaves the file out, counts the rest and passes. A dozen files were
  # not scanned that way, deps.py and security.py among them, while the
  # line count stayed far above the floor.
  local skipped=""
  skipped="$(files_skipped <<<"$report")"

  if [ -n "$skipped" ] && [ "$skipped" -gt 0 ]; then
    skipped_files <<<"$report" >&2
    error "Bandit could not read ${skipped} files, so they were not scanned. A syntax error here usually means Bandit is running on an older Python than the code is written for: the hook must run on the pinned one"
    return 1
  fi

  if [ "$exit_code" -ne 0 ]; then
    printf '%s\n' "$report" >&2
    error "Bandit found issues in ${lines} lines. Fix each one, or mark the line '# nosec <rule> - <why it is safe>'"
    return 1
  fi

  log "Bandit scanned ${lines} lines and found nothing"
}

main() {
  local report=""
  local exit_code=0

  report="$(run_scan)" || exit_code=$?

  check_report "$exit_code" <<<"$report"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
