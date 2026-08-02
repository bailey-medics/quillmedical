#!/usr/bin/env bash
# Shared logging helpers for .github/scripts.
# For use in GitHub Actions workflows only.
#
# Provides log() and error() functions prefixed with the calling script's name.
# Source this file early in each script, passing the script name as the first argument.
#
# Usage: source "$(dirname "$0")/../shared/logging.sh" "script-name"

_SCRIPT_NAME="${1:-script}"
_RED='\033[0;31m'
_RESET='\033[0m'
log()   { echo "[$_SCRIPT_NAME] $*"; }
error() { echo -e "${_RED}[$_SCRIPT_NAME] ERROR: $*${_RESET}" >&2; }
