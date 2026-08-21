#!/usr/bin/env bats
# Tests for write-breaking-changes-summary.sh

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/write-breaking-changes-summary.sh"
  export GITHUB_STEP_SUMMARY="${BATS_TEST_TMPDIR}/github_step_summary"
  : >"$GITHUB_STEP_SUMMARY"
}

@test "errors when no report argument is given" {
  run main
  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage: write-breaking-changes-summary.sh"* ]]
}

@test "errors when the report file does not exist" {
  run main "${BATS_TEST_TMPDIR}/missing.json"
  [ "$status" -eq 1 ]
  [[ "$output" == *"report file not found"* ]]
}

@test "errors when GITHUB_STEP_SUMMARY is not set" {
  unset GITHUB_STEP_SUMMARY
  local report="${BATS_TEST_TMPDIR}/report.json"
  echo '[]' >"$report"

  run main "$report"
  [ "$status" -eq 1 ]
  [[ "$output" == *"GITHUB_STEP_SUMMARY not set"* ]]
}

@test "writes formatted entries for a report with breaking changes" {
  local report="${BATS_TEST_TMPDIR}/report.json"
  cat >"$report" <<'JSON'
[
  {
    "id": "response-required-property-removed",
    "operation": "GET",
    "path": "/api/test/breaking-api",
    "text": "removed the required property 'message'"
  },
  {
    "id": "response-required-property-removed",
    "operation": "GET",
    "path": "/api/test/breaking-api",
    "text": "removed the required property 'detail'"
  }
]
JSON

  run main "$report"
  [ "$status" -eq 0 ]

  local summary
  summary="$(cat "$GITHUB_STEP_SUMMARY")"
  [[ "$summary" == *"Breaking API Changes Detected"* ]]
  [[ "$summary" == *"response-required-property-removed GET /api/test/breaking-api - removed the required property 'message'"* ]]
  [[ "$summary" == *"response-required-property-removed GET /api/test/breaking-api - removed the required property 'detail'"* ]]
}

@test "reports an empty array without treating it as a parse failure" {
  local report="${BATS_TEST_TMPDIR}/report.json"
  echo '[]' >"$report"

  run main "$report"
  [ "$status" -eq 0 ]

  local summary
  summary="$(cat "$GITHUB_STEP_SUMMARY")"
  [[ "$summary" == *"no entries"* ]]
  [[ "$summary" != *"Unable to parse"* ]]
}

@test "reports invalid JSON as a parse failure" {
  local report="${BATS_TEST_TMPDIR}/report.json"
  echo 'not json' >"$report"

  run main "$report"
  [ "$status" -eq 0 ]

  local summary
  summary="$(cat "$GITHUB_STEP_SUMMARY")"
  [[ "$summary" == *"Unable to parse oasdiff report as JSON"* ]]
}

@test "appends to existing GITHUB_STEP_SUMMARY content rather than overwriting it" {
  echo "pre-existing summary content" >"$GITHUB_STEP_SUMMARY"

  local report="${BATS_TEST_TMPDIR}/report.json"
  echo '[]' >"$report"

  run main "$report"
  [ "$status" -eq 0 ]

  local summary
  summary="$(cat "$GITHUB_STEP_SUMMARY")"
  [[ "$summary" == *"pre-existing summary content"* ]]
  [[ "$summary" == *"Breaking API Changes Detected"* ]]
}
