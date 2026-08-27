#!/usr/bin/env bash
# Dedupes the "breaking API change" Slack notification against a sticky PR
# comment, so a PR that still has the same breaking change(s) after a new
# push doesn't re-trigger an identical Slack ping.
#
# Usage: GH_TOKEN=<token> dedup-breaking-change-notify.sh <pr-number> <hash>
#
# Looks for an existing marker comment on the PR (body starting with
# "<!-- breaking-api-change-hash: <hash> -->" on its own first line). If one
# exists and its recorded hash matches <hash>, the breaking-change set is
# unchanged since the last notification: should_notify=false is written and
# no API mutation happens. Otherwise (no marker yet, or the recorded hash
# differs) the marker comment is created or updated in place with the new
# hash and should_notify=true is written, so the caller knows to fire Slack.
#
# Environment:
#   GH_TOKEN             Token used by `gh` to authenticate. Set by the workflow.
#   GITHUB_OUTPUT         Destination file for `should_notify=<bool>` (set by the runner).
#   GITHUB_REPOSITORY    "owner/repo" (set by the runner).
#   GITHUB_SERVER_URL    Base URL, e.g. "https://github.com" (set by the runner).
#   GITHUB_RUN_ID        Current run id, used to link back to the workflow.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "dedup-breaking-change-notify"

MARKER_PREFIX="<!-- breaking-api-change-hash:"

# Build the sticky marker-comment body from the breaking-change hash ($1)
# and the run URL ($2). Pure (no I/O) so it can be tested.
build_body() {
  local hash="$1"
  local run_url="$2"

  cat <<EOF
${MARKER_PREFIX} ${hash} -->
**⚠️ Breaking API change tracking**

This comment tracks the current set of breaking API changes on this PR, so
the Slack notification only fires when that set changes rather than on
every push. It is updated in place — not appended to — whenever the
breaking changes here differ from the last notified set.

*Last updated by:* ${run_url}
EOF
}

# Find the existing marker comment (if any) in a newline-delimited stream of
# PR comment JSON objects ($1, e.g. from `gh api ... --jq '.[]'`). Prints
# "<id><TAB><hash>" for the first marker comment found, or nothing if none
# exists. Pure (no gh calls) so it can be tested without mocking gh.
find_marker_comment() {
  local comments_jsonl="$1"

  if [ -z "$comments_jsonl" ]; then
    return 0
  fi

  jq -rs --arg prefix "$MARKER_PREFIX" '
    [.[] | select(.body | startswith($prefix))] | first
    | select(. != null)
    | "\(.id)\t\(((.body | capture("^<!-- breaking-api-change-hash: (?<h>[0-9a-f]+) -->")) // {h: ""}) | .h)"
  ' <<<"$comments_jsonl"
}

main() {
  local pr_number="${1:-}"
  local hash="${2:-}"

  if [ -z "$pr_number" ]; then
    error "No pull request number provided. Usage: dedup-breaking-change-notify.sh <pr-number> <hash>"
    exit 1
  fi

  if [ -z "$hash" ]; then
    error "No breaking-change hash provided. Usage: dedup-breaking-change-notify.sh <pr-number> <hash>"
    exit 1
  fi

  if [ -z "${GH_TOKEN:-}" ]; then
    error "GH_TOKEN is not set; cannot authenticate with the GitHub CLI"
    exit 1
  fi

  if [ -z "${GITHUB_OUTPUT:-}" ]; then
    error "GITHUB_OUTPUT not set (not running in GitHub Actions?)"
    exit 1
  fi

  if [ -z "${GITHUB_REPOSITORY:-}" ]; then
    error "GITHUB_REPOSITORY not set (not running in GitHub Actions?)"
    exit 1
  fi

  local comments_jsonl
  comments_jsonl="$(gh api "repos/${GITHUB_REPOSITORY}/issues/${pr_number}/comments" --paginate --jq '.[]')"

  local marker existing_id="" existing_hash=""
  marker="$(find_marker_comment "$comments_jsonl")"
  if [ -n "$marker" ]; then
    existing_id="$(cut -f1 <<<"$marker")"
    existing_hash="$(cut -f2 <<<"$marker")"
  fi

  if [ -n "$existing_id" ] && [ "$existing_hash" = "$hash" ]; then
    log "Breaking-change set unchanged (hash $hash already notified on comment #$existing_id) — skipping Slack notification."
    echo "should_notify=false" >>"$GITHUB_OUTPUT"
    return 0
  fi

  local run_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
  local body
  body="$(build_body "$hash" "$run_url")"

  if [ -n "$existing_id" ]; then
    log "Breaking-change set changed (was $existing_hash, now $hash) — updating marker comment #$existing_id."
    printf '%s' "$body" | gh api -X PATCH "repos/${GITHUB_REPOSITORY}/issues/comments/${existing_id}" -f body=@-
  else
    log "No existing marker comment — creating one on PR #$pr_number for hash $hash."
    printf '%s' "$body" | gh pr comment "$pr_number" --body-file -
  fi

  echo "should_notify=true" >>"$GITHUB_OUTPUT"
}

# Only run when executed directly, so bats can source the pure functions.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
