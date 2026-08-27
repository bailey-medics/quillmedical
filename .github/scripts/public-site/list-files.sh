#!/usr/bin/env bash
# Lists the contents of the teaching project's GCS landing bucket after a
# deploy, as a lightweight confirmation that files were uploaded.
#
# Usage: list-files.sh <gcp-project-id>
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "list-files"

main() {
  local project_id="${1:-}"

  if [ -z "$project_id" ]; then
    error "No GCP project ID provided. Usage: list-files.sh <gcp-project-id>"
    exit 1
  fi

  local bucket="${project_id}-landing"

  log "Checking bucket contents"
  gsutil ls "gs://${bucket}/"
}

main "$@"
