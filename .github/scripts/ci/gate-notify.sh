#!/usr/bin/env bash
# Decides whether a PR still needs a Slack message about its current
# change-set: one message per pull request per distinct set of findings.
#
# Usage: GH_TOKEN=<token> gate-notify.sh <marker-key> <pr-number> <hash> <message> <all-clear-message>
#
# Arguments:
#   marker-key   Identifies which gate is asking (e.g. "breaking-api-change-hash",
#                "db-destructive-migration-hash"), so several gates can each keep
#                their own record on the same PR without colliding.
#   pr-number    Pull request number.
#   hash         Hash identifying the current change-set (from compute-*-hash.sh),
#                or the literal "none" when the caller found nothing. "No
#                findings" is a state like any other, so a PR that had findings
#                and no longer does records that too.
#   message      The comment body when there is a finding, supplied by the
#                caller so this script stays gate-agnostic. Written in GitHub
#                markdown; see to-slack-mrkdwn.sh for how the same text reaches
#                Slack.
#   all-clear-message
#                The comment body when the findings have gone. A separate
#                string rather than something derived from the first, so each
#                gate can name what went away in its own words.
#
# Every change-set announced to Slack leaves a comment on the PR, marked
# "<!-- <marker-key>: <hash> -->" on its own first line. If this gate's
# *newest* comment already carries this exact marker, nothing has changed
# since it was written: should_notify=false and nothing is mutated. Otherwise
# a new comment is added and should_notify=true, so the caller sends the
# message.
#
# Comments are added, never edited, and only the newest is consulted, so the
# conversation reads as a timeline: each comment sits among the commits that
# produced that change-set, and moving back to an earlier change-set counts as
# a change like any other rather than being silently swallowed.
#
# A PR that had findings and now has none gets a comment too: "none" is just
# another state, so the transition to it differs from the last announcement
# like any other. The one case that stays silent is a PR where this gate has
# never spoken - a clean PR should not collect an all-clear for a finding it
# never had.
#
# Whether Slack is also told is the caller's decision, not this script's. The
# workflow gates its notify job on "the caller found something" as well as
# should_notify, so a return to clean records itself on the PR without paging
# anyone. The approval gate is unaffected throughout; it re-blocks on every
# push for as long as a finding is present.
#
# The record is a PR comment rather than actions/cache because cache entries are
# branch/key-scoped and evict after inactivity, whereas a comment persists
# indefinitely and doubles as a visible audit trail.
#
# Reading the comments and then writing one is NOT atomic - the GitHub API has
# no compare-and-swap - so two runs doing it at once would both read "nothing
# recorded yet" and both post. This script does not defend itself against that;
# the caller must ensure only one run reaches it at a time. In gate-breaking.yml
# that is wait-for-ancestor-decisions.sh, which also makes the comments land in
# commit order.
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

# The hash a caller passes when it found nothing. A real hash is 64 hex
# characters, so this cannot collide with one.
readonly NO_FINDINGS="none"

# Build the announcement comment body. The caller's message carries the
# finding itself; the marker line and run link are added around it. Pure (no
# I/O) so it can be tested.
build_body() {
  local marker_key="$1"
  local hash="$2"
  local run_url="$3"
  local message="$4"
  local all_clear_message="$5"

  local body="$message"
  if [ "$hash" = "$NO_FINDINGS" ]; then
    body="$all_clear_message"
  fi

  # The output of this function is captured in main.
  cat <<EOF
<!-- ${marker_key}: ${hash} -->
${body}

*Added by:* ${run_url}
EOF
}

# Whether this gate has ever commented on the PR, given a newline-delimited
# stream of PR comment JSON objects ($1). Prints "true" or "false". Used only
# to keep a clean PR clean: with no prior comment there is no finding to
# report the disappearance of. Pure (no gh calls) so it can be tested.
gate_has_commented() {
  local comments_jsonl="$1"
  local marker_key="$2"

  jq -rs --arg prefix "<!-- ${marker_key}: " \
    '[.[] | select(.body | startswith($prefix))] | length > 0' <<<"$comments_jsonl"
}

# Whether this gate's most recent announcement on the PR is for this exact
# change-set, given a newline-delimited stream of PR comment JSON objects
# ($1). Prints "true" or "false" - "false" when the gate has never spoken on
# this PR. Pure (no gh calls) so it can be tested.
#
# Only the newest marker comment is consulted, never the whole set. A
# change-set the PR held earlier but has since moved away from is therefore
# not "already announced": going back to it is a change like any other and
# gets its own comment, so the conversation reads as a true timeline.
#
# max_by(.id) rather than the last element of the list, so the answer does not
# depend on the order the API happened to return the comments in. GitHub does
# sort them oldest-first, but comment ids are monotonic, which is a stronger
# guarantee for free.
latest_announcement_matches() {
  local comments_jsonl="$1"
  local marker_key="$2"
  local hash="$3"

  jq -rs \
    --arg prefix "<!-- ${marker_key}: " \
    --arg marker "<!-- ${marker_key}: ${hash} -->" '
    [.[] | select(.body | startswith($prefix))]
    | if length == 0 then false else (max_by(.id).body | startswith($marker)) end
  ' <<<"$comments_jsonl"
}

main() {
  local marker_key="${1:-}"
  local pr_number="${2:-}"
  local hash="${3:-}"
  local message="${4:-}"
  local all_clear_message="${5:-}"

  if [ -z "$marker_key" ]; then
    error "No marker key provided. Usage: gate-notify.sh <marker-key> <pr-number> <hash> <message> <all-clear-message>"
    exit 1
  fi

  if [ -z "$pr_number" ]; then
    error "No pull request number provided. Usage: gate-notify.sh <marker-key> <pr-number> <hash> <message> <all-clear-message>"
    exit 1
  fi

  if [ -z "$hash" ]; then
    error "No hash provided. Usage: gate-notify.sh <marker-key> <pr-number> <hash> <message> <all-clear-message>"
    exit 1
  fi

  if [ -z "$message" ]; then
    error "No message provided. Usage: gate-notify.sh <marker-key> <pr-number> <hash> <message> <all-clear-message>"
    exit 1
  fi

  if [ -z "$all_clear_message" ]; then
    error "No all-clear message provided. Usage: gate-notify.sh <marker-key> <pr-number> <hash> <message> <all-clear-message>"
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

  # A clean PR this gate has never commented on has nothing to report the
  # disappearance of, so it stays clean.
  if [ "$hash" = "$NO_FINDINGS" ] && [ "$(gate_has_commented "$comments_jsonl" "$marker_key")" = "false" ]; then
    log "Nothing found and '$marker_key' has never commented on PR #$pr_number — nothing to record."
    echo "should_notify=false" >>"$GITHUB_OUTPUT"
    return 0
  fi

  local unchanged
  unchanged="$(latest_announcement_matches "$comments_jsonl" "$marker_key" "$hash")"

  if [ "$unchanged" = "true" ]; then
    log "State $hash is already the latest announcement on PR #$pr_number — nothing to record."
    echo "should_notify=false" >>"$GITHUB_OUTPUT"
    return 0
  fi

  local run_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
  local body
  body="$(build_body "$marker_key" "$hash" "$run_url" "$message" "$all_clear_message")"

  if [ "$hash" = "$NO_FINDINGS" ]; then
    log "Findings have gone from PR #$pr_number — recording that on the PR."
  else
    log "New change-set $hash — adding a comment to PR #$pr_number."
  fi

  printf '%s' "$body" | gh pr comment "$pr_number" --body-file -

  # Whether this also reaches Slack is the caller's call: the notify job is
  # gated on the caller having found something, so an all-clear stays on the PR.
  echo "should_notify=true" >>"$GITHUB_OUTPUT"
}

# Only run when executed directly, so bats can source the pure functions.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
