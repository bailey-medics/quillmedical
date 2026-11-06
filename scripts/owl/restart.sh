#!/usr/bin/env bash
# Restarts Owl, the alert watcher, and its Claude Code session, owl.
#
# Usage: restart.sh [force]
#
# Run by `just owl-restart`, from quillmedical-owl on the dev box only, as
# `just owl-install` is.
#
# Refuses while the busy flag is set, because an alert run may be part
# way through, unless given `force`. Run from inside the owl session, the flag
# belongs to the turn running this, so it is not a reason to refuse.
#
# The restart runs detached, with systemd-run, because it kills the owl
# session: run in place from inside it, it would kill the shell running it after the
# kill and before the start, and leave no Owl at all. The detached job
# stops quill-owl.service, kills the session, clears the busy flag so the new
# session does not start out busy, and starts the service, whose
# start-session.sh makes a fresh owl session with the current flags.
#
# OWL_WORKTREE, OWL_TMUX_TARGET and OWL_STATE change the worktree, the
# session name and the state folder, as they do for the daemon.
set -euo pipefail

# True when this is running inside the session it is about to restart.
inside_session() {
    local session="$1"

    if [ -z "${TMUX:-}" ]; then
        return 1
    fi

    [ "$(tmux display-message -p '#S' 2>/dev/null || true)" = "${session}" ]
}

main() {
    local force="${1:-}"
    local worktree="${OWL_WORKTREE:-${HOME}/github/quillmedical-owl}"
    local session="${OWL_TMUX_TARGET:-owl}"
    local state="${OWL_STATE:-${XDG_STATE_HOME:-${HOME}/.local/state}/quill-owl}"
    local flag="${state}/busy"
    local toplevel
    local job

    if [ -n "${force}" ] && [ "${force}" != "force" ]; then
        echo "✗ Unknown argument '${force}'. Usage: just owl-restart [force]" >&2
        return 1
    fi

    toplevel="$(git rev-parse --show-toplevel 2>/dev/null || true)"

    if [ "$(uname -s)" != "Linux" ] || [ "${toplevel}" != "${worktree}" ]; then
        echo "✗ Run this on the dev box, from ${worktree}." >&2
        return 1
    fi

    if [ -f "${flag}" ] && [ "${force}" != "force" ] && ! inside_session "${session}"; then
        echo "✗ ${session} is busy, with an alert run or a person's turn. Wait for it to finish, or run: just owl-restart force" >&2
        return 1
    fi

    job="systemctl --user stop quill-owl.service"
    job+="; tmux kill-session -t $(printf '%q' "=${session}")"
    job+="; rm -f $(printf '%q' "${flag}")"
    job+="; systemctl --user start quill-owl.service"

    systemd-run --user --collect --quiet bash -c "${job}"

    echo "Restarting Owl and ${session}. Attach with acc in a few seconds."
    echo "If it does not come back: journalctl --user -u quill-owl"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
