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
#
# Clean URLs: pages are uploaded without their .html extension, so the site
# serves /about and not /about.html. Cloud Storage serves exactly the object
# name asked for and has no rewriting of its own, and the load balancer in
# front of it is a classic Application Load Balancer, on which URL rewriting is
# not available — so the object name is the URL, and renaming is the only place
# this can be solved.
#
# index.html and not-found.html keep their names: the bucket's website
# configuration names them in main_page_suffix and not_found_page, so renaming
# them would break the front page and the 404.
#
# The rename happens in the source directory *before* the passes, so
# mirror-delete does the rest: the old .html objects are absent from the source
# and the HTML pass deletes them on the first deploy, while a page dropped from
# the build takes its URL with it. The cost is that renamed pages go up in the
# non-HTML pass and so arrive with the wrong content type and a 30-day cache,
# which the final setmeta pass corrects.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "deploy-to-gcs"

# Names of the pages that get a clean URL: every top-level page except the two
# the bucket's website configuration names by filename. Emitted one per line.
clean_url_pages() {
  local src="$1"
  local page
  local base

  for page in "$src"/*.html; do
    [ -e "$page" ] || continue
    base="$(basename "$page" .html)"
    case "$base" in
      index | not-found) continue ;;
    esac
    printf '%s\n' "$base"
  done
}

# Rename each page to its extensionless form, so the ordinary passes upload
# that and mirror-delete removes the .html object it replaces.
make_clean_urls() {
  local src="$1"
  local base
  local count=0

  while IFS= read -r base; do
    mv "${src}/${base}.html" "${src}/${base}"
    count=$((count + 1))
  done < <(clean_url_pages "$src")
  log "Renamed ${count} pages to clean URLs"
}

# The renamed pages, read back from the directory after the rename rather than
# recomputed from *.html — by this point there are no .html pages left to find.
clean_url_objects() {
  local src="$1"
  local file
  local base

  for file in "$src"/*; do
    [ -f "$file" ] || continue

    base="$(basename "$file")"

    # Anything with an extension is an asset, not a page.
    case "$base" in
      *.*) continue ;;
    esac

    printf '%s\n' "$base"
  done
}

# Correct what the non-HTML pass got wrong for the renamed pages. Without an
# extension gsutil types them application/octet-stream, which a browser offers
# to download rather than render, and it caches them for 30 days when HTML is
# meant never to be cached.
set_clean_url_metadata() {
  local src="$1"
  local bucket="$2"
  local base
  local -a objects=()

  while IFS= read -r base; do
    objects+=("gs://${bucket}/${base}")
  done < <(clean_url_objects "$src")

  if [ ${#objects[@]} -eq 0 ]; then
    log "No clean URLs to retype"
    return 0
  fi

  log "Setting HTML content type and no-cache on ${#objects[@]} clean URLs"

  gsutil -m setmeta \
    -h "Content-Type:text/html; charset=utf-8" \
    -h "Cache-Control:no-cache" \
    "${objects[@]}"
}

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

  make_clean_urls "public-site"

  log "Uploading hashed assets with immutable caching"
  gsutil -m -h "Cache-Control:public, max-age=31536000, immutable" \
    rsync -r -d -x '.*\.html$' public-site/assets/ "gs://${bucket}/assets/"

  log "Uploading remaining static files"
  gsutil -m -h "Cache-Control:public, max-age=2592000" \
    rsync -d -x '.*\.html$' public-site/ "gs://${bucket}/"

  log "Uploading HTML files with no-cache"
  gsutil -m -h "Cache-Control:no-cache" \
    rsync -d -x '.*(?<!\.html)$' public-site/ "gs://${bucket}/"

  set_clean_url_metadata "public-site" "$bucket"

  log "Deployment to gs://${bucket}/ complete"
}

main "$@"
