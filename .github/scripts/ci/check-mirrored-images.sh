#!/usr/bin/env bash
# Checks that every image CI pulls can come from this repository's own
# mirror, and that none is named so that it can only come from a public
# registry.
#
# Usage: check-mirrored-images.sh <compose-file> <Dockerfile>...
#
# Run from the repository root. The compose file and the Dockerfiles are
# the ones CI builds and starts; the workflows and composite actions under
# .github/ are found by this script.
#
# Why: a public registry limits how often it may be asked, and GitHub's
# runners share addresses. A pull that is refused fails its job, takes the
# pull request out of the merge queue, and every pull request stacked on it
# goes too: fourteen on 10 October 2026 and seven on 12 October, with
# nothing wrong in any of them. So the images are copied to
# ghcr.io/<owner>/mirror/ by mirror-images.yml and pulled from there.
#
# That only holds while every image is named in a way the mirror can
# stand in for. This refuses the four ways one can slip past it:
#
#   - a Dockerfile whose FROM names an image outright. It has to read an
#     ARG ending _IMAGE, as backend/Dockerfile does, so that
#     use-mirrored-base-images.sh can hand the build the copy.
#   - a compose file image with a registry in its name that is not the
#     default of a variable, `${CI_X_IMAGE:-...}`, so that
#     use-mirrored-images.sh can point it at the copy.
#   - a workflow or action that names an image from anywhere but GitHub's
#     own registry or Google's mirror of Docker Hub.
#   - an image the mirror copies that is named by tag alone, with no
#     `@sha256:` digest. A tag moves when a patch is released and the copy
#     does not follow it: mirror-images.yml runs when a name changes, on no
#     timer. Pinned, the image changes only in a pull request, and that
#     pull request makes the copy.
#
# Exits 1 and names each offender.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "check-mirrored-images"

# Registries a workflow may name outright. GitHub's own is pulled with the
# job's login. Google's mirror of Docker Hub has no limit for a caller with
# no login, and holds BuildKit's own image and the Dockerfile syntax image.
ALLOWED_REGISTRIES=("ghcr.io/" "mirror.gcr.io/")

# Images in a workflow that are known to be public still, each with why.
# "<file>|<start of the image>|<why>". Remove a line once it is no longer
# true: an exception that matches nothing fails this check.
KNOWN_PUBLIC=(
  ".github/workflows/ci.yml|public.ecr.aws/docker/library/postgres:|the drift check's Postgres service, moved to the mirror by pull request #1842"
)

fail=0

# Reports one offender.
offender() {
  error "$*"
  fail=1
}

# A Dockerfile's FROM lines may name only an _IMAGE argument, an earlier
# stage of the same file, or scratch.
check_dockerfile() {
  local dockerfile="$1"
  local line=""
  local image=""
  local stage=""
  local stages=" scratch "

  if [ ! -f "$dockerfile" ]; then
    offender "${dockerfile} does not exist"
    return
  fi

  # The default of each _IMAGE argument is what the mirror copies.
  while IFS= read -r image; do
    if [[ "$image" != *@sha256:* ]]; then
      offender "${dockerfile}: base image ${image} is named by tag alone. Pin it, as ${image}@sha256:<digest>, so the mirror's copy cannot fall behind it"
    fi
  done < <(sed -n -E 's/^ARG[[:space:]]+[A-Z0-9_]+_IMAGE=([^[:space:]]+).*$/\1/p' "$dockerfile")

  while IFS= read -r line; do
    # FROM [--platform=...] <image> [AS <stage>]
    # shellcheck disable=SC2086
    set -- $line
    shift
    if [[ "${1:-}" == --* ]]; then
      shift
    fi
    image="${1:-}"
    stage="${3:-}"

    if [[ "$image" =~ ^\$\{?[A-Z0-9_]+_IMAGE\}?$ ]] || [[ "$stages" == *" ${image} "* ]]; then
      :
    else
      offender "${dockerfile}: FROM ${image} names an image outright. Name it in an ARG ending _IMAGE and write FROM \${NAME_IMAGE}, so CI can build on the mirror's copy"
    fi

    if [ -n "$stage" ]; then
      stages="${stages}${stage} "
    fi
  done < <(grep -E '^FROM[[:space:]]' "$dockerfile" || true)
}

# A compose file's images may be ones CI builds itself, with no registry in
# the name, or the default of a variable.
check_compose() {
  local compose_file="$1"
  local image=""

  if [ ! -f "$compose_file" ]; then
    offender "${compose_file} does not exist"
    return
  fi

  while IFS= read -r image; do
    if [[ "$image" != */* ]]; then
      continue
    fi

    if [[ "$image" =~ ^\$\{[A-Z0-9_]+:-(.+)\}$ ]]; then
      if [[ "${BASH_REMATCH[1]}" != *@sha256:* ]]; then
        offender "${compose_file}: image ${BASH_REMATCH[1]} is named by tag alone. Pin it, as ${BASH_REMATCH[1]}@sha256:<digest>, so the mirror's copy cannot fall behind it"
      fi

      continue
    fi

    offender "${compose_file}: image ${image} comes from a registry and is not the default of a variable. Write it as \${CI_NAME_IMAGE:-${image}}, so CI can point it at the mirror's copy"
  done < <(sed -n -E 's/^[[:space:]]*image:[[:space:]]*"?([^"[:space:]]+)"?.*$/\1/p' "$compose_file")
}

# Says whether an image in a workflow is one of the known exceptions, and
# notes that the exception was used.
is_known_public() {
  local file="$1"
  local image="$2"
  local entry=""
  local index=0

  for entry in "${KNOWN_PUBLIC[@]}"; do
    IFS='|' read -r known_file known_image _ <<<"$entry"

    if [ "$file" = "$known_file" ] && [[ "$image" == "$known_image"* ]]; then
      used[index]=1
      return 0
    fi

    index=$((index + 1))
  done

  return 1
}

# A workflow or action may name an image only from an allowed registry, or
# through an expression, which is one this repository built.
check_workflow() {
  local file="$1"
  local image=""
  local registry=""
  local allowed=0

  while IFS= read -r image; do
    # An expression: an image this repository built and named itself.
    if [[ "$image" == *"\${{"* ]]; then
      continue
    fi

    allowed=0
    for registry in "${ALLOWED_REGISTRIES[@]}"; do
      if [[ "$image" == "$registry"* ]]; then
        allowed=1
      fi
    done

    if [ "$allowed" -eq 1 ] || is_known_public "$file" "$image"; then
      continue
    fi

    offender "${file}: image ${image} is pulled from a public registry. Copy it to the mirror and pull the copy, or name it in the compose file as a variable's default"
  done < <(sed -n -E \
    -e 's/^[[:space:]]*image:[[:space:]]*"?([^"[:space:]]+)"?.*$/\1/p' \
    -e 's/^.*[[:space:]]image=([^[:space:]"]+).*$/\1/p' "$file")
}

main() {
  local compose_file="${1:-}"

  if [ -z "$compose_file" ] || [ "$#" -lt 2 ]; then
    error "Usage: check-mirrored-images.sh <compose-file> <Dockerfile>..."
    exit 1
  fi

  shift

  used=()

  check_compose "$compose_file"

  local dockerfile=""
  for dockerfile in "$@"; do
    check_dockerfile "$dockerfile"
  done

  local file=""
  while IFS= read -r file; do
    check_workflow "$file"
  done < <(find .github/workflows .github/actions -type f \( -name '*.yml' -o -name '*.yaml' \) 2>/dev/null | sed 's|^\./||' | sort)

  local index=0
  local entry=""
  for entry in "${KNOWN_PUBLIC[@]}"; do
    if [ -z "${used[index]:-}" ]; then
      offender "the exception '${entry%%|*} ${entry#*|}' matches nothing any more. Remove it from KNOWN_PUBLIC in check-mirrored-images.sh"
    fi

    index=$((index + 1))
  done

  if [ "$fail" -ne 0 ]; then
    exit 1
  fi

  log "Every image CI pulls can come from the mirror."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
