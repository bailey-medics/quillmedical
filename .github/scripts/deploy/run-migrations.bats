#!/usr/bin/env bats
# Tests for run-migrations.sh — the pre-deploy migration Cloud Run Job step.
#
# `gcloud` is stubbed so the update/execute sequencing and argument handling
# can be tested without any real GCP access.

# shellcheck disable=SC2329

setup() {
  source "${BATS_TEST_DIRNAME}/run-migrations.sh"
}

@test "updates the job then executes it and waits" {
  calls="${BATS_TEST_TMPDIR}/calls"
  : > "$calls"

  gcloud() {
    echo "$*" >> "$calls"
  }

  run main "quill-admin-teaching" "my-project" "europe-west2" "europe-west2-docker.pkg.dev/my-project/quill/admin:abc123"
  [ "$status" -eq 0 ]

  [[ "$(sed -n '1p' "$calls")" == "run jobs update quill-admin-teaching --project=my-project --region=europe-west2 --image=europe-west2-docker.pkg.dev/my-project/quill/admin:abc123" ]]
  [[ "$(sed -n '2p' "$calls")" == "run jobs execute quill-admin-teaching --project=my-project --region=europe-west2 --update-env-vars=ADMIN_ACTION=run-migrations --wait" ]]
}

@test "fails and does not execute when the job update fails" {
  calls="${BATS_TEST_TMPDIR}/calls"
  : > "$calls"

  gcloud() {
    echo "$*" >> "$calls"
    if [ "$1" = "run" ] && [ "$2" = "jobs" ] && [ "$3" = "update" ]; then
      return 1
    fi
  }

  run main "quill-admin-teaching" "my-project" "europe-west2" "image:abc123"
  [ "$status" -ne 0 ]
  [ "$(wc -l < "$calls")" -eq 1 ]
}

@test "errors when a required argument is missing" {
  run main "quill-admin-teaching" "my-project" "europe-west2"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage: run-migrations.sh"* ]]
}
