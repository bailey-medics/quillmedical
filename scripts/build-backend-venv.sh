#!/usr/bin/env bash
# Builds the backend's Poetry environment on the Python this repository
# is pinned to.
#
# Usage: build-backend-venv.sh <repository root>
#
# Run by `just venv-rebuild` for the worktree it is run from, and by
# `just worktree-create` for the one it has just made.
#
# Left to itself Poetry builds an environment with whichever Python it
# finds first, which is how two worktrees on one machine came to be on
# different versions and neither on CI's. This names the Python:
# `.python-version` says 3.14.7, so the environment is built with
# `python3.14`. Any environment already there is replaced, since one
# built on another Python cannot be moved to this one.
#
# The environment goes in backend/.venv, inside the worktree, so each
# worktree has its own. See `worktree-create` in the Justfile for why.
set -euo pipefail

# Prints the first two parts of a version: 3.14 from 3.14.7.
minor_of() {
  local version="$1"

  cut -d. -f1,2 <<<"$version"
}

main() {
  local root="${1:-}"

  if [ -z "$root" ]; then
    echo "No repository root given. Usage: build-backend-venv.sh <repository root>" >&2
    exit 1
  fi

  if [ ! -f "${root}/.python-version" ]; then
    echo "${root}/.python-version is not there, so there is no pinned Python to build on." >&2
    exit 1
  fi

  local pinned=""
  pinned="$(tr -d '[:space:]' < "${root}/.python-version")"

  local minor=""
  minor="$(minor_of "$pinned")"

  local python=""
  python="$(command -v "python${minor}" || true)"

  if [ -z "$python" ]; then
    echo "Python ${minor} is not installed, and this repository is pinned to ${pinned}." >&2
    echo "Install it, for example with: brew install python@${minor}" >&2
    exit 1
  fi

  cd "${root}/backend"

  if [ -d .venv ]; then
    echo "Removing the old environment at backend/.venv"
    rm -rf .venv
  fi

  echo "Building the backend environment on $("$python" --version)"
  # `env -u VIRTUAL_ENV` so an environment active in the calling shell is
  # not used in place of this one, and the in-project flag so it is made
  # here and not in Poetry's shared cache.
  env -u VIRTUAL_ENV POETRY_VIRTUALENVS_IN_PROJECT=1 poetry env use "$python"
  env -u VIRTUAL_ENV POETRY_VIRTUALENVS_IN_PROJECT=1 poetry install
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
