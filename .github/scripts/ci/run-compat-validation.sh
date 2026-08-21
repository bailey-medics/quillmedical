#!/usr/bin/env bash
# Runs validate-compat-files.sh and extracts a clean error summary for the
# calling workflow's outputs.
#
# Usage: run-compat-validation.sh <oasdiff-json-output> <api-compat-dir>
#
# Environment:
#   GITHUB_OUTPUT  Destination file the `error_output` output is written to
#                  (set by the runner).
#
# Strips ANSI colour codes from validate-compat-files.sh's output (Slack
# renders escape codes as garbage text) before printing it, then extracts
# just the change IDs lacking decision files into GITHUB_OUTPUT's
# `error_output` - the full verbose log is too noisy for a Slack message.
# Exits with validate-compat-files.sh's own exit code.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "run-compat-validation"

# Can be overridden in tests via RUN_VALIDATOR_OVERRIDE (a shell function name).
run_validator() {
  if [ -n "${RUN_VALIDATOR_OVERRIDE:-}" ]; then
    "$RUN_VALIDATOR_OVERRIDE" "$1" "$2"
    return $?
  fi
  bash "$(dirname "${BASH_SOURCE[0]}")/validate-compat-files.sh" "$1" "$2"
}

main() {
  local oasdiff_json="${1:-}"
  local compat_dir="${2:-}"

  if [ -z "$oasdiff_json" ] || [ -z "$compat_dir" ]; then
    error "Usage: run-compat-validation.sh <oasdiff-json-output> <api-compat-dir>"
    exit 1
  fi

  if [ -z "${GITHUB_OUTPUT:-}" ]; then
    error "GITHUB_OUTPUT not set (not running in GitHub Actions?)"
    exit 1
  fi

  local output_file exit_code
  output_file="$(mktemp)"
  trap 'rm -f "$output_file"' RETURN

  set +e
  run_validator "$oasdiff_json" "$compat_dir" >"$output_file" 2>&1
  exit_code=$?
  set -e

  # Use a temp file + mv rather than `sed -i` for portability between GNU
  # and BSD sed (macOS ships BSD sed, whose -i requires a backup suffix arg).
  sed -E 's/\x1b\[[0-9;]*m//g' "$output_file" >"$output_file.clean"
  mv "$output_file.clean" "$output_file"
  cat "$output_file"

  {
    echo "error_output<<COMPAT_VALIDATION_EOF"
    grep "ERROR:" "$output_file" | sed -E "s/.*'([^']*)'.*/\1/" || echo "[No error details found]"
    echo "COMPAT_VALIDATION_EOF"
  } >>"$GITHUB_OUTPUT"

  exit "$exit_code"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
