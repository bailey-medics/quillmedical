#!/usr/bin/env bash
# Validates api-compatibility / decision files against the schema and CI rules.
#
# Usage: validate-compat-files.sh <oasdiff-json-output> [api-compat-dir]
#
# Arguments:
#   oasdiff-json-output  Path to oasdiff breaking --format json output file,
#                        or "-" to read from stdin.
#   api-compat-dir       Path to api-compatibility directory (default: ./api-compatibility).
#
# Environment:
#   GIT_MAIN_BRANCH      Name of the main branch to check against (default: main).
#
# Performs 11 validation rules:
#   1. (Skipped - oasdiff already ran)
#   2. Coverage: every flagged change has a matching file
#   3. reason: non-empty
#   4. change: single scalar string
#   5. Immutability: generation/forces_reload/change frozen post-merge
#   6. Filename regex match
#   7. No duplicate generations for forces_reload:true files
#   7a. Generation range for forces_reload:false files (1 to max)
#   8. (Skipped - structural validation, not a separate check)
#   10. Stale change string: change exists in oasdiff output
#   (Rule 9 is workflow environment wiring, not a script check)
#   (Rule 11 is repo setting, not a script check)
#
# Exits 0 if all validations pass, 1 if any fail.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "validate-compat-files"

# Configuration
OASDIFF_JSON="${1:-}"
COMPAT_DIR="${2:-./api-compatibility}"
GIT_MAIN_BRANCH="${GIT_MAIN_BRANCH:-main}"

# State
# Plain assignment (no declare/local) so these stay global even when this
# script is sourced inside a function (e.g. bats' setup()) - `declare` would
# otherwise scope them to that function and they'd vanish once it returns.
FAILURES=()
OASDIFF_CHANGES=()
MAX_TRUE_GENERATION=0
MAX_FALSE_GENERATION=0
NUM_TRUE_FILES=0

# YAML field names: constants so set -u catches a misspelled variable reference
readonly GENERATION="generation"
readonly FORCES_RELOAD="forces_reload"
readonly CHANGE="change"
readonly REASON="reason"

# ============================================================================
# Helper functions
# ============================================================================

fail() {
  FAILURES+=("$*")
  error "$*"
}

# Extract a YAML scalar value (avoids jq/yq dependency).
# Args: file, field_name
# Returns the value, or empty if not found. Always exits 0.
read_yaml_field() {
  local file="$1"
  local field="$2"
  local line

  if [ ! -e "$file" ]; then
    echo ""
    return 0
  fi

  line=$(grep "^${field}:" "$file" 2>/dev/null | head -1 || echo "")
  if [ -z "$line" ]; then
    echo ""
    return 0
  fi

  # Remove field: prefix and any leading spaces
  # shellcheck disable=SC2295
  local value="${line#${field}:}"
  value="${value#"${value%%[![:space:]]*}"}"  # strip leading whitespace

  # Remove quotes if present
  if [[ "$value" == \"* ]]; then
    value="${value#\"}"
    value="${value%\"}"
  fi

  echo "$value"
  return 0
}

# Check if a string looks like a YAML list (starts with [ or contains \n or has multiple items).
is_yaml_list() {
  local value="$1"

  [[ "$value" == "["* ]] || [[ "$value" == *$'\n'* ]] || [[ "$value" == *","* ]]
}

# Parse oasdiff JSON output to extract flagged change strings.
#
# `oasdiff breaking --format json` emits a bare JSON array of change objects
# (not a { "changes": [...] } wrapper), each with an "id" field (the check ID,
# e.g. "response-required-property-removed"), a "text" field (human-readable
# detail, e.g. "removed the required property message" - the ONLY field that
# differentiates two changes with the same id/operation/path, such as two
# properties removed from the same endpoint) and, for path-scoped changes,
# "operation" and "path" fields - see
# https://github.com/oasdiff/oasdiff/blob/main/formatters/changes.go.
# Decision files record the change as "<id> <operation> <path> <text>" (see
# backend/scripts/new_compat_decision.py), so rebuild that same string here.
parse_oasdiff_changes() {
  local oasdiff_file="$1"

  if [ ! -f "$oasdiff_file" ]; then
    fail "oasdiff output file not found: $oasdiff_file"
    return 1
  fi

  if ! command -v jq >/dev/null 2>&1; then
    fail "jq is required to parse oasdiff JSON output but was not found on PATH"
    return 1
  fi

  local content
  content=$(cat "$oasdiff_file")

  # oasdiff may write nothing at all if the CLI invocation failed upstream
  # (e.g. piped through `|| true`); treat that as "no changes" rather than a
  # parse failure.
  if [ -z "$content" ]; then
    return 0
  fi

  local jq_output

  if ! jq_output=$(jq -r \
    '.[] | [.id, .operation, .path, .text] | map(select(. != null and . != "")) | join(" ")' \
    <<<"$content" 2>&1); then
    fail "Failed to parse oasdiff JSON output as a JSON array: $jq_output"
    return 1
  fi

  while IFS= read -r change_str; do
    if [ -n "$change_str" ]; then
      OASDIFF_CHANGES+=("$change_str")
    fi
  done <<< "$jq_output"
}

# Get all new files added in this PR compared to main branch.
# Can be overridden in tests via GET_NEW_COMPAT_FILES_OVERRIDE.
get_new_compat_files() {
  if [ -n "${GET_NEW_COMPAT_FILES_OVERRIDE:-}" ]; then
    eval "$GET_NEW_COMPAT_FILES_OVERRIDE"
  else
    git diff --name-only --diff-filter=A "origin/$GIT_MAIN_BRANCH"...HEAD -- "$COMPAT_DIR" 2>/dev/null || true
  fi
}

# Get all compat files that were modified (not added).
# Can be overridden in tests via GET_MODIFIED_COMPAT_FILES_OVERRIDE.
get_modified_compat_files() {
  if [ -n "${GET_MODIFIED_COMPAT_FILES_OVERRIDE:-}" ]; then
    eval "$GET_MODIFIED_COMPAT_FILES_OVERRIDE"
  else
    git diff --name-only --diff-filter=M "origin/$GIT_MAIN_BRANCH"...HEAD -- "$COMPAT_DIR" 2>/dev/null || true
  fi
}

# Get all compat files that were deleted.
# Can be overridden in tests via GET_DELETED_COMPAT_FILES_OVERRIDE.
get_deleted_compat_files() {
  if [ -n "${GET_DELETED_COMPAT_FILES_OVERRIDE:-}" ]; then
    eval "$GET_DELETED_COMPAT_FILES_OVERRIDE"
  else
    git diff --name-only --diff-filter=D "origin/$GIT_MAIN_BRANCH"...HEAD -- "$COMPAT_DIR" 2>/dev/null || true
  fi
}

# Get all compat files currently in the directory.
get_all_compat_files() {
  find "$COMPAT_DIR" -name "*.yaml" -type f 2>/dev/null | sort || true
}

# Get a file's content as it exists on the main branch (empty if not present there).
# Can be overridden in tests via GET_MAIN_FILE_CONTENT_OVERRIDE (a shell function
# receiving $1=file, echoing the content).
get_main_file_content() {
  local file="$1"

  if [ -n "${GET_MAIN_FILE_CONTENT_OVERRIDE:-}" ]; then
    "$GET_MAIN_FILE_CONTENT_OVERRIDE" "$file"
  else
    git show "origin/$GIT_MAIN_BRANCH:$file" 2>/dev/null || echo ""
  fi
}

# ============================================================================
# Validation rules
# ============================================================================

# Rule 2: Coverage - every flagged change has a corresponding file
validate_coverage() {
  if [ ${#OASDIFF_CHANGES[@]} -eq 0 ]; then
    log "No flagged changes from oasdiff."
    return 0
  fi

  log "Checking coverage: ${#OASDIFF_CHANGES[@]} flagged change(s) must have matching files..."

  local start_failures=${#FAILURES[@]}
  local new_files

  new_files=$(get_new_compat_files)

  local covered_changes=()

  # For each new file, extract its 'change' field and store for later comparison
  while IFS= read -r file; do
    if [ -z "$file" ];
      then continue;
    fi

    local change_str
    change_str=$(read_yaml_field "$file" "$CHANGE")

    if [ -n "$change_str" ]; then
      covered_changes+=("$change_str")
    fi
  done <<< "$new_files"

  # Check if all oasdiff changes are covered
  for oasdiff_change in "${OASDIFF_CHANGES[@]}"; do
    local found=0

    # ${arr[@]+"${arr[@]}"} rather than "${arr[@]}": bash 3.2 (which macOS
    # still ships) treats an empty array as unset under `set -u` and aborts.
    # Empty is the normal case when a PR flags a change with no decision file
    # yet - exactly when someone runs this locally to find out why CI failed.
    for covered_change in ${covered_changes[@]+"${covered_changes[@]}"}; do
      if [ "$oasdiff_change" = "$covered_change" ]; then
        found=1
        break
      fi
    done

    if [ $found -eq 0 ]; then
      fail "Flagged change not covered by any decision file: '$oasdiff_change'"
    fi
  done

  [ ${#FAILURES[@]} -eq "$start_failures" ]
}

# Rule 3: Every new file's reason must be non-empty
validate_reasons_nonempty() {
  log "Checking reason fields are non-empty..."

  local start_failures=${#FAILURES[@]}
  local new_files
  new_files=$(get_new_compat_files)

  while IFS= read -r file; do
    if [ -z "$file" ];
      then continue;
    fi

    local reason
    reason=$(read_yaml_field "$file" "$REASON")

    if [ -z "$reason" ]; then
      fail "File $file has empty or missing 'reason' field"
    fi
  done <<< "$new_files"

  [ ${#FAILURES[@]} -eq "$start_failures" ]
}

# Rule 4: change field must be a single scalar (not a list or multi-line)
validate_change_is_scalar() {
  log "Checking change fields are single scalars..."

  local start_failures=${#FAILURES[@]}
  local new_files
  new_files=$(get_new_compat_files)

  while IFS= read -r file; do
    if [ -z "$file" ];
      then continue;
    fi

    local change
    change=$(read_yaml_field "$file" "$CHANGE")

    if [ -z "$change" ]; then
      fail "File $file has empty or missing 'change' field"
      continue
    fi

    if is_yaml_list "$change"; then
      fail "File $file has change field that looks like a list or multi-line: $change"
    fi
  done <<< "$new_files"

  [ ${#FAILURES[@]} -eq "$start_failures" ]
}

# Rule 5: Field-level immutability for generation/forces_reload/change
validate_immutability() {
  log "Checking immutability of generation/forces_reload/change fields..."

  local start_failures=${#FAILURES[@]}
  local modified_files
  modified_files=$(get_modified_compat_files)

  while IFS= read -r file; do
    if [ -z "$file" ];
      then continue;
    fi

    # Get the version on main (single git call, reused for all three fields)
    local main_content
    local main_generation
    local main_forces_reload
    local main_change

    main_content=$(get_main_file_content "$file")
    main_generation=$(echo "$main_content" | read_yaml_field /dev/stdin "$GENERATION" || echo "")
    main_forces_reload=$(echo "$main_content" | read_yaml_field /dev/stdin "$FORCES_RELOAD" || echo "")
    main_change=$(echo "$main_content" | read_yaml_field /dev/stdin "$CHANGE" || echo "")

    # Get the version in this PR
    local pr_generation pr_forces_reload pr_change
    pr_generation=$(read_yaml_field "$file" "$GENERATION")
    pr_forces_reload=$(read_yaml_field "$file" "$FORCES_RELOAD")
    pr_change=$(read_yaml_field "$file" "$CHANGE")

    # Check for changes in frozen fields
    if [ "$main_generation" != "$pr_generation" ]; then
      fail "File $file: 'generation' field changed (was '$main_generation', now '$pr_generation'). This field is immutable after merge."
    fi

    if [ "$main_forces_reload" != "$pr_forces_reload" ]; then
      fail "File $file: 'forces_reload' field changed (was '$main_forces_reload', now '$pr_forces_reload'). This field is immutable after merge."
    fi

    if [ "$main_change" != "$pr_change" ]; then
      fail "File $file: 'change' field changed (was '$main_change', now '$pr_change'). This field is immutable after merge."
    fi
  done <<< "$modified_files"

  [ ${#FAILURES[@]} -eq "$start_failures" ]
}

# Rule 5 (continued): No deleted files
validate_no_deletions() {
  log "Checking for deleted files..."

  local start_failures=${#FAILURES[@]}
  local deleted_files
  deleted_files=$(get_deleted_compat_files)

  while IFS= read -r file; do
    if [ -n "$file" ]; then
      fail "File deletion not permitted: $file. Superseded decisions get a new file, never deletion."
    fi
  done <<< "$deleted_files"

  [ ${#FAILURES[@]} -eq "$start_failures" ]
}

# Rule 6: Filename regex
validate_filename_regex() {
  log "Checking filename regex for new files..."

  local start_failures=${#FAILURES[@]}
  local new_files
  new_files=$(get_new_compat_files)

  local regex='^[0-9]{14}-[a-z0-9]+(-[a-z0-9]+)*\.yaml$'

  while IFS= read -r file; do
    if [ -z "$file" ];
      then continue;
    fi

    local basename
    basename=$(basename "$file")

    if ! [[ "$basename" =~ $regex ]]; then
      fail "File $file does not match required regex: $regex"
    fi
  done <<< "$new_files"

  [ ${#FAILURES[@]} -eq "$start_failures" ]
}

# Rule 7: No duplicate generations for `forces_reload: true` files
validate_duplicate_generations_true() {
  log "Checking for duplicate generations in forces_reload:true files..."

  local start_failures=${#FAILURES[@]}
  local all_files
  all_files=$(get_all_compat_files)

  declare -A true_gens
  NUM_TRUE_FILES=0
  MAX_TRUE_GENERATION=0

  while IFS= read -r file; do
    if [ -z "$file" ];
      then continue;
    fi

    local forces_reload
    local generation
    forces_reload=$(read_yaml_field "$file" "$FORCES_RELOAD")
    generation=$(read_yaml_field "$file" "$GENERATION")

    if [ "$forces_reload" = "true" ]; then
      ((NUM_TRUE_FILES++))

      # Track max generation for true files
      if [[ "$generation" =~ ^[0-9]+$ ]] && [ "$generation" -gt "$MAX_TRUE_GENERATION" ]; then
        MAX_TRUE_GENERATION="$generation"
      fi

      # Check for duplicates
      if [ -n "${true_gens[$generation]:-}" ]; then
        fail "Duplicate generation number for forces_reload:true files: $generation (files: ${true_gens[$generation]} and $file)"
      else
        true_gens[$generation]="$file"
      fi
    fi
  done <<< "$all_files"

  [ ${#FAILURES[@]} -eq "$start_failures" ]
}

# Rule 7a: Generation range for forces_reload: false files
validate_generation_range() {
  log "Checking generation range for forces_reload:false files (1 to $MAX_TRUE_GENERATION)..."

  if [ "$MAX_TRUE_GENERATION" -eq 0 ]; then
    MAX_TRUE_GENERATION=1
  fi

  local start_failures=${#FAILURES[@]}
  local all_files
  all_files=$(get_all_compat_files)

  MAX_FALSE_GENERATION=0

  while IFS= read -r file; do
    if [ -z "$file" ];
      then continue;
    fi

    local forces_reload
    local generation
    forces_reload=$(read_yaml_field "$file" "$FORCES_RELOAD")
    generation=$(read_yaml_field "$file" "$GENERATION")

    if [ "$forces_reload" = "false" ]; then
      # Track max generation for false files
      if [[ "$generation" =~ ^[0-9]+$ ]] && [ "$generation" -gt "$MAX_FALSE_GENERATION" ]; then
        MAX_FALSE_GENERATION="$generation"
      fi

      # Check that generation is numeric
      if ! [[ "$generation" =~ ^[0-9]+$ ]]; then
        fail "File $file: generation is not numeric: '$generation'"
        continue
      fi

      # Check range: must be between 1 and MAX_TRUE_GENERATION
      if [ "$generation" -lt 1 ] || [ "$generation" -gt "$MAX_TRUE_GENERATION" ]; then
        fail "File $file: generation $generation out of valid range [1, $MAX_TRUE_GENERATION]"
      fi
    fi
  done <<< "$all_files"

  [ ${#FAILURES[@]} -eq "$start_failures" ]
}

# Rule 10: Stale change strings (change field matches something in oasdiff output)
validate_stale_change_strings() {
  log "Checking for stale change strings..."

  if [ ${#OASDIFF_CHANGES[@]} -eq 0 ]; then
    log "No flagged changes from oasdiff, skipping stale change check."
    return 0
  fi

  local start_failures=${#FAILURES[@]}
  local new_files
  new_files=$(get_new_compat_files)

  while IFS= read -r file; do
    if [ -z "$file" ];
      then continue;
    fi

    local change
    change=$(read_yaml_field "$file" "$CHANGE")

    if [ -z "$change" ]; then
      log "Skipping file $file: change field is empty (already caught by validate_change_is_scalar)"
      continue
    fi

    # Check if this change is in the oasdiff output
    local found=0

    for oasdiff_change in "${OASDIFF_CHANGES[@]}"; do
      if [ "$change" = "$oasdiff_change" ]; then
        found=1
        break
      fi
    done

    if [ $found -eq 0 ]; then
      fail "File $file references change '$change' which was not flagged by oasdiff in this run (possible copy-paste of stale change string)"
    fi
  done <<< "$new_files"

  [ ${#FAILURES[@]} -eq "$start_failures" ]
}

# ============================================================================
# Main
# ============================================================================

main() {
  if [ -z "$OASDIFF_JSON" ]; then
    error "No oasdiff JSON output provided. Usage: validate-compat-files.sh <oasdiff-json-output> [api-compat-dir]"
    exit 1
  fi

  if [ ! -d "$COMPAT_DIR" ]; then
    # If no changes, compat directory might not exist yet
    log "api-compatibility directory not found: $COMPAT_DIR. Creating it."
    mkdir -p "$COMPAT_DIR"
  fi

  log "Parsing oasdiff output..."
  parse_oasdiff_changes "$OASDIFF_JSON"

  log "Running validation rules..."
  validate_coverage
  validate_reasons_nonempty
  validate_change_is_scalar
  validate_immutability
  validate_no_deletions
  validate_filename_regex
  validate_duplicate_generations_true
  validate_generation_range
  validate_stale_change_strings

  # Report results
  if [ ${#FAILURES[@]} -gt 0 ]; then
    error "Validation failed with ${#FAILURES[@]} error(s):"
    printf '%s\n' "${FAILURES[@]}" | sed 's/^/  /'
    return 1
  else
    log "All validation rules passed ✓"
    return 0
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
