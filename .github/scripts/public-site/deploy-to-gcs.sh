#!/usr/bin/env bash
# Syncs the built public site to the teaching project's GCS landing bucket,
# setting per-file-type cache headers.
#
# Usage: deploy-to-gcs.sh <gcp-project-id>
#
# Cache strategy:
#   - hashed js/css: 1-year immutable cache
#   - other static files (images, icons, manifest, etc.): 30 days
#   - HTML: never cached, so content updates are picked up immediately
#
# Mirror-delete: each pass uses rsync -d so removed/renamed pages and stale
# assets are deleted from the bucket. -x protects excluded files from deletion,
# and dropping -r confines the top-level passes to their own slice, so app-only
# sub-folders and the assets/ tree are never wiped by the wrong pass. An
# empty-build guard aborts before any sync if index.html is missing, so a broken
# build can never mirror-delete the live site.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "deploy-to-gcs"

main() {
  local project_id="${1:-}"

  if [ -z "$project_id" ]; then
    error "No GCP project ID provided. Usage: deploy-to-gcs.sh <gcp-project-id>"
    exit 1
  fi

  local bucket="${project_id}-landing"

  # Guard: never mirror-delete on a broken/empty build.
  if [ ! -f public-site/index.html ]; then
    error "public-site/index.html not found; refusing to sync to avoid wiping the live site"
    exit 1
  fi

  log "Uploading hashed assets with immutable caching"
  gsutil -m -h "Cache-Control:public, max-age=31536000, immutable" \
    rsync -r -d -x '.*\.html$' public-site/assets/ "gs://${bucket}/assets/"

  log "Uploading remaining static files"
  gsutil -m -h "Cache-Control:public, max-age=2592000" \
    rsync -d -x '.*\.html$' public-site/ "gs://${bucket}/"

  log "Uploading HTML files with no-cache"
  gsutil -m -h "Cache-Control:no-cache" \
    rsync -d -x '.*(?<!\.html)$' public-site/ "gs://${bucket}/"

  log "Deployment to gs://${bucket}/ complete"
}

main "$@"
