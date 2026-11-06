#!/usr/bin/env bash
# Names this Claude session's terminal tab after what the conversation is
# about, and renames it when the conversation moves to a new goal.
#
# Usage: tab-topic.sh <prompt|reset>
#
# Wired in .claude/settings.json: `prompt` as an async UserPromptSubmit
# hook, so the prompt never waits for it, and `reset` as a SessionStart
# hook, so a new session or a /clear starts without a title.
#
# The title is kept in the tmux session's `@topic` option, and the
# `set-titles-string` in ~/.tmux.conf shows it after "C<worktree number>".
# See docs/docs/tmux/index.md for that line.
#
# After each prompt a small model is shown the title, the person's
# previous message and their newest one, and asked whether it would name
# the conversation differently if it were starting now. A next step towards the same goal keeps the
# title. A new goal is held in `@topic_pending`, and becomes the title
# only when the next prompt agrees, so a one-message aside never renames
# the tab.
#
# Works only in a `q` session (`q1` to `q99`, the ones `just c` makes) and
# in Owl's `owl` session. Owl's alerts arrive as `/clear` then `/alert`,
# and a slash command is skipped, so during an alert the tab shows Claude
# Code's own title instead. A plain shell, Owl's `towl` and a web session
# are never touched. Always exits 0 and prints nothing: a UserPromptSubmit hook that
# exits 2 blocks the prompt, and one that prints adds to the context.
set -uo pipefail

readonly SESSION_PATTERN='^(q[0-9]+|owl)$'
readonly RECENT_MESSAGES=2
readonly MESSAGE_CHARACTERS=400
readonly TITLE_CHARACTERS=60

readonly SYSTEM_PROMPT='You name conversations for a terminal tab. Reply with one line and nothing else.'

# Prints the tmux session this hook's Claude runs in, or nothing.
session_name() {
    if [ -z "${TMUX_PANE:-}" ]; then
        return 0
    fi

    tmux display-message -p -t "${TMUX_PANE}" '#{session_name}' 2>/dev/null
}

# Prints the person's recent messages, oldest first, one numbered line
# each. Skips slash commands, command output and tool results, which are
# not the person writing.
recent_messages() {
    local transcript="$1"
    local prompt="$2"
    local earlier=""

    if [ -n "${transcript}" ] && [ -r "${transcript}" ]; then
        earlier="$(jq -r --argjson n "${RECENT_MESSAGES}" --argjson c "${MESSAGE_CHARACTERS}" '
            select(.type == "user" and (.isMeta | not))
            | .message.content
            | select(type == "string")
            | select(startswith("<") | not)
            | .[0:$c] | gsub("\\s+"; " ")
        ' "${transcript}" 2>/dev/null | tail -n "${RECENT_MESSAGES}")"
    fi

    {
        if [ -n "${earlier}" ]; then
            printf '%s\n' "${earlier}"
        fi
        printf '%s\n' "${prompt:0:${MESSAGE_CHARACTERS}}" | tr -s '[:space:]' ' '
        printf '\n'
    } | awk 'NF && $0 != last { print; last = $0 }' |
        tail -n "${RECENT_MESSAGES}" |
        awk '{ printf "%d. %s\n", NR, $0 }'
}

# Prints the question the model is asked.
question() {
    local current="$1"
    local messages="$2"

    if [ -z "${current}" ]; then
        printf 'The person'\''s messages so far, oldest first:\n%s\n\n' "${messages}"
        printf 'Name this conversation in 3 to 6 words, in sentence case.'
        return 0
    fi

    printf 'The conversation is called: %s\n\n' "${current}"
    printf 'The person'\''s recent messages, oldest first:\n%s\n\n' "${messages}"
    printf '%s\n' \
        'If this conversation were starting now, would you name it differently?' \
        'A next step towards the same goal keeps the name: a follow-up, a fix, docs, tests, or a pull request for the same work.' \
        'A new goal that the person would have started a fresh chat for changes it.' \
        'A short reply such as "yes", "thanks" or a single letter keeps the name.' \
        'Reply SAME to keep the name, or give the new name in 3 to 6 words, in sentence case.'
}

# Asks the small model, from a folder of its own so it reads no project
# instructions, with no settings (so no hooks), no tools and no saved
# session.
ask_model() {
    local text="$1"
    local scratch
    local -a limit=()

    scratch="$(mktemp -d 2>/dev/null)" || return 0

    if command -v timeout >/dev/null 2>&1; then
        limit=(timeout 60)
    fi

    (
        cd "${scratch}" &&
            env -u TMUX -u TMUX_PANE QUILL_TAB_TOPIC_CHILD=1 \
                "${limit[@]+"${limit[@]}"}" "${TAB_TOPIC_CLAUDE:-claude}" -p \
                --model haiku \
                --no-session-persistence \
                --setting-sources "" \
                --tools "" \
                --strict-mcp-config \
                --disable-slash-commands \
                --system-prompt "${SYSTEM_PROMPT}" \
                "${text}" 2>/dev/null
    )

    rm -rf "${scratch}"
}

# Prints the model's answer as a title tmux can show: the first line,
# ordinary characters only, trimmed and cut short. `#` is dropped because
# tmux would read it as the start of a format.
clean_title() {
    head -n 1 |
        tr -cd "[:alnum:] ,.:()/'-" |
        tr -s ' ' |
        sed -e 's/^ *//' -e 's/ *$//' -e 's/\.$//' |
        cut -c "1-${TITLE_CHARACTERS}"
}

session_option() {
    tmux show-options -t "$1" -qv "$2" 2>/dev/null
}

set_session_option() {
    tmux set-option -t "$1" "$2" "$3" >/dev/null 2>&1
}

unset_session_option() {
    tmux set-option -t "$1" -u "$2" >/dev/null 2>&1
}

on_prompt() {
    local session="$1"
    local payload prompt transcript current pending messages answer title

    payload="$(cat 2>/dev/null)"
    prompt="$(jq -r '.prompt // ""' <<<"${payload}" 2>/dev/null)"
    transcript="$(jq -r '.transcript_path // ""' <<<"${payload}" 2>/dev/null)"

    # A slash command is not the person saying what the work is about.
    if [ -z "${prompt}" ] || [[ "${prompt}" == /* ]] || [[ "${prompt}" == '<'* ]]; then
        return 0
    fi

    current="$(session_option "${session}" @topic)"
    pending="$(session_option "${session}" @topic_pending)"
    messages="$(recent_messages "${transcript}" "${prompt}")"

    answer="$(ask_model "$(question "${current}" "${messages}")")"
    title="$(clean_title <<<"${answer}")"

    if [ -z "${title}" ]; then
        return 0
    fi

    if [ -z "${current}" ]; then
        if [ "${title}" != "SAME" ]; then
            set_session_option "${session}" @topic "${title}"
        fi
        return 0
    fi

    if [ "${title}" = "SAME" ] || [ "${title}" = "${current}" ]; then
        unset_session_option "${session}" @topic_pending
        return 0
    fi

    if [ -n "${pending}" ]; then
        set_session_option "${session}" @topic "${title}"
        unset_session_option "${session}" @topic_pending
        return 0
    fi

    set_session_option "${session}" @topic_pending "${title}"
}

on_reset() {
    local session="$1"

    cat >/dev/null 2>&1 || true

    unset_session_option "${session}" @topic
    unset_session_option "${session}" @topic_pending
}

main() {
    local action="${1:-}"
    local session

    # The model's own Claude runs no hooks, but if it ever did, it must
    # not ask itself for a title.
    if [ -n "${QUILL_TAB_TOPIC_CHILD:-}" ] ||
        ! command -v tmux >/dev/null 2>&1 ||
        ! command -v jq >/dev/null 2>&1; then
        cat >/dev/null 2>&1 || true
        return 0
    fi

    session="$(session_name)"

    if ! [[ "${session}" =~ ${SESSION_PATTERN} ]]; then
        cat >/dev/null 2>&1 || true
        return 0
    fi

    case "${action}" in
        prompt) on_prompt "${session}" ;;
        reset) on_reset "${session}" ;;
        *) cat >/dev/null 2>&1 || true ;;
    esac

    return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@" >/dev/null 2>&1
    exit 0
fi
