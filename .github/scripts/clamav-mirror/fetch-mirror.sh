#!/usr/bin/env bash
# Copies the ClamAV packages and definitions out of the clamav-mirror
# image into a directory, for a build or a scan to use.
#
# Usage: fetch-mirror.sh <owner> <Dockerfile.scan> <out-directory>
#
# The image is ghcr.io/<owner>/clamav-mirror, tagged with the ClamAV
# version pinned in backend/Dockerfile.scan, which the daily clamav-mirror
# workflow moves to each day's definitions. Reading the version from the
# same file as the build keeps the two in step.
#
# The image is built FROM scratch and holds files, not a system, so it is
# never run: a container is created from it, its files copied out, and
# the container removed. The caller must already be logged in to GHCR.
#
# Fails, closed, when the image cannot be pulled or holds no definitions:
# a build or a scan with no definitions would pass every file.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "fetch-mirror"

# Prints the mirror image's name for an owner and a pinned version.
mirror_image() {
  local owner="$1"
  local version="$2"
  local lower_owner=""

  lower_owner="$(tr '[:upper:]' '[:lower:]' <<<"$owner")"

  echo "ghcr.io/${lower_owner}/clamav-mirror:${version}"
}

main() {
  local owner="${1:-}"
  local dockerfile="${2:-}"
  local out_dir="${3:-}"
  local version=""
  local image=""
  local container=""

  if [ -z "$owner" ] || [ -z "$dockerfile" ] || [ -z "$out_dir" ]; then
    error "Usage: fetch-mirror.sh <owner> <Dockerfile.scan> <out-directory>"
    exit 1
  fi

  if [ ! -f "$dockerfile" ]; then
    error "${dockerfile} does not exist"
    exit 1
  fi

  version="$(sed -n -E 's/^ARG[[:space:]]+CLAMAV_VERSION=([^[:space:]]+).*$/\1/p' "$dockerfile" | head -n 1)"

  if [ -z "$version" ]; then
    error "${dockerfile} does not pin CLAMAV_VERSION"
    exit 1
  fi

  image="$(mirror_image "$owner" "$version")"

  log "Fetching ${image}"
  docker pull --quiet "$image" >/dev/null

  mkdir -p "$out_dir"
  container="$(docker create "$image" none)"
  docker cp "${container}:/clamav/." "$out_dir"
  docker rm "$container" >/dev/null

  if ! compgen -G "${out_dir}/db/*.c[vl]d" >/dev/null; then
    error "${image} holds no definitions, so nothing can be scanned with it"
    exit 1
  fi

  log "ClamAV $(cat "${out_dir}/VERSION") and its definitions are in ${out_dir}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
