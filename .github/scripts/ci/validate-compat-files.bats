#!/usr/bin/env bats
# Tests for validate-compat-files.sh

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  export BATS_TEST_TMPDIR="${BATS_TEST_TMPDIR:-/tmp/bats-$$-$(date +%s)}"
  mkdir -p "$BATS_TEST_TMPDIR"
  export TEST_REPO="$BATS_TEST_TMPDIR/test-repo"
  mkdir -p "$TEST_REPO"
  cd "$TEST_REPO"

  # Create api-compatibility directory
  mkdir -p api-compatibility

  # Source the script (after creating the directory so functions work)
  source "${BATS_TEST_DIRNAME}/validate-compat-files.sh"

  # Default: no new/modified/deleted files unless explicitly set
  unset GET_NEW_COMPAT_FILES_OVERRIDE
  unset GET_MODIFIED_COMPAT_FILES_OVERRIDE
  unset GET_DELETED_COMPAT_FILES_OVERRIDE
  unset GET_MAIN_FILE_CONTENT_OVERRIDE
}

teardown() {
  cd /
  rm -rf "$BATS_TEST_TMPDIR"
}

# ============================================================================
# Helper functions for tests
# ============================================================================

# Create a decision file
create_compat_file() {
  local filename="$1"
  local generation="${2:-1}"
  local forces_reload="${3:-false}"
  local change="${4:-none}"
  local reason="${5-test reason}"  # unset-only default, allows explicit empty string

  mkdir -p api-compatibility
  cat > "api-compatibility/$filename" <<EOF
generation: $generation
forces_reload: $forces_reload
change: "$change"
reason: "$reason"
EOF
}

# ============================================================================
# Rule 2: Coverage - every flagged change has a file
# ============================================================================

@test "coverage: passes when all flagged changes have files" {
  create_compat_file "20260818000001-change1.yaml" "1" "true" "api-path-removed GET /api/v1/foo" "Change 1"
  create_compat_file "20260818000002-change2.yaml" "2" "true" "response-property-removed GET /api/v1/bar" "Change 2"

  export GET_NEW_COMPAT_FILES_OVERRIDE="echo -e 'api-compatibility/20260818000001-change1.yaml\napi-compatibility/20260818000002-change2.yaml'"
  OASDIFF_CHANGES=("api-path-removed GET /api/v1/foo" "response-property-removed GET /api/v1/bar")

  run validate_coverage
  [[ "$status" -eq 0 ]]
  [[ "$output" == *"coverage"* ]] || [[ "$output" == *"Coverage"* ]]
}

@test "coverage: fails when flagged change has no file" {
  create_compat_file "20260818000001-change1.yaml" "1" "true" "api-path-removed GET /api/v1/foo" "Change 1"

  export GET_NEW_COMPAT_FILES_OVERRIDE="echo 'api-compatibility/20260818000001-change1.yaml'"
  OASDIFF_CHANGES=("api-path-removed GET /api/v1/foo" "response-property-removed GET /api/v1/bar")

  run validate_coverage
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"Flagged change not covered"* ]]
  [[ "$output" == *"response-property-removed"* ]]
}

# ============================================================================
# Rule 3: reason must be non-empty
# ============================================================================

@test "reason: passes when all reasons are non-empty" {
  create_compat_file "20260818000001-change1.yaml" "1" "false" "none" "This is a reason"

  export GET_NEW_COMPAT_FILES_OVERRIDE="echo 'api-compatibility/20260818000001-change1.yaml'"

  run validate_reasons_nonempty
  [[ "$status" -eq 0 ]]
  [[ "$output" == *"reason"* ]]
}

@test "reason: fails when reason is empty" {
  create_compat_file "20260818000001-change1.yaml" "1" "false" "none" ""

  export GET_NEW_COMPAT_FILES_OVERRIDE="echo 'api-compatibility/20260818000001-change1.yaml'"

  run validate_reasons_nonempty
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"empty"* ]]
}

# ============================================================================
# Rule 4: change must be a single scalar
# ============================================================================

@test "change-scalar: passes when change is a scalar" {
  create_compat_file "20260818000001-change1.yaml" "1" "true" "api-path-removed GET /api/v1/foo" "Reason"

  export GET_NEW_COMPAT_FILES_OVERRIDE="echo 'api-compatibility/20260818000001-change1.yaml'"

  run validate_change_is_scalar
  [[ "$status" -eq 0 ]]
}

@test "change-scalar: fails when change looks like a list (starts with [)" {
  create_compat_file "20260818000001-badchange.yaml" "1" "false" "[api-path-removed GET /api/v1/foo, response-property-removed GET /api/v1/bar]" "Multiple changes"

  export GET_NEW_COMPAT_FILES_OVERRIDE="echo 'api-compatibility/20260818000001-badchange.yaml'"

  run validate_change_is_scalar
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"looks like a list"* ]]
}

@test "change-scalar: fails when change contains comma (multi-value)" {
  create_compat_file "20260818000001-badchange.yaml" "1" "false" "api-path-removed GET /api/v1/foo, response-property-removed GET /api/v1/bar" "Multiple changes"

  export GET_NEW_COMPAT_FILES_OVERRIDE="echo 'api-compatibility/20260818000001-badchange.yaml'"

  run validate_change_is_scalar
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"looks like a list"* ]]
}

# ============================================================================
# Rule 6: Filename regex
# ============================================================================

@test "filename-regex: passes for correctly formatted filename" {
  create_compat_file "20260818000001-valid-name.yaml" "1" "true" "api-path-removed GET /foo" "Reason"

  export GET_NEW_COMPAT_FILES_OVERRIDE="echo 'api-compatibility/20260818000001-valid-name.yaml'"

  run validate_filename_regex
  [[ "$status" -eq 0 ]]
}

@test "filename-regex: passes for multi-word kebab-case" {
  create_compat_file "20260818000001-valid-kebab-case-name.yaml" "1" "true" "api-path-removed GET /foo" "Reason"

  export GET_NEW_COMPAT_FILES_OVERRIDE="echo 'api-compatibility/20260818000001-valid-kebab-case-name.yaml'"

  run validate_filename_regex
  [[ "$status" -eq 0 ]]
}

@test "filename-regex: fails for bad timestamp (too short)" {
  create_compat_file "2026081800-bad.yaml" "1" "false" "none" "Bad timestamp"

  export GET_NEW_COMPAT_FILES_OVERRIDE="echo 'api-compatibility/2026081800-bad.yaml'"

  run validate_filename_regex
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"does not match required regex"* ]]
}

@test "filename-regex: fails for bad slug (contains uppercase)" {
  create_compat_file "20260818000001-Invalid-Name.yaml" "1" "false" "none" "Bad slug"

  export GET_NEW_COMPAT_FILES_OVERRIDE="echo 'api-compatibility/20260818000001-Invalid-Name.yaml'"

  run validate_filename_regex
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"does not match required regex"* ]]
}

@test "filename-regex: fails for bad slug (contains underscore)" {
  create_compat_file "20260818000001-bad_name.yaml" "1" "false" "none" "Bad slug"

  export GET_NEW_COMPAT_FILES_OVERRIDE="echo 'api-compatibility/20260818000001-bad_name.yaml'"

  run validate_filename_regex
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"does not match required regex"* ]]
}

# ============================================================================
# Rule 7: No duplicate generations for forces_reload:true files
# ============================================================================

@test "duplicate-gen-true: passes when true files have unique generations" {
  create_compat_file "20260818000001-change1.yaml" "1" "true" "api-path-removed GET /foo" "Change 1"
  create_compat_file "20260818000002-change2.yaml" "2" "true" "response-property-removed GET /bar" "Change 2"
  create_compat_file "20260818000003-change3.yaml" "2" "false" "other-change" "Change 3"

  run validate_duplicate_generations_true
  [[ "$status" -eq 0 ]]
}

@test "duplicate-gen-true: fails when two true files share a generation" {
  create_compat_file "20260818000001-change1.yaml" "1" "true" "api-path-removed GET /foo" "Change 1"
  create_compat_file "20260818000002-change2.yaml" "1" "true" "response-property-removed GET /bar" "Change 2"

  run validate_duplicate_generations_true
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"Duplicate generation"* ]]
}

@test "duplicate-gen-true: allows false files to share generations" {
  create_compat_file "20260818000001-change1.yaml" "1" "true" "api-path-removed GET /foo" "Change 1"
  create_compat_file "20260818000002-change2.yaml" "1" "false" "other-change" "Change 2"
  create_compat_file "20260818000003-change3.yaml" "1" "false" "another-change" "Change 3"

  run validate_duplicate_generations_true
  [[ "$status" -eq 0 ]]
}

# ============================================================================
# Rule 7a: Generation range for forces_reload:false files
# ============================================================================

@test "gen-range-false: passes when false files are within range" {
  create_compat_file "20260818000001-change1.yaml" "1" "true" "api-path-removed GET /foo" "Change 1"
  create_compat_file "20260818000002-change2.yaml" "2" "true" "response-property-removed GET /bar" "Change 2"
  create_compat_file "20260818000003-change3.yaml" "1" "false" "other-change" "Change 3"
  create_compat_file "20260818000004-change4.yaml" "2" "false" "another-change" "Change 4"

  MAX_TRUE_GENERATION=2  # Simulate after rule 7 runs

  run validate_generation_range
  [[ "$status" -eq 0 ]]
}

@test "gen-range-false: fails when false file gen is 0 (below range)" {
  create_compat_file "20260818000001-change1.yaml" "1" "true" "api-path-removed GET /foo" "Change 1"
  create_compat_file "20260818000002-change2.yaml" "0" "false" "other-change" "Change 2"

  MAX_TRUE_GENERATION=1

  run validate_generation_range
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"out of valid range"* ]]
}

@test "gen-range-false: fails when false file gen exceeds max true gen" {
  create_compat_file "20260818000001-change1.yaml" "1" "true" "api-path-removed GET /foo" "Change 1"
  create_compat_file "20260818000002-change2.yaml" "5" "false" "other-change" "Change 2"

  MAX_TRUE_GENERATION=1

  run validate_generation_range
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"out of valid range"* ]]
}

# ============================================================================
# Rule 10: Stale change strings
# ============================================================================

@test "stale-change: passes when change exists in oasdiff output" {
  create_compat_file "20260818000001-change1.yaml" "1" "true" "api-path-removed GET /api/v1/foo" "Change 1"

  OASDIFF_CHANGES=("api-path-removed GET /api/v1/foo")

  run validate_stale_change_strings
  [[ "$status" -eq 0 ]]
  [[ "$output" == *"stale"* ]]
}

@test "stale-change: fails when change does not exist in oasdiff output" {
  create_compat_file "20260818000001-change1.yaml" "1" "true" "api-path-removed GET /api/v1/foo" "Change 1"

  export GET_NEW_COMPAT_FILES_OVERRIDE="echo 'api-compatibility/20260818000001-change1.yaml'"
  OASDIFF_CHANGES=("response-property-removed GET /api/v1/bar")

  run validate_stale_change_strings
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"stale"* ]] || [[ "$output" == *"was not flagged"* ]]
}

@test "stale-change: skips check when no oasdiff changes" {
  OASDIFF_CHANGES=()

  run validate_stale_change_strings
  [[ "$status" -eq 0 ]]
  [[ "$output" == *"No flagged changes from oasdiff, skipping stale change check."* ]]
}

# ============================================================================
# Rule 5: Field-level immutability (generation/forces_reload/change)
# ============================================================================

main_file_content_stub() {
  # Args: $1=file. Reads content from a matching decision file keyed by basename
  # under $TEST_REPO/main-decisions/, echoing "" when no decision file exists.
  local file_basename
  local fixture
  file_basename="$(basename "$1")"
  fixture="$TEST_REPO/main-decisions/$file_basename"

  if [ -f "$fixture" ]; then
    cat "$fixture"
  else
    echo ""
  fi
}

create_main_decision_file() {
  local filename="$1"
  local generation="${2:-1}"
  local forces_reload="${3:-false}"
  local change="${4:-none}"
  local reason="${5:-test reason}"

  mkdir -p "$TEST_REPO/main-decisions"
  cat > "$TEST_REPO/main-decisions/$filename" <<EOF
generation: $generation
forces_reload: $forces_reload
change: "$change"
reason: "$reason"
EOF
}

@test "immutability: passes when generation/forces_reload/change are unchanged" {
  create_main_decision_file "20260818000001-change1.yaml" "1" "true" "api-path-removed GET /foo" "Old reason"
  create_compat_file "20260818000001-change1.yaml" "1" "true" "api-path-removed GET /foo" "Updated reason with more context"

  export GET_MODIFIED_COMPAT_FILES_OVERRIDE="echo 'api-compatibility/20260818000001-change1.yaml'"
  export GET_MAIN_FILE_CONTENT_OVERRIDE="main_file_content_stub"

  run validate_immutability
  [[ "$status" -eq 0 ]]
}

@test "immutability: fails when generation changes" {
  create_main_decision_file "20260818000001-change1.yaml" "1" "true" "api-path-removed GET /foo" "Old reason"
  create_compat_file "20260818000001-change1.yaml" "2" "true" "api-path-removed GET /foo" "Old reason"

  export GET_MODIFIED_COMPAT_FILES_OVERRIDE="echo 'api-compatibility/20260818000001-change1.yaml'"
  export GET_MAIN_FILE_CONTENT_OVERRIDE="main_file_content_stub"

  run validate_immutability
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"'generation' field changed"* ]]
}

@test "immutability: fails when forces_reload changes" {
  create_main_decision_file "20260818000001-change1.yaml" "1" "false" "api-path-removed GET /foo" "Old reason"
  create_compat_file "20260818000001-change1.yaml" "1" "true" "api-path-removed GET /foo" "Old reason"

  export GET_MODIFIED_COMPAT_FILES_OVERRIDE="echo 'api-compatibility/20260818000001-change1.yaml'"
  export GET_MAIN_FILE_CONTENT_OVERRIDE="main_file_content_stub"

  run validate_immutability
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"'forces_reload' field changed"* ]]
}

@test "immutability: fails when change field changes" {
  create_main_decision_file "20260818000001-change1.yaml" "1" "true" "api-path-removed GET /foo" "Old reason"
  create_compat_file "20260818000001-change1.yaml" "1" "true" "api-path-removed GET /bar" "Old reason"

  export GET_MODIFIED_COMPAT_FILES_OVERRIDE="echo 'api-compatibility/20260818000001-change1.yaml'"
  export GET_MAIN_FILE_CONTENT_OVERRIDE="main_file_content_stub"

  run validate_immutability
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"'change' field changed"* ]]
}

@test "immutability: no modified files passes trivially" {
  export GET_MODIFIED_COMPAT_FILES_OVERRIDE="echo ''"
  export GET_MAIN_FILE_CONTENT_OVERRIDE="main_file_content_stub"

  run validate_immutability
  [[ "$status" -eq 0 ]]
}

# ============================================================================
# Rule 5 (continued): no deletions permitted
# ============================================================================

@test "no-deletions: passes when no files are deleted" {
  export GET_DELETED_COMPAT_FILES_OVERRIDE="echo ''"

  run validate_no_deletions
  [[ "$status" -eq 0 ]]
}

@test "no-deletions: fails when a file is deleted" {
  export GET_DELETED_COMPAT_FILES_OVERRIDE="echo 'api-compatibility/20260818000001-change1.yaml'"

  run validate_no_deletions
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"File deletion not permitted"* ]]
  [[ "$output" == *"20260818000001-change1.yaml"* ]]
}

@test "no-deletions: fails and reports each of multiple deleted files" {
  export GET_DELETED_COMPAT_FILES_OVERRIDE="echo -e 'api-compatibility/20260818000001-a.yaml\napi-compatibility/20260818000002-b.yaml'"

  run validate_no_deletions
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"20260818000001-a.yaml"* ]]
  [[ "$output" == *"20260818000002-b.yaml"* ]]
}

# ============================================================================
# Helper functions: read_yaml_field
# ============================================================================

@test "read_yaml_field: reads generation field" {
  create_compat_file "20260818000001-test.yaml" "42" "true" "api-path-removed GET /foo" "Test"

  result=$(read_yaml_field "api-compatibility/20260818000001-test.yaml" "generation")
  [[ "$result" == "42" ]]
}

@test "read_yaml_field: reads forces_reload field" {
  create_compat_file "20260818000001-test.yaml" "1" "true" "none" "Test"

  result=$(read_yaml_field "api-compatibility/20260818000001-test.yaml" "forces_reload")
  [[ "$result" == "true" ]]
}

@test "read_yaml_field: returns empty for missing field" {
  cat > api-compatibility/test.yaml <<EOF
generation: 1
forces_reload: true
EOF

  result=$(read_yaml_field "api-compatibility/test.yaml" "reason")
  [[ -z "$result" ]]
}

# ============================================================================
# Helper functions: is_yaml_list
# ============================================================================

@test "is_yaml_list: detects list starting with [" {
  run is_yaml_list "[item1, item2]"
  [[ "$status" -eq 0 ]]
}

@test "is_yaml_list: detects list with commas" {
  run is_yaml_list "item1, item2, item3"
  [[ "$status" -eq 0 ]]
}

@test "is_yaml_list: rejects scalar without commas or brackets" {
  run is_yaml_list "single-scalar-string"
  [[ "$status" -eq 1 ]]
}

# ============================================================================
# Integration tests
# ============================================================================

@test "integration: complete workflow with valid files" {
  # Gen 1 is the bootstrap generation, so it's the one exception to the
  # usual "true file first, then false files" ordering seen in later generations.
  create_compat_file "20260818000000-init.yaml" "1" "false" "none" "Bootstrap"
  create_compat_file "20260818000001-breaking1.yaml" "1" "true" "api-path-removed GET /api/v1/foo" "Reason 1"
  create_compat_file "20260818000002-breaking2.yaml" "2" "true" "response-property-removed GET /api/v1/bar" "Reason 2"
  create_compat_file "20260818000003-cosmetic.yaml" "2" "false" "response-property-added GET /api/v1/baz" "Reason 3"

  export GET_NEW_COMPAT_FILES_OVERRIDE="echo -e 'api-compatibility/20260818000000-init.yaml\napi-compatibility/20260818000001-breaking1.yaml\napi-compatibility/20260818000002-breaking2.yaml\napi-compatibility/20260818000003-cosmetic.yaml'"
  OASDIFF_CHANGES=("api-path-removed GET /api/v1/foo" "response-property-removed GET /api/v1/bar" "response-property-added GET /api/v1/baz")

  run validate_coverage
  [[ "$status" -eq 0 ]]

  run validate_reasons_nonempty
  [[ "$status" -eq 0 ]]

  run validate_change_is_scalar
  [[ "$status" -eq 0 ]]

  run validate_filename_regex
  [[ "$status" -eq 0 ]]

  run validate_duplicate_generations_true
  [[ "$status" -eq 0 ]]

  # After rule 7 runs, MAX_TRUE_GENERATION should be 2
  MAX_TRUE_GENERATION=2
  run validate_generation_range
  [[ "$status" -eq 0 ]]
}

# ============================================================================
# parse_oasdiff_changes: parsing real oasdiff `--format json` output
#
# oasdiff emits a bare JSON array of change objects (not a
# { "changes": [...] } wrapper), each with an "id" field, a "text" field
# (human-readable detail - the only field distinguishing two changes sharing
# the same id/operation/path, e.g. two properties removed from one endpoint)
# and, for path-scoped changes, "operation"/"path" fields - see
# https://github.com/oasdiff/oasdiff/blob/main/formatters/changes.go. It is
# also compact (single-line, no indentation), since it goes through Go's
# json.Marshal with no indent option.
# ============================================================================

@test "parse_oasdiff_changes: parses a compact single-line array (real oasdiff shape)" {
  local oasdiff_file="$BATS_TEST_TMPDIR/oasdiff-report.json"
  echo -n '[{"id":"response-required-property-removed","text":"removed the required property message","level":3,"operation":"GET","operationId":"getBreaking","path":"/api/test/breaking-api","section":"response"},{"id":"api-path-removed-without-deprecation","text":"api path removed","level":3,"operation":"DELETE","path":"/api/v1/foo","section":"paths"}]' > "$oasdiff_file"

  parse_oasdiff_changes "$oasdiff_file"

  [[ "${#OASDIFF_CHANGES[@]}" -eq 2 ]]
  [[ "${OASDIFF_CHANGES[0]}" == "response-required-property-removed GET /api/test/breaking-api removed the required property message" ]]
  [[ "${OASDIFF_CHANGES[1]}" == "api-path-removed-without-deprecation DELETE /api/v1/foo api path removed" ]]
}

@test "parse_oasdiff_changes: parses a pretty-printed (multi-line) array too" {
  local oasdiff_file="$BATS_TEST_TMPDIR/oasdiff-report.json"
  cat > "$oasdiff_file" <<'EOF'
[
  {
    "id": "response-required-property-removed",
    "operation": "GET",
    "path": "/api/test/breaking-api",
    "text": "removed the required property message"
  }
]
EOF

  parse_oasdiff_changes "$oasdiff_file"

  [[ "${#OASDIFF_CHANGES[@]}" -eq 1 ]]
  [[ "${OASDIFF_CHANGES[0]}" == "response-required-property-removed GET /api/test/breaking-api removed the required property message" ]]
}

@test "parse_oasdiff_changes: empty array yields no changes" {
  local oasdiff_file="$BATS_TEST_TMPDIR/oasdiff-report.json"
  echo -n '[]' > "$oasdiff_file"

  parse_oasdiff_changes "$oasdiff_file"

  [[ "${#OASDIFF_CHANGES[@]}" -eq 0 ]]
}

@test "parse_oasdiff_changes: empty file (upstream oasdiff failure) yields no changes, not an error" {
  local oasdiff_file="$BATS_TEST_TMPDIR/oasdiff-report.json"
  : > "$oasdiff_file"

  run parse_oasdiff_changes "$oasdiff_file"
  [[ "$status" -eq 0 ]]
  [[ "${#OASDIFF_CHANGES[@]}" -eq 0 ]]
}

@test "parse_oasdiff_changes: change without operation/path (e.g. a component-level change) uses id+text" {
  local oasdiff_file="$BATS_TEST_TMPDIR/oasdiff-report.json"
  echo -n '[{"id":"api-schema-removed","text":"schema removed"}]' > "$oasdiff_file"

  parse_oasdiff_changes "$oasdiff_file"

  [[ "${#OASDIFF_CHANGES[@]}" -eq 1 ]]
  [[ "${OASDIFF_CHANGES[0]}" == "api-schema-removed schema removed" ]]
}

@test "parse_oasdiff_changes: fails cleanly on malformed JSON" {
  local oasdiff_file="$BATS_TEST_TMPDIR/oasdiff-report.json"
  echo -n 'not valid json' > "$oasdiff_file"

  run parse_oasdiff_changes "$oasdiff_file"
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"Failed to parse oasdiff JSON output"* ]]
}

@test "parse_oasdiff_changes: fails when oasdiff file does not exist" {
  run parse_oasdiff_changes "$BATS_TEST_TMPDIR/does-not-exist.json"
  [[ "$status" -eq 1 ]]
  [[ "$output" == *"not found"* ]]
}

# ============================================================================
# COMPAT_DIR argument resolution (regression test for path-doubling bug)
# ============================================================================

@test "COMPAT_DIR: resolves to the given directory as-is, not doubled" {
  # Simulates the real CI call site (working-directory: pr; args: ... api-compatibility),
  # where $2 is already the path to the api-compatibility directory itself.
  run bash -c "source '${BATS_TEST_DIRNAME}/validate-compat-files.sh' 'oasdiff.json' 'api-compatibility' 2>/dev/null; echo \"\$COMPAT_DIR\""
  [[ "$output" == "api-compatibility" ]]
}

@test "COMPAT_DIR: defaults to ./api-compatibility when no second argument is given" {
  run bash -c "source '${BATS_TEST_DIRNAME}/validate-compat-files.sh' 'oasdiff.json' 2>/dev/null; echo \"\$COMPAT_DIR\""
  [[ "$output" == "./api-compatibility" ]]
}
