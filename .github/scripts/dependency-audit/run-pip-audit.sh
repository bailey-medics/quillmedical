#!/usr/bin/env bash
# Checks the backend's installed packages against the known-vulnerability
# lists, and fails on any that is not excused in the ignore file.
#
# Usage: run-pip-audit.sh <virtualenv> <ignore-file> <fewest-packages>
#
# <virtualenv> is the folder Poetry installed the production packages
# into. <ignore-file> lists the advisories accepted for now, one a line,
# each with its reason. <fewest-packages> is the floor: an audit of fewer
# packages than this looked in the wrong place. Needs `pip-audit` and `jq`.
#
# pip-audit has no levels of severity to choose between: the Python
# advisory lists do not carry one. So every known vulnerability fails,
# and one that does not apply here is excused by name, in writing.
#
# Three ways this could pass without having checked anything, and each is
# closed:
#
# - pip-audit exits 0 over an empty folder, so too few packages fails.
# - an excuse outlives its advisory, so one that matches nothing fails,
#   and the list cannot grow stale.
# - an excuse with no reason is refused, so the list cannot become a
#   place to make a failure go away.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "run-pip-audit"

# Runs the audit over a site-packages folder and prints the report as
# JSON. Its own function so the tests can stand in for pip-audit.
run_audit() {
  local site_packages="$1"

  pip-audit --path "$site_packages" --format json --aliases on --progress-spinner off
}

# Prints the site-packages folder of a virtualenv, or nothing.
site_packages_of() {
  local venv="$1"
  local found=()

  shopt -s nullglob
  found=("${venv}"/lib/python*/site-packages)
  shopt -u nullglob

  if [ "${#found[@]}" -eq 1 ]; then
    echo "${found[0]}"
  fi
}

# Prints the ignore file's entries as "id<TAB>reason", one a line, with
# comments and blank lines left out.
ignore_entries() {
  local ignore_file="$1"

  sed -E 's/^[[:space:]]+//; /^#/d; /^$/d' "$ignore_file" \
    | sed -E 's/^([^[:space:]]+)[[:space:]]*(.*)$/\1\t\2/'
}

# Reads a pip-audit JSON report on stdin and says how many packages it
# looked at, or nothing when the report does not say.
packages_audited() {
  jq -r '.dependencies | length' 2>/dev/null || true
}

# Reads a pip-audit JSON report on stdin and prints one line a
# vulnerability: package, version, every name the advisory goes by
# joined with commas, and the versions that fix it.
vulnerabilities() {
  jq -r '
    .dependencies[]
    | . as $package
    | (.vulns // [])[]
    | [
        $package.name,
        $package.version,
        ([.id] + (.aliases // []) | unique | join(",")),
        ((.fix_versions // []) | join(", "))
      ]
    | @tsv
  ' | sort -u
}

# Decides from the report, the ignore file and the floor.
check_report() {
  local ignore_file="$1"
  local fewest="$2"
  local report=""
  report="$(cat)"

  local packages=""
  packages="$(packages_audited <<<"$report")"

  if [[ ! "$packages" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$report" >&2
    error "pip-audit did not say how many packages it looked at, so nothing can be said to have been checked"
    return 1
  fi

  if [ "$packages" -lt "$fewest" ]; then
    error "pip-audit looked at ${packages} packages, and there are more than ${fewest}: it looked in the wrong place"
    return 1
  fi

  local entries=""
  entries="$(ignore_entries "$ignore_file")"

  local id=""
  local reason=""

  while IFS=$'\t' read -r id reason; do
    if [ -n "$id" ] && [ -z "$reason" ]; then
      error "${ignore_file} excuses ${id} without saying why. Put the reason after it on the same line"
      return 1
    fi
  done <<<"$entries"

  local reported=""
  reported="$(vulnerabilities <<<"$report")"

  local failed=0
  local package=""
  local version=""
  local names=""
  local fix=""
  local used=""
  local excused=""

  while IFS=$'\t' read -r package version names fix; do
    if [ -z "$package" ]; then
      continue
    fi

    excused=""

    while IFS=$'\t' read -r id reason; do
      if [ -n "$id" ] && grep -qxF "$id" <<<"${names//,/$'\n'}"; then
        excused="$id"
      fi
    done <<<"$entries"

    if [ -n "$excused" ]; then
      used="${used}${excused}"$'\n'
      log "Excused: ${package} ${version}, ${names}"
    else
      error "${package} ${version} has a known vulnerability: ${names}. Fixed in: ${fix:-no version yet}"
      failed=1
    fi
  done <<<"$reported"

  while IFS=$'\t' read -r id reason; do
    if [ -n "$id" ] && ! grep -qxF "$id" <<<"$used"; then
      error "${ignore_file} excuses ${id}, which no installed package has any more. Take the line out"
      failed=1
    fi
  done <<<"$entries"

  if [ "$failed" -ne 0 ]; then
    error "Update the package, or if the advisory does not apply here, add its id and the reason to ${ignore_file}"
    return 1
  fi

  log "pip-audit looked at ${packages} packages and found nothing that is not excused"
}

main() {
  local venv="${1:-}"
  local ignore_file="${2:-}"
  local fewest="${3:-}"

  if [ -z "$venv" ] || [ -z "$ignore_file" ] || [[ ! "$fewest" =~ ^[1-9][0-9]*$ ]]; then
    error "Usage: run-pip-audit.sh <virtualenv> <ignore-file> <fewest-packages>"
    exit 1
  fi

  if [ ! -f "$ignore_file" ]; then
    error "${ignore_file} is not there. It may be empty, but it has to exist"
    exit 1
  fi

  local site_packages=""
  site_packages="$(site_packages_of "$venv")"

  if [ -z "$site_packages" ]; then
    error "${venv} holds no lib/python*/site-packages, so there is nothing installed to audit"
    exit 1
  fi

  local report=""

  # pip-audit exits 1 when it finds something and still prints its report,
  # so the report decides and not the exit code.
  report="$(run_audit "$site_packages")" || true

  check_report "$ignore_file" "$fewest" <<<"$report"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
