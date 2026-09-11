#!/usr/bin/env bash
# Resolves the base commit that the checked-out pull-request ref was actually
# merged onto, so the API schema diff compares like with like.
#
# Usage: resolve-pr-base-sha.sh <pr-checkout-dir>
#
# Environment:
#   GITHUB_OUTPUT  Destination file for `base_sha=<sha>` (set by the runner).
#
# On a `pull_request` event actions/checkout checks out `refs/pull/N/merge` -
# GitHub's cached merge of the pull request's head into its base branch.
# GitHub rebuilds that ref lazily, so it can sit well behind a base branch
# that has moved since. Diffing it against a *live* `main` checkout therefore
# compares two different points of main's own history, and every addition
# main gained in between reads as a removal by the pull request.
#
# That is not hypothetical: on pull request #547 the merge ref was four hours
# stale, main had gained `clinical_lead_id` in the meantime, and the gate
# reported the pull request as removing it - failing validation, paging Slack
# and demanding an approval, for a dependency bump that touched no API code.
#
# The merge ref carries the answer itself. GitHub writes it as
# "Merge <head> into <base>", parents in that same order, so its *first*
# parent is exactly the base commit the diffed tree was built on. Taking the
# base from there makes both sides of the diff share one point of history by
# construction, leaving only what the pull request itself changed.
#
# `github.event.pull_request.base.sha` looks like the same thing and is not:
# on #547 it was `ffe4676` while the merge ref's parent was `740b448`, so
# trusting it would have reproduced the very false positive this replaces.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "resolve-pr-base-sha"

# Prints the first parent of HEAD in <repo-dir>.
#
# Refuses anything that is not a two-parent merge. A pull-request checkout is
# always one; a single-parent HEAD means the merge ref was not what got
# checked out, and its "first parent" would be the previous commit on the
# branch - a wrong base that still produces a plausible-looking diff, so it
# would quietly under-report breaking changes rather than fail. Fail loudly
# instead.
resolve_base_sha() {
  local repo_dir="$1"
  local parents
  local -a fields

  if ! parents="$(git -C "$repo_dir" rev-list --parents -n 1 HEAD 2>/dev/null)"; then
    error "Could not read HEAD in '$repo_dir' - is it a git checkout?"
    return 1
  fi

  # rev-list --parents prints "<commit> <parent>...", so a merge gives three
  # fields and an ordinary commit two.
  read -r -a fields <<<"$parents"

  if [ "${#fields[@]}" -ne 3 ]; then
    error "HEAD in '$repo_dir' has $((${#fields[@]} - 1)) parent(s), expected 2."
    error "Expected GitHub's pull-request merge ref (refs/pull/N/merge)."
    error "Refusing to guess a base commit - a wrong base mis-reports the API diff."
    return 1
  fi

  echo "${fields[1]}"
}

main() {
  local pr_dir="${1:-}"

  if [ -z "$pr_dir" ]; then
    error "No pull request checkout given. Usage: resolve-pr-base-sha.sh <pr-checkout-dir>"
    exit 1
  fi

  if [ ! -d "$pr_dir" ]; then
    error "Pull request checkout directory not found: $pr_dir"
    exit 1
  fi

  if [ -z "${GITHUB_OUTPUT:-}" ]; then
    error "GITHUB_OUTPUT not set (not running in GitHub Actions?)"
    exit 1
  fi

  local base_sha
  base_sha="$(resolve_base_sha "$pr_dir")" || exit 1

  log "Pull request ref was merged onto base commit: $base_sha"
  echo "base_sha=$base_sha" >>"$GITHUB_OUTPUT"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
