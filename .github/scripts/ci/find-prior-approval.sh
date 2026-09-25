#!/usr/bin/env bash
# Finds an earlier human approval of this same change, so a gate need not ask again.
#
# Usage: find-prior-approval.sh <pr-number> <head-ref> <workflow-file> \
#          <environment> <artifact-name> <fingerprint> <current-run-id>
#
# Environment:
#   GH_TOKEN           Token for the GitHub API (actions: read).
#   GITHUB_REPOSITORY  "owner/repo" (set by the runner).
#   GITHUB_OUTPUT      Destination for `approved=true|false` and, on a match,
#                      `approved_by`, `approved_run` and `approved_at`.
#
# Looks through this workflow's earlier pull_request runs for the pull request,
# newest first. A run counts only when both hold:
#
#   - GitHub's own approval record for the run shows the environment approved
#     by a person, not a bot. Nothing a script or an agent could write - a PR
#     comment, a label, a commit message - is accepted as proof that a human
#     decided; see docs/docs/backend/api-compatibility.md.
#   - The change fingerprint that run recorded, as an artifact written by its
#     own detection job, equals <fingerprint>. The fingerprint is the patch ID
#     of the pull request's own change (compute-change-fingerprint.sh), so it
#     survives a rebase and changes with any edit to the pull request's code.
#
# Anything that goes wrong reading a run - an expired artifact, an API error -
# counts as "no approval found", so the gate asks again. Failing closed is the
# point: the worst outcome of a miss is one more approval click.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "find-prior-approval"

# Prints the login of a person who approved <environment>, from a run's
# approvals JSON on stdin; prints nothing when there is none. A bot's approval
# is ignored: the gate exists to record a human decision.
human_approver() {
  local environment="$1"
  jq -r --arg env "$environment" '
    [ .[]
      | select(.state == "approved")
      | select(.user.type == "User")
      | select(any(.environments[]?; .name == $env))
    ]
    | first
    | if . == null then "" else .user.login end
  '
}

# Prints "<run-id> <created-at>" for each earlier run of <workflow-file> on
# this pull request, newest first, from a workflow-runs JSON on stdin.
earlier_runs() {
  local pr_number="$1"
  local current_run_id="$2"
  jq -r --argjson pr "$pr_number" --argjson current "$current_run_id" '
    .workflow_runs
    | map(select(.id != $current))
    | map(select(any(.pull_requests[]?; .number == $pr)))
    | sort_by(.created_at) | reverse
    | .[] | "\(.id) \(.created_at)"
  '
}

# Prints the fingerprint a run recorded, or nothing when it cannot be read.
recorded_fingerprint() {
  local run_id="$1"
  local artifact_name="$2"
  local dir
  dir="$(mktemp -d)"
  if gh run download "$run_id" --repo "$GITHUB_REPOSITORY" \
    --name "$artifact_name" --dir "$dir" >/dev/null 2>&1 &&
    [ -f "$dir/fingerprint.txt" ]; then
    tr -d '[:space:]' <"$dir/fingerprint.txt"
  fi
  rm -rf "$dir"
}

main() {
  local pr_number="${1:-}"
  local head_ref="${2:-}"
  local workflow_file="${3:-}"
  local environment="${4:-}"
  local artifact_name="${5:-}"
  local fingerprint="${6:-}"
  local current_run_id="${7:-}"
  local runs_json run_id created_at approvals approver recorded

  if [ -z "$pr_number" ] || [ -z "$head_ref" ] || [ -z "$workflow_file" ] ||
    [ -z "$environment" ] || [ -z "$artifact_name" ] || [ -z "$fingerprint" ] ||
    [ -z "$current_run_id" ]; then
    error "Usage: find-prior-approval.sh <pr-number> <head-ref> <workflow-file> <environment> <artifact-name> <fingerprint> <current-run-id>"
    exit 1
  fi

  for var in GH_TOKEN GITHUB_REPOSITORY GITHUB_OUTPUT; do
    if [ -z "${!var:-}" ]; then
      error "${var} not set (not running in GitHub Actions?)"
      exit 1
    fi
  done

  if [ "$fingerprint" = "empty" ]; then
    log "Empty change: nothing to match against."
    echo "approved=false" >>"$GITHUB_OUTPUT"
    return 0
  fi

  if ! runs_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/${workflow_file}/runs?event=pull_request&branch=${head_ref}&per_page=100")"; then
    log "Could not list earlier runs; asking for approval."
    echo "approved=false" >>"$GITHUB_OUTPUT"
    return 0
  fi

  while read -r run_id created_at; do
    [ -n "$run_id" ] || continue
    approvals="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${run_id}/approvals" 2>/dev/null || echo '[]')"
    approver="$(human_approver "$environment" <<<"$approvals")"
    [ -n "$approver" ] || continue

    recorded="$(recorded_fingerprint "$run_id" "$artifact_name")"
    if [ "$recorded" = "$fingerprint" ]; then
      log "Approved by ${approver} in run ${run_id} (${created_at}) for this same change."
      {
        echo "approved=true"
        echo "approved_by=${approver}"
        echo "approved_run=${run_id}"
        echo "approved_at=${created_at}"
      } >>"$GITHUB_OUTPUT"
      return 0
    fi
  done < <(earlier_runs "$pr_number" "$current_run_id" <<<"$runs_json")

  log "No earlier human approval of this change; asking for one."
  echo "approved=false" >>"$GITHUB_OUTPUT"
}

# Only run when executed directly, so bats can source the pure functions.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
