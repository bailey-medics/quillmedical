#!/usr/bin/env bash
# Fails when a frontend source file is plain JavaScript, or is in no
# TypeScript project that `yarn typecheck:all` runs.
#
# Usage: check-typescript-coverage.sh
#
# Run from frontend/. A file outside every project is type-checked by
# nothing, and nothing says so: 30 were, until October 2026, among them
# the whole public site. A JavaScript file is checked by nothing either.
# So this lists every tracked source file and fails on any that is
# JavaScript or that no project includes.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "check-typescript-coverage"

#: Fewer source files than this means the listing missed the folders,
#: not that the frontend shrank. Well under the real number.
readonly MIN_SOURCE_FILES=500

#: JavaScript files allowed to stay JavaScript, each with its reason.
#: Empty: every one was converted in October 2026.
readonly ALLOWED_JS=()

# Every tracked source file, less what is generated or only declares.
source_files() {
  git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.cjs' '*.mjs' \
    | grep -v '^src/generated/' \
    | grep -v '\.d\.ts$' \
    || true
}

# The projects `typecheck:all` runs, read from package.json so the two
# cannot drift apart.
typecheck_projects() {
  jq -r '.scripts["typecheck:all"]' package.json \
    | grep -o -- '--project [^ ]*' \
    | cut -d' ' -f2
}

# Every file the given projects include, relative to this folder.
covered_files() {
  local project=""

  while read -r project; do
    yarn exec tsc --project "$project" --listFilesOnly
  done \
    | sed "s|^${PWD}/||" \
    | grep -v '^/' \
    | grep -v 'node_modules/' \
    | sort -u
}

is_allowed_js() {
  local file="$1"
  local allowed=""

  for allowed in ${ALLOWED_JS[@]+"${ALLOWED_JS[@]}"}; do
    if [ "$file" = "$allowed" ]; then return 0; fi
  done

  return 1
}

main() {
  local sources=""
  sources="$(source_files)"

  local count=0
  count="$(grep -c . <<<"$sources" || true)"

  if [ "$count" -lt "$MIN_SOURCE_FILES" ]; then
    error "found ${count} source files, and there are far more than ${MIN_SOURCE_FILES}: run this from frontend/"
    exit 1
  fi

  local javascript=""
  local file=""
  while read -r file; do
    case "$file" in
      *.js | *.jsx | *.cjs | *.mjs)
        if ! is_allowed_js "$file"; then javascript+="  ${file}"$'\n'; fi
        ;;
    esac
  done <<<"$sources"

  local covered=""
  covered="$(typecheck_projects | covered_files)"

  local uncovered=""
  uncovered="$(comm -23 <(sort -u <<<"$sources") <(echo "$covered"))"

  local failed=0

  if [ -n "$javascript" ]; then
    error "these are JavaScript, which nothing type-checks. Write them in TypeScript:"
    printf '%s' "$javascript" >&2
    failed=1
  fi

  if [ -n "$uncovered" ]; then
    error "these are in no project that yarn typecheck:all runs. Include each in one:"
    while read -r file; do echo "  ${file}" >&2; done <<<"$uncovered"
    failed=1
  fi

  if [ "$failed" -ne 0 ]; then exit 1; fi

  log "all ${count} source files are TypeScript in a project yarn typecheck:all runs"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
