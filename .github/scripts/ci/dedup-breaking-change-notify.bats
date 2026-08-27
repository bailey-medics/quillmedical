#!/usr/bin/env bats
# Tests for dedup-breaking-change-notify.sh — the sticky-comment dedup step.
#
# Only the pure functions (build_body, find_marker_comment) are unit-tested;
# the `gh` side effects in main() are not exercised here.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/dedup-breaking-change-notify.sh"
}

@test "build_body embeds the marker line with the hash on its own first line" {
  run build_body "abc123" "https://github.com/o/r/actions/runs/42"
  [ "$status" -eq 0 ]
  local first_line
  first_line="$(head -1 <<<"$output")"
  [ "$first_line" = "<!-- breaking-api-change-hash: abc123 -->" ]
  [[ "$output" == *'https://github.com/o/r/actions/runs/42'* ]]
}

@test "find_marker_comment returns nothing when there is no marker comment" {
  local comments='{"id":1,"body":"just a regular review comment"}
{"id":2,"body":"another comment"}'

  run find_marker_comment "$comments"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "find_marker_comment returns nothing for an empty comment stream" {
  run find_marker_comment ""
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "find_marker_comment extracts id and hash from the marker comment" {
  local comments='{"id":1,"body":"unrelated comment"}
{"id":2,"body":"<!-- breaking-api-change-hash: deadbeef -->\nsome explanation"}'

  run find_marker_comment "$comments"
  [ "$status" -eq 0 ]
  [ "$output" = $'2\tdeadbeef' ]
}

@test "find_marker_comment picks the first marker comment when several exist" {
  local comments='{"id":5,"body":"<!-- breaking-api-change-hash: aaa111 -->\nold"}
{"id":9,"body":"<!-- breaking-api-change-hash: bbb222 -->\nnewer"}'

  run find_marker_comment "$comments"
  [ "$status" -eq 0 ]
  [ "$output" = $'5\taaa111' ]
}
