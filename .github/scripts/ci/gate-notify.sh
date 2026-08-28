#!/usr/bin/env bash
# Decides whether a PR still needs a Slack message about its current
# change-set: one message per pull request per distinct set of findings.
#
# Usage: GH_TOKEN=<token> gate-notify.sh <marker-key> <pr-number> <hash> <title>
#
# Arguments:
#   marker-key   Identifies which gate is asking (e.g. "breaking-api-change-hash",
#                "db-destructive-migration-hash"), so several gates can each keep
#                their own record on the same PR without colliding.
#   pr-number    Pull request number.
#   hash         Hash identifying the current change-set (from compute-*-hash.sh).
#   title        Human-readable subject for the record comment (e.g. "Breaking API
#                change", "Destructive database migration").
#
# The PR carries a sticky comment recording what was last announced for this
# gate, marked "<!-- <marker-key>: <hash> -->" on its own first line. If that
# record already names <hash>, this change-set has been announced:
# should_notify=false is written and nothing is mutated. Otherwise (no record
# yet, or a different hash) the record is created or updated in place with the
# new hash and should_notify=true is written, so the caller sends the message.
#
# The record is a PR comment rather than actions/cache because cache entries are
# branch/key-scoped, evict after inactivity, and cannot be overwritten in place,
# whereas a comment persists indefinitely and doubles as a visible audit trail.
#
# Environment:
#   GH_TOKEN             Token used by `gh` to authenticate. Set by the workflow.
#   GITHUB_OUTPUT        Destination file for `should_notify=<bool>` (set by the runner).
#   GITHUB_REPOSITORY    "owner/repo" (set by the runner).
#   GITHUB_SERVER_URL    Base URL, e.g. "https://github.com" (set by the runner).
#   GITHUB_RUN_ID        Current run id, used to link back to the workflow.
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "gate-notify"

# Build the sticky record-comment body from the marker key, hash, run URL,
# and title. Pure (no I/O) so it can be tested.
build_body() {
  local marker_key="$1"
  local hash="$2"
  local run_url="$3"
  local title="$4"

  # The output of this function is captured in main.
  cat <<EOF
<!-- ${marker_key}: ${hash} -->
**⚠️ ${title}**

This comment records what was last announced to Slack for this pull request,
so the same finding is raised once rather than on every push. It is updated
in place — never appended to — whenever the finding changes.

*Last updated by:* ${run_url}
EOF
}

# Count the record comments for ($2) in a newline-delimited stream of PR
# comment JSON objects ($1). Normally 0 or 1 - anything higher means a record
# was created outside this script. Pure (no gh calls) so it can be tested.
count_marker_comments() {
  local comments_jsonl="$1"
  local marker_key="$2"

  jq -rs --arg prefix "<!-- ${marker_key}:" \
    '[.[] | select(.body | startswith($prefix))] | length' <<<"$comments_jsonl"
}

# Find the existing marker comment (if any) in a newline-delimited stream of
# PR comment JSON objects ($1, e.g. from `gh api ... --jq '.[]'`). The marker
# key is passed in $2. Prints "<id><TAB><hash>" for the first marker comment
# found, or nothing if none exists. Pure (no gh calls) so it can be tested.
find_marker_comment() {
  local comments_jsonl="$1"
  local marker_key="$2"

  if [ -z "$comments_jsonl" ]; then
    return 0
  fi

  jq -rs --arg prefix "<!-- ${marker_key}:" --arg key "$marker_key" '
    [.[] | select(.body | startswith($prefix))] | first
    | select(. != null)
    | "\(.id)\t\(((.body | capture("^<!-- " + $key + ": (?<h>[0-9a-f]+) -->")) // {h: ""}) | .h)"
  ' <<<"$comments_jsonl"
}

main() {
  local marker_key="${1:-}"
  local pr_number="${2:-}"
  local hash="${3:-}"
  local title="${4:-}"

  if [ -z "$marker_key" ]; then
    error "No marker key provided. Usage: gate-notify.sh <marker-key> <pr-number> <hash> <title>"
    exit 1
  fi

  if [ -z "$pr_number" ]; then
    error "No pull request number provided. Usage: gate-notify.sh <marker-key> <pr-number> <hash> <title>"
    exit 1
  fi

  if [ -z "$hash" ]; then
    error "No hash provided. Usage: gate-notify.sh <marker-key> <pr-number> <hash> <title>"
    exit 1
  fi

  if [ -z "$title" ]; then
    error "No title provided. Usage: gate-notify.sh <marker-key> <pr-number> <hash> <title>"
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

  # Defence in depth: this script only ever updates a marker in place, so a
  # second marker for the same key means something outside it created one
  # (a copy-pasted comment, a hand-edit).
  local duplicate_count
  duplicate_count="$(count_marker_comments "$comments_jsonl" "$marker_key")"

  if [ "$duplicate_count" -gt 1 ]; then
    log "WARNING: found $duplicate_count '$marker_key' marker comments on PR #$pr_number; expected at most one."
    log "WARNING: markers are updated in place, so duplicates were not created by this gate - clean them up by hand."
    log "WARNING: continuing with the first marker found."
  fi

  local marker
  local existing_id=""
  local existing_hash=""
  marker="$(find_marker_comment "$comments_jsonl" "$marker_key")"

  if [ -n "$marker" ]; then
    existing_id="$(cut -f1 <<<"$marker")"
    existing_hash="$(cut -f2 <<<"$marker")"
  fi

  if [ -n "$existing_id" ] && [ "$existing_hash" = "$hash" ]; then
    log "Change-set unchanged (hash $hash already notified on comment #$existing_id) — skipping Slack notification."
    echo "should_notify=false" >>"$GITHUB_OUTPUT"
    return 0
  fi

  local run_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
  local body
  body="$(build_body "$marker_key" "$hash" "$run_url" "$title")"

  if [ -n "$existing_id" ]; then
    log "Change-set changed (was $existing_hash, now $hash) — updating marker comment #$existing_id."
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
