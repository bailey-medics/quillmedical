#!/usr/bin/env bash
# Creates a fresh pre-commit virtual environment with pre-commit installed.
#
# Usage: ensure-pre-commit-venv.sh
#
# Recreates .venv from scratch every run and installs pre-commit>=3,<5.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "$0")/../shared/logging.sh" "ensure-pre-commit-venv"

# The venv is recreated every run rather than cached: a venv symlinks into the
# ephemeral Python toolcache, and a restored copy segfaults when that
# interpreter is rebuilt (even at the same version). Packages install quickly
# from the cached pip download directory.
log "Creating virtual environment..."
rm -rf .venv
python -m venv .venv

.venv/bin/python -m pip install -U pip
.venv/bin/python -m pip install "pre-commit>=3,<5"
