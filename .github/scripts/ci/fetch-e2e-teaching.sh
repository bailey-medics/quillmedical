#!/usr/bin/env bash
# Fetch the teaching content the end-to-end tests run against.
#
# compose.ci.yml mounts .e2e-teaching/ at /teaching-repos, and
# backend/scripts/seed_ci.py syncs every module it finds there into the CI
# organisation and opens it. Without this the CI teaching dashboard is empty,
# and nothing past it (a module page, a lecture) can be tested.
#
# respiratory-teaching, because it is public: CI clones it without a token.
# Pinned to a commit rather than main, so a content change cannot break
# Quill's CI on a pull request that touched no teaching code. Move the pin
# deliberately when the tests need newer content.
#
# Used by the heavy_e2e job in .github/workflows/ci.yml and by `just e2e`,
# so a local run tests the same content CI does. Safe to re-run: it does
# not fetch again when the pinned commit is already checked out.
#
# The checkout is left writable by anyone, because a video uploaded in the
# stack is saved beside the module's content, as it is wherever content is
# on disk. The backend runs as its own unprivileged user, so on a Linux
# host it could write to neither a folder the runner made nor one Docker
# made. Test machines only: App production keeps uploads in a bucket.
#
# Usage: fetch-e2e-teaching.sh

set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "fetch-e2e-teaching"

REPO_URL="https://github.com/bailey-medics/respiratory-teaching.git"
PINNED_SHA="3165ba07136af56591bff8853d4c2a95554da97e"

# Check out one commit of a repository into a directory, with no history.
#
# Leaves an existing checkout alone when it is already at that commit, so a
# re-run needs no network. Anything else in the directory is replaced: it is
# a download, never somewhere work is kept.
#
# Args: <repo-url> <sha> <dest>
fetch_commit() {
  local repo_url="$1" sha="$2" dest="$3"

  if [[ "$(git -C "$dest" rev-parse HEAD 2>/dev/null || true)" == "$sha" ]]; then
    log "Already at ${sha:0:7}"
    return 0
  fi

  rm -rf "$dest"
  mkdir -p "$dest"
  git -C "$dest" init -q
  if ! git -C "$dest" fetch -q --depth 1 "$repo_url" "$sha"; then
    error "Could not fetch ${sha:0:7} from ${repo_url}"
    rm -rf "$dest"
    return 1
  fi
  git -C "$dest" -c advice.detachedHead=false checkout -q FETCH_HEAD
  log "Fetched ${sha:0:7}"
}

# Let every user write anywhere under a checkout, so the stack's backend
# can save an upload beside the content. Files that are executable stay
# so and no others become so, which leaves git seeing no change.
#
# Args: <dest>
open_for_uploads() {
  local dest="$1"

  chmod -R a+rwX "$dest"
  log "Open for uploads"
}

main() {
  local root
  local dest

  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
  dest="${root}/.e2e-teaching/respiratory-teaching"

  fetch_commit "$REPO_URL" "$PINNED_SHA" "$dest"
  open_for_uploads "$dest"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
