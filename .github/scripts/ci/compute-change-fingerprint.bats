#!/usr/bin/env bats
# Tests for compute-change-fingerprint.sh.
#
# Each test builds a small throwaway repository, so what is being checked is
# git's own behaviour on real commits: that a rebased copy of a change keeps
# its fingerprint and an edited one does not.

# shellcheck disable=SC2329

setup() {
  source "${BATS_TEST_DIRNAME}/compute-change-fingerprint.sh"

  REPO="${BATS_TEST_TMPDIR}/repo"
  git init -q -b main "$REPO"
  git -C "$REPO" config user.email "test@example.com"
  git -C "$REPO" config user.name "Test"
  printf 'one\ntwo\nthree\n' >"$REPO/app.txt"
  printf 'first\n' >"$REPO/other.txt"
  git -C "$REPO" add .
  git -C "$REPO" commit -q -m "base"
  BASE="$(git -C "$REPO" rev-parse HEAD)"

  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : >"$GITHUB_OUTPUT"
}

# Commits a change to app.txt on a new branch from <start>, and prints the head.
make_change() {
  local start="$1"
  local branch="$2"
  git -C "$REPO" switch -q -c "$branch" "$start"
  printf 'one\nTWO\nthree\n' >"$REPO/app.txt"
  git -C "$REPO" commit -q -am "the change"
  git -C "$REPO" rev-parse HEAD
}

@test "a rebased copy of the same change has the same fingerprint" {
  local head original rebased new_base
  head="$(make_change "$BASE" feature)"
  original="$(change_fingerprint "$REPO" "$BASE" "$head")"

  # main moves on in a file the change does not touch, and the change is
  # replayed on top: what happens to a stacked branch when the one below
  # merges.
  git -C "$REPO" switch -q main
  printf 'first\nsecond\n' >"$REPO/other.txt"
  git -C "$REPO" commit -q -am "main moves on"
  new_base="$(git -C "$REPO" rev-parse HEAD)"
  git -C "$REPO" switch -q feature
  git -C "$REPO" rebase -q main
  rebased="$(change_fingerprint "$REPO" "$new_base" "$(git -C "$REPO" rev-parse HEAD)")"

  [ -n "$original" ]
  [ "$original" = "$rebased" ]
}

@test "an edit to the change gives a different fingerprint" {
  local head before after
  head="$(make_change "$BASE" feature)"
  before="$(change_fingerprint "$REPO" "$BASE" "$head")"

  printf 'one\nTWO\nTHREE\n' >"$REPO/app.txt"
  git -C "$REPO" commit -q -am "a further edit"
  after="$(change_fingerprint "$REPO" "$BASE" "$(git -C "$REPO" rev-parse HEAD)")"

  [ "$before" != "$after" ]
}

@test "a change with no diff is fingerprinted as empty" {
  run change_fingerprint "$REPO" "$BASE" "$BASE"

  [ "$status" -eq 0 ]
  [ "$output" = "empty" ]
}

@test "fails on a commit that does not exist" {
  run change_fingerprint "$REPO" "$BASE" "0000000000000000000000000000000000000000"

  [ "$status" -eq 1 ]
  [[ "$output" == *"No commit"* ]]
}

@test "main writes the fingerprint to GITHUB_OUTPUT" {
  local head
  head="$(make_change "$BASE" feature)"

  run main "$REPO" "$BASE" "$head"

  [ "$status" -eq 0 ]
  grep -Eq '^change_fingerprint=[0-9a-f]{40}$' "$GITHUB_OUTPUT"
}

@test "main refuses to run without its three arguments" {
  run main "$REPO" "$BASE"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Usage"* ]]
}
