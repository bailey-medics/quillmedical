#!/usr/bin/env bash
# Runs mypy over the backend with `strict` on, and fails if it checked too
# little.
#
# Usage: run-mypy.sh
#
# Run from the repository root by the pre-commit hook "mypy (backend,
# strict)", which is also how CI runs it: the fast tier runs every hook
# over every file.
#
# mypy is started through Poetry from backend/, so that it reads
# `[tool.mypy]` in backend/pyproject.toml and sees the libraries the
# backend is installed with. Both matter. Run from the repository root it
# finds no config and `strict` is never applied, and in an environment of
# its own it treats every FastAPI and Pydantic type as unknown. That is
# how the hook ran for a long time, passing code `strict` would refuse.
#
# mypy also passes when it is given nothing to check, so this reads the
# number of files it says it checked and fails on too few.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "run-mypy"

#: app/ and scripts/ hold well over a hundred source files once the tests
#: are left out. Fewer than this means mypy looked somewhere else.
readonly MIN_FILES=100

# Runs the check and prints mypy's report. Its own function so the tests
# can stand in for mypy.
run_check() {
  env -u VIRTUAL_ENV poetry -C backend run mypy 2>&1
}

# Reads a mypy report on stdin and says how many files it checked, or
# nothing when the report does not say. mypy words the count two ways:
# "no issues found in 156 source files" and "(checked 156 source files)".
files_checked() {
  sed -n -E 's/^.*(in|checked) ([0-9]+) source files?\)?$/\2/p' | tail -n 1
}

# Decides from mypy's exit code and its report.
check_report() {
  local exit_code="$1"
  local report=""
  report="$(cat)"

  local files=""
  files="$(files_checked <<<"$report")"

  if [ -z "$files" ]; then
    printf '%s\n' "$report" >&2
    error "mypy did not say how many files it checked, so nothing can be said to have been checked"
    return 1
  fi

  if [ "$files" -lt "$MIN_FILES" ]; then
    error "mypy checked ${files} files, and the backend is far more than ${MIN_FILES}: it looked in the wrong place"
    return 1
  fi

  if [ "$exit_code" -ne 0 ]; then
    printf '%s\n' "$report" >&2
    error "mypy found type errors in ${files} files, with strict on"
    return 1
  fi

  log "mypy checked ${files} files with strict on and found nothing"
}

main() {
  local report=""
  local exit_code=0

  report="$(run_check)" || exit_code=$?

  check_report "$exit_code" <<<"$report"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
