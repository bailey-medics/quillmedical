#!/usr/bin/env bats
# Tests for collect-mirror-fell-back.sh

setup() {
  SCRIPT="${BATS_TEST_DIRNAME}/collect-mirror-fell-back.sh"
  LEGS="${BATS_TEST_TMPDIR}/legs"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/output"
  mkdir -p "$LEGS"
  : > "$GITHUB_OUTPUT"
}

@test "writes nothing when the directory is missing" {
  run bash "$SCRIPT" "${BATS_TEST_TMPDIR}/nowhere"

  [ "$status" -eq 0 ]
  [ ! -s "$GITHUB_OUTPUT" ]
}

@test "writes nothing when no leg left a file" {
  run bash "$SCRIPT" "$LEGS"

  [ "$status" -eq 0 ]
  [ ! -s "$GITHUB_OUTPUT" ]
}

@test "hands on one leg's list unchanged" {
  echo "postgres:18-alpine, caddy:2" > "${LEGS}/1"

  run bash "$SCRIPT" "$LEGS"

  [ "$status" -eq 0 ]
  [ "$(cat "$GITHUB_OUTPUT")" = "fell_back=postgres:18-alpine, caddy:2" ]
}

@test "names an image once when several legs fell back to it" {
  # The legs ask the same registry at much the same moment, so they
  # usually agree.
  echo "postgres:18-alpine" > "${LEGS}/1"
  echo "postgres:18-alpine" > "${LEGS}/2"
  echo "postgres:18-alpine" > "${LEGS}/3"

  run bash "$SCRIPT" "$LEGS"

  [ "$status" -eq 0 ]
  [ "$(cat "$GITHUB_OUTPUT")" = "fell_back=postgres:18-alpine" ]
}

@test "keeps a fallback only one leg saw" {
  # The case a plain matrix output loses: the last leg to write wins.
  echo "caddy:2" > "${LEGS}/2"
  : > "${LEGS}/3"

  run bash "$SCRIPT" "$LEGS"

  [ "$status" -eq 0 ]
  [ "$(cat "$GITHUB_OUTPUT")" = "fell_back=caddy:2" ]
}

@test "joins different images from different legs" {
  echo "postgres:18-alpine" > "${LEGS}/1"
  echo "caddy:2, postgres:18-alpine" > "${LEGS}/2"

  run bash "$SCRIPT" "$LEGS"

  [ "$status" -eq 0 ]
  [ "$(cat "$GITHUB_OUTPUT")" = "fell_back=postgres:18-alpine, caddy:2" ]
}

@test "reads files a download left in subdirectories" {
  mkdir -p "${LEGS}/e2e-mirror-fell-back-1"
  echo "caddy:2" > "${LEGS}/e2e-mirror-fell-back-1/fell-back.txt"

  run bash "$SCRIPT" "$LEGS"

  [ "$status" -eq 0 ]
  [ "$(cat "$GITHUB_OUTPUT")" = "fell_back=caddy:2" ]
}

@test "fails without a directory" {
  run bash "$SCRIPT"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}

@test "fails without GITHUB_OUTPUT" {
  unset GITHUB_OUTPUT

  run bash "$SCRIPT" "$LEGS"

  [ "$status" -eq 1 ]
  [[ "$output" == *"GITHUB_OUTPUT"* ]]
}
