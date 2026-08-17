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
