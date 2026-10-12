#!/usr/bin/env bash
# Checks that Renovate can see every pinned image the mirror copies.
#
# Usage: check-renovate-tracks-images.sh <report> <compose-file> <Dockerfile>...
#
# <report> is what Renovate writes when run over this repository with
# `--platform=local --dry-run=extract --report-type=file`: every dependency
# it found, by file, and nothing changed.
#
# Why: every image CI pulls is pinned to a digest, and
# check-mirrored-images.sh holds that. A pinned image changes only when
# somebody changes the pin, and the somebody is Renovate. If Renovate
# stops seeing an image, nothing fails: the pin just stays, and the image
# goes without its security patches for as long as nobody notices. The
# mirror has no timer to catch it either.
#
# Renovate reads these images through two forms it could lose sight of: a
# compose image that is the default of a variable, `${CI_X_IMAGE:-...}`,
# and a Dockerfile's base image named in an `ARG` and not in `FROM`. So
# this takes the images from those two places, the same ones the mirror
# copies, and fails for any that Renovate's report does not list for that
# file, with the same digest, as something it will update.
#
# Exits 1 and names each image Renovate does not track.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "check-renovate-tracks-images"

# Prints the registry images a compose file gives as a variable's default,
# one a line.
compose_images() {
  local compose_file="$1"

  sed -n -E 's/^[[:space:]]*image:[[:space:]]*"?\$\{[A-Z0-9_]+:-([^}"[:space:]]+)\}"?.*$/\1/p' "$compose_file"
}

# Prints the image each `ARG <NAME>_IMAGE=<image>` in a Dockerfile gives as
# its default, one a line.
base_images() {
  local dockerfile="$1"

  sed -n -E 's/^ARG[[:space:]]+[A-Z0-9_]+_IMAGE=([^[:space:]]+).*$/\1/p' "$dockerfile"
}

# Prints "<name><TAB><digest>" for each dependency Renovate found in one
# file and will update. One it found and then skipped is left out: a
# skipped dependency is never bumped, which is the failure this looks for.
tracked_in() {
  local report="$1"
  local file="$2"

  jq -r --arg file "$file" '
    .repositories[]?.packageFiles // {}
    | to_entries[] | .value[]
    | select(.packageFile == $file)
    | .deps[]?
    | select(.skipReason == null)
    | "\(.packageName // .depName)\t\(.currentDigest // "")"
  ' "$report"
}

fail=0

# Checks every image of one file against what Renovate found there.
check_file() {
  local report="$1"
  local file="$2"
  local images="$3"
  local tracked=""
  local image=""
  local name=""
  local digest=""

  tracked="$(tracked_in "$report" "$file")"

  while IFS= read -r image; do
    if [ -z "$image" ]; then
      continue
    fi

    if [[ "$image" != *@sha256:* ]]; then
      error "${file}: ${image} has no digest, so there is no pin for Renovate to move. check-mirrored-images.sh should have refused it"
      fail=1
      continue
    fi

    # registry/path/name:tag@sha256:digest
    digest="${image##*@}"
    name="${image%@*}"
    name="${name%:*}"

    if grep -Fxq "${name}"$'\t'"${digest}" <<<"$tracked"; then
      continue
    fi

    error "${file}: Renovate does not track ${name} at ${digest}. It will never bump this pin. Write the image in a form Renovate reads, or add a custom manager for it to renovate.json"
    fail=1
  done <<<"$images"
}

main() {
  local report="${1:-}"
  local compose_file="${2:-}"

  if [ -z "$report" ] || [ -z "$compose_file" ] || [ "$#" -lt 3 ]; then
    error "Usage: check-renovate-tracks-images.sh <report> <compose-file> <Dockerfile>..."
    exit 1
  fi

  if [ ! -s "$report" ]; then
    error "${report} is missing or empty, so Renovate did not write its report"
    exit 1
  fi

  # A report with no files in it is a run that found nothing, which reads
  # the same as a run that looked in the wrong place.
  local files_found=""
  files_found="$(jq -r '[.repositories[]?.packageFiles // {} | to_entries[] | .value[]] | length' "$report" 2>/dev/null || true)"

  if [[ ! "$files_found" =~ ^[1-9][0-9]*$ ]]; then
    error "${report} lists no files at all, so it is not a report of this repository"
    exit 1
  fi

  shift 2

  local checked=0
  local images=""
  local file=""

  for file in "$compose_file" "$@"; do
    if [ ! -f "$file" ]; then
      error "${file} does not exist"
      exit 1
    fi

    if [ "$file" = "$compose_file" ]; then
      images="$(compose_images "$file")"
    else
      images="$(base_images "$file")"
    fi

    if [ -z "$images" ]; then
      error "${file} names no image the mirror copies, so there is nothing to check for it"
      exit 1
    fi

    check_file "$report" "$file" "$images"
    checked=$((checked + $(wc -l <<<"$images" | tr -d ' ')))
  done

  if [ "$fail" -ne 0 ]; then
    exit 1
  fi

  log "Renovate tracks all ${checked} pinned image(s) the mirror copies."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
