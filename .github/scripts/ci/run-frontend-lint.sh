#!/usr/bin/env bash
# Runs one frontend lint tool, and fails if it looked at too few files.
#
# Usage: run-frontend-lint.sh <eslint|prettier|stylelint>
#
# Run from frontend/. Each tool is started through its script in
# package.json, so the files it is given are the ones a developer gets
# from `yarn eslint`, `yarn prettier` and `yarn stylelint`.
#
# A lint tool passes when it finds no fault, and it finds none in files
# it was never given. For a long time the three scripts named their files
# with the pattern `*/*.ts`, which reaches one folder down and no
# further: ESLint checked 25 files of 1,200, and stylelint none at all,
# and every run was green. So this counts the files the tool reports
# having checked and fails on too few, whatever the tool's own verdict.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "run-frontend-lint"

#: The fewest files each tool should be looking at. Each is well under
#: the real number, so ordinary growth and shrinkage never trip it, and
#: far over what a pattern that misses the source folders can reach.
readonly MIN_ESLINT_FILES=500
readonly MIN_PRETTIER_FILES=500
readonly MIN_STYLELINT_FILES=30

# Fails when a tool looked at fewer files than it should have.
require_enough_files() {
  local tool="$1"
  local files="$2"
  local minimum="$3"

  if [[ ! "$files" =~ ^[0-9]+$ ]]; then
    error "${tool} did not say how many files it checked, so nothing can be said to have been checked"
    return 1
  fi

  if [ "$files" -lt "$minimum" ]; then
    error "${tool} checked ${files} files, and there are far more than ${minimum}: its pattern in package.json is missing the source folders"
    return 1
  fi
}

run_eslint() {
  local report=""
  report="$(mktemp)"

  local exit_code=0
  yarn eslint --format json -o "$report" >/dev/null || exit_code=$?

  local files=""
  files="$(jq -r 'length' "$report" 2>/dev/null || true)"

  require_enough_files "ESLint" "$files" "$MIN_ESLINT_FILES"

  if [ "$exit_code" -ne 0 ]; then
    jq -r '.[] | .filePath as $file | .messages[] | "\($file):\(.line) \(.ruleId) \(.message)"' "$report" >&2
    error "ESLint found faults in ${files} files"
    return 1
  fi

  log "ESLint checked ${files} files and found nothing"
}

run_stylelint() {
  local report=""
  report="$(mktemp)"

  local exit_code=0
  # stylelint prints the report as well as writing it, so that is dropped.
  yarn stylelint --formatter json -o "$report" >/dev/null || exit_code=$?

  local files=""
  files="$(jq -r 'length' "$report" 2>/dev/null || true)"

  require_enough_files "stylelint" "$files" "$MIN_STYLELINT_FILES"

  if [ "$exit_code" -ne 0 ]; then
    jq -r '.[] | .source as $file | .warnings[] | "\($file):\(.line) \(.rule) \(.text)"' "$report" >&2
    error "stylelint found faults in ${files} files"
    return 1
  fi

  log "stylelint checked ${files} files and found nothing"
}

run_prettier() {
  local output=""
  local exit_code=0

  # Prettier names each file it looks at only when asked for its debug
  # log, as a line saying where it looked for that file's config.
  output="$(yarn prettier --log-level debug 2>&1)" || exit_code=$?

  local files=""
  files="$(grep -c 'resolve config from' <<<"$output" || true)"

  require_enough_files "Prettier" "$files" "$MIN_PRETTIER_FILES"

  if [ "$exit_code" -ne 0 ]; then
    grep '^\[warn\]' <<<"$output" >&2 || true
    error "Prettier found files that are not formatted, among ${files}. Run 'yarn prettier:fix'"
    return 1
  fi

  log "Prettier checked ${files} files and all are formatted"
}

main() {
  local tool="${1:-}"

  case "$tool" in
    eslint) run_eslint ;;
    prettier) run_prettier ;;
    stylelint) run_stylelint ;;
    *)
      error "Unknown tool '${tool}'. Usage: run-frontend-lint.sh <eslint|prettier|stylelint>"
      exit 1
      ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
