#!/usr/bin/env bash
# Deploys a new revision under a traffic tag with --no-traffic, smoke-tests
# that revision's own tagged URL, and only then promotes it to receive all
# traffic. Keeps live traffic on the previous revision until the new one has
# proven healthy — see docs/docs/plans/2026-08-09-alembic-review-plan.md,
# item 13.
#
# Usage: deploy-tagged.sh <service> <project> <region> <image> <tag> <health-path>
#
# Exits non-zero (leaving traffic on the previous revision) if the tagged
# deploy, URL lookup, or smoke test fails. Only reaches the promote step once
# the new revision is confirmed healthy.
#
# The promote is issued with --async and then verified by polling the
# service's own status, rather than letting gcloud wait on the operation.
# gcloud's built-in wait has no ceiling of its own: when Cloud Run stalled on
# "Provisioning revision instances to receive traffic" it sat for 56 minutes
# before crashing with a WaitException, holding the serialised deploy queue
# the whole time. Polling here is bounded, and a stalled promotion gets one
# fresh attempt before the step fails with the service's conditions printed.
#
# Environment (all optional, mainly for tests):
#   PROMOTE_ATTEMPTS               Promotions to try before giving up (2)
#   PROMOTE_TIMEOUT_SECONDS        Wait per attempt for traffic to settle (300)
#   PROMOTE_POLL_INTERVAL_SECONDS  Delay between status polls (10)
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "deploy-tagged"

# Runs the smoke test against the tagged revision's own URL. Isolated in its
# own function (rather than inlined in main) so tests can stub it.
run_smoke_test() {
  bash "$(dirname "${BASH_SOURCE[0]}")/smoke-test.sh" "$1"
}

# Prints the service's current state as JSON.
describe_service() {
  local service="$1" project="$2" region="$3"

  gcloud run services describe "$service" \
    --project="$project" \
    --region="$region" \
    --format=json
}

# Succeeds once the service JSON on stdin shows the promotion has landed:
# the service is Ready, the newest revision is the one Cloud Run considers
# ready, and that revision is actually carrying all of the traffic. Checks
# status (what is live), not spec (what was asked for) — the stalled deploy
# had spec at 100% LATEST while status still sat on the old revision.
promotion_settled() {
  jq -e '
    (.status.conditions // [] | map(select(.type == "Ready")) | .[0].status) == "True"
    and .status.latestCreatedRevisionName == .status.latestReadyRevisionName
    and (.status.latestReadyRevisionName as $rev
         | [.status.traffic[]? | select(.revisionName == $rev) | .percent // 0]
         | add // 0) == 100
  ' > /dev/null
}

# Polls the service until the promotion settles or the timeout passes.
# Always polls at least once, so a zero timeout still checks the state.
wait_for_promotion() {
  local service="$1" project="$2" region="$3"
  local timeout="${PROMOTE_TIMEOUT_SECONDS:-300}"
  local interval="${PROMOTE_POLL_INTERVAL_SECONDS:-10}"
  local deadline=$((SECONDS + timeout))

  while true; do
    if describe_service "$service" "$project" "$region" | promotion_settled; then
      return 0
    fi

    if [ "$SECONDS" -ge "$deadline" ]; then
      return 1
    fi

    sleep "$interval"
  done
}

# Prints the service's conditions and traffic split, so a failed promotion
# leaves the reason in the job log rather than only in the GCP console.
print_promotion_diagnostics() {
  local service="$1" project="$2" region="$3"

  log "Service conditions and traffic at the time of failure:"
  describe_service "$service" "$project" "$region" \
    | jq '{conditions: .status.conditions, traffic: .status.traffic}' || true
}

main() {
  local service="${1:-}"
  local project="${2:-}"
  local region="${3:-}"
  local image="${4:-}"
  local tag="${5:-}"
  local health_path="${6:-}"

  if [ -z "$service" ] || [ -z "$project" ] || [ -z "$region" ] || \
    [ -z "$image" ] || [ -z "$tag" ] || [ -z "$health_path" ]; then
    error "Usage: deploy-tagged.sh <service> <project> <region> <image> <tag> <health-path>"
    exit 1
  fi

  log "Deploying $service to $image under tag $tag (no traffic)"
  if ! gcloud run services update "$service" \
    --project="$project" \
    --region="$region" \
    --image="$image" \
    --no-traffic \
    --tag="$tag"; then
    error "Failed to deploy $service under tag $tag"
    exit 1
  fi

  log "Resolving the tagged revision's own URL"
  local tagged_url
  tagged_url=$(describe_service "$service" "$project" "$region" \
    | jq -r --arg TAG "$tag" \
    '.status.traffic[] | select(.tag==$TAG) | .url')

  if [ -z "$tagged_url" ] || [ "$tagged_url" = "null" ]; then
    error "Could not resolve a tagged URL for $tag on $service"
    exit 1
  fi

  log "Smoke-testing the new revision at ${tagged_url}${health_path}"
  if ! run_smoke_test "${tagged_url}${health_path}"; then
    error "Smoke test failed for tagged revision $tag — traffic left on the previous revision"
    exit 1
  fi

  local attempts="${PROMOTE_ATTEMPTS:-2}"
  local attempt
  for ((attempt = 1; attempt <= attempts; attempt++)); do
    log "Promoting $tag — sending all traffic to the new revision (attempt $attempt/$attempts)"
    if ! gcloud run services update-traffic "$service" \
      --project="$project" \
      --region="$region" \
      --to-latest \
      --async; then
      error "Cloud Run rejected the traffic update for $tag"
      continue
    fi

    if wait_for_promotion "$service" "$project" "$region"; then
      log "Promotion settled: $tag is serving all traffic"
      return 0
    fi

    error "Traffic did not settle on $tag within ${PROMOTE_TIMEOUT_SECONDS:-300}s"
  done

  error "Failed to promote $tag to receive traffic after $attempts attempts"
  print_promotion_diagnostics "$service" "$project" "$region"
  exit 1
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then main "$@"; fi
