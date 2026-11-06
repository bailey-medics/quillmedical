#!/usr/bin/env bash
# Copy the framework fixtures from the testing repository's main into
# shared/framework-fixtures/, and record the commit they came from in SOURCE.
#
# Usage: framework-fixtures-refresh.sh [<repository> [<fixtures-dir>]]
#
# The testing repository, bailey-medics/quill-medical-framework-testing, is
# where a fixture is changed. This copies every file in its frameworks/
# folder except its own test framework, quill_test.yaml, and removes a
# fixture here that is no longer there. A refresh is an ordinary pull
# request, so a fixture change is reviewed here as well as there.
#
# .github/scripts/ci/check-framework-fixtures.sh checks the copy against the
# commit in SOURCE, and this sources it for the helpers both need.
set -euo pipefail

# shellcheck source=../.github/scripts/ci/check-framework-fixtures.sh
source "$(dirname "${BASH_SOURCE[0]}")/../.github/scripts/ci/check-framework-fixtures.sh"

# Again, so the messages carry this script's name and not the check's.
# shellcheck source=../.github/scripts/shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../.github/scripts/shared/logging.sh" "framework-fixtures-refresh"

TESTING_REPOSITORY="https://github.com/bailey-medics/quill-medical-framework-testing.git"

# Writes SOURCE, naming the repository and the commit the copy came from.
write_source() {
  local source_file="$1"
  local repository="$2"
  local commit="$3"

  {
    echo "# Where the fixtures beside this file were copied from. Written by"
    echo "# just framework-fixtures-refresh, and read by"
    echo "# .github/scripts/ci/check-framework-fixtures.sh. Never edit it by hand."
    echo "repository=${repository}"
    echo "commit=${commit}"
  } > "${source_file}"
}

# Removes each fixture here that the testing repository no longer holds.
remove_gone() {
  local frameworks_dir="$1"
  local fixtures_dir="$2"
  local name

  while IFS= read -r name; do
    if [ ! -f "${frameworks_dir}/${name}" ]; then
      rm "${fixtures_dir}/${name}"
      log "Removed ${name}"
    fi
  done < <(fixture_names "${fixtures_dir}")
}

# Copies each fixture in the testing repository's frameworks folder here.
copy_fixtures() {
  local frameworks_dir="$1"
  local fixtures_dir="$2"
  local name

  while IFS= read -r name; do
    cp "${frameworks_dir}/${name}" "${fixtures_dir}/${name}"
    log "Copied ${name}"
  done < <(fixture_names "${frameworks_dir}")
}

main() {
  local repository="${1:-${TESTING_REPOSITORY}}"
  local fixtures_dir="${2:-${DEFAULT_FIXTURES_DIR}}"
  local scratch
  local commit

  if [ ! -d "${fixtures_dir}" ]; then
    error "${fixtures_dir} does not exist. Run this from the top of a Quill worktree."
    exit 1
  fi

  scratch="$(mktemp -d)"
  # shellcheck disable=SC2064 # expand now: scratch is local to main
  trap "rm -rf '${scratch}'" EXIT

  git clone --quiet --depth 1 "${repository}" "${scratch}/testing"
  commit="$(git -C "${scratch}/testing" rev-parse HEAD)"

  if [ ! -d "${scratch}/testing/frameworks" ]; then
    error "${repository} has no frameworks folder at ${commit}."
    exit 1
  fi

  remove_gone "${scratch}/testing/frameworks" "${fixtures_dir}"
  copy_fixtures "${scratch}/testing/frameworks" "${fixtures_dir}"
  write_source "${fixtures_dir}/SOURCE" "${repository}" "${commit}"

  log "The fixtures are now the testing repository's at ${commit}."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
