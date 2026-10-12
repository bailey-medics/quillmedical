#!/usr/bin/env bash
# Works out the build arguments that point a Dockerfile's base images at
# this repository's own mirror, for each one the mirror holds.
#
# Usage: use-mirrored-base-images.sh <owner> <Dockerfile>...
#
# A Dockerfile here names each image it builds on in an ARG ending _IMAGE,
# with the public image as its default:
#
#   ARG PYTHON_IMAGE=public.ecr.aws/docker/library/python:3.14-slim@sha256:...
#   FROM ${PYTHON_IMAGE} AS base
#
# For each such argument, this works out where the copy would be, asks the
# registry whether it is there, and if so writes `<NAME>_IMAGE=<the copy>`
# to $GITHUB_OUTPUT as one line of `build_args`, for the build step to
# pass as `build-args`. Needs a login to ghcr.io.
#
# Why: the public registry limits how often it may be asked. On 12 October
# 2026 it refused the Python image to a merge queue run, saying its data
# limit had been exceeded. That failed the image build, took the pull request
# out of the queue, and every pull request stacked on it went with it. A
# copy in our own registry is pulled with the job's own login.
#
# An image the mirror does not hold gets no build argument, so the build
# uses the public default. The log says so, and the images left behind are
# written to $GITHUB_OUTPUT as `fell_back`, for the workflow to post to
# Slack. Nothing is written for `fell_back` when every image came from the
# mirror, so an empty value means all is well.
#
# That is what happens on the pull request that changes an image's version,
# before the mirror has caught up, so a version change never has to wait
# for the mirror.
#
# A copy is exact and is asked for by the same digest, so the build is on
# the very image the Dockerfile pins, whichever registry hands it over.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "use-mirrored-base-images"
# shellcheck source=../shared/mirror-ref.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/mirror-ref.sh"

# Prints each base image argument of a Dockerfile as "<NAME> <image>", one
# a line.
base_image_args() {
  local dockerfile="$1"

  sed -n -E 's/^ARG[[:space:]]+([A-Z0-9_]+_IMAGE)=([^[:space:]]+).*$/\1 \2/p' "$dockerfile"
}

# Says whether the registry holds an image.
is_in_registry() {
  local ref="$1"

  docker manifest inspect "$ref" >/dev/null 2>&1
}

main() {
  local owner="${1:-}"

  if [ -z "$owner" ] || [ "$#" -lt 2 ]; then
    error "Usage: use-mirrored-base-images.sh <owner> <Dockerfile>..."
    exit 1
  fi

  if [ -z "${GITHUB_OUTPUT:-}" ]; then
    error "GITHUB_OUTPUT is not set, so there is nowhere to hand the build arguments to the next step"
    exit 1
  fi

  shift

  local dockerfile=""
  local args=""
  local found=""

  for dockerfile in "$@"; do
    if [ ! -f "$dockerfile" ]; then
      error "${dockerfile} does not exist"
      exit 1
    fi

    found="$(base_image_args "$dockerfile")"

    if [ -z "$found" ]; then
      error "${dockerfile} names no base image in an ARG ending _IMAGE, so there is nothing to point at the mirror"
      exit 1
    fi

    args="$(printf '%s\n%s\n' "$args" "$found" | grep . | sort -u)"
  done

  local name=""
  local public=""
  local mirrored=""
  local build_args=""
  local fell_back=""

  while read -r name public; do
    mirrored="$(mirror_pull_ref "$owner" "$public")"

    if is_in_registry "$mirrored"; then
      build_args="${build_args:+${build_args}$'\n'}${name}=${mirrored}"
      log "${name}: using the mirror, ${mirrored}"
    else
      log "${name}: the mirror does not hold ${mirrored}, so staying on ${public}"
      fell_back="${fell_back:+${fell_back}, }${public}"
    fi
  done <<<"$args"

  # A value of several lines needs a delimiter. One no image name could
  # contain.
  {
    echo "build_args<<END_OF_BUILD_ARGS"
    [ -n "$build_args" ] && echo "$build_args"
    echo "END_OF_BUILD_ARGS"
  } >> "$GITHUB_OUTPUT"

  if [ -n "$fell_back" ]; then
    echo "fell_back=${fell_back}" >> "$GITHUB_OUTPUT"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
