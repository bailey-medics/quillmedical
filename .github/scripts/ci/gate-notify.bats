#!/usr/bin/env bats
# Tests for gate-notify.sh — the "does this PR still need messages?" step.
#
# Covers both the API breaking-change and destructive-migration marker keys,
# proving each gate reads only its own record on a PR that trips both.
#
# Ordered to follow main(): the argument and environment guards first, then
# the pure functions in the order main() reaches them. Every guard exits
# before the first `gh` call, so they are tested against the real main() with
# no mocking; the `gh` side effects after those guards are not exercised here.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/gate-notify.sh"

  # A complete, valid environment. Each guard test below removes exactly one
  # piece of it, so no test ever gets past the guards to the `gh` calls.
  export GH_TOKEN="fake-token-never-used"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  export GITHUB_REPOSITORY="owner/repo"
  : >"$GITHUB_OUTPUT"
}

# A valid argument set, so each guard test can supply everything up to the
# one argument it is deliberately withholding.
VALID_KEY="db-destructive-migration-hash"
VALID_PR="42"
VALID_HASH="abc123"
VALID_TITLE="Destructive database migration"

@test "errors when no marker key is given" {
  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"No marker key provided"* ]]
}

@test "errors when no pull request number is given" {
  run main "$VALID_KEY"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No pull request number provided"* ]]
}

@test "errors when no hash is given" {
  run main "$VALID_KEY" "$VALID_PR"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No hash provided"* ]]
}

@test "errors when no title is given" {
  run main "$VALID_KEY" "$VALID_PR" "$VALID_HASH"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No title provided"* ]]
}

@test "errors when GH_TOKEN is not set" {
  unset GH_TOKEN

  run main "$VALID_KEY" "$VALID_PR" "$VALID_HASH" "$VALID_TITLE"

  [ "$status" -eq 1 ]
  [[ "$output" == *"GH_TOKEN is not set"* ]]
}

@test "errors when GITHUB_OUTPUT is not set" {
  unset GITHUB_OUTPUT

  run main "$VALID_KEY" "$VALID_PR" "$VALID_HASH" "$VALID_TITLE"

  [ "$status" -eq 1 ]
  [[ "$output" == *"GITHUB_OUTPUT not set"* ]]
}

@test "errors when GITHUB_REPOSITORY is not set" {
  unset GITHUB_REPOSITORY

  run main "$VALID_KEY" "$VALID_PR" "$VALID_HASH" "$VALID_TITLE"

  [ "$status" -eq 1 ]
  [[ "$output" == *"GITHUB_REPOSITORY not set"* ]]
}

@test "count_marker_comments returns 0 for an empty comment stream" {
  run count_marker_comments "" "breaking-api-change-hash"

  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

@test "count_marker_comments returns 0 when no comment carries the marker" {
  local comments='{"id":1,"body":"just a regular review comment"}'

  run count_marker_comments "$comments" "breaking-api-change-hash"

  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

@test "count_marker_comments counts only markers for the requested key" {
  local comments='{"id":5,"body":"<!-- breaking-api-change-hash: aaa111 -->\nAPI"}
{"id":7,"body":"<!-- db-destructive-migration-hash: 1b2b3b -->\nDB"}'

  run count_marker_comments "$comments" "breaking-api-change-hash"

  [ "$status" -eq 0 ]
  [ "$output" = "1" ]

  run count_marker_comments "$comments" "db-destructive-migration-hash"

  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

@test "count_marker_comments detects duplicate markers for the same key" {
  local comments='{"id":5,"body":"<!-- breaking-api-change-hash: aaa111 -->\noriginal"}
{"id":9,"body":"<!-- breaking-api-change-hash: aaa111 -->\ncopy-pasted"}'

  run count_marker_comments "$comments" "breaking-api-change-hash"
  [ "$status" -eq 0 ]
  [ "$output" = "2" ]
}

@test "find_marker_comment returns nothing when there is no marker comment" {
  local comments='{"id":1,"body":"just a regular review comment"}
{"id":2,"body":"another comment"}'

  run find_marker_comment "$comments" "breaking-api-change-hash"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "find_marker_comment returns nothing for an empty comment stream" {
  run find_marker_comment "" "breaking-api-change-hash"

  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

@test "find_marker_comment extracts id and hash from the breaking-api-change marker comment" {
  local comments='{"id":1,"body":"unrelated comment"}
{"id":2,"body":"<!-- breaking-api-change-hash: deadbeef -->\nsome explanation"}'

  run find_marker_comment "$comments" "breaking-api-change-hash"

  [ "$status" -eq 0 ]
  [ "$output" = $'2\tdeadbeef' ]
}

@test "find_marker_comment extracts id and hash from the db-destructive-migration marker comment" {
  local comments='{"id":1,"body":"unrelated comment"}
{"id":3,"body":"<!-- db-destructive-migration-hash: cafebabe -->\nmigration explanation"}'

  run find_marker_comment "$comments" "db-destructive-migration-hash"

  [ "$status" -eq 0 ]
  [ "$output" = $'3\tcafebabe' ]
}

@test "find_marker_comment ignores non-matching marker keys on the same PR" {
  # PR has both API breaking-change and destructive migration marker comments;
  # each finder should only find its own.
  local comments='{"id":5,"body":"<!-- breaking-api-change-hash: aaa111 -->\nAPI changes"}
{"id":7,"body":"<!-- db-destructive-migration-hash: 1b2b3b -->\nMigrations"}'

  run find_marker_comment "$comments" "breaking-api-change-hash"

  [ "$status" -eq 0 ]
  [ "$output" = $'5\taaa111' ]

  run find_marker_comment "$comments" "db-destructive-migration-hash"

  [ "$status" -eq 0 ]
  [ "$output" = $'7\t1b2b3b' ]
}

# This needs updating with the new work we will do in the second next commit
@test "find_marker_comment picks the first marker comment when several exist for the same key" {
  local comments='{"id":5,"body":"<!-- breaking-api-change-hash: aaa111 -->\nold"}
{"id":9,"body":"<!-- breaking-api-change-hash: 1b2b3b -->\nnewer"}'

  run find_marker_comment "$comments" "breaking-api-change-hash"

  [ "$status" -eq 0 ]
  [ "$output" = $'5\taaa111' ]
}

@test "build_body with breaking-api-change-hash marker key embeds the marker on its own first line" {
  run build_body "breaking-api-change-hash" "abc123" "https://github.com/o/r/actions/runs/42" "Breaking API change"

  [ "$status" -eq 0 ]

  local first_line
  first_line="$(head -1 <<<"$output")"

  [ "$first_line" = "<!-- breaking-api-change-hash: abc123 -->" ]
  [[ "$output" == *'https://github.com/o/r/actions/runs/42'* ]]
  [[ "$output" == *'Breaking API change'* ]]
}

@test "build_body with db-destructive-migration-hash marker key embeds the correct marker" {
  run build_body "db-destructive-migration-hash" "def456" "https://github.com/o/r/actions/runs/99" "Destructive migration"

  [ "$status" -eq 0 ]

  local first_line
  first_line="$(head -1 <<<"$output")"

  [ "$first_line" = "<!-- db-destructive-migration-hash: def456 -->" ]
  [[ "$output" == *'https://github.com/o/r/actions/runs/99'* ]]
  [[ "$output" == *'Destructive migration'* ]]
}
