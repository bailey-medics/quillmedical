#!/usr/bin/env bats
# Tests for to-slack-mrkdwn.sh
#
# Ordered to follow main(): the argument and environment guards first, then the
# conversion itself.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/to-slack-mrkdwn.sh"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : >"$GITHUB_OUTPUT"
}

@test "errors when no message is given" {
  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"No message provided"* ]]
}

@test "errors when GITHUB_OUTPUT is not set" {
  unset GITHUB_OUTPUT

  run main "**bold**"

  [ "$status" -eq 1 ]
  [[ "$output" == *"GITHUB_OUTPUT not set"* ]]
}

@test "refuses a message carrying the output delimiter on its own line" {
  # Otherwise the message could close the heredoc early and write arbitrary
  # step outputs of its own.
  run main "harmless
GATE_MESSAGE_EOF
injected=true"

  [ "$status" -eq 1 ]
  [[ "$output" == *"refusing to write it"* ]]
}

@test "allows the delimiter when it is only part of a line" {
  run main "mentions GATE_MESSAGE_EOF inline, which is harmless"

  [ "$status" -eq 0 ]
}

@test "to_mrkdwn turns GitHub bold into Slack bold" {
  run to_mrkdwn <<<"**Destructive database migration pending review**"

  [ "$status" -eq 0 ]
  [ "$output" = "*Destructive database migration pending review*" ]
}

@test "to_mrkdwn converts every bold run on a line" {
  run to_mrkdwn <<<"Click **Review pending deployments** to approve **now**"

  [ "$status" -eq 0 ]
  [ "$output" = "Click *Review pending deployments* to approve *now*" ]
}

@test "to_mrkdwn leaves the rest of the markup alone" {
  # Backticks, fences and plain text render the same in both dialects, so the
  # bold substitution must be the only change.
  local message='Use `db-destructive-migration-review`
```
2026_08_28_1200-aabbccdd1111_test.py aabbccdd1111 drop_column
```'

  run to_mrkdwn <<<"$message"

  [ "$status" -eq 0 ]
  [ "$output" = "$message" ]
}

@test "writes the converted message to GITHUB_OUTPUT as a multi-line value" {
  main "**Heading**

Body line."

  run cat "$GITHUB_OUTPUT"

  [[ "$output" == *"slack_message<<GATE_MESSAGE_EOF"* ]]
  [[ "$output" == *"*Heading*"* ]]
  [[ "$output" == *"Body line."* ]]
  [[ "$output" == *$'\nGATE_MESSAGE_EOF' ]]
}
