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

if [ ! -x .venv/bin/python ]; then
  log "Creating new virtual environment..."
  rm -rf .venv
  python -m venv .venv
else
  log "Using cached .venv"
fi

# Always ensure pre-commit is installed (quick if already present).
.venv/bin/python -m pip install -U pip
.venv/bin/python -m pip install "pre-commit>=3,<5"
