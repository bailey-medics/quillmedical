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

check_python() {
  local source docker mypy entry name value fail=0

  source="$(cut -d. -f1,2 < .python-version)"
  docker="$(grep -oE 'python:[0-9]+\.[0-9]+' backend/Dockerfile | head -1 | cut -d: -f2)"
  mypy="$(grep -m1 -oE 'python_version = "[0-9]+\.[0-9]+"' backend/pyproject.toml | grep -oE '[0-9]+\.[0-9]+')"

  log "Python minor — .python-version: ${source:-<none>}, backend/Dockerfile: ${docker:-<none>}, mypy: ${mypy:-<none>}"

  for entry in "backend/Dockerfile=$docker" "backend/pyproject.toml (mypy)=$mypy"; do
    name="${entry%%=*}"
    value="${entry#*=}"

    if [ "$value" != "$source" ]; then
      error "Python minor mismatch: $name is '$value' but .python-version is '$source'"
      fail=1
    fi
  done

  return "$fail"
}

check_node() {
  local ci docker fail=0

  ci="$(grep -oE "node-version: '[0-9]+'" .github/actions/setup-frontend/action.yml | grep -oE '[0-9]+' | sort -u)"
  docker="$(grep -oE 'node:[0-9]+' frontend/Dockerfile | head -1 | cut -d: -f2)"

  if [ "$(printf '%s\n' "$ci" | grep -c .)" -ne 1 ]; then
    error "setup-frontend action has more than one distinct node-version major: $(echo "$ci" | tr '\n' ' ')"
    fail=1
  fi

  log "Node major — .github/actions/setup-frontend/action.yml: ${ci:-<none>}, frontend/Dockerfile: ${docker:-<none>}"

  if [ "$ci" != "$docker" ]; then
    error "Node major mismatch: setup-frontend action is '$ci' but frontend/Dockerfile is '$docker'"
    fail=1
  fi

  return "$fail"
}

check_poetry() {
  local source consumer bound hardcoded fail=0

  if [ ! -s .poetry-version ]; then
    error ".poetry-version is missing or empty; it is the single source for Poetry's version"
    return 1
  fi

  source="$(cut -d. -f1,2 < .poetry-version)"

  log "Poetry minor — .poetry-version: ${source}"

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
