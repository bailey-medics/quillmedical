#!/usr/bin/env bats
# Tests for run-compat-validation.sh - the real validator is stubbed by
# redefining run_validator() after sourcing, so this can be tested without a
# git repo / real api-compatibility files.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/run-compat-validation.sh"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : >"$GITHUB_OUTPUT"
}

@test "errors when the oasdiff report argument is missing" {
  run main "" "api-compatibility"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage: run-compat-validation.sh"* ]]
}

@test "errors when the compat dir argument is missing" {
  run main "report.json" ""
  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage: run-compat-validation.sh"* ]]
}

@test "errors when GITHUB_OUTPUT is not set" {
  unset GITHUB_OUTPUT
  run main "report.json" "api-compatibility"
  [ "$status" -eq 1 ]
  [[ "$output" == *"GITHUB_OUTPUT not set"* ]]
}

@test "passes through validator success and writes no error details" {
  run_validator() {
    echo "All validation rules passed"
    return 0
  }

  run main "report.json" "api-compatibility"
  [ "$status" -eq 0 ]
  [[ "$output" == *"All validation rules passed"* ]]
  [[ "$(cat "$GITHUB_OUTPUT")" == *"[No error details found]"* ]]
}

@test "extracts the change id from an ERROR line and exits non-zero on failure" {
  run_validator() {
    echo "Validation failed with 1 error(s):"
    echo "ERROR: change 'response-required-property-removed GET /api/test/breaking-api' has no decision file"
    return 1
  }

  run main "report.json" "api-compatibility"
  [ "$status" -eq 1 ]
  [[ "$(cat "$GITHUB_OUTPUT")" == *"response-required-property-removed GET /api/test/breaking-api"* ]]
}

@test "strips ANSI colour codes from validator output before printing" {
  run_validator() {
    printf '\033[0;31mERROR: something bad\033[0m\n'
    return 1
  }

  run main "report.json" "api-compatibility"
  [[ "$output" != *$'\033'* ]]
}

@test "writes the error_output heredoc markers even with no ERROR lines" {
  run_validator() {
    echo "Validation failed with 1 error(s):"
    echo "Some other failure line without the matching prefix"
    return 1
  }

  run main "report.json" "api-compatibility"
  [ "$status" -eq 1 ]
  local github_output
  github_output="$(cat "$GITHUB_OUTPUT")"
  [[ "$github_output" == *"error_output<<COMPAT_VALIDATION_EOF"* ]]
  [[ "$github_output" == *"COMPAT_VALIDATION_EOF"* ]]
  [[ "$github_output" == *"[No error details found]"* ]]
}
