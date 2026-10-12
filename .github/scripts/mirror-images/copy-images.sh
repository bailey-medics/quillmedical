#!/usr/bin/env bash
# Copies the public images a compose file uses, and the ones Dockerfiles
# build on, into this repository's own mirror in GitHub's registry.
#
# Usage: copy-images.sh <owner> <compose-file> [<Dockerfile>...]
#
# <owner> is the owner of this repository, whose registry the copies go to.
# Needs `skopeo`, which GitHub's runners carry, and a login to ghcr.io that
# may write packages.
#
# Every image in the compose file that comes from a registry is copied. One
# with no registry in its name, such as quillmedical-ci_backend:latest, is
# built by CI itself and is left alone.
#
# From each Dockerfile, the image every `ARG <NAME>_IMAGE=<image>` gives as
# its default is copied too. That is how a Dockerfile here names the image
# it builds on: in an ARG and not in the FROM line, so that CI can hand the
# build the copy with `--build-arg`. See backend/Dockerfile. A FROM that
# names a public image outright is not found by this, and so is not
# copied: check-mirrored-images.sh is what refuses one.
#
# `skopeo copy --all` moves the image for every platform as it is, so the
# copy's digest is the source's digest, and an image pinned to a digest can
# be pulled from the copy by that same digest. Copying one that is already
# there changes nothing, so this is safe to run as often as wanted.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "copy-images"
# shellcheck source=../shared/mirror-ref.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/mirror-ref.sh"

# Prints the compose file's images that come from a registry, one a line.
public_images() {
  local compose_file="$1"

  docker compose -f "$compose_file" config --images | grep '/' | sort -u || true
}

# Prints the image each `ARG <NAME>_IMAGE=<image>` in a Dockerfile gives as
# its default, one a line.
base_images() {
  local dockerfile="$1"

  sed -n -E 's/^ARG[[:space:]]+[A-Z0-9_]+_IMAGE=([^[:space:]]+).*$/\1/p' "$dockerfile"
}

main() {
  local owner="${1:-}"
  local compose_file="${2:-}"

  if [ -z "$owner" ] || [ -z "$compose_file" ]; then
    error "Usage: copy-images.sh <owner> <compose-file> [<Dockerfile>...]"
    exit 1
  fi

  shift 2

  local images=""
  images="$(public_images "$compose_file")"

  local dockerfile=""
  local found=""

  for dockerfile in "$@"; do
    if [ ! -f "$dockerfile" ]; then
      error "${dockerfile} does not exist"
      exit 1
    fi

    found="$(base_images "$dockerfile")"

    # A Dockerfile handed to this that names no base image in an ARG is a
    # mistake in the Dockerfile or in the list, and copying nothing for it
    # would look like success.
    if [ -z "$found" ]; then
      error "${dockerfile} names no base image in an ARG ending _IMAGE, so there is nothing to copy for it"
      exit 1
    fi

    images="$(printf '%s\n%s\n' "$images" "$found" | grep '/' | sort -u)"
  done

  if [ -z "$images" ]; then
    error "${compose_file} names no image from a registry, so there is nothing to copy. It should name at least one"
    exit 1
  fi

  local image=""
  local source=""
  local destination=""

  while IFS= read -r image; do
    source="$(mirror_source_ref "$image")"
    destination="$(mirror_push_ref "$owner" "$image")"

    log "Copying ${source} to ${destination}"
    skopeo copy --all "docker://${source}" "docker://${destination}"
  done <<<"$images"

  log "Copied $(wc -l <<<"$images" | tr -d ' ') image(s)"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
