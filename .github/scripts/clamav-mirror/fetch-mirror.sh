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
# a build or a scan with no definitions would pass every file. Fails too
# when a package in it does not match the checksum pinned in
# Dockerfile.scan, or is for another version: the teaching pipeline
# installs the package as root, so a mirror that had been overwritten
# could otherwise run anything on the runner and pass any scan.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "fetch-mirror"

# Prints the value of one ARG pinned in a Dockerfile, or nothing.
arg_value() {
  local dockerfile="$1"
  local name="$2"

  sed -n -E "s/^ARG[[:space:]]+${name}=([^[:space:]]+).*$/\\1/p" "$dockerfile" | head -n 1
}

# Fails unless each package the mirror holds is the one pinned, by
# version and by checksum. The same checks build-mirror.sh makes when it
# downloads them, made again on the way out, so the mirror is trusted to
# carry the packages and not to choose them.
check_packages() {
  local dockerfile="$1"
  local out_dir="$2"
  local version="$3"
  local sum_amd64=""
  local sum_arm64=""
  local arch=""
  local checksum=""
  local deb=""

  sum_amd64="$(arg_value "$dockerfile" CLAMAV_SHA256_AMD64)"
  sum_arm64="$(arg_value "$dockerfile" CLAMAV_SHA256_ARM64)"

  if [ -z "$sum_amd64" ] || [ -z "$sum_arm64" ]; then
    error "${dockerfile} does not pin CLAMAV_SHA256_AMD64 and CLAMAV_SHA256_ARM64"
    exit 1
  fi

  if [ "$(cat "${out_dir}/VERSION" 2>/dev/null)" != "$version" ]; then
    error "The mirror says it holds ClamAV $(cat "${out_dir}/VERSION" 2>/dev/null), not the ${version} pinned in ${dockerfile}"
    exit 1
  fi

  for arch in x86_64 aarch64; do
    if [ "$arch" = "x86_64" ]; then checksum="$sum_amd64"; else checksum="$sum_arm64"; fi
    deb="${out_dir}/clamav-${version}.linux.${arch}.deb"

    if [ ! -f "$deb" ]; then
      error "The mirror holds no ${arch} package for ClamAV ${version}"
      exit 1
    fi

    if ! echo "${checksum}  ${deb}" | sha256sum --check --quiet - >/dev/null 2>&1; then
      error "The mirror's ${arch} package does not match the checksum pinned in ${dockerfile}, so it is not used"
      exit 1
    fi
  done
}

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

  version="$(arg_value "$dockerfile" CLAMAV_VERSION)"

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

  check_packages "$dockerfile" "$out_dir" "$version"

  log "ClamAV $(cat "${out_dir}/VERSION") and its definitions are in ${out_dir}, its packages checked"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
