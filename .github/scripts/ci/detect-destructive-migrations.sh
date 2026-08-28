#!/usr/bin/env bash
# Reports destructive operations in Alembic migrations newly added on this PR.
#
# Usage: detect-destructive-migrations.sh [<main-ref>]
#
# Environment:
#   GITHUB_OUTPUT  Optional. Destination for `destructive=true`/`false` and the
#                  multi-line `report` output; set by the runner in CI.
#
# Only migrations *added* on this PR are considered (git diff --diff-filter=A
# against <main-ref>, default origin/main). A migration merged in an earlier PR
# was already gated when it was added, so re-flagging it on every later PR would
# be noise - this mirrors how oasdiff diffs main against the PR branch rather
# than rescanning the whole history.
#
# Detection is deliberately blind to the `allow-destructive` marker: the review
# gate downstream must fire on what a migration *does*, never on what its own
# comments claim, so the same text that satisfies the static pre-commit check
# cannot also satisfy the gate.
#
# This script always exits 0. A destructive migration is a signal for the
# downstream review gate to act on, not a failure of this check, which ran
# successfully either way.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "detect-destructive-migrations"

VERSIONS_DIR="backend/alembic/versions"
CHECKER="backend/scripts/check_migrations.py"

# List migration files added on this PR relative to main_ref, one per line.
added_migration_files() {
  local main_ref="$1"

  git diff --name-only --diff-filter=A "${main_ref}...HEAD" \
    -- "${VERSIONS_DIR}/*.py"
}

# Report the destructive ops in the given migration files, one line each.
report_destructive() {
  python3 "$CHECKER" --report-destructive "$@"
}

# Write both job outputs. The report is multi-line, so it uses heredoc syntax.
write_outputs() {
  local destructive="$1"
  local report="$2"

  if [ -z "${GITHUB_OUTPUT:-}" ]; then
    return 0
  fi

  {
    echo "destructive=${destructive}"
    echo "report<<DESTRUCTIVE_REPORT_EOF"
    echo "$report"
    echo "DESTRUCTIVE_REPORT_EOF"
  } >>"$GITHUB_OUTPUT"
}

main() {
  local main_ref="${1:-origin/main}"

  local added
  added="$(added_migration_files "$main_ref")"

  if [ -z "$added" ]; then
    log "No migration files added on this PR."
    write_outputs false ""
    return 0
  fi

  # A read loop rather than `mapfile`, which is a bash 4 builtin and so
  # unavailable to the bats suite on macOS (bash 3.2).
  local -a files=()
  local line

  while IFS= read -r line; do
    [ -n "$line" ] && files+=("$line")
  done <<<"$added"

  log "Migration file(s) added on this PR:"
  local file
  for file in "${files[@]}"; do
    log "  $file"
  done

  local report
  report="$(report_destructive "${files[@]}")"

  if [ -z "$report" ]; then
    log "No destructive operations in the added migration(s)."
    write_outputs false ""
    return 0
  fi

  error "Destructive operation(s) detected - human review gate required:"
  while IFS= read -r line; do
    error "  $line"
  done <<<"$report"
  write_outputs true "$report"
}

# Only run when executed directly, so bats can source the functions.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
