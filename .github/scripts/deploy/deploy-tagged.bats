#!/usr/bin/env bats
# Tests for deploy-tagged.sh — the pre-deploy tagged/no-traffic revision
# deploy, smoke test, and promote step.
#
# `gcloud` and `run_smoke_test` are stubbed so the deploy/lookup/promote
# sequencing can be tested without any real GCP access or network calls.

# shellcheck disable=SC2329

setup() {
  source "${BATS_TEST_DIRNAME}/deploy-tagged.sh"
  # No real waiting in tests: one poll per attempt unless a test says otherwise.
  export PROMOTE_TIMEOUT_SECONDS=0
  export PROMOTE_POLL_INTERVAL_SECONDS=0
}

TAGGED_URL="https://rev-abc123---quill-backend-teaching-xyz.a.run.app"

# Service JSON once the promotion has landed: Ready, newest revision is the
# ready one, and it carries all the traffic (split across the LATEST entry
# and the 0% tagged entry, as Cloud Run reports it).
settled_json() {
  cat <<JSON
{"status":{
  "conditions":[{"type":"Ready","status":"True"}],
  "latestCreatedRevisionName":"quill-backend-teaching-00285-quv",
  "latestReadyRevisionName":"quill-backend-teaching-00285-quv",
  "traffic":[
    {"revisionName":"quill-backend-teaching-00285-quv","percent":100,"latestRevision":true},
    {"revisionName":"quill-backend-teaching-00285-quv","percent":0,"tag":"rev-abc123","url":"${TAGGED_URL}"}
  ]}}
JSON
}

# The exact shape of the stalled deploy: the new revision is ready and
# tagged, but traffic is still on the previous revision and the service is
# stuck on "Provisioning revision instances to receive traffic".
stalled_json() {
  cat <<JSON
{"status":{
  "conditions":[{"type":"Ready","status":"Unknown","message":"Provisioning revision instances to receive traffic."}],
  "latestCreatedRevisionName":"quill-backend-teaching-00285-quv",
  "latestReadyRevisionName":"quill-backend-teaching-00285-quv",
  "traffic":[
    {"revisionName":"quill-backend-teaching-00283-pok","percent":100,"tag":"rev-794862ba50d9","url":"https://rev-794862ba50d9---quill-backend-teaching-xyz.a.run.app"},
    {"revisionName":"quill-backend-teaching-00285-quv","percent":0,"tag":"rev-abc123","url":"${TAGGED_URL}"}
  ]}}
JSON
}

is_describe() {
  [ "$1" = "run" ] && [ "$2" = "services" ] && [ "$3" = "describe" ]
}

is_update_traffic() {
  [ "$1" = "run" ] && [ "$2" = "services" ] && [ "$3" = "update-traffic" ]
}

@test "deploys under tag, smoke-tests the tagged URL, then promotes and verifies" {
  calls="${BATS_TEST_TMPDIR}/calls"
  : > "$calls"

  gcloud() {
    echo "$*" >> "$calls"
    if is_describe "$@"; then settled_json; fi
  }

  run_smoke_test() {
    echo "$*" >> "$calls"
    return 0
  }

  run main "quill-backend-teaching" "my-project" "europe-west2" "image:abc123" "rev-abc123" "/api/health"
  [ "$status" -eq 0 ]
  [[ "$output" == *"Promotion settled"* ]]

  [[ "$(sed -n '1p' "$calls")" == "run services update quill-backend-teaching --project=my-project --region=europe-west2 --image=image:abc123 --no-traffic --tag=rev-abc123" ]]
  [[ "$(sed -n '2p' "$calls")" == "run services describe quill-backend-teaching --project=my-project --region=europe-west2 --format=json" ]]
  [[ "$(sed -n '3p' "$calls")" == "${TAGGED_URL}/api/health" ]]
  [[ "$(sed -n '4p' "$calls")" == "run services update-traffic quill-backend-teaching --project=my-project --region=europe-west2 --to-latest --async" ]]
  [[ "$(sed -n '5p' "$calls")" == "run services describe quill-backend-teaching --project=my-project --region=europe-west2 --format=json" ]]
  [ "$(wc -l < "$calls")" -eq 5 ]
}

@test "keeps polling until the traffic has actually moved" {
  export PROMOTE_TIMEOUT_SECONDS=30
  describes="${BATS_TEST_TMPDIR}/describes"
  : > "$describes"

  gcloud() {
    if is_describe "$@"; then
      echo . >> "$describes"
      # 1st describe resolves the tagged URL; the next two show the old
      # revision still live; only the 4th shows the promotion landed.
      if [ "$(wc -l < "$describes")" -lt 4 ]; then stalled_json; else settled_json; fi
    fi
  }

  run_smoke_test() { return 0; }

  run main "quill-backend-teaching" "my-project" "europe-west2" "image:abc123" "rev-abc123" "/api/health"
  [ "$status" -eq 0 ]
  [ "$(wc -l < "$describes")" -eq 4 ]
}

@test "retries the promotion once when traffic never settles, then fails with diagnostics" {
  calls="${BATS_TEST_TMPDIR}/calls"
  : > "$calls"

  gcloud() {
    echo "$*" >> "$calls"
    if is_describe "$@"; then stalled_json; fi
  }

  run_smoke_test() { return 0; }

  run main "quill-backend-teaching" "my-project" "europe-west2" "image:abc123" "rev-abc123" "/api/health"
  [ "$status" -ne 0 ]
  [ "$(grep -c 'update-traffic' "$calls")" -eq 2 ]
  [[ "$output" == *"did not settle"* ]]
  [[ "$output" == *"after 2 attempts"* ]]
  [[ "$output" == *"Provisioning revision instances to receive traffic."* ]]
}

@test "succeeds when the second promotion attempt settles" {
  calls="${BATS_TEST_TMPDIR}/calls"
  : > "$calls"

  gcloud() {
    echo "$*" >> "$calls"
    if is_describe "$@"; then
      # Settle only once a second update-traffic has been issued.
      if [ "$(grep -c 'update-traffic' "$calls")" -ge 2 ]; then settled_json; else stalled_json; fi
    fi
  }

  run_smoke_test() { return 0; }

  run main "quill-backend-teaching" "my-project" "europe-west2" "image:abc123" "rev-abc123" "/api/health"
  [ "$status" -eq 0 ]
  [ "$(grep -c 'update-traffic' "$calls")" -eq 2 ]
  [[ "$output" == *"attempt 2/2"* ]]
  [[ "$output" == *"Promotion settled"* ]]
}

@test "retries when Cloud Run rejects the traffic update outright" {
  calls="${BATS_TEST_TMPDIR}/calls"
  : > "$calls"

  gcloud() {
    echo "$*" >> "$calls"
    if is_describe "$@"; then settled_json; fi
    if is_update_traffic "$@" && [ "$(grep -c 'update-traffic' "$calls")" -eq 1 ]; then
      return 1
    fi
  }

  run_smoke_test() { return 0; }

  run main "quill-backend-teaching" "my-project" "europe-west2" "image:abc123" "rev-abc123" "/api/health"
  [ "$status" -eq 0 ]
  [ "$(grep -c 'update-traffic' "$calls")" -eq 2 ]
  [[ "$output" == *"rejected the traffic update"* ]]
}

@test "honours PROMOTE_ATTEMPTS" {
  export PROMOTE_ATTEMPTS=3
  calls="${BATS_TEST_TMPDIR}/calls"
  : > "$calls"

  gcloud() {
    echo "$*" >> "$calls"
    if is_describe "$@"; then stalled_json; fi
  }

  run_smoke_test() { return 0; }

  run main "quill-backend-teaching" "my-project" "europe-west2" "image:abc123" "rev-abc123" "/api/health"
  [ "$status" -ne 0 ]
  [ "$(grep -c 'update-traffic' "$calls")" -eq 3 ]
  [[ "$output" == *"after 3 attempts"* ]]
}

@test "fails and does not promote when the smoke test fails" {
  calls="${BATS_TEST_TMPDIR}/calls"
  : > "$calls"

  gcloud() {
    echo "$*" >> "$calls"
    if is_describe "$@"; then settled_json; fi
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
    if is_describe "$@"; then echo '{"status":{"traffic":[]}}'; fi
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

# ---------- promotion_settled ----------

@test "promotion_settled accepts a Ready service with all traffic on the newest revision" {
  run promotion_settled <<< "$(settled_json)"
  [ "$status" -eq 0 ]
}

@test "promotion_settled rejects the stalled state — spec says LATEST, traffic still on the old revision" {
  run promotion_settled <<< "$(stalled_json)"
  [ "$status" -ne 0 ]
}

@test "promotion_settled rejects a service whose Ready condition is not True" {
  json="$(settled_json | jq '.status.conditions[0].status = "Unknown"')"
  run promotion_settled <<< "$json"
  [ "$status" -ne 0 ]
}

@test "promotion_settled rejects a newer revision that is not yet the ready one" {
  json="$(settled_json | jq '.status.latestCreatedRevisionName = "quill-backend-teaching-00286-abc"')"
  run promotion_settled <<< "$json"
  [ "$status" -ne 0 ]
}

@test "promotion_settled rejects a partial traffic split" {
  json="$(settled_json | jq '.status.traffic[0].percent = 50')"
  run promotion_settled <<< "$json"
  [ "$status" -ne 0 ]
}

@test "promotion_settled rejects empty or malformed status" {
  run promotion_settled <<< '{}'
  [ "$status" -ne 0 ]
  run promotion_settled <<< 'not json'
  [ "$status" -ne 0 ]
}
