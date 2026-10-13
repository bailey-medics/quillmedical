#!/usr/bin/env bats
# Holds the "records awaiting a decision" alert to the line the retention
# run really prints.
#
# The nightly run prints one line when a closed account's training records
# need somebody to decide whether they are deleted, and an alert in
# infra/modules/monitoring/main.tf matches that line to tell them. If the
# words changed in one place and not the other, nobody would be told, and
# records would sit undecided past what the privacy policy promises.
#
# The words are DECISION_NEEDED in backend/app/retention.py, whose own
# tests prove a real run prints them and a report never does.

setup() {
  ROOT="${BATS_TEST_DIRNAME}/../../.."
  ALERT="${ROOT}/infra/modules/monitoring/main.tf"
  SAID="$(sed -n -E 's/^DECISION_NEEDED = "(.*)"$/\1/p' "${ROOT}/backend/app/retention.py")"
  PATTERN="$(sed -n -E 's/^[[:space:]]*textPayload =~ "(\^Decision needed[^"]*)"$/\1/p' "$ALERT")"
}

@test "the run's words and the alert's pattern are both found" {
  # Comparing empty with empty would pass.
  [ -n "$SAID" ]
  [ -n "$PATTERN" ]
}

@test "the alert matches the line the run prints" {
  grep -Eq "$PATTERN" <<<"${SAID} 3 closed accounts have training records past their period, awaiting a decision"
}

@test "the alert does not match a count of nought" {
  run grep -Eq "$PATTERN" <<<"${SAID} 0 closed accounts have training records past their period, awaiting a decision"

  [ "$status" -ne 0 ]
}

@test "the alert does not match the line every run prints" {
  run grep -Eq "$PATTERN" <<<"Listed 3 closed accounts whose records are newly past their period"

  [ "$status" -ne 0 ]
}

@test "the alert sends no name: its text has no placeholder for one" {
  run grep -A24 'resource "google_monitoring_alert_policy" "retention_decision_needed"' "$ALERT"

  [[ "$output" != *"label_extractors"* ]]
}
