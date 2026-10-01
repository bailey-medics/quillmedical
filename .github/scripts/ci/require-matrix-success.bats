#!/usr/bin/env bats
# Tests for require-matrix-success.sh
#
# The script stands between a matrix job's legs and the required check that
# carries their name, so what matters is that nothing but "success" passes.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/require-matrix-success.sh"
}

@test "passes when every leg passed" {
  run bash "$SCRIPT" "Storybook interaction tests" "success"

  [ "$status" -eq 0 ]
  [[ "$output" == *"every leg passed"* ]]
}

@test "fails when a leg failed, and names the job and the result" {
  run bash "$SCRIPT" "Storybook interaction tests" "failure"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Storybook interaction tests"* ]]
  [[ "$output" == *"'failure'"* ]]
}

@test "fails when the legs were cancelled" {
  run bash "$SCRIPT" "Storybook interaction tests" "cancelled"

  [ "$status" -eq 1 ]
}

@test "fails when the legs were skipped" {
  # A skipped required check counts as passed, which is the hole this
  # script closes. The caller does not run on a draft, so skipped legs
  # here mean its condition and theirs have drifted apart.
  run bash "$SCRIPT" "Storybook interaction tests" "skipped"

  [ "$status" -eq 1 ]
}

@test "fails on a result it does not know" {
  run bash "$SCRIPT" "Storybook interaction tests" "Success"

  [ "$status" -eq 1 ]
}

@test "fails without a result" {
  run bash "$SCRIPT" "Storybook interaction tests"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}

@test "fails with no arguments" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}
