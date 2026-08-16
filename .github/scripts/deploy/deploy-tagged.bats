#!/usr/bin/env bats
# Tests for deploy-tagged.sh — the pre-deploy tagged/no-traffic revision
# deploy, smoke test, and promote step.
#
# `gcloud` and `run_smoke_test` are stubbed so the deploy/lookup/promote
# sequencing can be tested without any real GCP access or network calls.

# shellcheck disable=SC2329

setup() {
  source "${BATS_TEST_DIRNAME}/deploy-tagged.sh"
}

@test "deploys under tag, smoke-tests the tagged URL, then promotes" {
  calls="${BATS_TEST_TMPDIR}/calls"
  : > "$calls"

  gcloud() {
    echo "$*" >> "$calls"
    if [ "$1" = "run" ] && [ "$2" = "services" ] && [ "$3" = "describe" ]; then
      echo '{"status":{"traffic":[{"tag":"rev-abc123","url":"https://rev-abc123---quill-backend-teaching-xyz.a.run.app"}]}}'
    fi
  }

  run_smoke_test() {
    echo "$*" >> "$calls"
    return 0
  }

  run main "quill-backend-teaching" "my-project" "europe-west2" "image:abc123" "rev-abc123" "/api/health"
  [ "$status" -eq 0 ]

  [[ "$(sed -n '1p' "$calls")" == "run services update quill-backend-teaching --project=my-project --region=europe-west2 --image=image:abc123 --no-traffic --tag=rev-abc123" ]]
  [[ "$(sed -n '2p' "$calls")" == "run services describe quill-backend-teaching --project=my-project --region=europe-west2 --format=json" ]]
  [[ "$(sed -n '3p' "$calls")" == "https://rev-abc123---quill-backend-teaching-xyz.a.run.app/api/health" ]]
  [[ "$(sed -n '4p' "$calls")" == "run services update-traffic quill-backend-teaching --project=my-project --region=europe-west2 --to-latest" ]]
}

@test "fails and does not promote when the smoke test fails" {
  calls="${BATS_TEST_TMPDIR}/calls"
  : > "$calls"

  gcloud() {
    echo "$*" >> "$calls"
    if [ "$1" = "run" ] && [ "$2" = "services" ] && [ "$3" = "describe" ]; then
      echo '{"status":{"traffic":[{"tag":"rev-abc123","url":"https://rev-abc123---quill-backend-teaching-xyz.a.run.app"}]}}'
    fi
  }

  run_smoke_test() {
    echo "$*" >> "$calls"
    return 1
  }

  run main "quill-backend-teaching" "my-project" "europe-west2" "image:abc123" "rev-abc123" "/api/health"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Smoke test failed"* ]]
  [ "$(wc -l < "$calls")" -eq 3 ]
}

@test "fails when the tagged URL cannot be resolved" {
  calls="${BATS_TEST_TMPDIR}/calls"
  : > "$calls"

  gcloud() {
    echo "$*" >> "$calls"
    if [ "$1" = "run" ] && [ "$2" = "services" ] && [ "$3" = "describe" ]; then
      echo '{"status":{"traffic":[]}}'
    fi
  }

  run main "quill-backend-teaching" "my-project" "europe-west2" "image:abc123" "rev-abc123" "/api/health"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Could not resolve a tagged URL"* ]]
  [ "$(wc -l < "$calls")" -eq 2 ]
}

@test "fails and does not run describe or smoke-test when the tagged deploy fails" {
  calls="${BATS_TEST_TMPDIR}/calls"
  : > "$calls"

  gcloud() {
    echo "$*" >> "$calls"
    if [ "$1" = "run" ] && [ "$2" = "services" ] && [ "$3" = "update" ]; then
      return 1
    fi
  }

  run main "quill-backend-teaching" "my-project" "europe-west2" "image:abc123" "rev-abc123" "/api/health"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Failed to deploy"* ]]
  [ "$(wc -l < "$calls")" -eq 1 ]
}

@test "errors when a required argument is missing" {
  run main "quill-backend-teaching" "my-project" "europe-west2" "image:abc123" "rev-abc123"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage: deploy-tagged.sh"* ]]
}
