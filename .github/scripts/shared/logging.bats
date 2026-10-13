#!/usr/bin/env bats
# Tests for logging.sh
#
# Every other script here sources it, so what matters is that a line says
# which script wrote it, and that an error goes to stderr and not stdout.

setup() {
  LOGGING="${BATS_TEST_DIRNAME}/logging.sh"
}

@test "log prefixes the line with the script's name" {
  run bash -c "source '$LOGGING' copy-images; log Copied 3 images"

  [ "$status" -eq 0 ]
  [ "$output" = "[copy-images] Copied 3 images" ]
}

@test "log writes to stdout" {
  run bash -c "source '$LOGGING' copy-images; log hello 2>/dev/null"

  [ "$output" = "[copy-images] hello" ]
}

@test "error names the script and says ERROR" {
  run bash -c "source '$LOGGING' copy-images; error No owner given"

  [[ "$output" == *"[copy-images] ERROR: No owner given"* ]]
}

@test "error writes to stderr, and nothing to stdout" {
  run bash -c "source '$LOGGING' copy-images; error broken 2>/dev/null"

  [ "$output" = "" ]
}

@test "a script that gives no name is called script" {
  run bash -c "source '$LOGGING'; log hello"

  [ "$output" = "[script] hello" ]
}

@test "words with spaces between them are kept in order" {
  run bash -c "source '$LOGGING' x; log one 'two three' four"

  [ "$output" = "[x] one two three four" ]
}
