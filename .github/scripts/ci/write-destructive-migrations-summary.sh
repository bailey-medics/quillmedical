#!/usr/bin/env bash
# Writes a summary of destructive migrations to the GitHub job summary.
#
# Usage: write-destructive-migrations-summary.sh <report>
#
# Environment:
#   GITHUB_STEP_SUMMARY  Destination file for the summary (set by the runner).
#
# <report> is detect-destructive-migrations.sh's report output: one line per
# flagged migration, "<filename> <revision> <op>[,<op>...]". Rendered as a
# table so the approver can see what is being confirmed before they click
# "Review deployments" - the same page that gate lands them on.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "write-destructive-migrations-summary"

# Render the report as a markdown table body, one row per flagged migration.
render_rows() {
  local report="$1"
  local file
  local revision
  local ops

  while read -r file revision ops; do
    [ -z "$file" ] && continue
    echo "| \`${file}\` | \`${revision}\` | ${ops//,/, } |"
  done <<<"$report"
}

main() {
  local report="${1:-}"

  if [ -z "$report" ]; then
    error "No report provided. Usage: write-destructive-migrations-summary.sh <report>"
    exit 1
  fi

  if [ -z "${GITHUB_STEP_SUMMARY:-}" ]; then
    error "GITHUB_STEP_SUMMARY not set (not running in GitHub Actions?)"
    exit 1
  fi

  {
    echo "## ⚠️ Destructive database migration(s) detected"
    echo
    echo "The following newly-added migration(s) drop a column, table, or"
    echo "constraint. Dropped clinical data cannot be recovered by a rollback."
    echo
    echo "| Migration | Revision | Destructive operations |"
    echo "| --- | --- | --- |"
    render_rows "$report"
    echo
    echo "Before approving, confirm for **each** migration that:"
    echo
    echo "- the column or table is genuinely no longer read by any serving"
    echo "  revision (the contract step of an expand-contract sequence, with"
    echo "  the expand step already deployed), and"
    echo "- the data being discarded is not needed for clinical audit history."
    echo
    echo "**Review carefully** before clicking **Review deployments** to approve."
  } >>"$GITHUB_STEP_SUMMARY"

  log "Destructive migration summary written to GitHub job summary."
}

# Only run when executed directly, so bats can source the functions.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
