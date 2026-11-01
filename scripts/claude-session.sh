#!/usr/bin/env bash
# Take this terminal to the worktree's Claude Code session on the home box,
# with Claude running in it, whatever state either is in.
#
# Each worktree has one tmux session: q1 for ~/github/quillmedical, q2 and
# up for quillmedical-2 and up. ~/.local/bin/quill-sessions starts q1 to q5
# at boot. This:
#
#   - starts the session, with Claude in it, when there is none;
#   - starts Claude again in it when Claude has exited and left the shell;
#   - attaches from outside tmux, or switches from another session.
#
# Run from the session's own shell after Claude has exited, it starts
# Claude right there, in the foreground, since the shell is the pane.
#
# Claude starts with --ide, which links it to the VS Code window open on
# the devbox when there is exactly one, so it sees the file and lines
# highlighted there. A Claude already running cannot be linked from
# outside, so attaching to one from VS Code's terminal shows a note to
# type /ide instead. Nothing is typed into it: keys sent to a busy
# session land in whatever is half written there.
#
# Whether Claude is running is read from the processes in the pane's
# session, not from tmux's pane_current_command: a pane started with
# `bash -lc 'claude ...'` reports bash while Claude runs as its child.
#
# Worktree 5 belongs to the alert watcher while quill-alert-watcher.service
# is enabled. Its Claude needs the watcher's environment and allowlist,
# which only scripts/alert-watcher/start-session.sh gives it, so a missing
# session or a stopped Claude there is refused and the fix named.

set -euo pipefail

if ! command -v tmux > /dev/null; then
    echo "✗ tmux is not installed. This is for the home box." >&2
    exit 1
fi

if ! top="$(git rev-parse --show-toplevel 2> /dev/null)"; then
    echo "✗ Run this from one of the Quill worktrees." >&2
    exit 1
fi

worktree="$(basename "${top}")"

case "${worktree}" in
    quillmedical) name="q1" ;;
    quillmedical-[2-9] | quillmedical-[1-9][0-9]) name="q${worktree#quillmedical-}" ;;
    *)
        echo "✗ ${top} is not one of the Quill worktrees." >&2
        exit 1
        ;;
esac

start_claude="claude --continue --ide --remote-control ${worktree} || claude --ide --remote-control ${worktree}"

watcher_owns_it=false
claude_was_running=false

if [ "${name}" = "q5" ] && systemctl --user is-enabled --quiet quill-alert-watcher.service 2> /dev/null; then
    watcher_owns_it=true
fi

refuse_for_watcher() {
    echo "✗ q5 belongs to the alert watcher, and its Claude needs the watcher's flags. Start it again with:" >&2
    echo "    tmux kill-session -t q5; systemctl --user restart quill-alert-watcher" >&2
    exit 1
}

if ! tmux has-session -t "=${name}" 2> /dev/null; then
    [ "${watcher_owns_it}" = false ] || refuse_for_watcher

    tmux new-session -d -s "${name}" -c "${top}" "bash -lc '${start_claude}; exec bash'"
    echo "Started ${name} in ${top}"
else
    pane_id="$(tmux display-message -p -t "=${name}:" '#{pane_id}')"
    pane_pid="$(tmux display-message -p -t "=${name}:" '#{pane_pid}')"

    # The pane is its process session's leader, so its pid is the session id.
    if ! pgrep -x -s "${pane_pid}" claude > /dev/null; then
        [ "${watcher_owns_it}" = false ] || refuse_for_watcher

        # This terminal is the pane, so start Claude here. Typing it in
        # with send-keys would land behind this script, at the same prompt.
        if [ "${TMUX_PANE:-}" = "${pane_id}" ]; then
            cd "${top}"
            bash -c "${start_claude}"
            exit 0
        fi

        tmux send-keys -t "${pane_id}" "${start_claude}" Enter
        echo "Started Claude again in ${name}"
    else
        claude_was_running=true
    fi
fi

if [ -n "${TMUX:-}" ]; then
    if [ "$(tmux display-message -p '#{session_name}')" = "${name}" ]; then
        exit 0
    fi

    exec tmux switch-client -t "=${name}"
fi

# Inside tmux, TERM_PROGRAM names tmux rather than the terminal, so VS
# Code's terminal is only recognised from outside, which is where the
# link is wanted. VS Code moves to a new port each time it restarts, so
# a Claude already running may hold a link that no longer answers: ask
# it to link again, and its picker waits for the person attaching. Text
# left half-typed in Claude's input would be sent along with it.
if [ "${claude_was_running}" = true ] && [ "${TERM_PROGRAM:-}" = "vscode" ]; then
    tmux send-keys -t "${pane_id}" "/ide" Enter
fi

exec tmux attach -t "=${name}"
