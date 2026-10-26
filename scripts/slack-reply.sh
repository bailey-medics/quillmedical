#!/usr/bin/env bash
# Posts one message into an alert's Slack thread, for the alert watcher's
# `/alert` skill.
#
# Usage: slack-reply.sh <alert-file> <message|->
#
# The channel and the thread come from the alert file's header, the
# `key: value` lines above its `---`, and from nowhere else. The text below
# the `---` arrived from Slack and is never read here. Both values are
# checked against Slack's own formats before they are used.
#
# The bot token is SLACK_BOT_TOKEN from the environment, or the
# SLACK_BOT_TOKEN line of the watcher's env file
# (~/.config/quill-alert-watcher/env, or QUILL_ALERT_WATCHER_ENV). The file
# is read, never sourced, so nothing else in it runs. The token reaches
# curl through a header on standard input rather than on the command line,
# so it never shows in `ps`.
#
# A message over 3,900 characters is cut, with a note that it was, to stay
# under the 4,000 Slack recommends for a message's text.
#
# SLACK_REPLY_DRY_RUN=1 prints the request body instead of sending it, and
# needs no token. SLACK_API_URL points the request elsewhere, for tests.
#
# Exit codes:
#   0  posted, or printed in a dry run
#   1  Slack refused the message, or could not be reached
#   2  wrong usage, or a missing or malformed alert file or token
set -euo pipefail

readonly MAX_CHARACTERS=3900

# Prints the value of one header key from the alert file, or nothing.
header_value() {
    local file="$1"
    local key="$2"

    awk -v key="${key}" '
        $0 == "---" { exit }
        index($0, key ": ") == 1 { print substr($0, length(key) + 3); exit }
    ' "${file}"
}

# Prints the bot token from the environment or the env file, or nothing.
bot_token() {
    local env_file="${QUILL_ALERT_WATCHER_ENV:-${HOME}/.config/quill-alert-watcher/env}"

    if [ -n "${SLACK_BOT_TOKEN:-}" ]; then
        printf '%s' "${SLACK_BOT_TOKEN}"
        return
    fi

    if [ -r "${env_file}" ]; then
        sed -n 's/^SLACK_BOT_TOKEN=//p' "${env_file}" | head -n 1 | tr -d "\"'"
    fi
}

# Prints the chat.postMessage body: the message, cut if it is too long.
request_body() {
    local channel="$1"
    local thread_ts="$2"
    local message="$3"

    jq -n \
        --arg channel "${channel}" \
        --arg thread_ts "${thread_ts}" \
        --arg message "${message}" \
        --argjson max "${MAX_CHARACTERS}" '
        {
            channel: $channel,
            thread_ts: $thread_ts,
            unfurl_links: false,
            text: (
                if ($message | length) > $max
                then $message[0:$max] + "\n_(cut short: the message was too long for Slack)_"
                else $message
                end
            )
        }'
}

main() {
    local alert_file="${1:-}"
    local message="${2:-}"

    if [ -z "${alert_file}" ] || [ "$#" -ne 2 ]; then
        echo "Usage: slack-reply.sh <alert-file> <message|->" >&2
        exit 2
    fi

    if [ ! -r "${alert_file}" ]; then
        echo "✗ Cannot read the alert file: ${alert_file}" >&2
        exit 2
    fi

    if [ "${message}" = "-" ]; then
        message="$(cat)"
    fi

    if [ -z "${message//[[:space:]]/}" ]; then
        echo "✗ The message is empty." >&2
        exit 2
    fi

    local channel
    channel="$(header_value "${alert_file}" channel)"
    local thread_ts
    thread_ts="$(header_value "${alert_file}" thread_ts)"

    if ! [[ "${channel}" =~ ^[CG][A-Z0-9]{8,}$ ]]; then
        echo "✗ The alert file has no valid channel in its header." >&2
        exit 2
    fi

    if ! [[ "${thread_ts}" =~ ^[0-9]{9,}\.[0-9]{6}$ ]]; then
        echo "✗ The alert file has no valid thread_ts in its header." >&2
        exit 2
    fi

    local body
    body="$(request_body "${channel}" "${thread_ts}" "${message}")"

    if [ "${SLACK_REPLY_DRY_RUN:-}" = "1" ]; then
        printf '%s\n' "${body}"
        exit 0
    fi

    local token
    token="$(bot_token)"

    if ! [[ "${token}" =~ ^xoxb- ]]; then
        echo "✗ No bot token: set SLACK_BOT_TOKEN, or put it in the watcher's env file." >&2
        exit 2
    fi

    local api_url="${SLACK_API_URL:-https://slack.com/api}"
    local response

    if ! response="$(
        printf 'Authorization: Bearer %s\n' "${token}" |
            curl --silent --show-error --fail --max-time 20 \
                --header @- \
                --header 'Content-Type: application/json; charset=utf-8' \
                --data "${body}" \
                "${api_url}/chat.postMessage"
    )"; then
        echo "✗ Could not reach Slack." >&2
        exit 1
    fi

    if [ "$(jq -r '.ok' <<<"${response}")" != "true" ]; then
        echo "✗ Slack refused the message: $(jq -r '.error // "no reason given"' <<<"${response}")" >&2
        exit 1
    fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
