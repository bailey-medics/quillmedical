#!/usr/bin/env bats
# Tests for check-api-breaking-changes.sh - `oasdiff` is stubbed so the
# report/output-writing logic can be tested without installing it.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/check-api-breaking-changes.sh"
}

@test "errors when a required argument is missing" {
  run main "base.json"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage: check-api-breaking-changes.sh"* ]]
}

@test "reports no breaking changes and writes breaking=false" {
  oasdiff() {
    echo "no changes found"
  }

  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : >"$GITHUB_OUTPUT"

  run main "base.json" "revision.json"
  [ "$status" -eq 0 ]
  [[ "$output" == *"no changes found"* ]]
  [[ "$output" == *"No undeclared breaking API changes found."* ]]
  [[ "$(cat "$GITHUB_OUTPUT")" == "breaking=false" ]]
}

@test "reports a breaking change and writes breaking=true" {
  oasdiff() {
    echo "removed required field 'foo'"
    return 1
  }

  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : >"$GITHUB_OUTPUT"

  run main "base.json" "revision.json"
  [ "$status" -eq 0 ]
  [[ "$output" == *"removed required field 'foo'"* ]]
  [[ "$output" == *"Breaking API change(s) detected"* ]]
  [[ "$(cat "$GITHUB_OUTPUT")" == "breaking=true" ]]
}

@test "writes the oasdiff report to GITHUB_STEP_SUMMARY when breaking" {
  oasdiff() {
    echo "removed required field 'foo'"
    return 1
  }

  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : >"$GITHUB_OUTPUT"
  export GITHUB_STEP_SUMMARY="${BATS_TEST_TMPDIR}/github_step_summary"
  : >"$GITHUB_STEP_SUMMARY"

  run main "base.json" "revision.json"
  [ "$status" -eq 0 ]
  [[ "$(cat "$GITHUB_STEP_SUMMARY")" == *"Breaking API change(s) detected"* ]]
  [[ "$(cat "$GITHUB_STEP_SUMMARY")" == *"removed required field 'foo'"* ]]
}

@test "does not write GITHUB_STEP_SUMMARY when not breaking" {
  oasdiff() {
    echo "no changes found"
  }

  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : >"$GITHUB_OUTPUT"
  export GITHUB_STEP_SUMMARY="${BATS_TEST_TMPDIR}/github_step_summary"
  : >"$GITHUB_STEP_SUMMARY"

  run main "base.json" "revision.json"
  [ "$status" -eq 0 ]
  [ -z "$(cat "$GITHUB_STEP_SUMMARY")" ]
}
