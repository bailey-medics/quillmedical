#!/usr/bin/env bash
# Resolves which commit the deploy pipeline should build and exposes it to
# downstream jobs. Allows manual or CI triggering.
#
# Usage: MANUAL_COMMIT=<ref> GITHUB_OUTPUT=<file> resolve-commit.sh
#    or: GITHUB_SHA=<ref> GITHUB_OUTPUT=<file> resolve-commit.sh
#
# Environment:
#   MANUAL_COMMIT  Preferred ref; used when set. e.g. "4f2a9c1" (commit),
#                  "feature/my-fix" (branch), or "v1.4.0" (tag).
#   GITHUB_SHA     Fallback ref, used when MANUAL_COMMIT is unset.
#                  Normally set automatically by CI. e.g. "4f2a9c1".
#   GITHUB_OUTPUT  Destination file the outputs are written to; set by
#                  the runner in CI, or manually. e.g. "/tmp/out".
#
# Reads MANUAL_COMMIT (the optional workflow_dispatch input) from the
# environment with a fallback to GITHUB_SHA. The value is taken from an env var
# to prevent script injection and validated against a git-safe whole-string
# whitelist (select_ref).

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "resolve-commit"

# Pick the ref (MANUAL_COMMIT, else GITHUB_SHA), validate it, and print it.
# Fails with an error if both are empty, or if the ref isn't a git-safe single
# line starting with an alphanumeric (blocks newline and flag injection).
# No git dependency, so it can be unit-tested in isolation.
select_ref() {
  local manual_commit="${1:-}"
  local github_sha="${2:-}"
  local ref="${manual_commit:-$github_sha}"

  if [ -z "$ref" ]; then
    error "No commit to build: both MANUAL_COMMIT and GITHUB_SHA are empty"
    return 1
  fi

  if ! [[ "$ref" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]]; then
    error "Invalid commit/ref: '$ref'"
    return 1
  fi

  printf '%s\n' "$ref"
}

# Resolve a validated ref (commit, branch, or tag) to its full commit SHA.
resolve_sha() {
  local ref="$1" sha

  # Fast path: already present locally (e.g. the push commit that triggered the
  # run, or a full SHA in history). ^{commit} dereferences annotated tags.
  if sha="$(git rev-parse --verify --quiet "${ref}^{commit}")"; then
    printf '%s\n' "$sha"
    return 0
  fi

  # Otherwise fetch full history for all branches and tags, then resolve locally.
  # A short SHA can't be fetched by name (the wire protocol won't expand a
  # prefix), so we pull everything and let git resolve the prefix from the local
  # object store. --unshallow deepens a shallow checkout; the || fallback covers
  # an already-complete clone, where --unshallow errors.
  git fetch --quiet --tags --unshallow origin '+refs/heads/*:refs/remotes/origin/*' 2>/dev/null \
    || git fetch --quiet --tags origin '+refs/heads/*:refs/remotes/origin/*'
  git rev-parse --verify "${ref}^{commit}"
}

main() {
  set -euo pipefail

  local ref
  ref="$(select_ref "${MANUAL_COMMIT:-}" "${GITHUB_SHA:-}")" || exit 1

  local sha
  if ! sha="$(resolve_sha "$ref")"; then
    error "Could not resolve ref to a commit: '$ref'"
    exit 1
  fi

  log "Building from ref '$ref' (commit $sha)"
  echo "sha=$sha" >> "$GITHUB_OUTPUT"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
