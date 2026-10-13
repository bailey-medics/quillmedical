#!/usr/bin/env bash
# Checks that pinned tool versions agree across the single-source config files,
# their Docker consumers, and CI.
#
# Usage: check-version-consistency.sh
#
# Run from the repository root. Compares Python at minor granularity (e.g. 3.13)
# and Node at major granularity (e.g. 24), because the pins live at different
# granularities (.python-version is exact, the Docker tag is minor, etc.).
# Poetry is compared at minor granularity too: .poetry-version selects the
# version, and each pyproject's requires-poetry lower bound must match it.
# Exits 1 and names the offending files if any consumer has drifted.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "$0")/../shared/logging.sh" "check-version-consistency"

# Every pyproject that declares a requires-poetry constraint.
POETRY_CONSUMERS=(
  "backend/pyproject.toml"
  "backend/app/features/teaching/tooling/pyproject.toml"
)

# Prints the Python a formatter in backend/pyproject.toml targets, as
# two parts: 3.14 from `target-version = "py314"` under the table given.
# Ruff writes the target as a string and Black as a list, and this reads
# either. Nothing when the table has no target.
#
# Ruff and Black format every Python file here for this version, and at
# py314 that means syntax nothing older can read. Left a release behind,
# as both were for a while after the backend moved, they simply hold the
# code back; set ahead of the Python the code runs on, they break it.
formatter_target() {
  local table="$1"
  local target

  target="$(awk -v table="[${table}]" '
    $0 == table { inside = 1; next }
    /^\[/ { inside = 0 }
    inside && /^target-version[[:space:]]*=/ { print; exit }
  ' backend/pyproject.toml | grep -oE 'py[0-9]+' | head -1 || true)"

  if [ -z "$target" ]; then
    return 0
  fi

  # py314 is 3.14: the first digit is the major version, the rest the minor.
  echo "${target:2:1}.${target:3}"
}

# Prints the image the backend is built on, from the default of
# `ARG PYTHON_IMAGE=` in backend/Dockerfile: registry, tag and digest.
# Nothing when the line is not there.
backend_base_image() {
  grep -m1 -oE '^ARG PYTHON_IMAGE=[^[:space:]]+' backend/Dockerfile | cut -d= -f2- || true
}

# Prints the image the shell test image is built on, from the `FROM` line
# of .github/Dockerfile. Nothing when the file or the line is not there.
#
# `just ts` runs the shell tests in that image, and the tests run the
# scripts in scripts/ for real, so it has to be on the pinned Python. It
# gets one by building on the image the backend builds on.
shell_test_base_image() {
  if [ ! -f .github/Dockerfile ]; then
    return 0
  fi

  grep -m1 -E '^FROM[[:space:]]' .github/Dockerfile | awk '{print $2}' || true
}

# Prints the Python an image reference names, as two parts: 3.14 from
# `.../python:3.14-slim@sha256:...`. Nothing when it names none.
python_of_image() {
  local image="$1"

  grep -oE 'python:[0-9]+\.[0-9]+' <<<"$image" | head -1 | cut -d: -f2 || true
}

# Fails when the shell test image is not built on the very image the
# backend is: same registry, tag and digest. The two are pinned in two
# files and meant to be one image, so that there is one Python to keep up
# to date and not two. Renovate moves both in one pull request; this is
# what notices if one is ever moved alone.
check_shell_test_image_is_the_backends() {
  local backend
  local shell_tests

  backend="$(backend_base_image)"
  shell_tests="$(shell_test_base_image)"

  # A missing line is reported by check_python, which reads the same two.
  if [ -z "$backend" ] || [ -z "$shell_tests" ]; then
    return 0
  fi

  if [ "$backend" != "$shell_tests" ]; then
    error "Base image mismatch: .github/Dockerfile builds on '$shell_tests' but backend/Dockerfile builds on '$backend'. The shell tests are meant to run on the backend's own Python image: make the two lines name the same image and digest"
    return 1
  fi
}

check_python() {
  local source
  local docker
  local mypy
  local ruff
  local black
  local shell_tests
  local entry
  local name
  local value
  local fail=0

  source="$(cut -d. -f1,2 < .python-version)"
  docker="$(grep -oE 'python:[0-9]+\.[0-9]+' backend/Dockerfile | head -1 | cut -d: -f2)"
  mypy="$(grep -m1 -oE 'python_version = "[0-9]+\.[0-9]+"' backend/pyproject.toml | grep -oE '[0-9]+\.[0-9]+')"
  ruff="$(formatter_target "tool.ruff")"
  black="$(formatter_target "tool.black")"
  shell_tests="$(python_of_image "$(shell_test_base_image)")"

  log "Python minor - .python-version: ${source:-<none>}, backend/Dockerfile: ${docker:-<none>}, mypy: ${mypy:-<none>}, Ruff: ${ruff:-<none>}, Black: ${black:-<none>}, .github/Dockerfile: ${shell_tests:-<none>}"

  for entry in \
    "backend/Dockerfile=$docker" \
    "backend/pyproject.toml (mypy)=$mypy" \
    "backend/pyproject.toml (Ruff target-version)=$ruff" \
    "backend/pyproject.toml (Black target-version)=$black" \
    ".github/Dockerfile (base image)=$shell_tests"; do
    name="${entry%%=*}"
    value="${entry#*=}"

    # A line that is not there reads as nothing, and nothing must not be
    # allowed to pass for a match.
    if [ -z "$value" ]; then
      error "Python minor not found: $name names no version, so it cannot be held to .python-version ('$source')"
      fail=1
    elif [ "$value" != "$source" ]; then
      error "Python minor mismatch: $name is '$value' but .python-version is '$source'"
      fail=1
    fi
  done

  return "$fail"
}

# Prints every `node-version:` under .github/ as "<file> <major>", one a
# line. Workflows and composite actions alike, and either kind of quote:
# the setup action writes '24' and a workflow that sets Node up for itself
# may write "24".
node_pins() {
  local file major

  while IFS= read -r file; do
    while IFS= read -r major; do
      echo "${file} ${major}"
    done < <(grep -oE "node-version: *['\"]?[0-9]+" "$file" | grep -oE '[0-9]+$')
  done < <(find .github -type f \( -name '*.yml' -o -name '*.yaml' \) | sort)
}

check_node() {
  local docker pins file major fail=0

  docker="$(grep -oE 'node:[0-9]+' frontend/Dockerfile | head -1 | cut -d: -f2)"
  pins="$(node_pins)"

  log "Node major - frontend/Dockerfile: ${docker:-<none>}"

  if [ -z "$pins" ]; then
    error "No node-version found under .github/, so CI's Node cannot be compared with frontend/Dockerfile"
    return 1
  fi

  # Every place CI names Node, not the setup action alone. A workflow that
  # sets Node up for itself, as dependency-audit.yml does so that it need
  # install nothing, is a pin too, and went unchecked until it was found
  # by reading.
  while read -r file major; do
    log "Node major - ${file}: ${major}"

    if [ "$major" != "$docker" ]; then
      error "Node major mismatch: ${file} is '${major}' but frontend/Dockerfile is '${docker}'"
      fail=1
    fi
  done <<< "$pins"

  return "$fail"
}

check_poetry() {
  local source consumer bound hardcoded fail=0

  if [ ! -s .poetry-version ]; then
    error ".poetry-version is missing or empty; it is the single source for Poetry's version"
    return 1
  fi

  source="$(cut -d. -f1,2 < .poetry-version)"

  log "Poetry - .poetry-version: $(cat .poetry-version) (minor ${source})"

  # Each pyproject's requires-poetry lower bound must match the pinned version.
  # The pin selects; the constraint rejects a Poetry that cannot read the lock,
  # including on a developer's machine, which no repository file can install to.
  for consumer in "${POETRY_CONSUMERS[@]}"; do
    if [ ! -f "$consumer" ]; then
      error "Poetry consumer not found: $consumer"
      fail=1
      continue
    fi

    bound="$(grep -m1 -oE 'requires-poetry = ">=[0-9]+\.[0-9]+' "$consumer" | grep -oE '[0-9]+\.[0-9]+$' || true)"

    if [ -z "$bound" ]; then
      error "No requires-poetry lower bound in $consumer"
      fail=1
    elif [ "$bound" != "$source" ]; then
      error "Poetry minor mismatch: $consumer requires '>=${bound}' but .poetry-version is '$source'"
      fail=1
    fi
  done

  # Renovate runs in its own container and cannot read .poetry-version, so it
  # is pinned by value in renovate.json and checked here instead. Without this
  # the bot relocks with whatever Poetry it happens to carry - it used 2.3.3
  # against a 2.4.2 pin - which is the drift the pin exists to prevent.
  # Parsed as JSON rather than grepped: a line-window grep missed the pin as
  # soon as another constraint was listed before it, and reported the pin as
  # absent when it was there. Guarded, so a missing jq is not mistaken for a
  # missing constraint.
  if ! command -v jq >/dev/null 2>&1; then
    error "jq is required to read renovate.json"
    return 1
  fi

  local renovate_pin
  renovate_pin="$(jq -r '.constraints.poetry // empty' renovate.json 2>/dev/null || true)"
  if [ -z "$renovate_pin" ]; then
    error "No constraints.poetry in renovate.json; the bot would relock with its own Poetry"
    fail=1
  elif [ "$renovate_pin" != "$(cat .poetry-version)" ]; then
    error "Poetry mismatch: renovate.json pins '$renovate_pin' but .poetry-version is '$(cat .poetry-version)'"
    fail=1
  fi

  # Nothing may hardcode a version: every install site reads .poetry-version,
  # so a bump is one edit rather than a sweep that can be half-finished.
  # Test files are excluded because a hardcoded version is exactly the fixture
  # they need to prove this check works, and a .bats file installs nothing.
  hardcoded="$(grep -rlE 'poetry==[0-9]' --exclude='*.bats' \
    backend/Dockerfile .github 2>/dev/null || true)"
  if [ -n "$hardcoded" ]; then
    error "Poetry version hardcoded instead of read from .poetry-version:"
    while IFS= read -r offender; do
      error "  ${offender}"
    done <<< "$hardcoded"
    fail=1
  fi

  return "$fail"
}

main() {
  local fail=0

  check_python || fail=1
  check_shell_test_image_is_the_backends || fail=1
  check_node || fail=1
  check_poetry || fail=1

  if [ "$fail" -ne 0 ]; then
    error "Version consistency check failed. Update the mismatched files to match the single source."
    exit 1
  fi

  log "All pinned versions are consistent."
}

# Only run when executed, not when sourced, so tests can load the
# functions above without the script running itself.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
