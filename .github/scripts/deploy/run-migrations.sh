#!/usr/bin/env bash
# Updates the admin Cloud Run Job to the given image, then executes it and
# blocks until it completes, running `alembic upgrade head` once against the
# shared core database before the new app revision is deployed.
#
# Usage: run-migrations.sh <job-name> <project> <region> <image>
#
# Exits non-zero if the job update or execution fails, so a failed migration
# blocks the subsequent service deploy (see
# docs/docs/backend/alembic-migration-safety.md).
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "run-migrations"

main() {
  local job_name="${1:-}"
  local project="${2:-}"
  local region="${3:-}"
  local image="${4:-}"

  if [ -z "$job_name" ] || [ -z "$project" ] || [ -z "$region" ] || [ -z "$image" ]; then
    error "Usage: run-migrations.sh <job-name> <project> <region> <image>"
    exit 1
  fi

  log "Updating $job_name to image $image"
  if ! gcloud run jobs update "$job_name" \
    --project="$project" \
    --region="$region" \
    --image="$image"; then
    error "Failed to update $job_name to image $image"
    exit 1
  fi

  log "Executing $job_name (running database migrations, waiting for completion)"
  if ! gcloud run jobs execute "$job_name" \
    --project="$project" \
    --region="$region" \
    --update-env-vars=ADMIN_ACTION=run-migrations \
    --wait; then
    error "Migration job $job_name failed"
    exit 1
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
