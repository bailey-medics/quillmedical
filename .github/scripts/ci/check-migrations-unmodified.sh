#!/usr/bin/env bash
# Fails the build if this PR rewrites a merged migration's code, or deletes or
# renames one. Comment edits are allowed.
#
# Usage: check-migrations-unmodified.sh [<main-ref>]
#
# Adding a migration is always fine (--diff-filter excludes A). Changing one
# already on main is limited, because the destructive-migration gate only
# inspects migrations ADDED on a PR - a drop_column edited into a merged file
# is invisible to it.
#
# Frozen: the DDL, the revision identifiers, the docstring, and whether each
# destructive call carries its allow-destructive marker. Editable: every other
# comment, so a marker's rationale can be clarified in place.
# compare_migration_code.py draws that line; this script does the git work.
#
# Deletions and renames are refused without comparing, because a migration's
# filename carries its revision id and the chain's ordering.
#
# Fails the build directly rather than routing to a gate - there is no
# legitimate case to approve. Wrong code is corrected by a NEW migration.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "check-migrations-unmodified"

VERSIONS_DIR="backend/alembic/versions"

# Resolved from this script's own location rather than the working directory,
# so the comparer is found wherever the checkout sits.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
COMPARER="${REPO_ROOT}/backend/scripts/compare_migration_code.py"

# Migrations touched on this PR other than by being added, one
# "<status><TAB><path>" per line. M=modified, D=deleted, R=renamed.
touched_migrations() {
  local base_ref="$1"

  git diff --name-status --diff-filter=MDR "${base_ref}...HEAD" \
    -- "${VERSIONS_DIR}/*.py"
}

# Turn git's single-letter status into something a reader can act on. R comes
# through as R100, R087 and so on - the digits are similarity, not part of the
# status. Pure (no git calls) so it can be tested.
describe_status() {
  local status="$1"

  case "$status" in
    M*) echo "modified" ;;
    D*) echo "deleted" ;;
    R*) echo "renamed" ;;
    *) echo "changed (${status})" ;;
  esac
}

# Deletions and renames are refused without inspecting content; only a
# modification is worth comparing.
is_comparable_status() {
  [[ "$1" == M* ]]
}

# What changed in this migration beyond its comments, or nothing at all.
# Echoes the comparer's explanation and returns non-zero when the code moved.
code_difference() {
  local base_commit="$1"
  local path="$2"
  local before

  before="$(mktemp)"
  # shellcheck disable=SC2064  # expand $before now, not at trap time
  trap "rm -f '$before'" RETURN

  git show "${base_commit}:${path}" >"$before"

  PYTHONPATH="${REPO_ROOT}/backend" python3 "$COMPARER" "$before" "$path"
}

main() {
  local main_ref="${1:-origin/main}"

  if [ -z "$main_ref" ]; then
    error "No main ref provided. Usage: check-migrations-unmodified.sh [<main-ref>]"
    exit 1
  fi

  local touched
  touched="$(touched_migrations "$main_ref")"

  if [ -z "$touched" ]; then
    log "No merged migration was modified, deleted or renamed."
    return 0
  fi

  # The "before" content lives at the merge base, which is what `...` diffs
  # against - not the tip of main, which may have moved on since.
  local base_commit
  base_commit="$(git merge-base "$main_ref" HEAD)"

  local status path reason
  local failures=()

  while IFS=$'\t' read -r status path _; do
    [ -n "$status" ] || continue

    if ! is_comparable_status "$status"; then
      failures+=("$(describe_status "$status"): ${path}")
      continue
    fi

    if reason="$(code_difference "$base_commit" "$path" 2>&1)"; then
      log "Comments only, allowed: ${path}"
      continue
    fi

    failures+=("${path}: ${reason}")
  done <<<"$touched"

  if [ ${#failures[@]} -eq 0 ]; then
    log "Merged migrations changed only in their comments."
    return 0
  fi

  error "This PR rewrites migrations that are already on ${main_ref}:"

  local failure
  for failure in "${failures[@]}"; do
    error "  ${failure}"
  done

  error ""
  error "A merged migration's code is not allowed to change - not its DDL, not its"
  error "revision identifiers, not its docstring, and not whether a"
  error "'# migration-check: allow-destructive' marker is present. Those"
  error "record a decision that was already reviewed and approved."
  error ""
  error "Comments may be edited, so a marker's rationale can be clarified"
  error "or corrected in place. Anything else is corrected by adding a NEW"
  error "migration that supersedes this one. See"
  error "docs/docs/backend/alembic-migration-safety.md."
  exit 1
}

# Only run when executed directly, so bats can source the pure functions.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
