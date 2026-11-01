#!/usr/bin/env bash
# Take this terminal to a plain shell in tmux for the worktree on the home
# box, so a command run there outlives the terminal that started it: a
# browser tab on the phone, through the VS Code tunnel, above all.
#
# Each worktree has one such session: t1 for ~/github/quillmedical, t2 and
# up for quillmedical-2 and up, beside the q1 and up that hold Claude. This:
#
#   - starts the session, with a login shell in the worktree, when there
#     is none;
#   - attaches from outside tmux, or switches from another session.
#
# A number gives the worktree another such session: `just tw 2` in
# quillmedical-6 is t6-2, beside t6, and `just tw 2` again comes back to it.
#
# It runs nothing in the shell. Whatever is wanted is typed there.
#
# A session of its own, rather than a window in a q session, keeps `just c`
# landing on Claude, and keeps it out of the alert watcher's way: the
# watcher types into whichever window of q5 is active.

set -euo pipefail

number="${1:-}"

case "${number}" in
    "" | [2-9] | [1-9][0-9]) ;;
    *)
        echo "✗ The number names another shell beside the first, so it runs from 2 to 99: just tw 2" >&2
        exit 1
        ;;
esac

if ! command -v tmux > /dev/null; then
    echo "✗ tmux is not installed. This is for the home box." >&2
    exit 1
fi

if ! top="$(git rev-parse --show-toplevel 2> /dev/null)"; then
    echo "✗ Run this from one of the Quill worktrees." >&2
    exit 1
fi

worktree="$(basename "${top}")"

# The same names as scripts/claude-session.sh, with t for q.
case "${worktree}" in
    quillmedical) name="t1" ;;
    quillmedical-[2-9] | quillmedical-[1-9][0-9]) name="t${worktree#quillmedical-}" ;;
    *)
        echo "✗ ${top} is not one of the Quill worktrees." >&2
        exit 1
        ;;
esac

if [ -n "${number}" ]; then
    name="${name}-${number}"
fi

if ! tmux has-session -t "=${name}" 2> /dev/null; then
    tmux new-session -d -s "${name}" -c "${top}" "bash -l"
    echo "Started ${name} in ${top}"
fi

if [ -n "${TMUX:-}" ]; then
    if [ "$(tmux display-message -p '#{session_name}')" = "${name}" ]; then
        exit 0
    fi

    exec tmux switch-client -t "=${name}"
fi

exec tmux attach -t "=${name}"
