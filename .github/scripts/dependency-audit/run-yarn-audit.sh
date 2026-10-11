#!/usr/bin/env bash
# Checks the packages the frontend ships against the npm advisory list,
# and fails on any advisory.
#
# Usage: run-yarn-audit.sh <folder>
#
# <folder> holds the yarn.lock to audit. Needs `yarn` and `jq`.
#
# Only the packages that reach a browser are checked: `--environment
# production` leaves out the build and test tools, which run on a
# developer's machine and in CI and are never served. Deprecation notices
# are left out too; they are not vulnerabilities.
#
# To accept an advisory that does not apply, add its id to
# npmAuditIgnoreAdvisories in the folder's .yarnrc.yml, with a comment
# saying why. Yarn reads that list itself.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "run-yarn-audit"

# Runs the audit and prints one JSON object a line for each advisory. Its
# own function so the tests can stand in for Yarn.
run_audit() {
  local folder="$1"

  (cd "$folder" && yarn npm audit --all --recursive --environment production --no-deprecations --json)
}

# Reads the audit's output on stdin and prints one line an advisory.
advisories() {
  jq -r '
    select(.value != null and .children != null)
    | "\(.children.Severity) \(.value) \((.children["Tree Versions"] // []) | join(", ")): \(.children.Issue) \(.children.URL // "")"
  ' 2>/dev/null || true
}

# Decides from Yarn's exit code and what it printed.
check_report() {
  local exit_code="$1"
  local report=""
  report="$(cat)"

  local found=""
  found="$(advisories <<<"$report")"

  if [ -n "$found" ]; then
    printf '%s\n' "$found" >&2
    error "$(wc -l <<<"$found" | tr -d ' ') advisories against packages the frontend ships. Update each, or add its id to npmAuditIgnoreAdvisories in .yarnrc.yml with the reason"
    return 1
  fi

  if [ "$exit_code" -ne 0 ]; then
    printf '%s\n' "$report" >&2
    error "The Yarn audit failed without naming an advisory, so nothing can be said to have been checked"
    return 1
  fi

  log "The Yarn audit found no advisory against the packages the frontend ships"
}

main() {
  local folder="${1:-}"

  if [ -z "$folder" ]; then
    error "No folder given. Usage: run-yarn-audit.sh <folder>"
    exit 1
  fi

  if [ ! -f "${folder}/yarn.lock" ]; then
    error "${folder}/yarn.lock is not there, so there is nothing to audit"
    exit 1
  fi

  local report=""
  local exit_code=0

  report="$(run_audit "$folder")" || exit_code=$?

  check_report "$exit_code" <<<"$report"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
