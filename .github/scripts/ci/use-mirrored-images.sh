#!/usr/bin/env bash
# Points a compose file's public images at this repository's own mirror,
# for each one the mirror holds.
#
# Usage: use-mirrored-images.sh <owner> <compose-file> <VARIABLE>...
#
# Each <VARIABLE> is one the compose file reads an image from, with the
# public image as its default:
#
#   image: ${CI_POSTGRES_IMAGE:-public.ecr.aws/docker/library/postgres:18-alpine}
#
# For each, this works out where the copy would be, asks the registry
# whether it is there, and if so sets the variable for the rest of the job
# by writing it to $GITHUB_ENV. Needs a login to ghcr.io.
#
# Why: the public registry limits how often a caller with no login may
# pull, and counts by address. GitHub's runners share addresses and the
# merge queue starts several of these jobs at once, so one was sometimes
# refused with "Rate exceeded". That failed the job, took the pull
# request out of the queue, and every pull request stacked on it with it.
# A copy in our own registry is pulled with the job's own login.
#
# An image the mirror does not hold is left on its public default, the log
# says so, and the images left behind are written to $GITHUB_OUTPUT as
# `fell_back`, for the workflow to post to Slack. Nothing is written when
# every image came from the mirror, so an empty `fell_back` means all is well.
#
# That is what happens on the pull request that changes an
# image's version, before the mirror has caught up, so a version change
# never has to wait for the mirror.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "use-mirrored-images"
# shellcheck source=../shared/mirror-ref.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/mirror-ref.sh"

# Prints the public image a compose file gives a variable as its default,
# or nothing when the file does not use the variable that way.
default_image() {
  local compose_file="$1"
  local variable="$2"

  sed -n -E "s/.*\\\$\\{${variable}:-([^}]+)\\}.*/\\1/p" "$compose_file" | head -n 1
}

# Says whether the registry holds an image.
is_in_registry() {
  local ref="$1"

  docker manifest inspect "$ref" >/dev/null 2>&1
}

main() {
  local owner="${1:-}"
  local compose_file="${2:-}"

  if [ -z "$owner" ] || [ -z "$compose_file" ] || [ "$#" -lt 3 ]; then
    error "Usage: use-mirrored-images.sh <owner> <compose-file> <VARIABLE>..."
    exit 1
  fi

  if [ -z "${GITHUB_ENV:-}" ]; then
    error "GITHUB_ENV is not set, so there is nowhere to hand the choice to the next step"
    exit 1
  fi

  shift 2

  local variable=""
  local public=""
  local mirrored=""
  local fell_back=""

  for variable in "$@"; do
    public="$(default_image "$compose_file" "$variable")"

    if [ -z "$public" ]; then
      error "${compose_file} does not read an image from \${${variable}:-...}, so there is nothing to point at the mirror"
      exit 1
    fi

    mirrored="$(mirror_pull_ref "$owner" "$public")"

    if is_in_registry "$mirrored"; then
      echo "${variable}=${mirrored}" >> "$GITHUB_ENV"
      log "${variable}: using the mirror, ${mirrored}"
    else
      log "${variable}: the mirror does not hold ${mirrored}, so staying on ${public}"
      fell_back="${fell_back:+${fell_back}, }${public}"
    fi
  done

  if [ -n "$fell_back" ] && [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "fell_back=${fell_back}" >> "$GITHUB_OUTPUT"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
