#!/usr/bin/env bash
# Computes a stable hash identifying the set of destructive migrations
# detected on this PR, so callers can tell "the same destructive migrations
# as last time" apart from "a different set of destructive migrations".
#
# Usage: compute-destructive-migration-hash.sh <report>
#
# The report is the multi-line output from detect-destructive-migrations.sh,
# one line per flagged migration file. Each line is already formatted as an
# identity string suitable for hashing (revision id + operations detected).
# Lines are sorted (order is not a meaningful identity signal) and hashed
# with sha256sum, so the same set of migrations always hashes the same
# regardless of the order they were detected in.
#
# Environment:
#   GITHUB_OUTPUT   Destination file for `destructive_hash=<hash>` (set by
#                    the runner).
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "compute-destructive-migration-hash"

# Compute the stable hash for a set of identity lines read from stdin. Sorted
# first, so the order the migrations were reported in doesn't change the hash.
hash_change_lines() {
  sort | sha256sum | awk '{print $1}'
}

main() {
  local report="${1:-}"

  if [ -z "$report" ]; then
    error "No report provided. Usage: compute-destructive-migration-hash.sh <report>"
    exit 1
  fi

  if [ -z "${GITHUB_OUTPUT:-}" ]; then
    error "GITHUB_OUTPUT not set (not running in GitHub Actions?)"
    exit 1
  fi

  local hash
  hash="$(echo "$report" | hash_change_lines)"

  log "Computed destructive-migration hash: $hash"
  echo "destructive_hash=$hash" >>"$GITHUB_OUTPUT"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
