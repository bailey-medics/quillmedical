#!/usr/bin/env bats
# Tests for compute-destructive-migration-hash.sh

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/compute-destructive-migration-hash.sh"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : >"$GITHUB_OUTPUT"
}

MIGRATION_1="2026_08_28_1200-aabbccdd1111_test.py aabbccdd1111 drop_column"
MIGRATION_2="2026_08_25_1534-fa4401ce1b92_drop.py fa4401ce1b92 drop_column"

MIGRATION_1_DROP_TABLE="${MIGRATION_1/drop_column/drop_table}"

REPORT_ONE="$MIGRATION_1"

REPORT_TWO="$MIGRATION_1
$MIGRATION_2"

REPORT_TWO_REVERSED="$MIGRATION_2
$MIGRATION_1"

read_hash() {
  sed -n 's/^destructive_hash=//p' "$GITHUB_OUTPUT"
}

@test "errors when no report argument is given" {
  run main
  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage: compute-destructive-migration-hash.sh"* ]]
}

@test "errors when GITHUB_OUTPUT is not set" {
  unset GITHUB_OUTPUT

  run main "$REPORT_ONE"
  [ "$status" -eq 1 ]
  [[ "$output" == *"GITHUB_OUTPUT not set"* ]]
}

@test "writes destructive_hash to GITHUB_OUTPUT and checks is consistent" {
  run main "$REPORT_ONE"
  [ "$status" -eq 0 ]

  local hash
  hash="$(read_hash)"
  [ "$hash" = "0c0ff1036ac7914babe215f5b7f0fef1a93d4d0345d202e0a67d33e9efc276b5" ]
}

@test "the same migrations in a different order hash the same" {
  main "$REPORT_TWO"
  local forward
  forward="$(read_hash)"

  : >"$GITHUB_OUTPUT"
  main "$REPORT_TWO_REVERSED"
  local reversed
  reversed="$(read_hash)"

  [ "$forward" = "$reversed" ]
}

@test "adding a second destructive migration moves the hash" {
  main "$REPORT_ONE"
  local one
  one="$(read_hash)"

  : >"$GITHUB_OUTPUT"
  main "$REPORT_TWO"
  local two
  two="$(read_hash)"

  [ "$one" != "$two" ]
}

@test "a changed operation on the same migration moves the hash" {
  main "$REPORT_ONE"
  local before
  before="$(read_hash)"

  : >"$GITHUB_OUTPUT"
  main "$MIGRATION_1_DROP_TABLE"
  local after
  after="$(read_hash)"

  [ "$before" != "$after" ]
}
