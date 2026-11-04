#!/usr/bin/env bats
# Tests for point-job-at-build.sh
#
# gcloud is stubbed: `describe` answers as the test sets, and every call is
# recorded, so each test can say whether an update was asked for.

# `run !` needs this declared, or bats runs in a compatibility mode where
# flags on `run` are not honoured and the negation silently passes.
bats_require_minimum_version 1.5.0

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/point-job-at-build.sh"
  CALLS="${BATS_TEST_TMPDIR}/gcloud-calls"
  : > "$CALLS"
  export DESCRIBE_ANSWER="quill-framework-sync-app"
  export DESCRIBE_STATUS=0

  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB_DIR"
  cat > "${STUB_DIR}/gcloud" <<STUB
#!/usr/bin/env bash
echo "\$*" >> "${CALLS}"
case "\$*" in
  *"jobs describe"*) echo "\${DESCRIBE_ANSWER}"; exit "\${DESCRIBE_STATUS}" ;;
esac
STUB
  chmod +x "${STUB_DIR}/gcloud"
  PATH="${STUB_DIR}:${PATH}"
}

point() {
  run bash "$SCRIPT" quill-framework-sync-app my-project europe-west2 the/image:abc
}

@test "fails without all four arguments" {
  run bash "$SCRIPT" quill-framework-sync-app my-project

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}

@test "updates a job that exists" {
  point

  [ "$status" -eq 0 ]
  grep -q "run jobs update quill-framework-sync-app --project=my-project --region=europe-west2 --image=the/image:abc" "$CALLS"
}

@test "skips a job that does not exist yet, with a notice" {
  export DESCRIBE_ANSWER="ERROR: (gcloud.run.jobs.describe) Cannot find job [quill-framework-sync-app]: NOT_FOUND"
  export DESCRIBE_STATUS=1

  point

  [ "$status" -eq 0 ]
  [[ "$output" == *"does not exist yet"* ]]
  run ! grep -q "jobs update" "$CALLS"
}

@test "any other failure to read the job fails the step" {
  export DESCRIBE_ANSWER="ERROR: PERMISSION_DENIED"
  export DESCRIBE_STATUS=1

  point

  [ "$status" -eq 1 ]
  [[ "$output" == *"Could not read quill-framework-sync-app"* ]]
}
