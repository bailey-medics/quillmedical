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
#
# An image pinned to a digest the mirror already holds is skipped, with no
# call to the public registry at all. Copying it again changed nothing, but
# `skopeo copy` still read it from the source first, so a pull request that
# touched compose.ci.yml without changing an image could still be refused
# by the public registry's limit. A digest names one exact image, so if the
# mirror holds it, it holds the right one. An image named by tag alone is
# always copied: the tag may point somewhere new. If the mirror cannot be
# asked, the image is copied, as it was before.
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

# Whether the mirror already holds this exact image. Only an image pinned
# to a digest can be known to be the same; one named by tag alone is
# never counted as held.
already_mirrored() {
  local owner="$1"
  local image="$2"

  if [ -z "$(_digest_of "$image")" ]; then
    return 1
  fi

  skopeo inspect --raw "docker://$(mirror_pull_ref "$owner" "$image")" >/dev/null 2>&1
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
  local copied=0
  local held=0

  while IFS= read -r image; do
    source="$(mirror_source_ref "$image")"
    destination="$(mirror_push_ref "$owner" "$image")"

    if already_mirrored "$owner" "$image"; then
      log "Already mirrored: ${source}"
      held=$((held + 1))
      continue
    fi

    log "Copying ${source} to ${destination}"
    skopeo copy --all "docker://${source}" "docker://${destination}"
    copied=$((copied + 1))
  done <<<"$images"

  log "Copied ${copied} image(s); ${held} already mirrored"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
