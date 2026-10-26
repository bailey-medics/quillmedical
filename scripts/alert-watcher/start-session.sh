#!/usr/bin/env bash
# Starts the alert watcher's Claude Code session in tmux, unless one is
# already running.
#
# Usage: start-session.sh
#
# Run by quill-alert-watcher.service before the daemon starts. A session
# that is already there is left alone, so one a person is sitting in
# survives a restart of the daemon.
#
# The session is q5, the name ~/.local/bin/quill-sessions gives worktree 5,
# so `acc` attaches to it as to any other worktree. While this service is
# enabled, quill-sessions leaves worktree 5 to it: a q5 started there would
# lack the environment and the flags below, and this script would find it
# and leave it alone.
#
# The session runs `claude` in worktree 5 with QUILL_ALERT_WATCHER=true,
# which is what turns on the busy-flag hook and the standing permission in
# CLAUDE.md, and nothing else sets it. It may read the alert files the
# daemon writes (--add-dir), and runs without a prompt only the commands
# the /alert skill needs beyond reading and testing (--allowedTools): a
# prompt would stall a run with nobody there to answer it. When `claude`
# exits, a login shell takes its place, so the tmux session stays for a
# person to start it again. Remote Control is on from the start, under the
# worktree's name, as quill-sessions does for the others.
#
# CLOUDSDK_CONFIG gives the session gcloud settings of its own, holding the
# log reader's key and nothing else. The watcher runs as the same user as
# everything else on the box, so the key activated in the ordinary place
# would become the account for every gcloud command there, and a later
# `gcloud auth login` would quietly take it back.
#
# ALERT_WATCHER_TMUX_TARGET, ALERT_WATCHER_WORKTREE and
# QUILL_ALERT_WATCHER_STATE change the session name, the worktree and the
# state folder, as they do for the daemon.
set -euo pipefail

# Pushing and opening pull requests go through the stack recipes only, as
# everywhere else in the repository: `just stack-submit` pushes the stack and
# opens its pull requests, so neither a bare `git push` nor `gh pr create` is
# here, and the /alert skill refuses both.
readonly ALLOWED_TOOLS=(
    "Bash(just stack-fresh:*)"
    "Bash(just stack-new:*)"
    "Bash(just stack-submit:*)"
    "Bash(just stu:*)"
    "Bash(gh pr edit:*)"
    "Bash(gh pr ready:*)"
    "Bash(gcloud logging read:*)"
    "Bash(scripts/slack-reply.sh:*)"
)

main() {
    local session="${ALERT_WATCHER_TMUX_TARGET:-q5}"
    local worktree="${ALERT_WATCHER_WORKTREE:-${HOME}/github/quillmedical-5}"
    local state="${QUILL_ALERT_WATCHER_STATE:-${XDG_STATE_HOME:-${HOME}/.local/state}/quill-alert-watcher}"
    local gcloud_config="${HOME}/.config/quill-alert-watcher/gcloud"

    # `=` asks for that exact name, so a session called q50 does not
    # count as this one.
    if tmux has-session -t "=${session}" 2>/dev/null; then
        echo "The tmux session ${session} is already running; left as it is."
        return 0
    fi

    if [ ! -d "${worktree}" ]; then
        echo "✗ No worktree at ${worktree}." >&2
        return 1
    fi

    mkdir -p "${state}/alerts"
    chmod 0700 "${state}" "${state}/alerts"

    local command
    command="export QUILL_ALERT_WATCHER=true CLOUDSDK_CONFIG=$(printf '%q' "${gcloud_config}"); claude --add-dir $(printf '%q' "${state}/alerts")"
    command+=" --remote-control $(printf '%q' "$(basename "${worktree}")")"
    command+=" --allowedTools $(printf '%q ' "${ALLOWED_TOOLS[@]}")"
    command+="; exec bash -l"

    tmux new-session -d -s "${session}" -c "${worktree}" bash -lc "${command}"
    echo "Started the tmux session ${session} in ${worktree}."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
