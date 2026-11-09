#!/usr/bin/env bash
# Refuses, in Owl's session, a Bash command in a shape that would raise a
# permission prompt, and says what shape to use instead.
#
# Usage: wired as a PreToolUse hook on Bash in scripts/owl/session-settings.json,
# which only Owl's session loads. Reads the hook's JSON payload on stdin.
#
# Nobody is at Owl's session to answer a prompt, so one stalls the run until
# the watcher stops it at 45 minutes. A refusal goes back to the model with
# its reason, and the model tries again in a shape that needs no approval.
# Refused:
#
# - commands joined with `;`, `&&` or `||`
# - a leading `cd`
# - `python3 -c` or `python -c`
# - a bare `curl` or `gh api`, which point to scripts/owl/fetch.sh and
#   scripts/owl/gh-get.sh: allowed as patterns, both would take any flag
#   after them, including ones that send data
# - an unquoted path outside the worktree, the alerts folder, /dev and the
#   session's scratchpad under /tmp/claude-<uid>
#
# Text inside quotes is not looked at, so a `;` in a commit message or a
# `/` at the start of a grep pattern is never refused. Nor is a heredoc's
# body, which is how the skills hand a Slack reply to slack-reply.sh:
# everything after the line that opens the heredoc is left out.
#
# Does nothing unless QUILL_OWL is `true`, which only Owl's tmux session
# sets. Exits 2 with the reason on stderr to refuse, which Claude Code
# shows to the model; exits 0 and prints nothing otherwise, including when
# the payload cannot be read, so a fault here never blocks a command.
set -uo pipefail

# Prints the command with any heredoc body cut off, every quoted span
# removed, and `\;` (as find's -exec ends) removed too, so only the shell's
# own syntax is left. sed -z reads the whole command as one, so a quoted
# span over several lines goes as well.
unquoted() {
    local command="$1"

    printf '%s\n' "${command}" |
        awk '{ print } /<</ { exit }' |
        sed -zE "s/'[^']*'//g; s/\"([^\"\\\\]|\\\\.)*\"//g; s/\\\\;//g" |
        tr -d '\0'
}

# Prints the first unquoted path in the command outside the folders the
# session may use, or nothing.
outside_path() {
    local text="$1"
    local project="$2"
    local alerts="$3"
    local scratch="$4"
    local token path

    # No globbing while splitting, so a `*` in the command stays a `*`.
    local -
    set -f

    for token in $(printf '%s' "${text}" | tr '=<>|()' '      '); do
        path="${token}"
        path="${path/#\~/${HOME}}"
        path="${path/#\$\{HOME\}/${HOME}}"
        path="${path/#\$HOME/${HOME}}"

        if [ "${path#/}" = "${path}" ]; then
            continue
        fi

        case "${path}" in
            "${project}" | "${project}"/* | "${alerts}" | "${alerts}"/* | /dev/* | "${scratch}"/*)
                continue
                ;;
        esac

        printf '%s' "${token}"
        return 0
    done
}

refuse() {
    printf '%s\n' "Owl's session has nobody to answer a permission prompt, so this command was refused before it could raise one. $1" >&2
    exit 2
}

main() {
    local payload command text found
    local project="${CLAUDE_PROJECT_DIR:-${PWD}}"
    local state="${OWL_STATE:-${XDG_STATE_HOME:-${HOME}/.local/state}/quill-owl}"
    local scratch
    scratch="/tmp/claude-$(id -u)"

    payload="$(cat 2>/dev/null || true)"

    if [ "${QUILL_OWL:-}" != "true" ]; then
        return 0
    fi

    command="$(printf '%s' "${payload}" | jq -r '.tool_input.command // empty' 2>/dev/null)" || return 0
    if [ -z "${command}" ]; then
        return 0
    fi

    text="$(unquoted "${command}")"

    if [[ "${text}" == *";"* || "${text}" == *"&&"* || "${text}" == *"||"* ]]; then
        refuse "Run one command per Bash call: no ';', '&&' or '||'. Send independent commands as separate calls in the same turn."
    fi

    if [[ "${text}" =~ ^[[:space:]]*cd([[:space:]]|$) ]]; then
        refuse "Do not start with cd. The shell is already in the worktree; give paths relative to it."
    fi

    if [[ "${text}" =~ (^|[[:space:]])python3?[[:space:]]+(-[A-Za-z]*[[:space:]]+)*-c([[:space:]]|$) ]]; then
        refuse "Do not run python3 -c. Use jq, grep or the Read tool, or write a script under scripts/ for a person to review."
    fi

    # A command starts the text or a line, or follows a pipe, `$(` or a
    # backtick.
    local curl_command=$'(^|[\n|(`])[[:space:]]*curl([[:space:]]|$)'
    local gh_api_command=$'(^|[\n|(`])[[:space:]]*gh[[:space:]]+api([[:space:]]|$)'

    if [[ "${text}" =~ ${curl_command} ]]; then
        refuse "Do not run curl. Read a status page or test a release download with scripts/owl/fetch.sh <url>, which takes one whitelisted address and only reads."
    fi

    if [[ "${text}" =~ ${gh_api_command} ]]; then
        refuse "Do not run gh api. Read an API path with scripts/owl/gh-get.sh <path>, which always uses GET and takes no other option."
    fi

    found="$(outside_path "${text}" "${project}" "${state}/alerts" "${scratch}")"
    if [ -n "${found}" ]; then
        refuse "Stay inside the worktree and the alerts folder: ${found} is outside them. Use a path relative to the worktree, or a just recipe that reads what is needed."
    fi

    return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
    exit 0
fi
