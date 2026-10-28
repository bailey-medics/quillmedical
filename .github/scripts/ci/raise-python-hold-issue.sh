#!/usr/bin/env bash
# Opens an issue saying the backend can move to the next Python minor.
#
# check-python-hold.sh decides whether the hold is still needed. This turns
# a positive finding into something that persists, as
# raise-typescript-hold-issue.sh does for the TypeScript hold: a Slack
# message would scroll away, and the Dependency Dashboard entry only works
# for someone already reading it.
#
# Idempotent by title: the check runs monthly, and a minor that has become
# ready stays ready, so every later run must find the issue it already
# opened rather than open another. The title names the minor, so the next
# one gets an issue of its own.
#
# Usage: raise-python-hold-issue.sh
#
# Environment:
#   REPORT        The finding from check-python-hold.sh (required).
#   MINOR         The Python minor it is about, such as 3.15 (required).
#   ISSUE_LABELS  Comma-separated labels. Default "dependencies".
#   GH_TOKEN      Token for the gh CLI (required in Actions).
#
# Exit codes:
#   0  an issue exists, whether this run opened it or found it
#   1  REPORT or MINOR was empty, or gh could not be reached
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "raise-python-hold-issue"

# Prints the issue's title for a minor.
issue_title() {
  local minor="$1"

  echo "Python ${minor} hold can be lifted: every compiled dependency has a wheel"
}

# Prints the number of the open issue with this exact title, or nothing.
#
# --search matches loosely, so the title is compared exactly afterwards.
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
  local minor="$2"

  cat <<BODY
${report}

## What to do

1. Open Renovate's Dependency Dashboard and tick the **Python minor
   version** entry under *Pending Approval*. Renovate raises one PR moving
   \`.python-version\` and the Python images in the Dockerfiles.
2. On that PR's branch, move what Renovate does not: the \`python\`
   constraint in both pyproject files, Ruff's and Black's
   \`target-version\`, mypy's \`python_version\`, and \`language_version\`
   in \`.pre-commit-config.yaml\`. \`check-version-consistency.sh\` names
   any place still on the old minor.
3. Once it is merged, everybody installs Python ${minor} and runs
   \`just vr\` to rebuild the backend's environment on it.

Leave the hold and the workflow in place. They move on to the next minor
by themselves.

## Why the hold exists

A new Python minor arrives before the compiled packages have wheels for
it. Without one, pip builds from source, and for some, pygit2 among them,
that fails in the slim image. 3.14 keeps getting security fixes as patch
releases meanwhile, and those are not held.

---

Opened automatically by \`.github/workflows/python-hold-check.yml\`.
Closing this issue without moving will simply reopen it next month.
BODY
}

main() {
  local report="${REPORT:-}"
  local minor="${MINOR:-}"
  local labels="${ISSUE_LABELS:-dependencies}"

  if [ -z "$report" ]; then
    error "REPORT is empty; nothing to raise an issue about"
    return 1
  fi

  if [ -z "$minor" ]; then
    error "MINOR is empty; cannot name the issue"
    return 1
  fi

  local title
  title="$(issue_title "$minor")"

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
    --body "$(issue_body "$report" "$minor")"

  log "Opened an issue: ${title}"
}

# Only run when executed, so the tests can source this file.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
