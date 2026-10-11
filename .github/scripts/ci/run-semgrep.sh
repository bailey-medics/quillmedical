#!/usr/bin/env bash
# Runs the Semgrep scan over one folder, and fails if it scanned too little.
#
# Usage: run-semgrep.sh <folder> <fewest-files>
#
# The folder holds its own .semgrep.yml and its own ignore file, and Semgrep is
# run from inside it. <fewest-files> is the floor for that folder: a scan
# of fewer files than this looked in the wrong place.
#
# Semgrep exits 0 when it finds nothing, and it finds nothing in files it
# never opened. A wrong folder, an ignore rule that swallows the source or
# a config that matches no language all pass that way. So this reads the
# number of files Semgrep says it scanned and fails on too few, whatever
# Semgrep's own verdict.
#
# It proves the rules first. A rule whose pattern matches nothing passes
# every scan too, and looks the same as a rule the code obeys. So the folder
# also holds .semgrep-canary.<ext>.txt, one line breaking each rule. This
# copies it to a scratch folder under its real extension, scans it, and
# fails without scanning the source when any rule in .semgrep.yml has not
# found its line.
#
# It also says how many files Semgrep could not read all the way through,
# and names the ones that are source and not tests or stories. Semgrep
# leaves out the piece of such a file that it did not understand and scans
# the rest, and with the log level the workflow sets nothing else reports
# them.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "run-semgrep"

# Runs the scan and prints Semgrep's report as JSON. Its own function so
# the tests can stand in for Semgrep.
run_scan() {
  local folder="$1"

  (cd "$folder" && semgrep --config .semgrep.yml --error --json --quiet)
}

# Prints the ids of the rules in a rules file, one a line.
rule_ids() {
  local rules_file="$1"

  sed -n -E 's/^  - id: *//p' "$rules_file"
}

# Reads a Semgrep JSON report on stdin and prints the ids of the rules
# that found something, one a line.
rules_that_fired() {
  jq -r '[.results[]? | .check_id] | unique | .[]' 2>/dev/null || true
}

# Prints the folder's canary file, or nothing when it has none or several.
canary_file() {
  local folder="$1"
  local found=()

  shopt -s nullglob
  found=("${folder}"/.semgrep-canary.*.txt)
  shopt -u nullglob

  if [ "${#found[@]}" -eq 1 ]; then
    echo "${found[0]}"
  fi
}

# Scans the folder's canary file with the folder's rules, and fails unless
# every rule found something in it.
prove_rules() {
  local folder="$1"
  local canary=""
  canary="$(canary_file "$folder")"

  if [ -z "$canary" ]; then
    error "${folder} needs exactly one .semgrep-canary.<ext>.txt, holding a line that breaks each rule, so the rules can be shown to work"
    return 1
  fi

  local scratch=""
  scratch="$(mktemp -d)"
  local name=""
  name="$(basename "$canary" .txt)"

  cp "${folder}/.semgrep.yml" "${scratch}/.semgrep.yml"
  cp "$canary" "${scratch}/canary.${name##*.}"

  local report=""
  report="$(run_scan "$scratch")" || true
  rm -rf "$scratch"

  local fired=""
  fired="$(rules_that_fired <<<"$report")"

  local ids=""
  ids="$(rule_ids "${folder}/.semgrep.yml")"

  if [ -z "$ids" ]; then
    error "${folder}/.semgrep.yml holds no rules, so the scan would check nothing"
    return 1
  fi

  local id=""
  local silent=""

  while IFS= read -r id; do
    if ! grep -qxF "$id" <<<"$fired"; then
      silent="${silent:+${silent}, }${id}"
    fi
  done <<<"$ids"

  if [ -n "$silent" ]; then
    error "These rules found nothing in ${canary}: ${silent}. Each rule needs a line there that breaks it, and a rule that cannot find its own line would pass any code"
    return 1
  fi

  log "All $(wc -l <<<"$ids" | tr -d ' ') rules found their line in $(basename "$canary")"
}

# Reads a Semgrep JSON report on stdin and says how many files it scanned,
# or nothing when the report does not say.
files_scanned() {
  jq -r '.paths.scanned | length' 2>/dev/null || true
}

# Reads a Semgrep JSON report on stdin and says how many files it could
# not read all the way through.
files_partly_read() {
  jq -r '[.errors[]? | .path? // empty] | unique | length' 2>/dev/null || true
}

# Reads a Semgrep JSON report on stdin and prints the source files it could
# not read all the way through, one a line. A test or a story is left out:
# no rule here is about what a test does.
source_files_partly_read() {
  jq -r '[.errors[]? | .path? // empty] | unique | .[]' 2>/dev/null \
    | grep -v -E '(\.test\.|\.stories\.|_test\.py$)' || true
}

# Reads a Semgrep JSON report on stdin and prints one line a finding.
findings() {
  jq -r '.results[]? | "\(.path):\(.start.line) \(.check_id) \(.extra.message)"'
}

# Decides from Semgrep's exit code, the floor and its report. Prints the
# findings when there are any to act on.
check_report() {
  local exit_code="$1"
  local fewest="$2"
  local report=""
  report="$(cat)"

  local files=""
  files="$(files_scanned <<<"$report")"

  if [[ ! "$files" =~ ^[0-9]+$ ]]; then
    printf '%s\n' "$report" >&2
    error "Semgrep did not say how many files it scanned, so nothing can be said to have been checked"
    return 1
  fi

  if [ "$files" -lt "$fewest" ]; then
    error "Semgrep scanned ${files} files, and there are more than ${fewest}: it looked in the wrong place"
    return 1
  fi

  local partly=""
  partly="$(files_partly_read <<<"$report")"

  if [ "$exit_code" -ne 0 ]; then
    findings <<<"$report" >&2
    error "Semgrep found issues in ${files} files. Fix each one, or end the line with a comment reading 'nosemgrep: <rule> - <why it is safe>'"
    return 1
  fi

  log "Semgrep scanned ${files} files and found nothing. It could not read ${partly:-0} of them all the way through"

  local source_files=""
  source_files="$(source_files_partly_read <<<"$report")"

  if [ -n "$source_files" ]; then
    log "Of those, these are source and not tests or stories. Semgrep skipped the piece of each it did not understand: $(tr '\n' ' ' <<<"$source_files")"
  fi
}

main() {
  local folder="${1:-}"
  local fewest="${2:-}"

  if [ -z "$folder" ]; then
    error "No folder given. Usage: run-semgrep.sh <folder> <fewest-files>"
    exit 1
  fi

  if [[ ! "$fewest" =~ ^[1-9][0-9]*$ ]]; then
    error "No floor given, or not a number above nought. Usage: run-semgrep.sh <folder> <fewest-files>"
    exit 1
  fi

  if [ ! -f "${folder}/.semgrep.yml" ]; then
    error "${folder}/.semgrep.yml is not there, so there are no rules to scan with"
    exit 1
  fi

  prove_rules "$folder"

  local report=""
  local exit_code=0

  report="$(run_scan "$folder")" || exit_code=$?

  check_report "$exit_code" "$fewest" <<<"$report"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
