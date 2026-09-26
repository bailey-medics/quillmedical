#!/usr/bin/env bash
# Fingerprints a pull request's own change, so an approval can outlive a rebase.
#
# Usage: compute-change-fingerprint.sh <repo-dir> <base-sha> <head-sha>
#
# Environment:
#   GITHUB_OUTPUT  Destination file for `change_fingerprint=<id>` (set by the
#                  runner).
#
# The fingerprint is Git's patch ID of the diff from <base-sha> to <head-sha>:
# Git's own identity for "the same change". It ignores line numbers and the
# commit the change sits on, so rebasing the pull request, or retargeting it
# onto main once the branch below has merged, leaves it unchanged. Any edit to
# the pull request's own code changes it. That is the rule the breaking-change
# gates use to decide whether an earlier approval still covers this change.
#
# A pull request that changes nothing has no patch ID. It gets the fixed
# fingerprint "empty" rather than an error, so the caller need not special-case
# it; no gate ever asks for approval of an empty change.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "compute-change-fingerprint"

# Prints the stable patch ID of <base>..<head> in <repo-dir>, or "empty".
# Fails when either commit cannot be found, rather than fingerprinting the
# wrong range: a wrong fingerprint could match someone else's approval.
change_fingerprint() {
  local repo_dir="$1"
  local base="$2"
  local head="$3"
  local ref
  local patch_id

  for ref in "$base" "$head"; do
    if ! git -C "$repo_dir" rev-parse --verify --quiet "${ref}^{commit}" >/dev/null; then
      error "No commit '${ref}' in '${repo_dir}'."
      return 1
    fi
  done

  patch_id="$(git -C "$repo_dir" diff "${base}" "${head}" | git -C "$repo_dir" patch-id --stable | awk '{print $1}')"
  echo "${patch_id:-empty}"
}

main() {
  local repo_dir="${1:-}"
  local base="${2:-}"
  local head="${3:-}"
  local fingerprint

  if [ -z "$repo_dir" ] || [ -z "$base" ] || [ -z "$head" ]; then
    error "Usage: compute-change-fingerprint.sh <repo-dir> <base-sha> <head-sha>"
    exit 1
  fi

  if [ -z "${GITHUB_OUTPUT:-}" ]; then
    error "GITHUB_OUTPUT not set (not running in GitHub Actions?)"
    exit 1
  fi

  fingerprint="$(change_fingerprint "$repo_dir" "$base" "$head")"
  log "Change fingerprint: ${fingerprint}"
  echo "change_fingerprint=${fingerprint}" >>"$GITHUB_OUTPUT"
}

# Only run when executed directly, so bats can source the pure functions.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
