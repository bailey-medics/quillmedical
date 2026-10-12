#!/usr/bin/env bats
# Tests for report-queue-failure.sh
#
# Against logs written here, with stand-ins for the two calls to GitHub.
# The logs of the three outside failures are the real lines from 12
# October 2026, which is what the script has to recognise.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/report-queue-failure.sh"
  source "$SCRIPT"

  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/output"
  : > "$GITHUB_OUTPUT"
  LOGS="${BATS_TEST_TMPDIR}/logs"
  mkdir -p "$LOGS"
  REF="refs/heads/gh-readonly-queue/main/pr-1830-0a1b2c3d"

  JOBS=""
  failed_jobs() { printf '%s' "$JOBS"; }
  job_log() { cat "${LOGS}/$2"; }

  cat > "${LOGS}/ecr" <<'LOG'
#8 [base 1/9] FROM public.ecr.aws/docker/library/python:3.14-slim
#8 ERROR: unexpected status from HEAD request: 429 Too Many Requests
ERROR: failed to solve: toomanyrequests: Data limit exceeded
##[error]buildx failed with: ERROR: failed to solve: toomanyrequests: Data limit exceeded
LOG

  cat > "${LOGS}/curl" <<'LOG'
[install-actionlint] Downloading actionlint v1.7.8 for linux/amd64...
curl: (22) The requested URL returned error: 504
##[error]Process completed with exit code 22.
LOG

  cat > "${LOGS}/twice" <<'LOG'
::warning title=Retried an outside call::'yarn' failed with status 1. Trying once more in 30s.
[retry-once] ERROR: 'yarn' failed twice, with status 1 and then 1.
##[error]Process completed with exit code 1.
LOG

  cat > "${LOGS}/test" <<'LOG'
FAILED tests/feedback_test.py::test_it_saves - assert 1 == 2
=========== 1 failed, 4200 passed in 140.11s ===========
##[error]Process completed with exit code 1.
LOG
}

# The message written to $GITHUB_OUTPUT.
text() {
  sed -n '/^text<<END_OF_QUEUE_REPORT$/,/^END_OF_QUEUE_REPORT$/p' "$GITHUB_OUTPUT"
}

verdict() {
  grep '^verdict=' "$GITHUB_OUTPUT" | cut -d= -f2
}

@test "a refused registry pull is an outside fault" {
  run outside_cause < "${LOGS}/ecr"

  [ "$output" = "a service refused it for too many requests (429)" ]
}

@test "a download answered with 504 is an outside fault" {
  run outside_cause < "${LOGS}/curl"

  [ "$output" = "a service answered with a server error (5xx)" ]
}

@test "a call that failed its second try is an outside fault" {
  run outside_cause < "${LOGS}/twice"

  [ "$output" = "an outside call failed twice in a row" ]
}

@test "a name that cannot be looked up is an outside fault" {
  printf '%s\n' 'dial tcp: lookup ghcr.io: no such host' '##[error]exit 1' > "${LOGS}/dns"

  run outside_cause < "${LOGS}/dns"

  [ "$output" = "a service's name could not be looked up" ]
}

@test "a failed test shows no outside fault" {
  run outside_cause < "${LOGS}/test"

  [ "$output" = "" ]
}

@test "a 504 a test printed long before it failed is not an outside fault" {
  {
    echo "test_a_504_from_the_proxy_is_shown PASSED: returned error: 504"
    for line in $(seq 1 40); do echo "test_${line} PASSED"; done
    echo "FAILED tests/feedback_test.py::test_it_saves"
    echo "##[error]Process completed with exit code 1."
  } > "${LOGS}/noisy"

  run outside_cause < "${LOGS}/noisy"

  [ "$output" = "" ]
}

@test "only the first error is read, not what a later step printed" {
  {
    echo "FAILED tests/feedback_test.py::test_it_saves"
    echo "##[error]Process completed with exit code 1."
    echo "Post job cleanup: curl returned error: 504"
    echo "##[error]cleanup failed"
  } > "${LOGS}/later"

  run outside_cause < "${LOGS}/later"

  [ "$output" = "" ]
}

@test "a log with no error line is read from its end" {
  printf '%s\n' 'pulling image' 'toomanyrequests: Data limit exceeded' > "${LOGS}/cut-short"

  run outside_cause < "${LOGS}/cut-short"

  [ "$output" = "a service refused it for too many requests (429)" ]
}

@test "the pull request is read from the merge group's ref" {
  run pull_request_of "$REF"

  [ "$output" = "1830" ]
}

@test "a ref that is not a merge group's names no pull request" {
  run pull_request_of "refs/heads/feature/pr-12-something"

  [ "$output" = "" ]
}

@test "every failed job being outside the code says to queue it again" {
  JOBS=$'ecr\tE2E image build\ncurl\tShell and workflow lint\n'

  run main bailey-medics/quillmedical 123 "$REF"

  [ "$status" -eq 0 ]
  [ "$(verdict)" = "outside" ]
  [[ "$(text)" == *"#1830 was removed by a fault outside the code"* ]]
  [[ "$(text)" == *"• E2E image build: looks like a service refused it for too many requests (429)"* ]]
  [[ "$(text)" == *"• Shell and workflow lint: looks like a service answered with a server error (5xx)"* ]]
  [[ "$(text)" == *"Add it to the queue again"* ]]
}

@test "a failed test is reported as a real failure" {
  JOBS=$'test\tPython unit\n'

  run main bailey-medics/quillmedical 123 "$REF"

  [ "$(verdict)" = "code" ]
  [[ "$(text)" == *"#1830 was removed by a failed check"* ]]
  [[ "$(text)" == *"• Python unit: no sign of an outside fault"* ]]
  [[ "$(text)" != *"Add it to the queue again"* ]]
}

@test "one of each does not say to queue it again" {
  JOBS=$'ecr\tE2E image build\ntest\tPython unit\n'

  run main bailey-medics/quillmedical 123 "$REF"

  [ "$(verdict)" = "mixed" ]
  [[ "$(text)" == *"not only by an outside fault"* ]]
  [[ "$(text)" != *"Add it to the queue again"* ]]
}

@test "a log that cannot be fetched counts as a real failure" {
  JOBS=$'missing\tPython unit\n'

  run main bailey-medics/quillmedical 123 "$REF"

  [ "$status" -eq 0 ]
  [ "$(verdict)" = "code" ]
}

@test "the message links the pull request and the run" {
  JOBS=$'ecr\tE2E image build\n'

  run main bailey-medics/quillmedical 123 "$REF"

  [[ "$(text)" == *"<https://github.com/bailey-medics/quillmedical/pull/1830|#1830>"* ]]
  [[ "$(text)" == *"<https://github.com/bailey-medics/quillmedical/actions/runs/123|View Run>"* ]]
}

@test "a run with no failed job is an error, not a report" {
  JOBS=""

  run main bailey-medics/quillmedical 123 "$REF"

  [ "$status" -eq 1 ]
  [[ "$output" == *"no failed job"* ]]
  [ ! -s "$GITHUB_OUTPUT" ]
}

@test "a ref outside the merge queue is refused" {
  run main bailey-medics/quillmedical 123 refs/heads/main

  [ "$status" -eq 1 ]
  [[ "$output" == *"not a merge group's ref"* ]]
}

@test "a run id that is not a number is refused" {
  run main bailey-medics/quillmedical "12;ls" "$REF"

  [ "$status" -eq 1 ]
  [[ "$output" == *"must be a number"* ]]
}

@test "a missing argument is refused" {
  run main bailey-medics/quillmedical 123

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage:"* ]]
}
