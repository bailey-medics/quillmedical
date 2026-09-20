#!/usr/bin/env bash
# Opens an issue saying the TypeScript hold can be lifted.
#
# check-typescript-hold.sh decides whether the hold is still needed. This
# turns a positive finding into something that persists. A Slack message
# would scroll away long before anyone acted on a once-a-year event, and the
# Dependency Dashboard entry only works for someone already reading it.
#
# Idempotent by title: the check runs monthly, and a hold that has become
# liftable stays liftable, so every later run must find the issue it already
# opened rather than open another.
#
# Usage: raise-typescript-hold-issue.sh
#
# Environment:
#   REPORT        The finding from check-typescript-hold.sh (required).
#   ISSUE_TITLE   Title to open and to search for. Has a default.
#   ISSUE_LABELS  Comma-separated labels. Default "dependencies".
#   GH_TOKEN      Token for the gh CLI (required in Actions).
#
# Exit codes:
#   0  an issue exists, whether this run opened it or found it
#   1  REPORT was empty, or gh could not be reached
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "raise-typescript-hold-issue"

readonly DEFAULT_TITLE="TypeScript hold can be lifted: typescript-eslint now supports TS 7"

# Prints the number of the open issue with this exact title, or nothing.
#
# --search matches loosely, so the title is compared exactly afterwards.
# Opening a duplicate every month is the one failure that would turn this
# from a reminder into noise.
find_open_issue() {
  local title="$1"

  gh issue list \
    --state open \
    --search "$title in:title" \
    --json number,title \
    --limit 50 |
    jq -r --arg title "$title" \
      'map(select(.title == $title)) | first | .number // empty'
}

# Writes the issue body. Kept separate so the tests can read it without
# going near gh.
issue_body() {
  local report="$1"

  cat <<BODY
${report}

## What to do

1. Open Renovate's Dependency Dashboard and tick the **typescript** entry
   under *Pending Approval*. Renovate will raise the upgrade PR.
2. Once that PR is green, remove the \`dependencyDashboardApproval\` rule for
   \`typescript\` from \`renovate.json\`, so majors flow normally again.
3. Delete the monthly workflow that opened this issue — it exists only to
   watch for this moment.

## Why the hold exists

typescript-eslint threw at import time against the TypeScript 7 API and
declared a peer range that stopped short of 7, so the eslint job failed
before linting a file. \`tsc\` and the test suites were fine on TS 7; the
linter alone was the blocker.

---

Opened automatically by \`.github/workflows/typescript-hold-check.yml\`.
Closing this issue without lifting the hold will simply reopen it next month.
BODY
}

main() {
  local report="${REPORT:-}"
  local title="${ISSUE_TITLE:-$DEFAULT_TITLE}"
  local labels="${ISSUE_LABELS:-dependencies}"

  if [ -z "$report" ]; then
    error "REPORT is empty; nothing to raise an issue about"
    return 1
  fi

  local existing
  if ! existing="$(find_open_issue "$title")"; then
    error "Could not search existing issues"
    return 1
  fi

  if [ -n "$existing" ]; then
    log "Issue #${existing} is already open; leaving it alone."
    return 0
  fi

  gh issue create \
    --title "$title" \
    --label "$labels" \
    --body "$(issue_body "$report")"

  log "Opened an issue: ${title}"
}

# Only run when executed, so the tests can source this file.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
