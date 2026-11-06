#!/usr/bin/env bats
# Tests for tab-topic.sh, the hook that names a Claude session's terminal
# tab after what the conversation is about.
#
# tmux and claude are both stand-ins on PATH: the tmux one keeps session
# options as files in a temporary folder, and the claude one answers with
# whatever the test puts in ANSWER and keeps the question it was asked.

setup() {
    SCRIPT="${BATS_TEST_DIRNAME}/tab-topic.sh"
    STUBS="${BATS_TEST_TMPDIR}/bin"
    export OPTIONS="${BATS_TEST_TMPDIR}/options"
    export ASKED="${BATS_TEST_TMPDIR}/asked"
    export ANSWER_FILE="${BATS_TEST_TMPDIR}/answer"
    export SESSION="q4"
    export TMUX="/tmp/tmux-test/default,1,0"
    export TMUX_PANE="%1"
    mkdir -p "${STUBS}" "${OPTIONS}"
    unset QUILL_TAB_TOPIC_CHILD

    cat >"${STUBS}/tmux" <<'EOF'
#!/usr/bin/env bash
case "$1" in
    display-message) printf '%s\n' "${SESSION}" ;;
    show-options) cat "${OPTIONS}/${*: -1}" 2>/dev/null ;;
    set-option)
        if [ "$4" = "-u" ]; then
            rm -f "${OPTIONS}/$5"
        else
            printf '%s\n' "$5" >"${OPTIONS}/$4"
        fi
        ;;
esac
EOF

    cat >"${STUBS}/claude" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "${@: -1}" >"${ASKED}"
printf 'child=%s tmux=%s\n' "${QUILL_TAB_TOPIC_CHILD:-}" "${TMUX:-}" >>"${ASKED}"
cat "${ANSWER_FILE}"
EOF

    chmod +x "${STUBS}/tmux" "${STUBS}/claude"
    export PATH="${STUBS}:${PATH}"
}

answer() {
    printf '%s\n' "$1" >"${ANSWER_FILE}"
}

topic() {
    cat "${OPTIONS}/@topic" 2>/dev/null
}

pending() {
    cat "${OPTIONS}/@topic_pending" 2>/dev/null
}

prompt() {
    jq -n --arg p "$1" --arg t "${2:-}" '{prompt: $p, transcript_path: $t}' |
        "$SCRIPT" prompt
}

@test "the first prompt names the tab at once" {
    answer "Tmux copy mode typing"

    run prompt "how do I stop tmux copy mode needing q"
    [ "$status" -eq 0 ]
    [ -z "$output" ]
    [ "$(topic)" = "Tmux copy mode typing" ]
    grep -q "Name this conversation" "${ASKED}"
}

@test "SAME keeps the title and drops a pending one" {
    answer "Tmux copy mode typing"
    prompt "first"
    printf '%s\n' "Something else" >"${OPTIONS}/@topic_pending"
    answer "SAME"

    prompt "now add docs for it"
    [ "$(topic)" = "Tmux copy mode typing" ]
    [ -z "$(pending)" ]
    grep -q "The conversation is called: Tmux copy mode typing" "${ASKED}"
}

@test "a new goal waits for a second prompt before renaming the tab" {
    answer "Tmux copy mode typing"
    prompt "first"
    answer "Tab titles from the topic"

    prompt "can the tab show the topic"
    [ "$(topic)" = "Tmux copy mode typing" ]
    [ "$(pending)" = "Tab titles from the topic" ]

    prompt "go with the hook"
    [ "$(topic)" = "Tab titles from the topic" ]
    [ -z "$(pending)" ]
}

@test "a one-message aside never renames the tab" {
    answer "Tmux copy mode typing"
    prompt "first"
    answer "Docker daemon question"
    prompt "quick one, is docker running?"
    answer "SAME"

    prompt "back to tmux"
    [ "$(topic)" = "Tmux copy mode typing" ]
    [ -z "$(pending)" ]
}

@test "the title is cleaned to one short line tmux can show" {
    answer '"Fix #{the} tab: titles, now!" and some more words that run on and on past the limit'
    printf '%s\n' "second line" >>"${ANSWER_FILE}"

    prompt "first"
    title="$(topic)"
    [ -n "${title}" ]
    [[ "${title}" != *'#'* ]]
    [[ "${title}" != *'"'* ]]
    [[ "${title}" != *"second line"* ]]
    [ "${#title}" -le 60 ]
}

@test "slash commands are left alone" {
    answer "Should not be used"

    prompt "/crpd ready"
    [ -z "$(topic)" ]
    [ ! -e "${ASKED}" ]
}

@test "the question carries recent messages from the transcript, not tool results" {
    transcript="${BATS_TEST_TMPDIR}/t.jsonl"
    {
        jq -cn '{type: "user", message: {content: "earlier question about tmux"}}'
        jq -cn '{type: "user", message: {content: [{type: "tool_result"}]}}'
        jq -cn '{type: "user", message: {content: "<command-name>/clear</command-name>"}}'
        jq -cn '{type: "user", isMeta: true, message: {content: "caveat"}}'
    } >"${transcript}"
    answer "Tmux"

    prompt "and the newest one" "${transcript}"
    grep -q "1. earlier question about tmux" "${ASKED}"
    grep -q "2. and the newest one" "${ASKED}"
    ! grep -q "command-name" "${ASKED}"
    ! grep -q "caveat" "${ASKED}"
}

@test "only the previous message and the newest one are sent" {
    transcript="${BATS_TEST_TMPDIR}/t.jsonl"
    for message in "oldest about copy mode" "older about docs" "previous about tab titles"; do
        jq -cn --arg m "${message}" '{type: "user", message: {content: $m}}'
    done >"${transcript}"
    answer "Tab titles"

    prompt "newest about Haiku" "${transcript}"
    grep -q "1. previous about tab titles" "${ASKED}"
    grep -q "2. newest about Haiku" "${ASKED}"
    ! grep -q "3\\." "${ASKED}"
    ! grep -q "oldest about copy mode" "${ASKED}"
    ! grep -q "older about docs" "${ASKED}"
}

@test "the model runs outside tmux and marked as the hook's child" {
    answer "Tmux"

    prompt "first"
    grep -q "child=1 tmux=$" "${ASKED}"
}

@test "reset clears the title and any pending one" {
    printf '%s\n' "Old" >"${OPTIONS}/@topic"
    printf '%s\n' "Older" >"${OPTIONS}/@topic_pending"

    run "$SCRIPT" reset <<<'{"source": "clear"}'
    [ "$status" -eq 0 ]
    [ -z "$(topic)" ]
    [ -z "$(pending)" ]
}

@test "Owl's session is named like a q session" {
    export SESSION="owl"
    answer "Cloud Run errors"

    prompt "why did the backend start failing"
    [ "$(topic)" = "Cloud Run errors" ]
}

@test "Owl's alerts, which arrive as slash commands, are left alone" {
    export SESSION="owl"
    answer "Should not be used"

    prompt "/alert /home/owl/alerts/123.json"
    [ -z "$(topic)" ]
    [ ! -e "${ASKED}" ]
}

@test "outside a q session or Owl's it does nothing" {
    export SESSION="towl"
    answer "Should not be used"

    run prompt "first"
    [ "$status" -eq 0 ]
    [ -z "$(topic)" ]
    [ ! -e "${ASKED}" ]
}

@test "outside tmux it does nothing" {
    unset TMUX_PANE
    answer "Should not be used"

    prompt "first"
    [ -z "$(topic)" ]
    [ ! -e "${ASKED}" ]
}

@test "inside the hook's own model call it does nothing" {
    export QUILL_TAB_TOPIC_CHILD=1
    answer "Should not be used"

    prompt "first"
    [ -z "$(topic)" ]
    [ ! -e "${ASKED}" ]
}

@test "an empty answer changes nothing" {
    printf '%s\n' "Kept" >"${OPTIONS}/@topic"
    answer ""

    prompt "anything"
    [ "$(topic)" = "Kept" ]
    [ -z "$(pending)" ]
}
