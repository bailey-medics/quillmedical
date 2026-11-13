#!/usr/bin/env bash
# Copy the framework fixtures from the testing repositories into
# shared/framework-fixtures/, and record the commit each came from in SOURCE.
#
# Usage: framework-fixtures-refresh.sh [<fixtures-dir> [<repository>[#<branch>] ...]]
#
# With no arguments it copies from both testing repositories' main:
# bailey-medics/quill-medical-framework-testing, which holds quill_test,
# and bailey-medics/quill-medical-2-framework-testing, which holds
# quill_2_test. A branch after `#` copies from that branch instead, so a
# Quill pull request can use a fixture whose own pull request has not
# merged yet; the commit in SOURCE still names exactly what was copied.
#
# Every framework file in each repository's frameworks/ folder is copied,
# as it stands and, under history/, at every version it has had. A fixture
# here that no repository holds any more is removed. A
# refresh is an ordinary pull request, so a fixture change is reviewed here
# as well as there.
#
# .github/scripts/ci/check-framework-fixtures.sh checks the copy against the
# commits in SOURCE, and this sources it for the helpers both need.
set -euo pipefail

# shellcheck source=../.github/scripts/ci/check-framework-fixtures.sh
source "$(dirname "${BASH_SOURCE[0]}")/../.github/scripts/ci/check-framework-fixtures.sh"

# Again, so the messages carry this script's name and not the check's.
# shellcheck source=../.github/scripts/shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../.github/scripts/shared/logging.sh" "framework-fixtures-refresh"

TESTING_REPOSITORIES=(
  "https://github.com/bailey-medics/quill-medical-framework-testing.git"
  "https://github.com/bailey-medics/quill-medical-2-framework-testing.git"
)

# Writes SOURCE's header, which explains the file to a reader.
write_source_header() {
  local source_file="$1"

  {
    echo "# Where the fixtures beside this file were copied from: one line for"
    echo "# each testing repository, with the commit copied. Written by"
    echo "# just framework-fixtures-refresh, and read by"
    echo "# .github/scripts/ci/check-framework-fixtures.sh. Never edit it by hand."
  } > "${source_file}"
}

# Removes each fixture here that no testing repository holds any more.
remove_gone() {
  local gathered_dir="$1"
  local fixtures_dir="$2"
  local name

  while IFS= read -r name; do
    if [ ! -f "${gathered_dir}/${name}" ]; then
      rm "${fixtures_dir}/${name}"
      log "Removed ${name}"
    fi
  done < <(fixture_names "${fixtures_dir}")
}

# Copies each fixture gathered from the testing repositories here.
copy_fixtures() {
  local gathered_dir="$1"
  local fixtures_dir="$2"
  local name

  while IFS= read -r name; do
    cp "${gathered_dir}/${name}" "${fixtures_dir}/${name}"
    log "Copied ${name}"
  done < <(fixture_names "${gathered_dir}")
}

# Clones one repository, at a branch or at its default, into a folder.
# Whole, not shallow, because history/ is read from every commit.
clone_branch() {
  local repository="$1"
  local branch="$2"
  local into="$3"

  if [ -n "${branch}" ]; then
    git clone --quiet --branch "${branch}" "${repository}" "${into}"
  else
    git clone --quiet "${repository}" "${into}"
  fi
}

main() {
  local fixtures_dir="${1:-${DEFAULT_FIXTURES_DIR}}"
  local scratch
  local spec
  local repository
  local branch
  local commit
  local count=0
  local specs=()

  shift || true

  if [ "$#" -gt 0 ]; then
    specs=("$@")
  else
    specs=("${TESTING_REPOSITORIES[@]}")
  fi

  if [ ! -d "${fixtures_dir}" ]; then
    error "${fixtures_dir} does not exist. Run this from the top of a Quill worktree."
    exit 1
  fi

  scratch="$(mktemp -d)"
  # shellcheck disable=SC2064 # expand now: scratch is local to main
  trap "rm -rf '${scratch}'" EXIT
  mkdir "${scratch}/gathered"
  write_source_header "${scratch}/SOURCE"

  for spec in "${specs[@]}"; do
    repository="${spec%%#*}"
    branch=""

    if [ "${spec}" != "${repository}" ]; then
      branch="${spec#*#}"
    fi

    count=$((count + 1))
    clone_branch "${repository}" "${branch}" "${scratch}/testing-${count}"
    commit="$(git -C "${scratch}/testing-${count}" rev-parse HEAD)"

    if [ ! -d "${scratch}/testing-${count}/frameworks" ]; then
      error "${repository} has no frameworks folder at ${commit}."
      exit 1
    fi

    gather "${scratch}/testing-${count}/frameworks" "${scratch}/gathered" "${repository}" || exit 1
    gather_history "${scratch}/testing-${count}" HEAD "${scratch}/gathered/history" || exit 1
    echo "source=${repository} ${commit}" >> "${scratch}/SOURCE"
    log "Read ${repository} at ${commit}"
  done

  remove_gone "${scratch}/gathered" "${fixtures_dir}"
  copy_fixtures "${scratch}/gathered" "${fixtures_dir}"
  rm -rf "${fixtures_dir}/history"
  cp -R "${scratch}/gathered/history" "${fixtures_dir}/history"
  cp "${scratch}/SOURCE" "${fixtures_dir}/SOURCE"

  log "The fixtures are now the testing repositories' at the commits in SOURCE."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
