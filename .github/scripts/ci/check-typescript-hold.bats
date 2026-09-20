#!/usr/bin/env bats
# Tests for check-typescript-hold.sh
#
# Ordered to follow main(): the environment guard first, then the decision,
# which is the part that has to be right. npm returns a range that excludes
# TypeScript 7 today, so the lift can only be proven with fixtures.
#
# The point of this script is to break a silence, so the tests care most
# about the two ways it could stay quiet when it should not: a range that
# has opened up, and a range it cannot read.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/check-typescript-hold.sh"
  unset GITHUB_OUTPUT
}

@test "errors when the peer range cannot be read" {
  # An empty PEER_RANGE falls through to npm, which is stubbed to fail.
  fetch_peer_range() { return 1; }

  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"Could not read typescript-eslint's typescript peer range"* ]]
}

@test "errors when npm returns an empty range" {
  fetch_peer_range() { echo ""; }

  run main

  [ "$status" -eq 1 ]
}

@test "stays quiet on the range typescript-eslint declares today" {
  export PEER_RANGE=">=4.8.4 <6.1.0"

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"Hold stands"* ]]
  [[ "$output" != *"now allows"* ]]
}

@test "reports when the range has opened up to the held major" {
  export PEER_RANGE=">=4.8.4 <8.0.0"

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"now allows TypeScript 7"* ]]
}

@test "treats an upper bound inside the held major as allowing it" {
  # 7.0.0 is below 7.1.0, so TS 7 is in range.
  export PEER_RANGE=">=4.8.4 <7.1.0"

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"now allows TypeScript 7"* ]]
}

@test "treats an upper bound at the held major as still excluding it" {
  # 7.0.0 is not below 7.0.0.
  export PEER_RANGE=">=4.8.4 <7.0.0"

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"Hold stands"* ]]
}

@test "takes the most permissive bound when the range is or-joined" {
  export PEER_RANGE=">=4.8.4 <6.1.0 || >=7.0.0 <8.0.0"

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"now allows TypeScript 7"* ]]
}

@test "reports a range with no upper bound at all" {
  export PEER_RANGE=">=4.8.4"

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"sets no upper"* ]]
}

@test "asks for a human when the range caps the major without a < bound" {
  # "^6.0.0" excludes TS 7, but nothing in it says "<". Reading that as
  # open-ended would cry wolf every month, so it says it cannot decide.
  export PEER_RANGE="^6.0.0"

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"Could not read"* ]]
  [[ "$output" == *"Check by hand"* ]]
}

@test "honours HELD_MAJOR when the held version moves on" {
  export PEER_RANGE=">=4.8.4 <8.0.0"
  export HELD_MAJOR=9

  run main

  [ "$status" -eq 0 ]
  [[ "$output" == *"Hold stands"* ]]
}

@test "writes nothing to the liftable output while the hold stands" {
  export PEER_RANGE=">=4.8.4 <6.1.0"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/output"
  : >"$GITHUB_OUTPUT"

  run main

  [ "$status" -eq 0 ]
  # The key is present but empty, which is what the workflow's `!= ''`
  # condition reads as "nothing to do".
  run cat "$GITHUB_OUTPUT"
  [[ "$output" == *"liftable<<TYPESCRIPT_HOLD_EOF"* ]]
  [[ "$output" != *"now allows"* ]]
}

@test "writes the report to the liftable output when the hold can go" {
  export PEER_RANGE=">=4.8.4 <8.0.0"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/output"
  : >"$GITHUB_OUTPUT"

  run main

  [ "$status" -eq 0 ]
  run cat "$GITHUB_OUTPUT"
  [[ "$output" == *"now allows TypeScript 7"* ]]
}

@test "refuses to write a report containing the output delimiter" {
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/output"
  : >"$GITHUB_OUTPUT"

  run publish_step_output "TYPESCRIPT_HOLD_EOF"

  [ "$status" -eq 1 ]
  [[ "$output" == *"refusing to write it"* ]]
}
