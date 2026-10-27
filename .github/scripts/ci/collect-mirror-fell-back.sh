#!/usr/bin/env bash
# Gathers the public images each leg of a matrix job fell back to into one
# list, for the job that reports it.
#
# Usage: collect-mirror-fell-back.sh <directory>
#
# Each leg that ran use-mirrored-images.sh and fell back writes its
# `fell_back` list, "image, image", to a file and uploads it. The gate job
# downloads them all into <directory>. This joins them, drops repeats, and
# writes the result to $GITHUB_OUTPUT as `fell_back`, in the same form
# use-mirrored-images.sh writes it.
#
# Why: a matrix job's output is whichever leg wrote it last, so a fallback
# one leg saw could be lost behind a leg that saw none.
#
# A missing or empty <directory> means no leg fell back, and nothing is
# written, so an empty `fell_back` still means all is well.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "collect-mirror-fell-back"

# Prints each image named in the files under a directory, once, in the
# order first seen.
unique_images() {
  local directory="$1"

  if [ ! -d "$directory" ]; then
    return 0
  fi

  find "$directory" -type f -print0 \
    | sort -z \
    | xargs -0 -r cat \
    | tr ',' '\n' \
    | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' \
    | awk 'NF && !seen[$0]++'
}

main() {
  local directory="${1:-}"

  if [ -z "$directory" ]; then
    error "Usage: collect-mirror-fell-back.sh <directory>"
    exit 1
  fi

  if [ -z "${GITHUB_OUTPUT:-}" ]; then
    error "GITHUB_OUTPUT is not set, so there is nowhere to hand the list on"
    exit 1
  fi

  local images
  images="$(unique_images "$directory")"

  if [ -z "$images" ]; then
    log "No leg fell back to a public image"
    return 0
  fi

  local fell_back
  fell_back="$(paste -sd ',' <<< "$images" | sed 's/,/, /g')"

  echo "fell_back=${fell_back}" >> "$GITHUB_OUTPUT"
  log "Fell back to: ${fell_back}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
