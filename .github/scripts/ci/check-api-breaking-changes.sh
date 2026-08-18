#!/usr/bin/env bash
# Runs `oasdiff breaking` between two OpenAPI specs and reports whether an
# undeclared breaking change was found.
#
# Usage: check-api-breaking-changes.sh <base-spec> <revision-spec>
#
# Environment:
#   GITHUB_OUTPUT  Optional. Destination file `breaking=true`/`breaking=false`
#                  is additionally written to; set by the runner in CI.
#
# Prints oasdiff's human-readable report to stdout regardless of outcome, so a
# downstream job can route through the api-breaking-change-review environment
# gate. This script always exits 0 itself - a breaking change is a signal for
# that downstream gate to act on, not a failure of the check itself, which ran
# successfully either way.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "check-api-breaking-changes"

# Script-scoped (not local to main) so the EXIT trap can still see it once
# main has returned - a trap set on a function-local var goes unbound.
report=""
trap 'rm -f "$report"' EXIT

main() {
  local base_spec="${1:-}"
  local revision_spec="${2:-}"

  if [ -z "$base_spec" ] || [ -z "$revision_spec" ]; then
    error "Usage: check-api-breaking-changes.sh <base-spec> <revision-spec>"
    exit 1
  fi

  local exit_code breaking

  report="$(mktemp)"

  set +e
  oasdiff breaking "$base_spec" "$revision_spec" >"$report" 2>&1
  exit_code=$?
  set -e

  cat "$report"

  if [ "$exit_code" -eq 0 ]; then
    breaking=false
    log "No undeclared breaking API changes found."
  else
    breaking=true
    error "Breaking API change(s) detected - see the oasdiff report above."
  fi

  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "breaking=$breaking" >>"$GITHUB_OUTPUT"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
