#!/usr/bin/env bash
# Republishes a gate's message in Slack's markup, so one piece of text can
# serve both the PR comment and the Slack notification.
#
# Usage: to-slack-mrkdwn.sh <message>
#
# A gate message is written once, in GitHub markdown, and used verbatim for the
# PR comment. Slack's "mrkdwn" is nearly the same dialect but takes *single*
# asterisks for bold where GitHub takes double, so the message would render
# with stray asterisks if it were handed to Slack unchanged. Everything else
# the gate messages use - fenced code blocks, inline backticks, plain
# paragraphs - is identical in both, so that one substitution is the whole job.
#
# Writes `slack_message` to GITHUB_OUTPUT for the notify job to pick up.
#
# Environment:
#   GITHUB_OUTPUT   Destination for `slack_message` (set by the runner).
set -euo pipefail

# shellcheck source=../shared/logging.sh
source "$(dirname "${BASH_SOURCE[0]}")/../shared/logging.sh" "to-slack-mrkdwn"

# Delimiter for the heredoc form of GITHUB_OUTPUT, the only way to pass a value
# containing newlines between steps. A message containing this line would let
# the caller inject arbitrary step outputs, so main refuses that below.
readonly OUTPUT_DELIMITER="GATE_MESSAGE_EOF"

# Convert GitHub markdown bold (**text**) to Slack mrkdwn bold (*text*).
# Reads standard input, so it can be tested without GITHUB_OUTPUT.
to_mrkdwn() {
  sed 's/\*\*/*/g'
}

main() {
  local message="${1:-}"

  if [ -z "$message" ]; then
    error "No message provided. Usage: to-slack-mrkdwn.sh <message>"
    exit 1
  fi

  if [ -z "${GITHUB_OUTPUT:-}" ]; then
    error "GITHUB_OUTPUT not set (not running in GitHub Actions?)"
    exit 1
  fi

  if grep -qxF "$OUTPUT_DELIMITER" <<<"$message"; then
    error "Message contains the output delimiter '$OUTPUT_DELIMITER' on a line of its own; refusing to write it."
    exit 1
  fi

  {
    echo "slack_message<<${OUTPUT_DELIMITER}"
    to_mrkdwn <<<"$message"
    echo "$OUTPUT_DELIMITER"
  } >>"$GITHUB_OUTPUT"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
