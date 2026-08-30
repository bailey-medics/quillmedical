#!/usr/bin/env bash
# Waits until every ancestor commit of this run has finished deciding whether
# to comment, so the PR's comments land in commit order.
#
# Usage: GH_TOKEN=<token> wait-for-ancestor-decisions.sh <job-name> <head-sha> <run-id>
#
# Arguments:
#   job-name   The `name:` of the decide job to wait on, e.g. "Destructive-migration
#              Slack notification decision". Each gate waits only on its own.
#   head-sha   The commit this run is for (github.event.pull_request.head.sha).
#   run-id     This run's id, so it does not wait on itself.
#
# Waits on the decide JOB of each ancestor run, never the run itself. The run
# also holds the approval gate, and a job awaiting environment approval has
# not started, so its `timeout-minutes` is not counting - GitHub parks the run
# in `waiting` for up to 30 days. Waiting on run status would therefore stall
# every later commit's notification behind an unapproved one for that long.
#
# Environment:
#   GH_TOKEN            Token used by `gh` (needs `actions: read`).
#   GITHUB_REPOSITORY   "owner/repo" (set by the runner).
#   GITHUB_HEAD_REF     The PR's source branch, to scope the run listing (set by the runner).
#   GITHUB_WORKFLOW_REF Used to derive the workflow file to query (set by the runner).
#   WAIT_SETTLE_SECONDS      Pause before the first poll (default 0). Needed
#                            only where detection is fast enough that this job
#                            can start before a sibling run has registered -
#                            see the note below.
#   WAIT_POLL_SECONDS        Pause between polls (default 10).
#   WAIT_DEADLINE_SECONDS    Give up and proceed after this (default 600).
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "wait-for-ancestor-decisions"

SETTLE_SECONDS="${WAIT_SETTLE_SECONDS:-0}"
POLL_SECONDS="${WAIT_POLL_SECONDS:-10}"
DEADLINE_SECONDS="${WAIT_DEADLINE_SECONDS:-600}"
readonly SETTLE_SECONDS POLL_SECONDS DEADLINE_SECONDS

# Did this commit come before ours on the branch?
#
# Checks the commit still exists first. A force-push can delete commits, and
# asking git about a missing one is an error rather than a "no" - which would
# stop the script.
is_ancestor_commit() {
  local candidate="$1"
  local head="$2"

  git cat-file -e "${candidate}^{commit}" 2>/dev/null || return 1
  git merge-base --is-ancestor "$candidate" "$head" 2>/dev/null
}

# Which runs do we have to wait for?
#
# A run counts only if all three are true:
#   * it has not finished yet
#   * it is not this run - otherwise we would wait for ourselves forever
#   * its commit came earlier on the branch than ours
#
# Prints one "<run id> <commit>" per line. Split out from the polling so it
# can be tested without calling GitHub.
ancestor_run_ids() {
  local runs_json="$1"
  local head_sha="$2"
  local own_run_id="$3"

  # Finds every run that has not finished, one "<run id><tab><commit>" per line.
  local unfinished_runs
  unfinished_runs="$(jq -r '
    .workflow_runs[]?
    | select(.status != "completed")
    | "\(.id)\t\(.head_sha)"
  ' <<<"$runs_json")"

  local id
  local sha

  while IFS=$'\t' read -r id sha; do
    [ -n "$id" ] || continue
    [ "$id" != "$own_run_id" ] || continue

    if is_ancestor_commit "$sha" "$head_sha"; then
      printf '%s %s\n' "$id" "$sha"
    fi
  done <<<"$unfinished_runs"
}

# Has that run finished deciding?
#
# Cancelled and failed both count as finished: they will never post a comment,
# so waiting for them would just waste the deadline. A job missing from the
# list has NOT finished - it is probably still queued behind its detection
# job. Split out from the polling so it can be tested without calling GitHub.
decide_job_finished() {
  local jobs_json="$1"
  local job_name="$2"

  local status
  status="$(jq -r --arg name "$job_name" \
    'first(.jobs[]? | select(.name == $name) | .status) // "absent"' <<<"$jobs_json")"

  [ "$status" = "completed" ]
}

main() {
  local job_name="${1:-}"
  local head_sha="${2:-}"
  local own_run_id="${3:-}"

  if [ -z "$job_name" ]; then
    error "No job name provided. Usage: wait-for-ancestor-decisions.sh <job-name> <head-sha> <run-id>"
    exit 1
  fi

  if [ -z "$head_sha" ]; then
    error "No head SHA provided. Usage: wait-for-ancestor-decisions.sh <job-name> <head-sha> <run-id>"
    exit 1
  fi

  if [ -z "$own_run_id" ]; then
    error "No run id provided. Usage: wait-for-ancestor-decisions.sh <job-name> <head-sha> <run-id>"
    exit 1
  fi

  if [ -z "${GH_TOKEN:-}" ]; then
    error "GH_TOKEN is not set; cannot authenticate with the GitHub CLI"
    exit 1
  fi

  if [ -z "${GITHUB_REPOSITORY:-}" ]; then
    error "GITHUB_REPOSITORY not set (not running in GitHub Actions?)"
    exit 1
  fi

  if [ -z "${GITHUB_HEAD_REF:-}" ]; then
    error "GITHUB_HEAD_REF not set (not a pull_request event?)"
    exit 1
  fi

  if [ -z "${GITHUB_WORKFLOW_REF:-}" ]; then
    error "GITHUB_WORKFLOW_REF not set (not running in GitHub Actions?)"
    exit 1
  fi

  # GitHub gives us a long reference like:
  # "owner/repo/.github/workflows/gate-breaking.yml@refs/pull/1/merge".
  # Cut it down to just "gate-breaking.yml", which is what the API asks for.
  local workflow_file
  workflow_file="$(basename "${GITHUB_WORKFLOW_REF%%@*}")"

  # Catches a malformed reference the guard above cannot - one that starts
  # with "@", say, leaving nothing once the suffix is cut off.
  if [ -z "$workflow_file" ]; then
    error "Could not derive a workflow file name from GITHUB_WORKFLOW_REF: '${GITHUB_WORKFLOW_REF}'"
    exit 1
  fi

  # A sibling run needs a moment to appear in the runs listing. Whether that
  # matters depends on how fast this gate's detection job is, which is why the
  # default is 0 and the caller sets it:
  #
  #   migration gate - detection ~9s, so this job starts ~14s after the push,
  #                    inside the window where a sibling may not be listed yet.
  #   API gate       - detection takes minutes, so everything has long
  #                    registered by the time this runs.
  #
  # Measured on PR #446: three pushes 5s apart, and this job proceeded 0.45s
  # after starting, having seen none of its ancestors. The comment left
  # standing then described migrations the branch no longer had.
  if [ "$SETTLE_SECONDS" -gt 0 ]; then
    log "Letting sibling runs register (${SETTLE_SECONDS}s)..."
    sleep "$SETTLE_SECONDS"
  fi

  log "Waiting for ancestors of ${head_sha} to finish '${job_name}'..."

  # SECONDS is automatically incremented by bash, so we can use it to track
  # elapsed time.
  SECONDS=0

  while [ "$SECONDS" -lt "$DEADLINE_SECONDS" ]; do
    # Newest runs first, so an ancestor still deciding is near the top - it was
    # pushed moments ago. 20 is deep enough to cover a burst of pushes while
    # keeping the response small: each run object is ~14KB, two thirds of it
    # repository detail this script never reads, and this runs on every poll.
    # ancestor_run_ids drops the completed ones, so no status filter is needed
    # (and none would do: a run awaiting approval is "waiting", not "completed",
    # and may still have a decide job in flight).
    local runs_json

    runs_json="$(gh api --method GET \
      "repos/${GITHUB_REPOSITORY}/actions/workflows/${workflow_file}/runs" \
      -f "branch=${GITHUB_HEAD_REF}" -f "per_page=20" 2>/dev/null || echo '{}')"

    # Counted for the log line below: "no ancestor still deciding" reads the
    # same whether we checked three runs or listed none at all, and that
    # difference is exactly what went unnoticed on PR #446.
    local considered
    considered="$(jq '[.workflow_runs[]?] | length' <<<"$runs_json" 2>/dev/null || echo 0)"

    local pending=0
    local ancestors=0
    local id
    local sha
    local jobs_json

    while read -r id sha; do
      [ -n "$id" ] || continue
      ancestors=$((ancestors + 1))
      jobs_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${id}/jobs" 2>/dev/null || echo '{}')"
      if ! decide_job_finished "$jobs_json" "$job_name"; then
        log "  still waiting on run ${id} (commit ${sha})"
        pending=$((pending + 1))
      fi
    done < <(ancestor_run_ids "$runs_json" "$head_sha" "$own_run_id")

    if [ "$pending" -eq 0 ]; then
      log "No ancestor still deciding after ${SECONDS}s (${considered} run(s) listed, ${ancestors} ancestor(s) of ours) - proceeding."
      return 0
    fi

    sleep "$POLL_SECONDS"
  done

  # Deliberately not an error: a stuck ancestor must not cost this commit its
  # comment. Out-of-order comments are recoverable; a missing one is not.
  log "Deadline of ${DEADLINE_SECONDS}s reached with ancestors still deciding - proceeding anyway."
}

# Only run when executed directly, so bats can source the pure functions.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
