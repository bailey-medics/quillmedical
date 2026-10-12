#!/usr/bin/env bats
# Tests for retry-once.sh
#
# What matters: a command that works is run once, one that fails is run
# exactly twice, and the answer given is the second run's.

setup() {
  RETRY="${BATS_TEST_DIRNAME}/retry-once.sh"
  export RETRY_WAIT_SECONDS=0
  export RUNS="${BATS_TEST_TMPDIR}/runs"
  : > "$RUNS"

  # Fails until it has been run as many times as its first argument,
  # then succeeds. Exits with its second argument when it fails.
  cat > "${BATS_TEST_TMPDIR}/flaky" <<'SCRIPT'
#!/usr/bin/env bash
echo run >> "$RUNS"
[ "$(wc -l < "$RUNS")" -ge "$1" ] && exit 0
exit "${2:-1}"
SCRIPT
  chmod +x "${BATS_TEST_TMPDIR}/flaky"
  FLAKY="${BATS_TEST_TMPDIR}/flaky"
}

runs() {
  wc -l < "$RUNS" | tr -d ' '
}

@test "a command that works is run once" {
  run bash "$RETRY" "$FLAKY" 1

  [ "$status" -eq 0 ]
  [ "$(runs)" = "1" ]
  [[ "$output" != *"::warning"* ]]
}

@test "a command that fails once is run again and passes" {
  run bash "$RETRY" "$FLAKY" 2

  [ "$status" -eq 0 ]
  [ "$(runs)" = "2" ]
}

@test "the second try is announced as a warning" {
  run bash "$RETRY" "$FLAKY" 2 7

  [[ "$output" == *"::warning title=Retried an outside call::"* ]]
  [[ "$output" == *"status 7"* ]]
}

@test "a command that fails twice is not run a third time" {
  run bash "$RETRY" "$FLAKY" 3

  [ "$status" -ne 0 ]
  [ "$(runs)" = "2" ]
}

@test "the status returned is the second failure's" {
  cat > "${BATS_TEST_TMPDIR}/changing" <<'SCRIPT'
#!/usr/bin/env bash
echo run >> "$RUNS"
exit "$(( $(wc -l < "$RUNS") + 40 ))"
SCRIPT
  chmod +x "${BATS_TEST_TMPDIR}/changing"

  run bash "$RETRY" "${BATS_TEST_TMPDIR}/changing"

  [ "$status" -eq 42 ]
  [[ "$output" == *"status 41 and then 42"* ]]
}

@test "arguments with spaces reach the command whole" {
  cat > "${BATS_TEST_TMPDIR}/echo-args" <<'SCRIPT'
#!/usr/bin/env bash
printf '<%s>' "$@"
SCRIPT
  chmod +x "${BATS_TEST_TMPDIR}/echo-args"

  run bash "$RETRY" "${BATS_TEST_TMPDIR}/echo-args" "two words" last

  [ "$output" = "<two words><last>" ]
}

@test "the command's own output is passed through" {
  run bash "$RETRY" echo hello

  [ "$output" = "hello" ]
}

@test "no command at all is an error, not a pass" {
  run bash "$RETRY"

  [ "$status" -eq 2 ]
  [[ "$output" == *"No command given"* ]]
}

@test "it waits the given time before the second try" {
  export RETRY_WAIT_SECONDS=1
  start=$SECONDS

  run bash "$RETRY" "$FLAKY" 2

  [ "$(( SECONDS - start ))" -ge 1 ]
}
