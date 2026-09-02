#!/usr/bin/env bash
# Reports whether this branch changes the teaching content contract, and what
# that contract now hashes to.
#
# Usage: detect-teaching-tooling-changes.sh <base-ref>
#
# The contract is everything that can make previously-valid content invalid:
# the tooling package, its pinned dependencies, and the MDX parser the
# validator judges slides with.
#
# Code runs on every push. Revalidating every published question bank against
# the bucket is slow, so `sweep-live-banks.sh` only does that when
# `detect-teaching-tooling-changes.sh` says the contract has moved.
#
# Compares content hashes, not which paths were touched. The difference
# shows up on a revert: the push carrying the edit answers yes, the push
# putting it back answers no, so revalidation stops when the reason for it
# does. The notification gate posts an all-clear on the return.
#
# Every later push on a branch that moved the contract answers yes again,
# and revalidates again. The contract has not moved twice — this holds no
# memory of what it already checked — but the published content it is judged
# against can change while the pull request is open, so the answer can too.
#
# Hashing contents also survives a rebase, an amend or a squash, which
# matters for the decision file recorded against this hash.
#
# Writes to GITHUB_OUTPUT (or stdout when run by hand):
#   changed=true|false   whether the contract differs from the base
#   tooling_hash=<sha>   what it hashes to at HEAD
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "detect-teaching-tooling-changes"

#: The one list. Anything that judges content belongs here; a path missing
#: from it is a change that ships unexamined.
CONTRACT_PATHS=(
  "backend/app/features/teaching/tooling"
  "backend/app/features/teaching/mdx_parser.py"
)

# Hash a stream of git tree entries. Pure (stdin/stdout) so it can be tested
# without a repository. Sorted, because git's listing order is not a
# meaningful identity signal.
hash_entries() {
  sort | sha256sum | cut -d' ' -f1
}

# The contract's hash at a ref. Args: <ref>.
contract_hash() {
  local ref="$1"
  local entries=""
  local path

  for path in "${CONTRACT_PATHS[@]}"; do
    # A missing path lists as empty rather than failing, so deleting a file
    # changes the hash instead of breaking the run.
    entries+="$(git ls-tree -r "$ref" -- "$path" || true)"$'\n'
  done

  if [ -z "${entries//[[:space:]]/}" ]; then
    return 1
  fi

  printf '%s' "$entries" | hash_entries
}

main() {
  local base_ref="${1:-}"

  if [ -z "$base_ref" ]; then
    error "No base ref provided. Usage: detect-teaching-tooling-changes.sh <base-ref>"
    exit 1
  fi

  local head_hash
  local base_hash

  if ! head_hash="$(contract_hash HEAD)"; then
    error "No contract files at HEAD; refusing to hash nothing"
    exit 1
  fi

  if ! base_hash="$(contract_hash "$base_ref")"; then
    error "No contract files at ${base_ref}; refusing to hash nothing"
    exit 1
  fi

  local changed=false

  if [ "$head_hash" != "$base_hash" ]; then
    changed=true

    log "The content contract moved: ${base_hash:0:12} -> ${head_hash:0:12}"

    # Name the files, so nobody has to guess why revalidation ran.
    git diff --name-only "${base_ref}...HEAD" -- "${CONTRACT_PATHS[@]}" \
      | sed 's/^/  /' || true
  else
    log "The content contract is unchanged at ${head_hash:0:12}"
  fi

  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    {
      echo "changed=${changed}"
      echo "tooling_hash=${head_hash}"
    } >> "$GITHUB_OUTPUT"
  else
    echo "changed=${changed}"
    echo "tooling_hash=${head_hash}"
  fi
}

# Only run when executed, not when sourced, so tests can load the
# functions above without the script running itself.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
