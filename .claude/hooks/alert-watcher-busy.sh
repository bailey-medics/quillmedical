#!/usr/bin/env bash
# Keeps the alert watcher's busy flag: set when a turn begins, cleared when
# it ends.
#
# Usage: alert-watcher-busy.sh <set|clear>
#
# Wired in .claude/settings.json as a UserPromptSubmit hook (set) and a Stop
# hook (clear). The daemon in scripts/alert-watcher/ reads the flag before it
# types an alert into worktree 5, and queues the alert while the flag is
# there, whether the turn is an alert's or a person's. The flag holds the
# time the turn began, in seconds since the epoch, which is how the daemon
# tells a run that has stalled.
#
# Does nothing at all unless QUILL_ALERT_WATCHER is `true`, which only the
# watcher's tmux session sets, so every other worktree and machine never
# sees a flag. Always exits 0 and prints nothing: a UserPromptSubmit hook
# that exits 2 blocks the prompt, and one that prints adds to the context.
set -uo pipefail

main() {
    local action="${1:-}"
    local state_dir="${QUILL_ALERT_WATCHER_STATE:-${XDG_STATE_HOME:-${HOME}/.local/state}/quill-alert-watcher}"
    local flag="${state_dir}/busy"

    # The hook's JSON payload is not needed, but is read so the hook never
    # leaves its writer blocked on a full pipe.
    cat >/dev/null 2>&1 || true

    if [ "${QUILL_ALERT_WATCHER:-}" != "true" ]; then
        return 0
    fi

    case "${action}" in
        set)
            mkdir -p "${state_dir}" 2>/dev/null &&
                date +%s >"${flag}.tmp" 2>/dev/null &&
                mv "${flag}.tmp" "${flag}" 2>/dev/null
            ;;
        clear)
            rm -f "${flag}" 2>/dev/null
            ;;
    esac

    return 0
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
    exit 0
fi
