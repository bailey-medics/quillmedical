#!/usr/bin/env bash
# Runs the bats suite, failing on warnings as well as on test failures.
#
# Usage: run-shell-tests.sh [<path>]
#
# bats reports BW01 (a bare `!` that is not a test's last command) and BW02
# (flags on `run` without a declared minimum version) as warnings, and a
# warning leaves the exit status at 0. Both mean an assertion can pass while
# checking nothing, so a green run would be reporting the opposite of the
# truth. They are treated as failures here.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "$0")/../shared/logging.sh" "run-shell-tests"

main() {
  local target="${1:-.github/scripts}"

  if [ ! -d "$target" ]; then
    error "Test directory not found: ${target}"
    exit 1
  fi

  local log_file
  log_file=$(mktemp)
  # shellcheck disable=SC2064  # expand log_file now, not when the trap fires
  trap "rm -f '${log_file}'" EXIT

  # Warnings go to both streams, so merge them before capturing.
  local status=0
  bats --recursive "$target" 2>&1 | tee "$log_file" || status=$?

  if [ "$status" -ne 0 ]; then
    error "bats reported test failures"
    exit "$status"
  fi

  # Anchored to the warning code so a test *name* mentioning BW01 is not
  # mistaken for the warning itself.
  if grep -qE "^[[:space:]]*BW[0-9]+:" "$log_file"; then
    error "bats emitted warnings, so an assertion may be passing vacuously:"
    grep -E "^[[:space:]]*BW[0-9]+:" "$log_file" >&2 || true
    error "Fix the test rather than silencing the warning. A negative"
    error "assertion should be 'run ! cmd', and any file putting flags on"
    error "'run' needs 'bats_require_minimum_version 1.5.0' declared."
    exit 1
  fi

  log "All shell script tests passed with no warnings"
}

# Only run when executed, not when sourced, so tests can load the
# functions above without the script running itself.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
