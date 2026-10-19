#!/usr/bin/env bats
# Tests for run-sync-job.sh
#
# gcloud is stubbed: `execute` answers with a canned execution name, and
# `executions describe` plays back a scripted sequence of states, one per
# call. What matters is which project the job is started in, that the
# failure names the execution, and that the outputs reach GITHUB_OUTPUT.

bats_require_minimum_version 1.5.0

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/run-sync-job.sh"
  CALLS="${BATS_TEST_TMPDIR}/gcloud-calls"
  STATES="${BATS_TEST_TMPDIR}/states"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github-output"
  : > "$CALLS"
  : > "$STATES"
  : > "$GITHUB_OUTPUT"

  # Short polls, so the give-up case ends in a few seconds rather than
  # seven minutes. Not zero: the counter advances by POLL_SECONDS, so
  # zero would never reach the ceiling.
  export POLL_SECONDS=1
  export WAIT_SECONDS=2

  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB_DIR"
  cat > "${STUB_DIR}/gcloud" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${CALLS}"
case "\$*" in
  *"jobs execute"*) echo "quill-teaching-sync-app-abc12" ;;
  *"executions describe"*)
    # Pop the next scripted state; an empty line means still running.
    state=\$(head -n 1 "${STATES}")
    tail -n +2 "${STATES}" > "${STATES}.tmp" && mv "${STATES}.tmp" "${STATES}"
    echo "\$state"
    ;;
esac
EOF
  chmod +x "${STUB_DIR}/gcloud"
  PATH="${STUB_DIR}:${PATH}"
}

states() {
  printf '%s\n' "$@" > "$STATES"
}

@test "fails without a service account email" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No service account email provided"* ]]
}

@test "refuses an email that is not a service account's" {
  run bash "$SCRIPT" "somebody@example.com"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Not a service account email"* ]]
  [ ! -s "$CALLS" ]
}

@test "starts the job in the project named by the email" {
  states "1"

  run bash "$SCRIPT" "content-sync@quill-medical-app.iam.gserviceaccount.com"

  [ "$status" -eq 0 ]
  grep -q "run jobs execute quill-teaching-sync-app --project=quill-medical-app --region=europe-west2" "$CALLS"
}

@test "starts without --wait, so a failure still has a name" {
  states "1"

  run bash "$SCRIPT" "content-sync@quill-medical-app.iam.gserviceaccount.com"

  run ! grep -q -- "--wait" "$CALLS"
}

@test "writes the execution and its log address to GITHUB_OUTPUT" {
  states "1"

  run bash "$SCRIPT" "content-sync@quill-medical-app.iam.gserviceaccount.com"

  [ "$status" -eq 0 ]
  grep -q "^execution=quill-teaching-sync-app-abc12$" "$GITHUB_OUTPUT"
  grep -q "^log_url=https://console.cloud.google.com/run/jobs/executions/details/europe-west2/quill-teaching-sync-app-abc12?project=quill-medical-app$" "$GITHUB_OUTPUT"
}

@test "waits while the job runs and passes when it succeeds" {
  states "" "" "1"

  run bash "$SCRIPT" "content-sync@quill-medical-app.iam.gserviceaccount.com"

  [ "$status" -eq 0 ]
  [ "$(grep -c "executions describe" "$CALLS")" -eq 3 ]
  [[ "$output" == *"Sync complete: quill-teaching-sync-app-abc12"* ]]
}

@test "a failed job fails the step and names the execution and its log" {
  # A rejected bank: the job exits non-zero and failedCount is 1.
  states "" "	1"

  run bash "$SCRIPT" "content-sync@quill-medical-app.iam.gserviceaccount.com"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Sync failed: quill-teaching-sync-app-abc12"* ]]
  [[ "$output" == *"rejected banks are in its log"* ]]
  [[ "$output" == *"executions/details/europe-west2/quill-teaching-sync-app-abc12"* ]]
}

@test "gives up after the wait ceiling rather than hanging the pipeline" {
  states "" "" "" "" ""

  run bash "$SCRIPT" "content-sync@quill-medical-app.iam.gserviceaccount.com"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Gave up waiting"* ]]
}

@test "an execute that names nothing is an error, not a silent pass" {
  cat > "${STUB_DIR}/gcloud" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "${CALLS}"
EOF

  run bash "$SCRIPT" "content-sync@quill-medical-app.iam.gserviceaccount.com"

  [ "$status" -eq 1 ]
  [[ "$output" == *"did not name the execution"* ]]
}
