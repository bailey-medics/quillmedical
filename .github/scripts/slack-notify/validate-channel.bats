#!/usr/bin/env bats
# Tests for validate-channel.sh — the Slack notifier's channel/webhook check.
#
# Only the pure validation logic (validate_channel) is unit-tested here.

setup() {
  source "${BATS_TEST_DIRNAME}/validate-channel.sh"
  WEBHOOKS='{"teaching":"https://hooks.slack.com/services/AAA/BBB/CCC"}'
  UNSET_WEBHOOKS='{"teaching":""}'
}

@test "accepts a known channel with a configured webhook" {
  run validate_channel "$WEBHOOKS" "teaching"
  [ "$status" -eq 0 ]
}

@test "rejects an unknown channel" {
  run validate_channel "$WEBHOOKS" "alerts"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Unknown Slack channel 'alerts'"* ]]
}

@test "rejects a known channel whose webhook secret is unset" {
  run validate_channel "$UNSET_WEBHOOKS" "teaching"
  [ "$status" -ne 0 ]
  [[ "$output" == *"No webhook secret configured for Slack channel 'teaching'"* ]]
}

@test "rejects an empty channel name" {
  run validate_channel "$WEBHOOKS" ""
  [ "$status" -ne 0 ]
  [[ "$output" == *"No channel provided"* ]]
}
