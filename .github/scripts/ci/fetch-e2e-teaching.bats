#!/usr/bin/env bats
# Tests for fetch-e2e-teaching.sh
#
# Against a local repository standing in for respiratory-teaching, so the
# suite needs no network. The pin itself is checked for shape only: whether
# GitHub still has that commit is what the E2E job finds out.

# shellcheck disable=SC2329

setup() {
  source "${BATS_TEST_DIRNAME}/fetch-e2e-teaching.sh"
  SOURCE_REPO="${BATS_TEST_TMPDIR}/source"
  DEST="${BATS_TEST_TMPDIR}/dest/respiratory-teaching"

  git init -q -b main "$SOURCE_REPO"
  git -C "$SOURCE_REPO" config user.email "ci@example.com"
  git -C "$SOURCE_REPO" config user.name "CI"
  # GitHub serves any reachable commit by its id; a local repository only
  # does when told to
  # cspell:disable-next-line
  git -C "$SOURCE_REPO" config uploadpack.allowReachableSHA1InWant true

  mkdir -p "$SOURCE_REPO/modules/chest-xray"
  echo "moduleId: chest-xray" >"$SOURCE_REPO/modules/chest-xray/module.yaml"
  git -C "$SOURCE_REPO" add .
  git -C "$SOURCE_REPO" commit -qm "first"
  FIRST_SHA="$(git -C "$SOURCE_REPO" rev-parse HEAD)"

  echo "version: 2" >>"$SOURCE_REPO/modules/chest-xray/module.yaml"
  git -C "$SOURCE_REPO" commit -qam "second"
  SECOND_SHA="$(git -C "$SOURCE_REPO" rev-parse HEAD)"
}

@test "checks out the requested commit" {
  run fetch_commit "file://$SOURCE_REPO" "$FIRST_SHA" "$DEST"

  [ "$status" -eq 0 ]
  [ "$(git -C "$DEST" rev-parse HEAD)" = "$FIRST_SHA" ]
  [ -f "$DEST/modules/chest-xray/module.yaml" ]
  [[ "$output" == *"Fetched ${FIRST_SHA:0:7}"* ]]
}

@test "checks out a commit that is not the branch tip" {
  # The pin is usually behind main by the time anyone reads it
  run fetch_commit "file://$SOURCE_REPO" "$FIRST_SHA" "$DEST"

  [ "$status" -eq 0 ]
  ! grep -q "version: 2" "$DEST/modules/chest-xray/module.yaml"
}

@test "leaves a checkout at the pinned commit alone, with no fetch" {
  fetch_commit "file://$SOURCE_REPO" "$SECOND_SHA" "$DEST"
  touch "$DEST/marker"

  # An address that cannot be reached: a fetch would fail the run
  run fetch_commit "file://${BATS_TEST_TMPDIR}/nowhere" "$SECOND_SHA" "$DEST"

  [ "$status" -eq 0 ]
  [[ "$output" == *"Already at ${SECOND_SHA:0:7}"* ]]
  [ -f "$DEST/marker" ]
}

@test "replaces a checkout at another commit" {
  fetch_commit "file://$SOURCE_REPO" "$FIRST_SHA" "$DEST"
  touch "$DEST/stale"

  run fetch_commit "file://$SOURCE_REPO" "$SECOND_SHA" "$DEST"

  [ "$status" -eq 0 ]
  [ "$(git -C "$DEST" rev-parse HEAD)" = "$SECOND_SHA" ]
  [ ! -e "$DEST/stale" ]
}

@test "replaces a directory that is not a checkout" {
  mkdir -p "$DEST"
  touch "$DEST/leftover"

  run fetch_commit "file://$SOURCE_REPO" "$FIRST_SHA" "$DEST"

  [ "$status" -eq 0 ]
  [ "$(git -C "$DEST" rev-parse HEAD)" = "$FIRST_SHA" ]
  [ ! -e "$DEST/leftover" ]
}

@test "fails, and leaves nothing behind, when the commit does not exist" {
  run fetch_commit "file://$SOURCE_REPO" \
    "0000000000000000000000000000000000000000" "$DEST"

  [ "$status" -ne 0 ]
  [[ "$output" == *"Could not fetch 0000000"* ]]
  [ ! -e "$DEST" ]
}

@test "opens a checkout for every user to write to" {
  fetch_commit "file://$SOURCE_REPO" "$FIRST_SHA" "$DEST"
  chmod -R go-w "$DEST"

  run open_for_uploads "$DEST"

  [ "$status" -eq 0 ]
  [ "$(stat -c '%a' "$DEST/modules/chest-xray")" = "777" ]
  [ "$(stat -c '%a' "$DEST/modules/chest-xray/module.yaml")" = "666" ]
}

@test "leaves alone, without failing, what another user wrote there" {
  # On a Linux host the stack's backend writes its uploads as its own
  # user, and a chmod of those failed every run after the first. Here
  # `id` says the caller is somebody else, so nothing in the checkout is
  # theirs.
  fetch_commit "file://$SOURCE_REPO" "$FIRST_SHA" "$DEST"
  chmod -R go-w "$DEST"
  mkdir -p "$BATS_TEST_TMPDIR/bin"
  printf '#!/bin/sh\necho 64999\n' >"$BATS_TEST_TMPDIR/bin/id"
  chmod +x "$BATS_TEST_TMPDIR/bin/id"

  PATH="$BATS_TEST_TMPDIR/bin:$PATH" run open_for_uploads "$DEST"

  [ "$status" -eq 0 ]
  [ "$(stat -c '%a' "$DEST/modules/chest-xray/module.yaml")" = "644" ]
}

@test "opening a checkout for uploads leaves git seeing no change" {
  fetch_commit "file://$SOURCE_REPO" "$FIRST_SHA" "$DEST"

  open_for_uploads "$DEST"

  [ -z "$(git -C "$DEST" status --porcelain)" ]
}

@test "pins a full commit id, not a branch" {
  [[ "$PINNED_SHA" =~ ^[0-9a-f]{40}$ ]]
}

@test "fetches from the public respiratory-teaching repository" {
  # Public, so CI needs no token to fetch it
  [ "$REPO_URL" = "https://github.com/bailey-medics/respiratory-teaching.git" ]
}
