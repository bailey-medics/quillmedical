#!/usr/bin/env bats
# Tests for post-plan-comment.sh — the Terraform plan PR-comment step.
#
# Only the pure formatting logic (truncate_plan, build_body) is unit-tested;
# the `gh pr comment` side effect in main() is not exercised here.

setup() {
  source "${BATS_TEST_DIRNAME}/post-plan-comment.sh"
}

@test "truncate_plan passes short plans through unchanged" {
  run truncate_plan <<<"Plan: 1 to add, 0 to change, 0 to destroy."
  [ "$status" -eq 0 ]
  [ "$output" = "Plan: 1 to add, 0 to change, 0 to destroy." ]
}

@test "truncate_plan cuts oversized plans and appends a marker" {
  local big
  big="$(printf 'x%.0s' $(seq 1 70000))"
  run truncate_plan <<<"$big"
  [ "$status" -eq 0 ]
  [[ "$output" == *"... (truncated)" ]]
  # 60000 chars + "\n\n... (truncated)" (17 chars) = 60017
  [ "${#output}" -eq 60017 ]
}

@test "build_body wraps the plan in a titled code fence with the run URL" {
  run build_body "PLAN TEXT" "https://github.com/o/r/actions/runs/42"
  [ "$status" -eq 0 ]
  [[ "$output" == *'### Terraform Plan: `teaching`'* ]]
  [[ "$output" == *'PLAN TEXT'* ]]
  [[ "$output" == *'*Workflow:* https://github.com/o/r/actions/runs/42'* ]]
}
