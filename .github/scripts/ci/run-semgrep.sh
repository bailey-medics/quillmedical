#!/usr/bin/env bash
# Runs the Semgrep scan over one folder, and fails if it scanned too little.
#
# Usage: run-semgrep.sh <folder>
#
# The folder holds its own .semgrep.yml and its own ignore file, and Semgrep is
# run from inside it.
#
# Semgrep exits 0 when it finds nothing, and it finds nothing in files it
# never opened. A wrong folder, an ignore rule that swallows the source or
# a config that matches no language all pass that way. So this reads the
# number of files Semgrep says it scanned and fails on too few, whatever
# Semgrep's own verdict.
#
# It also says how many files Semgrep could not read all the way through.
# Those are scanned up to the syntax it did not understand and no further,
# and with the log level the workflow sets nothing else reports them.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "run-semgrep"

#: The frontend is well over a thousand source files. Fewer than this means
#: the scan looked somewhere else.
readonly MIN_FILES=500

# Runs the scan and prints Semgrep's report as JSON. Its own function so
# the tests can stand in for Semgrep.
run_scan() {
  local folder="$1"

  (cd "$folder" && semgrep --config .semgrep.yml --error --json --quiet)
}

# Reads a Semgrep JSON report on stdin and says how many files it scanned,
# or nothing when the report does not say.
files_scanned() {
  jq -r '.paths.scanned | length' 2>/dev/null || true
}

# Reads a Semgrep JSON report on stdin and says how many files it could
# not read all the way through.
files_partly_read() {
  jq -r '[.errors[]? | .path? // empty] | unique | length' 2>/dev/null || true
}

# Reads a Semgrep JSON report on stdin and prints one line a finding.
findings() {
  jq -r '.results[]? | "\(.path):\(.start.line) \(.check_id) \(.extra.message)"'
}

# Decides from Semgrep's exit code and its report. Prints the findings
# when there are any to act on.
check_report() {
  local exit_code="$1"
  local report=""
  report="$(cat)"

  local files=""
  files="$(files_scanned <<<"$report")"

  if [[ ! "$files" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$report" >&2
    error "Semgrep did not say how many files it scanned, so nothing can be said to have been checked"
    return 1
  fi

  if [ "$files" -lt "$MIN_FILES" ]; then
    error "Semgrep scanned ${files} files, and there are far more than ${MIN_FILES}: it looked in the wrong place"
    return 1
  fi

  local partly=""
  partly="$(files_partly_read <<<"$report")"

  if [ "$exit_code" -ne 0 ]; then
    findings <<<"$report" >&2
    error "Semgrep found issues in ${files} files. Fix each one, or mark the line '// nosemgrep: <rule> - <why it is safe>'"
    return 1
  fi

  log "Semgrep scanned ${files} files and found nothing. It could not read ${partly:-0} of them all the way through"
}

main() {
  local folder="${1:-}"

  if [ -z "$folder" ]; then
    error "No folder given. Usage: run-semgrep.sh <folder>"
    exit 1
  fi

  if [ ! -f "${folder}/.semgrep.yml" ]; then
    error "${folder}/.semgrep.yml is not there, so there are no rules to scan with"
    exit 1
  fi

  local report=""
  local exit_code=0

  report="$(run_scan "$folder")" || exit_code=$?

  check_report "$exit_code" <<<"$report"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
