#!/usr/bin/env bash
# Works out which BuildKit image Buildx should run: the mirror's copy if
# the mirror holds it, otherwise the public image.
#
# Usage: use-mirrored-buildkit.sh <owner> <Dockerfile>
#
# <Dockerfile> is .github/buildkit/Dockerfile, which names the image as the
# default of `ARG BUILDKIT_IMAGE=`. Writes `image=<the image>` to
# $GITHUB_OUTPUT for the setup-buildx action to pass to Buildx. Where the
# mirror does not hold the copy, it also writes `fell_back=<the public
# image>`, so an empty value means all is well. Needs a login to ghcr.io.
#
# Falling back is what happens on the pull request that changes the
# digest, before the mirror has caught up, so a new BuildKit never has to
# wait for the mirror. The same reasoning as use-mirrored-base-images.sh.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "use-mirrored-buildkit"
# shellcheck source=../shared/mirror-ref.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/mirror-ref.sh"

# Prints the default the Dockerfile gives `ARG BUILDKIT_IMAGE=`, or nothing.
buildkit_image() {
  local dockerfile="$1"

  sed -n -E 's/^ARG[[:space:]]+BUILDKIT_IMAGE=([^[:space:]]+).*$/\1/p' "$dockerfile"
}

main() {
  local owner="${1:-}"
  local dockerfile="${2:-}"

  if [ -z "$owner" ] || [ -z "$dockerfile" ]; then
    error "Usage: use-mirrored-buildkit.sh <owner> <Dockerfile>"
    exit 1
  fi

  if [ -z "${GITHUB_OUTPUT:-}" ]; then
    error "GITHUB_OUTPUT is not set, so there is nowhere to hand the image to the next step"
    exit 1
  fi

  if [ ! -f "$dockerfile" ]; then
    error "${dockerfile} does not exist"
    exit 1
  fi

  local public=""
  public="$(buildkit_image "$dockerfile")"

  if [ -z "$public" ]; then
    error "${dockerfile} names no image in ARG BUILDKIT_IMAGE, so there is nothing for Buildx to run"
    exit 1
  fi

  local mirrored=""
  mirrored="$(mirror_pull_ref "$owner" "$public")"

  if mirror_holds "$mirrored"; then
    log "BuildKit: using the mirror, ${mirrored}"
    echo "image=${mirrored}" >> "$GITHUB_OUTPUT"
    return 0
  fi

  log "BuildKit: the mirror does not hold ${mirrored}, so staying on ${public}"
  echo "image=${public}" >> "$GITHUB_OUTPUT"
  echo "fell_back=${public}" >> "$GITHUB_OUTPUT"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
