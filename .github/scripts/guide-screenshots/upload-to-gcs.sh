#!/usr/bin/env bash
# Sorts the in-app guides' screenshots into the public and the private
# guide-assets buckets, and mirrors each.
#
# Usage: upload-to-gcs.sh <gcp-project-id>
#
# Reads from a relative "guide-assets" directory, laid out as the guides name
# their images, <guide>/<name>.png, with a file "public-guides.txt" beside
# them naming one guide per line.
#
# Two buckets, because the guides have two kinds of reader. A guide named in
# public-guides.txt is read by somebody with no account, so its pictures go
# to <project>-guide-assets, which the load balancer serves at
# /guide-assets/*. Every other guide is read signed in, and its pictures go
# to <project>-guide-assets-private, which only the backend can read.
#
# Private unless listed: a guide the list does not name goes to the private
# bucket, and with no list at all nothing is uploaded. A mistake therefore
# hides a picture that should be seen, and never publishes one that should
# not.
#
# Mirror-delete: rsync -d removes a screenshot from a bucket once it no
# longer belongs there, so each holds exactly what the last run sorted into
# it. That covers a guide that stops being public: its pictures leave the
# public bucket on the next run. It is also why the guard below matters: a
# run that took nothing would otherwise empty both buckets.
#
# Cached for five minutes, matching the CDN in infra/modules/guide-assets. A
# retaken screenshot keeps its name, so a long cache would keep showing a
# screen that has since changed.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "upload-to-gcs"

readonly SOURCE="guide-assets"
readonly PUBLIC_LIST="${SOURCE}/public-guides.txt"

# Whether a guide is named in the list of public guides. A whole-line match,
# so "join" does not pass for "join-a-course".
is_public() {
  local guide="$1"

  grep -qxF -- "$guide" "$PUBLIC_LIST"
}

# Copy each guide's folder into the staging directory for its bucket.
sort_guides() {
  local staging="$1"
  local folder
  local guide

  mkdir -p "${staging}/public" "${staging}/private"

  for folder in "$SOURCE"/*/; do
    [ -d "$folder" ] || continue
    guide="$(basename "$folder")"

    if is_public "$guide"; then
      cp -R "$folder" "${staging}/public/${guide}"
    else
      cp -R "$folder" "${staging}/private/${guide}"
    fi
  done
}

mirror() {
  local from="$1"
  local bucket="$2"

  gsutil -m -h "Cache-Control:public, max-age=300" \
    rsync -r -d "${from}/" "gs://${bucket}/"
}

main() {
  local project_id="${1:-}"
  local staging

  if [ -z "$project_id" ]; then
    error "No GCP project ID provided. Usage: upload-to-gcs.sh <gcp-project-id>"
    exit 1
  fi

  # Guard: never mirror-delete on a run that produced no screenshots.
  if ! find "$SOURCE" -type f -name '*.png' 2>/dev/null | grep -q .; then
    error "No screenshots found in ${SOURCE}/; refusing to sync to avoid emptying the buckets"
    exit 1
  fi

  # Guard: without the list there is no telling which pictures may be
  # public, and guessing either way is wrong.
  if [ ! -f "$PUBLIC_LIST" ]; then
    error "${PUBLIC_LIST} not found; refusing to sync without knowing which guides are public"
    exit 1
  fi

  staging="$(mktemp -d)"
  sort_guides "$staging"

  log "Uploading the public guides' screenshots"
  mirror "${staging}/public" "${project_id}-guide-assets"

  log "Uploading the signed-in guides' screenshots"
  mirror "${staging}/private" "${project_id}-guide-assets-private"

  log "Upload complete"
  gsutil ls -r "gs://${project_id}-guide-assets/"
  gsutil ls -r "gs://${project_id}-guide-assets-private/"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
