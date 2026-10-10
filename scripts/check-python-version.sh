#!/usr/bin/env bash
# Checks the backend's Python on this machine is the one CI runs.
#
# Usage: check-python-version.sh
#
# Run from the repository root, by the pre-commit hook "local Python
# matches CI" and by the recipes that use the backend's own environment.
#
# `.python-version` names the Python this repository is pinned to. CI and
# the Docker images are built from it, so the unit tests, which run in a
# container, cannot drift from it. What can drift is the environment
# Poetry builds on a developer's machine, which a handful of checks run
# in: the strict mypy hook, the API schema check, the email preview hook.
# Poetry builds that environment with whichever Python it finds first.
# One built on an older Python can pass here and fail in CI, or the
# reverse, and nothing says the two were never the same.
#
# So this refuses a mismatch, and names the one command that fixes it.
# It compares the first two parts of the version, 3.14 with 3.14: CI
# installs the newest patch release of the pinned minor version, and so
# may a developer.
set -euo pipefail

readonly PIN_FILE=".python-version"

# Prints the first two parts of a version: 3.14 from 3.14.7.
minor_of() {
  local version="$1"

  cut -d. -f1,2 <<<"$version"
}

# Prints the version of the Python the backend's Poetry environment
# runs, or nothing when there is no environment to ask. Its own function
# so the tests can stand in for Poetry.
backend_python() {
  env -u VIRTUAL_ENV poetry -C backend run python -c \
    'import sys; print(".".join(str(part) for part in sys.version_info[:3]))' \
    2>/dev/null || true
}

main() {
  if [ ! -f "$PIN_FILE" ]; then
    echo "${PIN_FILE} is not here, so there is no pinned Python to check against. Run this from the repository root." >&2
    exit 1
  fi

  local pinned=""
  pinned="$(tr -d '[:space:]' < "$PIN_FILE")"

  local found=""
  found="$(backend_python)"

  if [ -z "$found" ]; then
    echo "The backend has no Python environment on this machine, so the checks that need one cannot run." >&2
    echo "Build one on Python $(minor_of "$pinned") with: just venv-rebuild" >&2
    exit 1
  fi

  if [ "$(minor_of "$found")" != "$(minor_of "$pinned")" ]; then
    echo "The backend's environment on this machine is Python ${found}." >&2
    echo "This repository is pinned to ${pinned} (${PIN_FILE}), which is what CI runs." >&2
    echo "A check that passes on one may fail on the other, so nothing is run on the wrong one." >&2
    echo "Rebuild the environment on Python $(minor_of "$pinned") with: just venv-rebuild" >&2
    exit 1
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
