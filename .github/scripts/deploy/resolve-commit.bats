#!/usr/bin/env bats
# Tests for resolve-commit.sh — the deploy pipeline's commit-resolution step.
#
# Only the pure selection/validation logic (select_ref) is unit-tested here.

setup() {
  source "${BATS_TEST_DIRNAME}/resolve-commit.sh"
}

@test "prefers MANUAL_COMMIT over GITHUB_SHA" {
  run select_ref "feature/my-fix" "4f2a9c1"
  [ "$status" -eq 0 ]
  [ "$output" = "feature/my-fix" ]
}

@test "falls back to GITHUB_SHA when MANUAL_COMMIT is empty" {
  run select_ref "" "4f2a9c1"
  [ "$status" -eq 0 ]
  [ "$output" = "4f2a9c1" ]
}

@test "accepts a full commit SHA" {
  run select_ref "deadbeefcafe1234567890abcdef1234567890ab" ""
  [ "$status" -eq 0 ]
  [ "$output" = "deadbeefcafe1234567890abcdef1234567890ab" ]
}

@test "accepts a tag containing dots" {
  run select_ref "v1.4.0" ""
  [ "$status" -eq 0 ]
  [ "$output" = "v1.4.0" ]
}

@test "errors when both inputs are empty" {
  run select_ref "" ""
  [ "$status" -ne 0 ]
  [[ "$output" == *"both MANUAL_COMMIT and GITHUB_SHA are empty"* ]]
}

@test "rejects a leading hyphen (argument injection)" {
  run select_ref "-foo" ""
  [ "$status" -ne 0 ]
  [[ "$output" == *"Invalid commit/ref: '-foo'"* ]]
}

@test "rejects shell metacharacter injection" {
  run select_ref 'a"; rm -rf / #' ""
  [ "$status" -ne 0 ]
  [[ "$output" == *"Invalid commit/ref"* ]]
}

@test "rejects an embedded newline (multiline injection)" {
  run select_ref $'4f2a9c1\nsha=evil' ""
  [ "$status" -ne 0 ]
  [[ "$output" == *"Invalid commit/ref"* ]]
}
