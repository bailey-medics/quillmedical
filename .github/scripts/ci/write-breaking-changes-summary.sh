#!/usr/bin/env bash
# Writes a formatted summary of breaking API changes to the GitHub job summary.
#
# Usage: write-breaking-changes-summary.sh <oasdiff-report.json>
#
# Environment:
#   GITHUB_STEP_SUMMARY  Destination file for the summary (set by the runner).
#
# Expects the oasdiff JSON report (generated with `--format json`). Formats
# each breaking change as "id operation path - text" for easy review by the
# approver before they click "Review deployments".
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "write-breaking-changes-summary"

main() {
  local oasdiff_report="${1:-}"

  if [ -z "$oasdiff_report" ]; then
    error "No oasdiff report provided. Usage: write-breaking-changes-summary.sh <oasdiff-report.json>"
    exit 1
  fi

  if [ ! -f "$oasdiff_report" ]; then
    error "oasdiff report file not found: $oasdiff_report"
    exit 1
  fi

  if [ -z "${GITHUB_STEP_SUMMARY:-}" ]; then
    error "GITHUB_STEP_SUMMARY not set (not running in GitHub Actions?)"
    exit 1
  fi

  {
    echo "## ⚠️ Breaking API Changes Detected"
    echo
    echo "The following breaking changes must be approved:"
    echo

    if ! jq empty "$oasdiff_report" 2>/dev/null; then
      echo "Unable to parse oasdiff report as JSON (see logs above for details)."
    elif [ "$(jq 'length' "$oasdiff_report")" -eq 0 ]; then
      echo "oasdiff report contained no entries (see logs above for details)."
    else
      echo '```'
      jq -r '.[] | "\(.id) \(.operation) \(.path) - \(.text)"' "$oasdiff_report" | sed 's/^/  /'
      echo '```'
    fi

    echo
    echo "**Review the changes carefully** before clicking **Review deployments** to approve."
  } >>"$GITHUB_STEP_SUMMARY"

  log "Breaking changes summary written to GitHub job summary."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
