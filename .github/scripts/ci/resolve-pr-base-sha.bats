#!/usr/bin/env bats
# Tests for resolve-pr-base-sha.sh
#
# Ordered to follow main(): the argument and environment guards first, then
# the resolution itself.

# shellcheck disable=SC2329,SC2030,SC2031

setup() {
  source "${BATS_TEST_DIRNAME}/resolve-pr-base-sha.sh"
  export GITHUB_OUTPUT="${BATS_TEST_TMPDIR}/github_output"
  : >"$GITHUB_OUTPUT"
}

# Builds a repository shaped like a pull-request merge ref: a base branch, a
# feature branch off an earlier point, and a merge of the feature INTO the
# base - so HEAD's first parent is the base and its second is the head, the
# order GitHub writes refs/pull/N/merge in.
#
# Echoes "<base-sha> <head-sha>".
make_merge_ref_repo() {
  local repo="$1"
  local base_sha head_sha

  git init -q -b main "$repo"
  git -C "$repo" config user.email "ci@example.com"
  git -C "$repo" config user.name "CI"

  echo "one" >"$repo/file.txt"
  git -C "$repo" add file.txt
  git -C "$repo" commit -qm "first"

  # The feature branch leaves here, so the base can move on independently.
  git -C "$repo" checkout -qb feature
  echo "feature" >"$repo/feature.txt"
  git -C "$repo" add feature.txt
  git -C "$repo" commit -qm "feature work"
  head_sha="$(git -C "$repo" rev-parse HEAD)"

  git -C "$repo" checkout -q main
  echo "two" >>"$repo/file.txt"
  git -C "$repo" add file.txt
  git -C "$repo" commit -qm "base moves on"
  base_sha="$(git -C "$repo" rev-parse HEAD)"

  git -C "$repo" merge -q --no-ff -m "Merge feature into main" feature

  echo "$base_sha $head_sha"
}

# Builds a repository whose HEAD is an ordinary single-parent commit.
make_linear_repo() {
  local repo="$1"

  git init -q -b main "$repo"
  git -C "$repo" config user.email "ci@example.com"
  git -C "$repo" config user.name "CI"

  echo "one" >"$repo/file.txt"
  git -C "$repo" add file.txt
  git -C "$repo" commit -qm "first"
  echo "two" >>"$repo/file.txt"
  git -C "$repo" add file.txt
  git -C "$repo" commit -qm "second"
}

@test "errors when no checkout directory is given" {
  run main

  [ "$status" -eq 1 ]
  [[ "$output" == *"No pull request checkout given"* ]]
}

@test "errors when the checkout directory does not exist" {
  run main "${BATS_TEST_TMPDIR}/nope"

  [ "$status" -eq 1 ]
  [[ "$output" == *"directory not found"* ]]
}

@test "errors when GITHUB_OUTPUT is not set" {
  local repo="${BATS_TEST_TMPDIR}/repo"
  make_merge_ref_repo "$repo" >/dev/null
  unset GITHUB_OUTPUT

  run main "$repo"

  [ "$status" -eq 1 ]
  [[ "$output" == *"GITHUB_OUTPUT not set"* ]]
}

@test "resolve_base_sha returns the merge's first parent" {
  local repo="${BATS_TEST_TMPDIR}/repo"
  local shas base_sha
  shas="$(make_merge_ref_repo "$repo")"
  base_sha="${shas%% *}"

  run resolve_base_sha "$repo"

  [ "$status" -eq 0 ]
  [ "$output" = "$base_sha" ]
}

@test "resolve_base_sha picks the base, never the pull request head" {
  # The whole point: parent 1 is the base branch, parent 2 is the branch under
  # review. Returning the head would diff the branch against itself.
  local repo="${BATS_TEST_TMPDIR}/repo"
  local shas head_sha
  shas="$(make_merge_ref_repo "$repo")"
  head_sha="${shas##* }"

  run resolve_base_sha "$repo"

  [ "$status" -eq 0 ]
  [ "$output" != "$head_sha" ]
}

@test "resolve_base_sha refuses a HEAD that is not a merge" {
  # A single-parent HEAD means the merge ref was not what got checked out.
  local repo="${BATS_TEST_TMPDIR}/repo"
  make_linear_repo "$repo"

  run resolve_base_sha "$repo"

  [ "$status" -eq 1 ]
  [[ "$output" == *"has 1 parent(s), expected 2"* ]]
}

@test "resolve_base_sha errors when the directory is not a git checkout" {
  local repo="${BATS_TEST_TMPDIR}/plain"
  mkdir -p "$repo"

  run resolve_base_sha "$repo"

  [ "$status" -eq 1 ]
  [[ "$output" == *"Could not read HEAD"* ]]
}

@test "writes base_sha to GITHUB_OUTPUT" {
  local repo="${BATS_TEST_TMPDIR}/repo"
  local shas base_sha
  shas="$(make_merge_ref_repo "$repo")"
  base_sha="${shas%% *}"

  run main "$repo"

  [ "$status" -eq 0 ]
  [[ "$output" == *"merged onto base commit: $base_sha"* ]]
  grep -qx "base_sha=$base_sha" "$GITHUB_OUTPUT"
}

@test "a non-merge HEAD fails main rather than writing a guessed base" {
  local repo="${BATS_TEST_TMPDIR}/repo"
  make_linear_repo "$repo"

  run main "$repo"

  [ "$status" -eq 1 ]
  [ ! -s "$GITHUB_OUTPUT" ]
}
