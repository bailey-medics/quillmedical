#!/usr/bin/env bash
# Fails the build if shared/framework-fixtures/ differs from the testing
# repository at the commit its SOURCE file records.
#
# Usage: check-framework-fixtures.sh [<fixtures-dir>]
#
# The testing repository, bailey-medics/quill-medical-framework-testing, is
# where the fixtures are changed, by a reviewed pull request there. This
# folder is a copy, kept so the unit tests, Storybook and the end-to-end
# stack read the fixtures offline. `just framework-fixtures-refresh` makes
# the copy and writes SOURCE. So a fixture edited here by hand fails this
# check, which is what makes the testing repository the source.
#
# It compares with the commit in SOURCE, not with the testing repository's
# main, so a merge there never turns an unrelated pull request here red.
#
# Every frameworks/*.yaml at that commit is a fixture except quill_test.yaml,
# the repository's own test framework. The integration test reads that one
# from the repository, with its history, and no test here needs it.
#
# scripts/framework-fixtures-refresh.sh sources this file for its helpers.
# See Phase 15 of docs/docs/plans/2026-11-01-passport-record-and-catalogue-plan.md.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "check-framework-fixtures"

DEFAULT_FIXTURES_DIR="shared/framework-fixtures"

# The testing repository's own framework, which stays out of the fixtures.
NOT_A_FIXTURE="quill_test.yaml"

# Prints the value of one key=value line in a SOURCE file.
source_value() {
  local source_file="$1"
  local key="$2"

  sed -n "s/^${key}=//p" "${source_file}" | head -n 1
}

# Prints the name of each fixture in a frameworks folder, one a line, sorted.
fixture_names() {
  local frameworks_dir="$1"
  local path
  local name

  for path in "${frameworks_dir}"/*.yaml; do
    [ -e "${path}" ] || continue

    name="$(basename "${path}")"
    if [ "${name}" != "${NOT_A_FIXTURE}" ]; then
      echo "${name}"
    fi
  done | sort
}

# Clones a repository into a folder, at one commit.
clone_at() {
  local repository="$1"
  local commit="$2"
  local into="$3"

  git clone --quiet --no-checkout "${repository}" "${into}"
  git -C "${into}" -c advice.detachedHead=false checkout --quiet "${commit}"
}

# Prints a line for each fixture that differs between the two folders.
differences() {
  local expected_dir="$1"
  local actual_dir="$2"
  local name

  while IFS= read -r name; do
    if [ ! -f "${actual_dir}/${name}" ]; then
      echo "${name} is in the testing repository but not here"
    elif ! cmp -s "${expected_dir}/${name}" "${actual_dir}/${name}"; then
      echo "${name} differs from the testing repository"
    fi
  done < <(fixture_names "${expected_dir}")

  while IFS= read -r name; do
    if [ ! -f "${expected_dir}/${name}" ]; then
      echo "${name} is here but not in the testing repository"
    fi
  done < <(fixture_names "${actual_dir}")
}

main() {
  local fixtures_dir="${1:-${DEFAULT_FIXTURES_DIR}}"
  local source_file="${fixtures_dir}/SOURCE"
  local repository
  local commit
  local scratch
  local found

  if [ ! -f "${source_file}" ]; then
    error "${source_file} is missing. Run: just framework-fixtures-refresh"
    exit 1
  fi

  repository="$(source_value "${source_file}" repository)"
  commit="$(source_value "${source_file}" commit)"

  if [ -z "${repository}" ] || [ -z "${commit}" ]; then
    error "${source_file} names no repository or no commit. Run: just framework-fixtures-refresh"
    exit 1
  fi

  scratch="$(mktemp -d)"
  # shellcheck disable=SC2064 # expand now: scratch is local to main
  trap "rm -rf '${scratch}'" EXIT

  log "Reading ${repository} at ${commit}"
  clone_at "${repository}" "${commit}" "${scratch}/testing"

  found="$(differences "${scratch}/testing/frameworks" "${fixtures_dir}")"

  if [ -n "${found}" ]; then
    while IFS= read -r line; do
      error "${line}"
    done <<< "${found}"

    error "Change a fixture in the testing repository, then copy it here with: just framework-fixtures-refresh"
    exit 1
  fi

  log "Every fixture matches the testing repository at ${commit}."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
