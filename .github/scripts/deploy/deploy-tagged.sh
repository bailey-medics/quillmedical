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
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "deploy-tagged"

# Runs the smoke test against the tagged revision's own URL. Isolated in its
# own function (rather than inlined in main) so tests can stub it.
run_smoke_test() {
  bash "$(dirname "${BASH_SOURCE[0]}")/smoke-test.sh" "$1"
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
  tagged_url=$(gcloud run services describe "$service" \
    --project="$project" \
    --region="$region" \
    --format=json | jq -r --arg TAG "$tag" \
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

  log "Promoting $tag — sending all traffic to the new revision"
  if ! gcloud run services update-traffic "$service" \
    --project="$project" \
    --region="$region" \
    --to-latest; then
    error "Failed to promote $tag to receive traffic"
    exit 1
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then main "$@"; fi
