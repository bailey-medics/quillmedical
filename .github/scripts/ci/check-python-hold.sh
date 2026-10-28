#!/usr/bin/env bash
# Reports when the backend can move to the next Python minor.
#
# renovate.json holds every new Python minor behind Dependency Dashboard
# approval, because the backend cannot move until each compiled dependency
# publishes a wheel for it. For 3.15 that was pygit2, which does not build
# in the slim image without libgit2. As with the TypeScript hold, nothing in
# Renovate notices the day that stops being true, so this checks it.
#
# The minor it watches is the one after .python-version's, so it never needs
# changing or deleting: once the backend is on 3.15, it watches for 3.16.
#
# Every package in the backend's lock files is looked up on PyPI at its
# locked version, and sorted by the files that release ships:
#
#   - no wheels at all, only a source archive: taken to be pure Python
#   - a wheel tagged none for its ABI: works on any Python 3
#   - anything else is compiled, and ready only with a manylinux x86_64
#     wheel for the held minor, or a stable ABI (abi3) one from a minor no
#     later than it
#
# A package in BUILDS_WITHOUT_WHEEL installs from source without one, so it
# is not waited for.
#
# Prints its finding on standard output, and writes it to GITHUB_OUTPUT as
# `liftable`, with the minor as `minor`, when running inside GitHub Actions.
# Silence means the hold stands.
#
# Usage: check-python-hold.sh
#
# Run from the repository root.
#
# Environment:
#   HELD_MINOR     Python minor to check, such as 3.15, instead of the one
#                  after .python-version. Used by the tests, and by hand to
#                  rehearse.
#   GITHUB_OUTPUT  Destination for `liftable` and `minor`, when set by the
#                  runner.
#
# Exit codes:
#   0  ran successfully, whether or not the hold can be lifted
#   1  could not read .python-version, a lock file, or PyPI
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "check-python-hold"

# Delimiter for the heredoc form of GITHUB_OUTPUT. A report containing this
# line on its own could inject step outputs, so it is refused.
readonly OUTPUT_DELIMITER="PYTHON_HOLD_EOF"

# Every lock file the backend image installs from.
readonly LOCK_FILES=(
  "backend/poetry.lock"
  "backend/app/features/teaching/tooling/poetry.lock"
)

# Compiled packages whose C extension is optional: with no wheel, pip builds
# the pure Python fallback. PyYAML loses its C loader, which only config and
# the docs build use.
readonly BUILDS_WITHOUT_WHEEL=("pyyaml")

# Prints the minor after a version: 3.15 from 3.14.7. Nothing when the
# version is not at least two numbers.
next_minor() {
  local version="$1"

  if [[ ! "$version" =~ ^([0-9]+)\.([0-9]+) ]]; then
    return 0
  fi

  echo "${BASH_REMATCH[1]}.$((BASH_REMATCH[2] + 1))"
}

# Prints "name version" for every package in the lock files given, once each.
locked_packages() {
  awk '
    /^\[\[package\]\]/ { inside = 1; name = ""; next }
    /^\[/ { inside = 0 }
    inside && /^name = / { gsub(/"/, "", $3); name = $3 }
    inside && /^version = / && name != "" {
      gsub(/"/, "", $3)
      print name, $3
      inside = 0
    }
  ' "$@" | sort -u
}

# Prints the filenames one release ships, one to a line, from PyPI.
fetch_release_files() {
  local name="$1"
  local version="$2"

  curl -fsSL --retry 1 --retry-delay 10 \
    "https://pypi.org/pypi/${name}/${version}/json" |
    jq -r '.urls[].filename'
}

# Decides whether a release's files install on the held minor. Prints
# "ready" or "missing".
#
# Takes the minor as 3.15 and the filenames on standard input.
wheel_status() {
  local minor="$1"
  local minor_number="${minor#*.}"
  local tag="cp${minor/./}"
  local files
  local file

  files="$(grep -E '\.whl$' || true)"

  if [ -z "$files" ]; then
    echo "ready"
    return 0
  fi

  while read -r file; do
    # py3-none-any, and binaries such as Ruff's py3-none-manylinux, which
    # carry no Python ABI and so run on any Python 3.
    if [[ "$file" =~ -none-(any|manylinux[^-]*x86_64[^-]*)\.whl$ ]]; then
      echo "ready"
      return 0
    fi

    if [[ "$file" =~ -${tag}-${tag}-manylinux[^-]*x86_64[^-]*\.whl$ ]]; then
      echo "ready"
      return 0
    fi

    # A stable ABI wheel built for 3.N runs on every minor from N on.
    if [[ "$file" =~ -cp3([0-9]+)-abi3-manylinux[^-]*x86_64[^-]*\.whl$ ]] &&
      ((10#${BASH_REMATCH[1]} <= 10#$minor_number)); then
      echo "ready"
      return 0
    fi
  done <<<"$files"

  echo "missing"
}

# True when a package installs without a wheel, so is not waited for.
builds_without_wheel() {
  local name="$1"
  local allowed

  for allowed in "${BUILDS_WITHOUT_WHEEL[@]}"; do
    if [ "$name" = "$allowed" ]; then
      return 0
    fi
  done

  return 1
}

# Hands the report and the minor to the workflow. Does nothing outside
# Actions, which keeps the script runnable by hand.
publish_step_output() {
  local report="$1"
  local minor="$2"

  if [ -z "${GITHUB_OUTPUT:-}" ]; then
    return 0
  fi

  if grep -qxF "$OUTPUT_DELIMITER" <<<"$report"; then
    error "Report contains the output delimiter on a line of its own; refusing to write it."
    return 1
  fi

  {
    echo "minor=${minor}"
    echo "liftable<<${OUTPUT_DELIMITER}"
    if [ -n "$report" ]; then
      echo "$report"
    fi
    echo "$OUTPUT_DELIMITER"
  } >>"$GITHUB_OUTPUT"
}

main() {
  local minor="${HELD_MINOR:-}"
  local lock

  if [ -z "$minor" ]; then
    if [ ! -f .python-version ]; then
      error ".python-version not found; run this from the repository root"
      return 1
    fi

    minor="$(next_minor "$(<.python-version)")"
  fi

  if [ -z "$minor" ]; then
    error "Could not work out the next Python minor from .python-version"
    return 1
  fi

  for lock in "${LOCK_FILES[@]}"; do
    if [ ! -f "$lock" ]; then
      error "Lock file not found: ${lock}"
      return 1
    fi
  done

  local -a missing=()
  local name version files

  while read -r name version; do
    if ! files="$(fetch_release_files "$name" "$version")"; then
      error "Could not read ${name} ${version} from PyPI"
      return 1
    fi

    if [ "$(wheel_status "$minor" <<<"$files")" = "missing" ] &&
      ! builds_without_wheel "$name"; then
      missing+=("${name} ${version}")
    fi
  done < <(locked_packages "${LOCK_FILES[@]}")

  local report=""

  if [ "${#missing[@]}" -eq 0 ]; then
    report="Every compiled backend dependency now ships a wheel for Python ${minor}."
    echo "$report"
  else
    log "Python ${minor} is still held. No wheel yet for: $(printf '%s, ' "${missing[@]}" | sed 's/, $//')"
  fi

  publish_step_output "$report" "$minor"
}

# Only run when executed, so the tests can source this file.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  main "$@"
fi
