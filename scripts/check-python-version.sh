#!/usr/bin/env bash
# Checks the Python on this machine is the one CI runs.
#
# Usage: check-python-version.sh [host]
#
# Run from the repository root, by the pre-commit hook "local Python
# matches CI" and by the recipes that use the backend's own environment.
# With `host` it checks the `python3` on the PATH and nothing else, which
# is all the recipes that run a script from scripts/ need, and is quick.
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
# The other Python that can drift is the bare `python3` on the PATH. The
# scripts in scripts/ run on it: the stack recipes, the audit ledger. They
# are formatted for the pinned Python like every other Python file here,
# so an older `python3` cannot read them, and stops at the first line it
# does not understand with a bare SyntaxError. A guard inside the script
# would be too late: the file fails before any of it runs.
#
# So this refuses a mismatch, and names the one command that fixes it.
# It compares the first two parts of the version, 3.14 with 3.14: CI
# installs the newest patch release of the pinned minor version, and so
# may a developer.
set -euo pipefail

readonly PIN_FILE=".python-version"
readonly HOOKS_FILE=".pre-commit-config.yaml"

# Prints the first two parts of a version: 3.14 from 3.14.7.
minor_of() {
  local version="$1"

  cut -d. -f1,2 <<<"$version"
}

# Prints the Python each hook in the pre-commit config is told to run
# on, one to a line: 3.14 from `language_version: python3.14`. Nothing
# when no hook names one. A `language_version` for another language, such
# as node, is not a Python and is left alone.
hook_pythons() {
  { grep -E '^[[:space:]]*language_version:' "$HOOKS_FILE" || true; } \
    | { grep -oE 'python[0-9]+(\.[0-9]+)*' || true; } \
    | sed 's/^python//'
}

# Prints the version of the Python the backend's Poetry environment
# runs, or nothing when there is no environment to ask. Its own function
# so the tests can stand in for Poetry.
backend_python() {
  env -u VIRTUAL_ENV poetry -C backend run python -c \
    'import sys; print(".".join(str(part) for part in sys.version_info[:3]))' \
    2>/dev/null || true
}

# Prints the version of the `python3` first on the PATH, or nothing when
# there is none. Its own function so the tests can stand in for it.
host_python() {
  python3 -c \
    'import sys; print(".".join(str(part) for part in sys.version_info[:3]))' \
    2>/dev/null || true
}

# Refuses when the `python3` on the PATH is not the pinned Python.
check_host_python() {
  local pinned="$1"
  local found=""

  found="$(host_python)"

  if [ -z "$found" ]; then
    echo "There is no python3 on the PATH, so the scripts in scripts/ cannot run." >&2
    echo "Install Python $(minor_of "$pinned"), which is what this repository is pinned to (${PIN_FILE})." >&2
    return 1
  fi

  if [ "$(minor_of "$found")" = "$(minor_of "$pinned")" ]; then
    return 0
  fi

  echo "python3 on this machine is Python ${found} ($(command -v python3))." >&2
  echo "This repository is pinned to ${pinned} (${PIN_FILE}), which is what CI runs." >&2
  echo "The scripts in scripts/ are written for that Python, and another one may not be able to read them." >&2

  if comes_from_a_virtual_environment "$(command -v python3)"; then
    echo "A virtual environment is active (${VIRTUAL_ENV}), and python3 is coming from it." >&2
    echo "Leave it with: deactivate. If an editor's terminal activated it, choose backend/.venv as the editor's interpreter." >&2
  else
    echo "Install Python $(minor_of "$pinned") and put it first on the PATH as python3." >&2
  fi

  return 1
}

# True when a path is inside the active virtual environment. An editor
# that activates one in its terminals puts that environment's python3
# ahead of the machine's own, so a fresh shell and the editor's terminal
# can disagree about which Python `python3` is.
comes_from_a_virtual_environment() {
  local path="$1"

  [ -n "${VIRTUAL_ENV:-}" ] && [[ "$path" == "${VIRTUAL_ENV}/"* ]]
}

main() {
  local scope="${1:-}"

  if [ -n "$scope" ] && [ "$scope" != "host" ]; then
    echo "Unknown argument: ${scope}. Usage: check-python-version.sh [host]" >&2
    exit 1
  fi

  if [ ! -f "$PIN_FILE" ]; then
    echo "${PIN_FILE} is not here, so there is no pinned Python to check against. Run this from the repository root." >&2
    exit 1
  fi

  local pinned=""
  pinned="$(tr -d '[:space:]' < "$PIN_FILE")"

  check_host_python "$pinned" || exit 1

  if [ "$scope" = "host" ]; then
    return 0
  fi

  if [ ! -f "$HOOKS_FILE" ]; then
    echo "${HOOKS_FILE} is not here, so the Python its hooks run on cannot be checked. Run this from the repository root." >&2
    exit 1
  fi

  local hook_python=""

  while IFS= read -r hook_python; do
    if [ "$hook_python" != "$(minor_of "$pinned")" ]; then
      echo "A hook in ${HOOKS_FILE} is set to run on Python ${hook_python} (language_version: python${hook_python})." >&2
      echo "This repository is pinned to ${pinned} (${PIN_FILE}), which is what CI runs." >&2
      echo "Change it to: language_version: python$(minor_of "$pinned")" >&2
      exit 1
    fi
  done < <(hook_pythons)

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
