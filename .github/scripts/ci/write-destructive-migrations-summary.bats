#!/usr/bin/env bats
# Tests for write-destructive-migrations-summary.sh - the report is passed in
# directly, so no repository or checker is needed.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/write-destructive-migrations-summary.sh"
  export GITHUB_STEP_SUMMARY="${BATS_TEST_TMPDIR}/step_summary"
  : >"$GITHUB_STEP_SUMMARY"
}

@test "errors when no report is provided" {
  run main
  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage: write-destructive-migrations-summary.sh"* ]]
}

@test "errors when GITHUB_STEP_SUMMARY is not set" {
  unset GITHUB_STEP_SUMMARY

  run main "a.py abc123 drop_column"
  [ "$status" -eq 1 ]
  [[ "$output" == *"GITHUB_STEP_SUMMARY not set"* ]]
}

@test "renders a row per flagged migration" {
  report="a.py abc123 drop_column
b.py def456 drop_table"

  run main "$report"
  [ "$status" -eq 0 ]

  summary="$(cat "$GITHUB_STEP_SUMMARY")"
  [[ "$summary" == *"| \`a.py\` | \`abc123\` | drop_column |"* ]]
  [[ "$summary" == *"| \`b.py\` | \`def456\` | drop_table |"* ]]
}

@test "renders multiple ops on one migration as a readable list" {
  run main "a.py abc123 drop_column,drop_table"
  [ "$status" -eq 0 ]
  [[ "$(cat "$GITHUB_STEP_SUMMARY")" == *"drop_column, drop_table"* ]]
}

@test "includes the approval guidance the reviewer needs" {
  run main "a.py abc123 drop_column"
  [ "$status" -eq 0 ]

  summary="$(cat "$GITHUB_STEP_SUMMARY")"
  [[ "$summary" == *"Destructive database migration(s) detected"* ]]
  [[ "$summary" == *"no longer read by any serving"* ]]
  [[ "$summary" == *"clinical audit history"* ]]
  [[ "$summary" == *"Review deployments"* ]]
}

@test "appends to an existing summary rather than truncating it" {
  echo "earlier content" >"$GITHUB_STEP_SUMMARY"

  run main "a.py abc123 drop_column"
  [ "$status" -eq 0 ]
  [[ "$(cat "$GITHUB_STEP_SUMMARY")" == *"earlier content"* ]]
}
