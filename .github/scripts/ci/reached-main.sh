#!/usr/bin/env bash
# Says whether a merged pull request's commit is on main.
#
# Usage: reached-main.sh <repository> <merge-commit-sha>
#
# For merged-outside-main.yml, which raises an alarm when a pull request
# is merged into a branch other than main. Its first version went by the
# pull request's base branch alone, and that is wrong for a stack merged
# through the merge queue: the queue lands every pull request of the stack
# on main, and each one above the bottom still records the branch beneath
# it as its base. On 12 October 2026 eight alarms fired for pull requests
# that were all on main.
#
# So this asks the one question that matters: is the commit the pull
# request was merged as on main? GitHub's compare answers it with no
# checkout. "ahead" or "identical", read from the commit to main, means
# main holds it.
#
# It asks twice, RETRY_WAIT_SECONDS apart (30 unless set), before saying
# no. The event for a pull request can arrive a moment before main is seen
# to have moved, and a wrong "no" is a false alarm.
#
# Writes reached=true or reached=false to $GITHUB_OUTPUT. A commit GitHub
# cannot compare counts as not reached, so the alarm is raised when in
# doubt.
#
# Needs GH_TOKEN.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "reached-main"

# Prints how main stands against a commit: ahead, identical, behind or
# diverged. Nothing when GitHub cannot say. Its own function so the tests
# can stand in for GitHub.
compare_with_main() {
  local repository="$1"
  local sha="$2"

  gh api "repos/${repository}/compare/${sha}...main" --jq '.status' 2>/dev/null || true
}

# Says whether main holds the commit.
is_on_main() {
  local status=""
  status="$(compare_with_main "$1" "$2")"

  [ "$status" = "ahead" ] || [ "$status" = "identical" ]
}

main() {
  local repository="${1:-}"
  local sha="${2:-}"

  if [ -z "$repository" ]; then
    error "Usage: reached-main.sh <repository> <merge-commit-sha>"
    exit 1
  fi

  local reached="false"

  # A merged pull request with no merge commit is not one this can vouch
  # for, so it is left as not reached.
  if [[ "$sha" =~ ^[0-9a-f]{7,40}$ ]]; then
    if is_on_main "$repository" "$sha"; then
      reached="true"
    else
      sleep "${RETRY_WAIT_SECONDS:-30}"

      if is_on_main "$repository" "$sha"; then
        reached="true"
      fi
    fi
  else
    log "No merge commit given, so nothing to look for on main"
  fi

  log "Commit ${sha:-none} on main: ${reached}"
  echo "reached=${reached}" >> "$GITHUB_OUTPUT"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
