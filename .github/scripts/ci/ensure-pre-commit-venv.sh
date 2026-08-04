#!/usr/bin/env bash
# Ensures the pre-commit virtual environment exists and has pre-commit installed.
#
# Usage: ensure-styling-venv.sh
#
# Recreates the venv if the cached copy is missing or corrupted.
# Always upgrades pip and ensures pre-commit>=3,<5 is present (idempotent).
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "$0")/../shared/logging.sh" "ensure-pre-commit-venv"

# A cached .venv restored via a broad cache restore-key can point at a different
# Python patch than the current runner. Its interpreter then segfaults, so only
# reuse the venv if it actually runs and its version matches the active Python.
reuse_venv=0
if [ -x .venv/bin/python ]; then
  cached_py="$(.venv/bin/python -c 'import platform; print(platform.python_version())' 2>/dev/null || true)"
  current_py="$(python -c 'import platform; print(platform.python_version())' 2>/dev/null || true)"
  if [ -n "$cached_py" ] && [ "$cached_py" = "$current_py" ]; then
    reuse_venv=1
  fi
fi

if [ "$reuse_venv" -eq 1 ]; then
  log "Using cached .venv (Python $cached_py)"
else
  log "Creating new virtual environment..."
  rm -rf .venv
  python -m venv .venv
fi

# Always ensure pre-commit is installed (quick if already present).
.venv/bin/python -m pip install -U pip
.venv/bin/python -m pip install "pre-commit>=3,<5"
