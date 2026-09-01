#!/usr/bin/env bash
# Uploads a teaching content repository's modules to the GCS bucket.
#
# Usage: sync-to-gcs.sh <modules-directory> <bucket-name>
#
# Each module is mirrored whole to modules/<bank_id>/, so the bucket has the
# repository's shape and the backend needs no reconstruction to read it.
# Previously the same module was split across three prefixes, with
# assessment/ renamed to questions/ on the way.
#
# rsync with --delete, so a file removed from the repo is removed from the
# bucket.
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

    gsutil -m rsync -r -d \
      "${module_dir}" \
      "gs://${bucket}/modules/${bank_id}/"
  done

  log "Sync complete"
}

# Only run when executed, not when sourced, so tests can load the
# functions above without the script running itself.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
