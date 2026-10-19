#!/usr/bin/env bash
# Starts the teaching sync job and waits for it, failing if it failed.
#
# Usage: GITHUB_OUTPUT=<file> run-sync-job.sh <service-account-email>
#
# The job, quill-teaching-sync-app, has ADMIN_ACTION=sync-teaching fixed in
# its own environment, so starting it is all this does: there is no action
# to choose and no token to carry. The pipeline signs in as the content
# service account, which may start this one job and read its executions,
# and nothing else. The project is read from that account's email, so a
# teaching repository needs no secret beyond the ones it already holds.
#
# Started without --wait and watched by hand, because on a failed job
# `gcloud run jobs execute --wait` exits non-zero without printing the
# execution it made, and the failure notice needs to name it: the reasons a
# bank was rejected are in that execution's log, which GitHub cannot read
# without a project-wide logging role.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "$0")/../shared/logging.sh" "run-sync-job"

JOB_NAME="quill-teaching-sync-app"
REGION="europe-west2"
# The job's own timeout is five minutes; this is the ceiling on watching
# it, with room for the start-up and the clean-up either side.
WAIT_SECONDS="${WAIT_SECONDS:-420}"
POLL_SECONDS="${POLL_SECONDS:-10}"
# The wait advances by the poll interval, so an interval of zero would
# never reach the ceiling and the step would hang until the runner's own
# timeout. One second is the floor.
if [ "$POLL_SECONDS" -lt 1 ]; then
  POLL_SECONDS=1
fi

project_from_email() {
  local email="$1"

  # name@PROJECT.iam.gserviceaccount.com, and nothing else.
  if [[ "$email" =~ ^[^@]+@([a-z][a-z0-9-]+)\.iam\.gserviceaccount\.com$ ]]; then
    echo "${BASH_REMATCH[1]}"
    return 0
  fi

  return 1
}

log_url() {
  local project="$1"
  local execution="$2"

  echo "https://console.cloud.google.com/run/jobs/executions/details/${REGION}/${execution}?project=${project}"
}

main() {
  local email="${1:-}"

  if [ -z "$email" ]; then
    error "No service account email provided. Usage: run-sync-job.sh <service-account-email>"
    exit 1
  fi

  local project

  if ! project=$(project_from_email "$email"); then
    error "Not a service account email: ${email}"
    exit 1
  fi

  log "Starting ${JOB_NAME} in ${project}"
  local execution

  execution=$(gcloud run jobs execute "$JOB_NAME" \
    --project="$project" \
    --region="$REGION" \
    --format='value(metadata.name)')

  if [ -z "$execution" ]; then
    error "gcloud did not name the execution it started"
    exit 1
  fi

  local url

  url=$(log_url "$project" "$execution")
  log "Started ${execution}: ${url}"

  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    {
      echo "execution=${execution}"
      echo "log_url=${url}"
    } >> "$GITHUB_OUTPUT"
  fi

  local waited=0
  local state

  while :; do
    # succeededCount and failedCount are empty until the task ends, so
    # the line stays empty while the job runs.
    state=$(gcloud run jobs executions describe "$execution" \
      --project="$project" \
      --region="$REGION" \
      --format='value(status.succeededCount,status.failedCount)')

    case "$state" in
      1*) log "Sync complete: ${execution}"; return 0 ;;
      *1) error "Sync failed: ${execution}. The rejected banks are in its log: ${url}"; exit 1 ;;
    esac

    if [ "$waited" -ge "$WAIT_SECONDS" ]; then
      error "Gave up waiting for ${execution} after ${WAIT_SECONDS}s: ${url}"
      exit 1
    fi

    sleep "$POLL_SECONDS"
    waited=$((waited + POLL_SECONDS))
  done
}

# Only run when executed, not when sourced, so tests can load the
# functions above without the script running itself.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
