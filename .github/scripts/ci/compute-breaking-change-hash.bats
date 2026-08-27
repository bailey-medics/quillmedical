#!/usr/bin/env bats
# Tests for compute-breaking-change-hash.sh

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/compute-breaking-change-hash.sh"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : >"$GITHUB_OUTPUT"
}

write_report() {
  local file="$1"
  local json="$2"
  echo "$json" >"$file"
}

@test "errors when no report argument is given" {
  run main
  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage: compute-breaking-change-hash.sh"* ]]
}

@test "errors when the report file does not exist" {
  run main "${BATS_TEST_TMPDIR}/missing.json"
  [ "$status" -eq 1 ]
  [[ "$output" == *"report file not found"* ]]
}

@test "errors when GITHUB_OUTPUT is not set" {
  unset GITHUB_OUTPUT

  local report="${BATS_TEST_TMPDIR}/report.json"
  write_report "$report" '[]'

  run main "$report"
  [ "$status" -eq 1 ]
  [[ "$output" == *"GITHUB_OUTPUT not set"* ]]
}

@test "writes breaking_hash to GITHUB_OUTPUT" {
  local report="${BATS_TEST_TMPDIR}/report.json"
  write_report "$report" '[{"id":"a","operation":"GET","path":"/x","text":"removed"}]'

  run main "$report"
  [ "$status" -eq 0 ]

  local output_content
  output_content="$(cat "$GITHUB_OUTPUT")"
  [[ "$output_content" =~ ^breaking_hash=[0-9a-f]{64}$ ]]
}

@test "same changes in different input order hash the same" {
  local report_a="${BATS_TEST_TMPDIR}/a.json"
  local report_b="${BATS_TEST_TMPDIR}/b.json"

  write_report "$report_a" '[
    {"id":"a","operation":"GET","path":"/x","text":"removed x"},
    {"id":"b","operation":"POST","path":"/y","text":"removed y"}
  ]'
  write_report "$report_b" '[
    {"id":"b","operation":"POST","path":"/y","text":"removed y"},
    {"id":"a","operation":"GET","path":"/x","text":"removed x"}
  ]'

  local hash_a hash_b
  hash_a="$(extract_change_lines "$report_a" | hash_change_lines)"
  hash_b="$(extract_change_lines "$report_b" | hash_change_lines)"

  [ "$hash_a" = "$hash_b" ]
}

@test "a changed text field hashes differently" {
  local report_a="${BATS_TEST_TMPDIR}/a.json"
  local report_b="${BATS_TEST_TMPDIR}/b.json"

  write_report "$report_a" '[{"id":"a","operation":"GET","path":"/x","text":"removed message"}]'
  write_report "$report_b" '[{"id":"a","operation":"GET","path":"/x","text":"removed detail"}]'

  local hash_a hash_b
  hash_a="$(extract_change_lines "$report_a" | hash_change_lines)"
  hash_b="$(extract_change_lines "$report_b" | hash_change_lines)"

  [ "$hash_a" != "$hash_b" ]
}

@test "extract_change_lines returns nothing for an empty array" {
  local report="${BATS_TEST_TMPDIR}/report.json"
  write_report "$report" '[]'

  run extract_change_lines "$report"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "extract_change_lines returns nothing for unparseable JSON" {
  local report="${BATS_TEST_TMPDIR}/report.json"
  write_report "$report" 'not json'

  run extract_change_lines "$report"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
