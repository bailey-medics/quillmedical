#!/usr/bin/env bats
# Tests for smoke-test.sh — the deploy pipeline's post-deploy health check.
#
# The curl call (http_status) is stubbed so the retry logic can be tested
# without network access. Interval is set to 0 to keep tests fast.

# shellcheck disable=SC2329

setup() {
  source "${BATS_TEST_DIRNAME}/smoke-test.sh"
}

@test "passes immediately when the first attempt returns 200" {
  http_status() { echo "200"; }
  run main "http://www.example.com" 5 0
  [ "$status" -eq 0 ]
  [[ "$output" == *"Health check passed: http://www.example.com"* ]]
}

@test "retries then passes once the endpoint becomes healthy" {
  # Fail twice, then succeed, using a counter file across subshell calls.
  counter="${BATS_TEST_TMPDIR}/count"
  echo 0 > "$counter"

  http_status() {
    local n
    n="$(cat "$counter")"
    echo $((n + 1)) > "$counter"
    if [ "$n" -lt 2 ]; then echo "503"; else echo "200"; fi
  }

  run main "http://www.example.com" 5 0
  [ "$status" -eq 0 ]
  [[ "$output" == *"Attempt 1/5: got 503"* ]]
  [[ "$output" == *"Health check passed: http://www.example.com"* ]]
}

@test "fails after exhausting all retries" {
  http_status() { echo "500"; }
  run main "http://www.example.com" 3 0
  [ "$status" -ne 0 ]
  [[ "$output" == *"Attempt 3/3: got 500"* ]]
  [[ "$output" == *"Health check failed after 3 attempts: http://www.example.com"* ]]
}

@test "errors when url is missing" {
  run main
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage: smoke-test.sh"* ]]
}
