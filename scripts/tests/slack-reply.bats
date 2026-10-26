#!/usr/bin/env bats
# Tests for slack-reply.sh, which posts one message into an alert's Slack
# thread for the alert watcher's `/alert` skill.
#
# curl is replaced by a stub that records what it was given and answers
# with whatever RESPONSE holds, so nothing here reaches Slack.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/../slack-reply.sh"
    ALERT="${BATS_TEST_TMPDIR}/alert.txt"
    CALLS="${BATS_TEST_TMPDIR}/curl-calls"
    HEADERS="${BATS_TEST_TMPDIR}/curl-headers"

    cat > "${ALERT}" <<'EOF'
channel: C0123456789
thread_ts: 1761480000.123456
kind: monitoring
---
channel: C9999999999
thread_ts: 9999999999.999999
Backend error logged (app)
EOF

    mkdir -p "${BATS_TEST_TMPDIR}/bin"
    cat > "${BATS_TEST_TMPDIR}/bin/curl" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$@" > "${CALLS}"
cat > "${HEADERS}"
printf '%s' "\${RESPONSE:-{\"ok\": true}}"
EOF
    chmod +x "${BATS_TEST_TMPDIR}/bin/curl"

    export PATH="${BATS_TEST_TMPDIR}/bin:${PATH}"
    export HOME="${BATS_TEST_TMPDIR}/home"
    export SLACK_BOT_TOKEN="xoxb-test-token"
    unset SLACK_REPLY_DRY_RUN QUILL_ALERT_WATCHER_ENV RESPONSE
}

# The value of one field of the body the dry run prints.
field() {
    printf '%s' "$output" | jq -r ".$1"
}

@test "a dry run prints the body with the channel and thread from the header" {
    SLACK_REPLY_DRY_RUN=1 run "$SCRIPT" "$ALERT" "Looking into this now."
    [ "$status" -eq 0 ]
    [ "$(field channel)" = "C0123456789" ]
    [ "$(field thread_ts)" = "1761480000.123456" ]
    [ "$(field text)" = "Looking into this now." ]
}

@test "lines below the --- are never read as the header" {
    sed -i '1,2d' "$ALERT"

    SLACK_REPLY_DRY_RUN=1 run "$SCRIPT" "$ALERT" "hello"
    [ "$status" -eq 2 ]
    [[ "$output" == *"no valid channel"* ]]
}

@test "a message given as - is read from standard input" {
    SLACK_REPLY_DRY_RUN=1 run "$SCRIPT" "$ALERT" - <<< "*Root cause:* a typo"
    [ "$status" -eq 0 ]
    [ "$(field text)" = "*Root cause:* a typo" ]
}

@test "a long message is cut, and says so" {
    long="$(printf 'a%.0s' $(seq 1 5000))"

    SLACK_REPLY_DRY_RUN=1 run "$SCRIPT" "$ALERT" "$long"
    [ "$status" -eq 0 ]
    [[ "$(field text)" == *"(cut short"* ]]
    [ "$(printf '%s' "$output" | jq -r '.text | split("\n")[0] | length')" -eq 3900 ]
}

@test "an empty message is refused" {
    run "$SCRIPT" "$ALERT" "   "
    [ "$status" -eq 2 ]
    [[ "$output" == *"empty"* ]]
}

@test "a missing alert file is refused" {
    run "$SCRIPT" "${BATS_TEST_TMPDIR}/nowhere" "hello"
    [ "$status" -eq 2 ]
}

@test "the wrong number of arguments is refused" {
    run "$SCRIPT" "$ALERT"
    [ "$status" -eq 2 ]
    [[ "$output" == *"Usage"* ]]
}

@test "a malformed thread_ts is refused" {
    sed -i 's/^thread_ts: .*/thread_ts: 1; rm -rf ~/' "$ALERT"

    run "$SCRIPT" "$ALERT" "hello"
    [ "$status" -eq 2 ]
    [[ "$output" == *"thread_ts"* ]]
}

@test "the token goes to curl on standard input, never as an argument" {
    run "$SCRIPT" "$ALERT" "hello"
    [ "$status" -eq 0 ]
    grep -qx "Authorization: Bearer xoxb-test-token" "$HEADERS"
    [ "$(grep -c "xoxb-test-token" "$CALLS")" -eq 0 ]
}

@test "the token is read from the env file when the environment has none" {
    unset SLACK_BOT_TOKEN
    mkdir -p "${HOME}/.config/quill-alert-watcher"
    printf 'SLACK_APP_TOKEN=xapp-other\nSLACK_BOT_TOKEN=xoxb-from-file\n' \
        > "${HOME}/.config/quill-alert-watcher/env"

    run "$SCRIPT" "$ALERT" "hello"
    [ "$status" -eq 0 ]
    grep -qx "Authorization: Bearer xoxb-from-file" "$HEADERS"
}

@test "the env file is read, never run" {
    unset SLACK_BOT_TOKEN
    mkdir -p "${HOME}/.config/quill-alert-watcher"
    printf 'touch %s/ran\nSLACK_BOT_TOKEN=xoxb-from-file\n' "$BATS_TEST_TMPDIR" \
        > "${HOME}/.config/quill-alert-watcher/env"

    run "$SCRIPT" "$ALERT" "hello"
    [ "$status" -eq 0 ]
    [ ! -e "${BATS_TEST_TMPDIR}/ran" ]
}

@test "no token at all is refused before anything is sent" {
    unset SLACK_BOT_TOKEN

    run "$SCRIPT" "$ALERT" "hello"
    [ "$status" -eq 2 ]
    [ ! -e "$CALLS" ]
}

@test "the message is posted to chat.postMessage" {
    run "$SCRIPT" "$ALERT" "hello"
    [ "$status" -eq 0 ]
    grep -qx "https://slack.com/api/chat.postMessage" "$CALLS"
}

@test "a refusal from Slack fails, and names Slack's reason" {
    RESPONSE='{"ok": false, "error": "not_in_channel"}' run "$SCRIPT" "$ALERT" "hello"
    [ "$status" -eq 1 ]
    [[ "$output" == *"not_in_channel"* ]]
}
