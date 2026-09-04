#!/usr/bin/env bash
# Posts the teaching content sweep's findings to a pull request.
#
# Usage: GH_TOKEN=<token> post-sweep-comment.sh <pr-number> <report-file>
#
# The sweep answers "which published Q banks would this change reject?". That
# answer is only useful to the person making the change, so it goes on their
# pull request rather than into a job log they have no reason to open.
set -euo pipefail

# shellcheck source=../shared/logging.sh
# BASH_SOURCE, not $0: the tests source this file to reach build_body, and
# $0 is then bats rather than this script.
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "post-sweep-comment"

#: A comment is a poor place for a long report, and the detail is in the run.
MAX_REPORT_LINES=40

# Pure so it can be tested without a pull request. Args: <report> <run-url>.
build_body() {
  local report="$1" run_url="$2"

  printf '### Published teaching content would fail this change\n\n'
  printf 'The validator in this branch rejects content that is already live.\n'
  printf 'This may be intentional.\n'
  # shellcheck disable=SC2016
  printf '```\n%s\n```\n\n' "$report"
  printf '[View the full run](%s)\n' "$run_url"
}

main() {
  local pr_number="${1:-}"
  local report_file="${2:-}"

  if [ -z "$pr_number" ]; then
    error "No pull request number provided. Usage: post-sweep-comment.sh <pr-number> <report-file>"
    exit 1
  fi

  if [ -z "$report_file" ]; then
    error "No report file provided. Usage: post-sweep-comment.sh <pr-number> <report-file>"
    exit 1
  fi

  if [ -z "${GH_TOKEN:-}" ]; then
    error "GH_TOKEN is not set; cannot authenticate with the GitHub CLI"
    exit 1
  fi

  if [ ! -s "$report_file" ]; then
    error "Report '$report_file' is missing or empty"
    exit 1
  fi

  local report

  report="$(head -n "$MAX_REPORT_LINES" "$report_file")"

  if [ "$(wc -l < "$report_file")" -gt "$MAX_REPORT_LINES" ]; then
    report="${report}"$'\n'"… truncated, see the run"
  fi

  local run_url="${GITHUB_SERVER_URL:-}/${GITHUB_REPOSITORY:-}/actions/runs/${GITHUB_RUN_ID:-}"

  log "Posting sweep findings to PR #${pr_number}"

  build_body "$report" "$run_url" | gh pr comment "$pr_number" --body-file -
}

# Only run when executed, not when sourced, so tests can load the
# functions above without the script running itself.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
