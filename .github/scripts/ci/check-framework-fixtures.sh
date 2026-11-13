#!/usr/bin/env bash
# Fails the build if shared/framework-fixtures/ differs from the testing
# repositories at the commits its SOURCE file records.
#
# Usage: check-framework-fixtures.sh [<fixtures-dir>]
#
# There are two testing repositories, each holding one made-up framework:
# bailey-medics/quill-medical-framework-testing holds quill_test, and
# bailey-medics/quill-medical-2-framework-testing holds quill_2_test. A
# fixture is changed there, by a reviewed pull request. This folder is a
# copy, kept so the unit tests, Storybook and the end-to-end stack read the
# fixtures offline. `just framework-fixtures-refresh` makes the copy and
# writes SOURCE. So a fixture edited here by hand fails this check, which
# is what makes the testing repositories the source.
#
# It compares with the commits in SOURCE, not with each repository's main,
# so a merge there never turns an unrelated pull request here red.
#
# The folder holds each framework twice over. <id>.yaml is the newest
# version, for everything that reads a framework as it stands. history/
# holds every version, history/<id>/<version>.yaml, read from the
# repository's first-parent history oldest first, keeping the first text of
# each version, exactly as the framework sync reads a repository. The tests
# and the end-to-end seed sync from history/, because the sync refuses a
# framework whose first stored version is not 1.
#
# scripts/framework-fixtures-refresh.sh sources this file for its helpers.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "check-framework-fixtures"

DEFAULT_FIXTURES_DIR="shared/framework-fixtures"

# Prints each `source=` line of a SOURCE file as "<repository> <commit>",
# one a line, in the order written.
source_entries() {
  local source_file="$1"

  sed -n 's/^source=//p' "${source_file}"
}

# Prints the name of each fixture in a frameworks folder, one a line, sorted.
fixture_names() {
  local frameworks_dir="$1"
  local path

  for path in "${frameworks_dir}"/*.yaml; do
    [ -e "${path}" ] || continue

    basename "${path}"
  done | sort
}

# Prints the path of each fixture file in a fixtures folder, from the top of
# that folder, one a line, sorted: the newest versions, then history/.
fixture_paths() {
  local fixtures_dir="$1"
  local path

  fixture_names "${fixtures_dir}"

  for path in "${fixtures_dir}"/history/*/*.yaml; do
    [ -e "${path}" ] || continue

    echo "${path#"${fixtures_dir}/"}"
  done | sort
}

# Prints the version a framework file declares: the first `version:` line
# indented as the framework block's own fields are.
declared_version() {
  sed -n 's/^  version: *\([0-9][0-9]*\).*/\1/p' | head -n 1
}

# Writes every version of every framework at <ref> into <into>/<id>/, one
# file a version. Walks <ref>'s first-parent history oldest first and keeps
# the first text at which each version appears, as the framework sync does.
# Only a framework the checkout in <clone> still holds is kept: one deleted
# from the repository is no longer a fixture, whatever its history.
gather_history() {
  local clone="$1"
  local ref="$2"
  local into="$3"
  local commit
  local meta
  local path
  local blob
  local name
  local version
  local -A seen=()

  while IFS= read -r commit; do
    while IFS=$'\t' read -r meta path; do
      blob="$(echo "${meta}" | cut -d' ' -f3)"
      name="$(basename "${path}" .yaml)"

      if [ "${path}" != "frameworks/${name}.yaml" ] || [ -n "${seen[${blob}]:-}" ]; then
        continue
      fi

      if [ ! -e "${clone}/frameworks/${name}.yaml" ]; then
        continue
      fi

      seen[${blob}]=1
      version="$(git -C "${clone}" cat-file blob "${blob}" | declared_version)"

      if [ -z "${version}" ]; then
        error "${path} at ${commit} declares no version."
        return 1
      fi

      if [ ! -e "${into}/${name}/${version}.yaml" ]; then
        mkdir -p "${into}/${name}"
        git -C "${clone}" cat-file blob "${blob}" > "${into}/${name}/${version}.yaml"
      fi
    done < <(git -C "${clone}" ls-tree -r "${commit}" -- frameworks/)
  done < <(git -C "${clone}" rev-list --first-parent --reverse "${ref}")
}

# Clones a repository into a folder, at one commit.
clone_at() {
  local repository="$1"
  local commit="$2"
  local into="$3"

  git clone --quiet --no-checkout "${repository}" "${into}"
  git -C "${into}" -c advice.detachedHead=false checkout --quiet "${commit}"
}

# Copies a repository's frameworks into one folder holding every testing
# repository's, refusing a file name two repositories both hold.
gather() {
  local frameworks_dir="$1"
  local into="$2"
  local repository="$3"
  local name

  while IFS= read -r name; do
    if [ -e "${into}/${name}" ]; then
      error "${name} is in more than one testing repository, last in ${repository}."
      return 1
    fi

    cp "${frameworks_dir}/${name}" "${into}/${name}"
  done < <(fixture_names "${frameworks_dir}")
}

# Prints a line for each fixture that differs between the two folders.
differences() {
  local expected_dir="$1"
  local actual_dir="$2"
  local name

  while IFS= read -r name; do
    if [ ! -f "${actual_dir}/${name}" ]; then
      echo "${name} is in a testing repository but not here"
    elif ! cmp -s "${expected_dir}/${name}" "${actual_dir}/${name}"; then
      echo "${name} differs from its testing repository"
    fi
  done < <(fixture_paths "${expected_dir}")

  while IFS= read -r name; do
    if [ ! -f "${expected_dir}/${name}" ]; then
      echo "${name} is here but in no testing repository"
    fi
  done < <(fixture_paths "${actual_dir}")
}

main() {
  local fixtures_dir="${1:-${DEFAULT_FIXTURES_DIR}}"
  local source_file="${fixtures_dir}/SOURCE"
  local entries
  local scratch
  local repository
  local commit
  local count=0
  local found

  if [ ! -f "${source_file}" ]; then
    error "${source_file} is missing. Run: just framework-fixtures-refresh"
    exit 1
  fi

  entries="$(source_entries "${source_file}")"

  if [ -z "${entries}" ]; then
    error "${source_file} names no testing repository. Run: just framework-fixtures-refresh"
    exit 1
  fi

  scratch="$(mktemp -d)"
  # shellcheck disable=SC2064 # expand now: scratch is local to main
  trap "rm -rf '${scratch}'" EXIT
  mkdir "${scratch}/expected"

  while read -r repository commit; do
    if [ -z "${repository}" ] || [ -z "${commit}" ]; then
      error "${source_file} has a source line with no repository or no commit. Run: just framework-fixtures-refresh"
      exit 1
    fi

    count=$((count + 1))
    log "Reading ${repository} at ${commit}"
    clone_at "${repository}" "${commit}" "${scratch}/testing-${count}"
    gather "${scratch}/testing-${count}/frameworks" "${scratch}/expected" "${repository}" || exit 1
    gather_history "${scratch}/testing-${count}" "${commit}" "${scratch}/expected/history" || exit 1
  done <<< "${entries}"

  found="$(differences "${scratch}/expected" "${fixtures_dir}")"

  if [ -n "${found}" ]; then
    while IFS= read -r line; do
      error "${line}"
    done <<< "${found}"

    error "Change a fixture in its testing repository, then copy it here with: just framework-fixtures-refresh"
    exit 1
  fi

  log "Every fixture matches its testing repository at the commit in SOURCE."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
