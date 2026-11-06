#!/usr/bin/env bats
# Tests for check-sign-in-secrets.sh, and for how framework-pipeline.yml
# wires it and the start_sync input.

bats_require_minimum_version 1.5.0

setup() {
  ROOT="${BATS_TEST_DIRNAME}/../../.."
  SCRIPT="${BATS_TEST_DIRNAME}/check-sign-in-secrets.sh"
  WORKFLOW="${ROOT}/.github/workflows/framework-pipeline.yml"
}

# The lines of one job in the workflow, from its name to the next job's.
job() {
  local name="$1"

  awk -v start="  ${name}:" '
    $0 == start { found = 1; print; next }
    found && /^  [a-z-]+:$/ { exit }
    found { print }
  ' "$WORKFLOW"
}

@test "passes when both secrets are given" {
  run bash "$SCRIPT" projects/1/providers/p content@example.iam.gserviceaccount.com

  [ "$status" -eq 0 ]
  [[ "$output" == *"Both sign-in secrets were passed"* ]]
}

@test "fails naming the provider when it is missing" {
  run bash "$SCRIPT" "" content@example.iam.gserviceaccount.com

  [ "$status" -eq 1 ]
  [[ "$output" == *"passed no GCP_WORKLOAD_IDENTITY_PROVIDER."* ]]
  [[ "$output" != *"GCP_SERVICE_ACCOUNT"* ]]
}

@test "fails naming the account when it is missing" {
  run bash "$SCRIPT" projects/1/providers/p ""

  [ "$status" -eq 1 ]
  [[ "$output" == *"passed no GCP_SERVICE_ACCOUNT."* ]]
  [[ "$output" != *"GCP_WORKLOAD_IDENTITY_PROVIDER"* ]]
}

@test "fails naming both when neither is given, and says how to fix it" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"GCP_WORKLOAD_IDENTITY_PROVIDER or GCP_SERVICE_ACCOUNT"* ]]
  [[ "$output" == *"start_sync: false"* ]]
}

@test "never prints a value it was given" {
  run bash "$SCRIPT" "" content@example.iam.gserviceaccount.com

  [[ "$output" != *"content@example"* ]]
}

@test "the workflow takes start_sync, true by default" {
  run grep -A 4 '^      start_sync:$' "$WORKFLOW"

  [ "$status" -eq 0 ]
  [[ "$output" == *"type: boolean"* ]]
  [[ "$output" == *"default: true"* ]]
}

@test "no secret the workflow takes is required" {
  run ! grep -q 'required: true' "$WORKFLOW"
}

@test "deploy runs only when start_sync is true" {
  run job deploy

  [[ "$output" == *"inputs.start_sync"* ]]
}

@test "deploy checks the secrets before it signs in" {
  local steps

  steps="$(job deploy | grep -E 'check-sign-in-secrets.sh|google-github-actions/auth')"

  [[ "$(echo "$steps" | head -n 1)" == *"check-sign-in-secrets.sh"* ]]
  [[ "$(echo "$steps" | tail -n 1)" == *"google-github-actions/auth"* ]]
}
