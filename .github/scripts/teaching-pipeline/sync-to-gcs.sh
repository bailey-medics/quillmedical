#!/usr/bin/env bash
# Uploads a teaching content repository's modules to the GCS bucket.
#
# Usage: sync-to-gcs.sh <modules-directory> <bucket-name>
#
# Each module is split across three prefixes: assessment content to
# questions/, learning content to learning/, and module.yaml to modules/.
# Uses rsync with --delete so a file removed from the repo is removed from
# the bucket; module.yaml is copied rather than synced as it is a single
# file. Modules missing a section are skipped rather than failing.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "$0")/../shared/logging.sh" "sync-to-gcs"

main() {
  local modules_dir="${1:-}"
  local bucket="${2:-}"

  if [ -z "$modules_dir" ]; then
    error "No modules directory provided. Usage: sync-to-gcs.sh <modules-directory> <bucket-name>"
    exit 1
  fi

  if [ -z "$bucket" ]; then
    error "No bucket name provided. Usage: sync-to-gcs.sh <modules-directory> <bucket-name>"
    exit 1
  fi

  if [ ! -d "$modules_dir" ]; then
    error "Modules directory not found: ${modules_dir}"
    exit 1
  fi

  local module_dir bank_id
  for module_dir in "$modules_dir"/*/; do
    [ -d "$module_dir" ] || continue
    bank_id=$(basename "$module_dir")
    log "Syncing ${bank_id}"

    if [ -d "${module_dir}assessment" ]; then
      gsutil -m rsync -r -d \
        "${module_dir}assessment/" \
        "gs://${bucket}/questions/${bank_id}/"
    fi

    if [ -d "${module_dir}learning" ]; then
      gsutil -m rsync -r -d \
        "${module_dir}learning/" \
        "gs://${bucket}/learning/${bank_id}/"
    fi

    if [ -f "${module_dir}module.yaml" ]; then
      gsutil cp "${module_dir}module.yaml" \
        "gs://${bucket}/modules/${bank_id}/module.yaml"
    fi
  done

  log "Sync complete"
}

# Only run when executed, not when sourced, so tests can load the
# functions above without the script running itself.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
