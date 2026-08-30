#!/usr/bin/env bash
# Publishes the breaking changes an oasdiff report found, for the API gate's
# message to quote.
#
# Usage: extract-breaking-summary.sh <oasdiff-report.json>
#
# One "<id> <operation> <path> <text>" line per change - the same shape
# compute-breaking-change-hash.sh feeds into its hash, and the exact string
# `backend/scripts/new_compat_decision.py` asks to be pasted in. So the gate
# message doubles as the thing you copy from when writing a decision file.
#
# Deliberately not sourced from api_schema_diff's `compat_validation_error`
# output: that greps ERROR: lines out of the validator, so it is empty whenever
# validation passes - which is the normal case.
#
# Writes `breaking_summary` to GITHUB_OUTPUT.
#
# Environment:
#   GITHUB_OUTPUT   Destination for `breaking_summary` (set by the runner).
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "extract-breaking-summary"

# Delimiter for the heredoc form of GITHUB_OUTPUT, the only way to pass a value
# containing newlines between steps. A change text containing this line on its
# own would let the report inject arbitrary step outputs, so main refuses it.
readonly OUTPUT_DELIMITER="BREAKING_SUMMARY_EOF"

# One line per breaking change in the report ($1). Prints nothing for an
# unparseable or empty report. Pure (stdout only) so it can be tested without
# GITHUB_OUTPUT.
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

main() {
  local oasdiff_report="${1:-}"

  if [ -z "$oasdiff_report" ]; then
    error "No oasdiff report provided. Usage: extract-breaking-summary.sh <oasdiff-report.json>"
    exit 1
  fi

  if [ ! -f "$oasdiff_report" ]; then
    error "oasdiff report not found: $oasdiff_report"
    exit 1
  fi

  if [ -z "${GITHUB_OUTPUT:-}" ]; then
    error "GITHUB_OUTPUT not set (not running in GitHub Actions?)"
    exit 1
  fi

  local summary
  summary="$(extract_change_lines "$oasdiff_report")"

  if grep -qxF "$OUTPUT_DELIMITER" <<<"$summary"; then
    error "Change text contains the output delimiter '$OUTPUT_DELIMITER' on a line of its own; refusing to write it."
    exit 1
  fi

  {
    echo "breaking_summary<<${OUTPUT_DELIMITER}"
    printf '%s\n' "$summary"
    echo "$OUTPUT_DELIMITER"
  } >>"$GITHUB_OUTPUT"

  log "Published $(grep -c . <<<"$summary" || true) breaking change line(s)."
}

# Only run when executed directly, so bats can source the pure functions.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
