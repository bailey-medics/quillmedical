#!/usr/bin/env bash
# Computes a stable hash identifying the set of breaking changes in an
# oasdiff JSON report, so callers can tell "the same breaking changes as
# last time" apart from "a different set of breaking changes".
#
# Usage: compute-breaking-change-hash.sh <oasdiff-report.json>
#
# Reads the same oasdiff JSON report produced by `oasdiff breaking --format
# json`. Each change is rebuilt as "<id> <operation> <path> <text>" (the
# same identity string used by validate-compat-files.sh's
# parse_oasdiff_changes to match decision files), then the lines are sorted
# (oasdiff's array order isn't a meaningful identity signal) and hashed with
# sha256sum, so the same set of changes always hashes the same regardless of
# the order oasdiff reported them in.
#
# Environment:
#   GITHUB_OUTPUT   Destination file for `breaking_hash=<hash>` (set by the
#                    runner).
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "compute-breaking-change-hash"

# Extract each change from the oasdiff report as "<id> <operation> <path>
# <text>", one per line. Pure (stdin/stdout only) so it can be tested
# without GITHUB_OUTPUT. Prints nothing for an unparseable or empty report -
# callers should only invoke this once they know breaking changes exist.
extract_change_lines() {
  local oasdiff_report="$1"

  if ! jq empty "$oasdiff_report" 2>/dev/null; then
    return 0
  fi

  if [ "$(jq 'length' "$oasdiff_report")" -eq 0 ]; then
    return 0
  fi

  jq -r '.[] | [.id, .operation, .path, .text] | map(select(. != null and . != "")) | join(" ")' "$oasdiff_report"
}

# Compute the stable hash for a set of change lines read from stdin.
hash_change_lines() {
  sort | sha256sum | awk '{print $1}'
}

main() {
  local oasdiff_report="${1:-}"

  if [ -z "$oasdiff_report" ]; then
    error "No oasdiff report provided. Usage: compute-breaking-change-hash.sh <oasdiff-report.json>"
    exit 1
  fi

  if [ ! -f "$oasdiff_report" ]; then
    error "oasdiff report file not found: $oasdiff_report"
    exit 1
  fi

  if [ -z "${GITHUB_OUTPUT:-}" ]; then
    error "GITHUB_OUTPUT not set (not running in GitHub Actions?)"
    exit 1
  fi

  local hash
  hash="$(extract_change_lines "$oasdiff_report" | hash_change_lines)"

  log "Computed breaking-change hash: $hash"
  echo "breaking_hash=$hash" >>"$GITHUB_OUTPUT"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
