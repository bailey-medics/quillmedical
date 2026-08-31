#!/usr/bin/env bats
# Tests for run-shell-tests.sh
#
# bats itself is stubbed, so these exercise the wrapper's own decisions —
# which output it treats as a failure — without recursively running the
# real suite.

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/run-shell-tests.sh"
  TARGET="${BATS_TEST_TMPDIR}/scripts"
  mkdir -p "$TARGET"

  STUB_DIR="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "$STUB_DIR"
  PATH="${STUB_DIR}:${PATH}"
}

# Writes a fake bats that prints $1 and exits with $2.
stub_bats() {
  local output="$1" exit_code="$2"
  cat > "${STUB_DIR}/bats" <<EOF
#!/usr/bin/env bash
echo "${output}"
exit ${exit_code}
EOF
  chmod +x "${STUB_DIR}/bats"
}

@test "fails when the target directory does not exist" {
  stub_bats "ok 1 a test" 0
  run bash "$SCRIPT" "${BATS_TEST_TMPDIR}/absent"
  [ "$status" -eq 1 ]
  [[ "$output" == *"Test directory not found"* ]]
}

@test "passes when tests pass with no warnings" {
  stub_bats "ok 1 a test" 0
  run bash "$SCRIPT" "$TARGET"
  [ "$status" -eq 0 ]
}

@test "propagates a genuine test failure" {
  stub_bats "not ok 1 a test" 1
  run bash "$SCRIPT" "$TARGET"
  [ "$status" -eq 1 ]
  [[ "$output" == *"test failures"* ]]
}

@test "fails on BW01, which bats itself exits 0 on" {
  stub_bats "BW01: Using flags on \`run\` is deprecated" 0
  run bash "$SCRIPT" "$TARGET"
  [ "$status" -eq 1 ]
  [[ "$output" == *"passing vacuously"* ]]
}

@test "fails on BW02, which bats itself exits 0 on" {
  stub_bats "BW02: Using flags on \`run\` requires at least BATS_VERSION=1.5.0" 0
  run bash "$SCRIPT" "$TARGET"
  [ "$status" -eq 1 ]
  [[ "$output" == *"passing vacuously"* ]]
}

@test "the failure says how to fix it, not how to silence it" {
  stub_bats "BW02: something" 0
  run bash "$SCRIPT" "$TARGET"
  [[ "$output" == *"run ! cmd"* ]]
  [[ "$output" == *"bats_require_minimum_version 1.5.0"* ]]
}

@test "the offending warning line is echoed so it can be found" {
  stub_bats "BW02: in test file some/file.bats, line 42" 0
  run bash "$SCRIPT" "$TARGET"
  [[ "$output" == *"some/file.bats, line 42"* ]]
}

@test "a test name mentioning a warning code is not itself a warning" {
  # Real warnings start the line with the code; a passing test that merely
  # names one must not fail the build.
  stub_bats "ok 1 bare ! not last (BW01)" 0
  run bash "$SCRIPT" "$TARGET"
  [ "$status" -eq 0 ]
}

@test "a future warning code is caught too, not just BW01 and BW02" {
  stub_bats "BW03: some warning bats has not invented yet" 0
  run bash "$SCRIPT" "$TARGET"
  [ "$status" -eq 1 ]
}
