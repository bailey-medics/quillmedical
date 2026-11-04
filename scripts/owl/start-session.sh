#!/usr/bin/env bash
# Starts Owl's Claude Code session in tmux, unless one is
# already running.
#
# Usage: start-session.sh
#
# Run by quill-owl.service before the daemon starts. A session
# that is already there is left alone, so one a person is sitting in
# survives a restart of the daemon.
#
# The session is owl, the name scripts/claude-session.sh gives Owl's
# worktree, quillmedical-owl, so `acc` attaches to it as to any other
# worktree. While this service is enabled, claude-session.sh refuses to
# start a plain Claude there: one started that way would lack the
# environment and the flags below, and this script would find it and
# leave it alone.
#
# The session runs `claude` in quillmedical-owl with QUILL_OWL=true,
# which is what turns on the busy-flag hook and the standing permission in
# CLAUDE.md, and nothing else sets it. It may read the alert files the
# daemon writes (--add-dir), and runs without a prompt only the commands
# the /alert skill needs beyond reading and testing (--allowedTools): a
# prompt would stall a run with nobody there to answer it. When `claude`
# exits, a login shell takes its place, so the tmux session stays for a
# person to start it again. Remote Control is on from the start, under the
# worktree's name, as quill-sessions does for the others.
#
# The session must never stop to ask anything, because the watcher types
# into the pane blind: on 4 November 2026 two alerts were typed into an
# open dialog and lost. So it runs in auto mode, given explicitly because
# `defaultMode: auto` in the project settings does not take effect from a
# project file, which decides each tool call rather than prompting. The
# ways auto mode still asks are closed: AskUserQuestion is refused, so a
# run writes its assumption in the thread instead; reads outside the
# working directories are refused rather than asked about, through
# session-settings.json; and the feedback survey is off. That file also
# switches off the tips and suggestions drawn in the pane, so what the
# watcher reads there is the prompt and nothing else. It is passed with
# --settings, so it applies to this session and no other worktree.
#
# CLOUDSDK_CONFIG gives the session gcloud settings of its own, holding the
# log reader's key and nothing else. The watcher runs as the same user as
# everything else on the box, so the key activated in the ordinary place
# would become the account for every gcloud command there, and a later
# `gcloud auth login` would quietly take it back.
#
# The tmux server is started in a systemd scope of its own,
# quill-tmux-server.scope, never in this service's process group. Whichever
# `tmux new-session` runs first starts the server, and at boot that is this
# script, run by quill-owl.service. A server started in the
# service's group is killed with it, so a restart of the watcher once closed
# every session on the box, q1 to q6, and every Claude in them. See
# docs/docs/plans/2026-11-04-tmux-survives-an-alert-watcher-restart-plan.md.
#
# OWL_TMUX_TARGET, OWL_WORKTREE and
# OWL_STATE change the session name, the worktree and the
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

# The scope the tmux server runs in, so `systemctl --user status
# quill-tmux-server.scope` finds it.
readonly TMUX_SCOPE="quill-tmux-server"

# Runs a tmux command that may start the server, in a scope of its own.
#
# If no server is running, the command starts one inside the scope, and the
# scope lasts as long as the server. If one is already running, the command
# only asks it for a session, and the scope ends when the command returns.
# Either way the server is outside this service.
#
# systemd refuses a scope name already in use, so while the scope is active,
# which means the server is already in it, tmux runs as it is. Without
# systemd-run, as in the tests' container, it runs as it is too.
# --collect lets a failed scope go, so it never holds the name.
start_tmux() {
    if ! command -v systemd-run >/dev/null 2>&1; then
        tmux "$@"
        return
    fi

    if systemctl --user is-active --quiet "${TMUX_SCOPE}.scope" 2>/dev/null; then
        tmux "$@"
        return
    fi

    systemd-run --user --scope --quiet --collect --unit="${TMUX_SCOPE}" tmux "$@"
}

main() {
    local session="${OWL_TMUX_TARGET:-owl}"
    local worktree="${OWL_WORKTREE:-${HOME}/github/quillmedical-owl}"
    local state="${OWL_STATE:-${XDG_STATE_HOME:-${HOME}/.local/state}/quill-owl}"
    local gcloud_config="${HOME}/.config/quill-owl/gcloud"
    local settings
    settings="$(cd -- "${BASH_SOURCE[0]%/*}" && pwd)/session-settings.json"

    # `=` asks for that exact name, so a session called owl2 does not
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
    command="export QUILL_OWL=true CLOUDSDK_CONFIG=$(printf '%q' "${gcloud_config}") CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1; claude --add-dir $(printf '%q' "${state}/alerts")"
    command+=" --remote-control $(printf '%q' "$(basename "${worktree}")")"
    command+=" --permission-mode auto"
    command+=" --settings $(printf '%q' "${settings}")"
    command+=" --disallowedTools AskUserQuestion"
    command+=" --allowedTools $(printf '%q ' "${ALLOWED_TOOLS[@]}")"
    command+="; exec bash -l"

    start_tmux new-session -d -s "${session}" -c "${worktree}" bash -lc "${command}"
    echo "Started the tmux session ${session} in ${worktree}."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
