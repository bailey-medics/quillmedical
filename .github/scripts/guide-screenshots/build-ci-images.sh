#!/usr/bin/env bash
# Builds a compose file's images, each on the base images it is given.
#
# Usage: build-ci-images.sh <compose-file> [<build-args>]
#
# <build-args> is the `build_args` output of
# .github/scripts/ci/use-mirrored-base-images.sh: one NAME=image a line,
# such as `PYTHON_IMAGE=ghcr.io/<owner>/mirror/...`. Empty, or left out,
# builds on the public images the Dockerfiles name.
#
# Why: `docker compose up --build` cannot be given build arguments, so it
# always pulled Python and Node from Amazon's public registry. That refused
# the Python image with "Data limit exceeded" on 19 October 2026 and failed
# the guide screenshots with no screen changed.
#
# Every argument goes to every image. One a Dockerfile does not name is
# ignored by that build.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "build-ci-images"

main() {
  local compose_file="${1:-}"
  local build_args="${2:-}"

  if [ -z "$compose_file" ]; then
    error "No compose file given. Usage: build-ci-images.sh <compose-file> [<build-args>]"
    exit 1
  fi

  local flags=()
  local line=""

  while IFS= read -r line; do
    if [ -n "$line" ]; then
      flags+=(--build-arg "$line")
      log "Building with ${line}"
    fi
  done <<<"$build_args"

  if [ "${#flags[@]}" -eq 0 ]; then
    log "No build arguments, so building on the public base images"
  fi

  docker compose -f "$compose_file" build "${flags[@]}"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
