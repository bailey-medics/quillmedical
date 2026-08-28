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
#
# latest_announcement_matches is where the "one comment per distinct
# change-set" behaviour lives. It consults only the newest marker comment, so
# its tests cover both a changed finding and a return to an earlier one - the
# second is the case that a whole-history search would wrongly swallow.

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

@test "latest_announcement_matches is false for an empty comment stream" {
  run latest_announcement_matches "" "breaking-api-change-hash" "aaa111"

  [ "$status" -eq 0 ]
  [ "$output" = "false" ]
}

@test "latest_announcement_matches is false when no comment carries the marker" {
  local comments='{"id":1,"body":"just a regular review comment"}
{"id":2,"body":"another comment"}'

  run latest_announcement_matches "$comments" "breaking-api-change-hash" "aaa111"

  [ "$status" -eq 0 ]
  [ "$output" = "false" ]
}

@test "latest_announcement_matches is true when the newest announcement is this change-set" {
  local comments='{"id":1,"body":"unrelated comment"}
{"id":2,"body":"<!-- breaking-api-change-hash: aaa111 -->\nsome explanation"}'

  run latest_announcement_matches "$comments" "breaking-api-change-hash" "aaa111"

  [ "$status" -eq 0 ]
  [ "$output" = "true" ]
}

@test "latest_announcement_matches is false when the finding has changed" {
  local comments='{"id":5,"body":"<!-- breaking-api-change-hash: aaa111 -->\nearlier"}'

  run latest_announcement_matches "$comments" "breaking-api-change-hash" "1b2b3b"

  [ "$status" -eq 0 ]
  [ "$output" = "false" ]
}

@test "latest_announcement_matches is false when the PR moves back to an earlier change-set" {
  # aaa111 was announced, then 1b2b3b. Going back to aaa111 is a change from
  # the latest state, so it must be announced again rather than swallowed
  # because a matching comment exists further up the PR.
  local comments='{"id":5,"body":"<!-- breaking-api-change-hash: aaa111 -->\nearlier"}
{"id":9,"body":"<!-- breaking-api-change-hash: 1b2b3b -->\nlater"}'

  run latest_announcement_matches "$comments" "breaking-api-change-hash" "aaa111"

  [ "$status" -eq 0 ]
  [ "$output" = "false" ]
}

@test "latest_announcement_matches uses the newest comment, not the input order" {
  # Same two comments as above, fed newest-first. max_by(.id) must still pick
  # 1b2b3b, so the answer cannot depend on how the API ordered its response.
  local comments='{"id":9,"body":"<!-- breaking-api-change-hash: 1b2b3b -->\nlater"}
{"id":5,"body":"<!-- breaking-api-change-hash: aaa111 -->\nearlier"}'

  run latest_announcement_matches "$comments" "breaking-api-change-hash" "1b2b3b"

  [ "$status" -eq 0 ]
  [ "$output" = "true" ]

  run latest_announcement_matches "$comments" "breaking-api-change-hash" "aaa111"

  [ "$status" -eq 0 ]
  [ "$output" = "false" ]
}

@test "latest_announcement_matches ignores the other gate's marker key" {
  # A PR tripping both gates: each must read only its own newest comment, even
  # when the other gate spoke more recently.
  local comments='{"id":5,"body":"<!-- breaking-api-change-hash: aaa111 -->\nAPI"}
{"id":7,"body":"<!-- db-destructive-migration-hash: 1b2b3b -->\nDB"}'

  run latest_announcement_matches "$comments" "breaking-api-change-hash" "aaa111"

  [ "$status" -eq 0 ]
  [ "$output" = "true" ]

  run latest_announcement_matches "$comments" "db-destructive-migration-hash" "1b2b3b"

  [ "$status" -eq 0 ]
  [ "$output" = "true" ]
}

@test "latest_announcement_matches works for any marker key" {
  local comments='{"id":42,"body":"<!-- my-custom-gate-hash: 1f2e3d4c -->\nexplanation"}'

  run latest_announcement_matches "$comments" "my-custom-gate-hash" "1f2e3d4c"

  [ "$status" -eq 0 ]
  [ "$output" = "true" ]
}

@test "latest_announcement_matches is false when the findings have gone" {
  # The PR announced aaa111 and now has nothing. "none" differs from the last
  # announcement, so the disappearance gets recorded like any other change.
  local comments='{"id":5,"body":"<!-- breaking-api-change-hash: aaa111 -->\nearlier"}'

  run latest_announcement_matches "$comments" "breaking-api-change-hash" "none"

  [ "$status" -eq 0 ]
  [ "$output" = "false" ]
}

@test "latest_announcement_matches is true when the findings are still gone" {
  # Already recorded as clean, so later pushes do not re-record it.
  local comments='{"id":5,"body":"<!-- breaking-api-change-hash: aaa111 -->\nearlier"}
{"id":9,"body":"<!-- breaking-api-change-hash: none -->\nall clear"}'

  run latest_announcement_matches "$comments" "breaking-api-change-hash" "none"

  [ "$status" -eq 0 ]
  [ "$output" = "true" ]
}

@test "gate_has_commented is false on a PR this gate has never commented on" {
  # Keeps a clean PR clean: with no prior comment there is no finding to
  # report the disappearance of.
  local comments='{"id":1,"body":"just a regular review comment"}
{"id":2,"body":"<!-- db-destructive-migration-hash: aaa111 -->\nother gate"}'

  run gate_has_commented "$comments" "breaking-api-change-hash"

  [ "$status" -eq 0 ]
  [ "$output" = "false" ]
}

@test "gate_has_commented is false for an empty comment stream" {
  run gate_has_commented "" "breaking-api-change-hash"

  [ "$status" -eq 0 ]
  [ "$output" = "false" ]
}

@test "gate_has_commented is true once this gate has commented, whatever the hash" {
  local comments='{"id":5,"body":"<!-- breaking-api-change-hash: aaa111 -->\nearlier"}'

  run gate_has_commented "$comments" "breaking-api-change-hash"

  [ "$status" -eq 0 ]
  [ "$output" = "true" ]
}

@test "build_body renders an all-clear when there are no findings" {
  run build_body "breaking-api-change-hash" "none" "https://github.com/o/r/actions/runs/42" "Breaking API change"

  [ "$status" -eq 0 ]

  local first_line
  first_line="$(head -1 <<<"$output")"

  [ "$first_line" = "<!-- breaking-api-change-hash: none -->" ]
  [[ "$output" == *'no longer present'* ]]
  [[ "$output" != *'⚠️'* ]]
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
