#!/usr/bin/env bash
# Points a Cloud Run job at this build's image, if the job exists yet.
#
# Usage: point-job-at-build.sh <job-name> <project> <region> <image>
#
# Terraform creates a new job when its pull request merges, in a workflow
# that runs beside this deploy, so the deploy can reach the job before the
# job exists. A job that is not there yet is skipped with a notice: it is
# made with an image of its own, and the next deploy points it at the next
# build. Any other failure fails the step, as a plain `gcloud run jobs
# update` would.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "point-job-at-build"

main() {
  local job="${1:-}"
  local project="${2:-}"
  local region="${3:-}"
  local image="${4:-}"

  if [ -z "$job" ] || [ -z "$project" ] || [ -z "$region" ] || [ -z "$image" ]; then
    error "Usage: point-job-at-build.sh <job-name> <project> <region> <image>"
    exit 1
  fi

  local found

  if ! found=$(gcloud run jobs describe "$job" --project="$project" --region="$region" --format='value(metadata.name)' 2>&1); then
    if [[ "$found" == *"could not be found"* || "$found" == *"NOT_FOUND"* ]]; then
      log "::notice::${job} does not exist yet, so it keeps the image Terraform gave it until the next deploy."
      return 0
    fi

    error "Could not read ${job}: ${found}"
    exit 1
  fi

  gcloud run jobs update "$job" \
    --project="$project" \
    --region="$region" \
    --image="$image"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
