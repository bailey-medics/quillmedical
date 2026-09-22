#!/bin/bash

# Bring the editor window for one worktree to the front.
#
# Run when a Stop-hook banner is clicked, with the worktree path as $1. The
# windows are usually spread across Spaces, so this is what turns "something
# finished" into "take me there".
#
# Two ways, fastest first:
#
#   1. AXRaise through System Events, about 330ms. VS Code titles a window
#      "<file> — <folder>", so the folder's basename finds it. Needs
#      Accessibility permission, and finds nothing when no window holds the
#      folder, which is the ordinary case once a worktree is closed.
#
#   2. `code -r`, about 1.3s, because it starts Node and boots the CLI
#      before it can speak to the running editor. It needs no permission
#      and opens the folder when no window has it.
#
# The second only runs for a path that is a real directory. Without that
# guard a stale or mistyped path opens an empty window for a folder that
# does not exist, which is how this was first found.
#
# Failure is silent: a click that does nothing is a poor outcome, but an
# error dialog over whatever the user is doing is worse.

set -u

target="${1:-}"
[ -n "$target" ] || exit 0

name="$(basename "$target")"

# 1. Raise an existing window by title.
if osascript - "$name" >/dev/null 2>&1 <<'OSA'
on run argv
    set folderName to item 1 of argv
    tell application "System Events"
        if not (exists process "Code") then error "no editor"
        tell process "Code"
            set matches to every window whose name contains folderName
            if (count of matches) is 0 then error "no window"
            perform action "AXRaise" of item 1 of matches
            set frontmost to true
        end tell
    end tell
end run
OSA
then
    exit 0
fi

# 2. No window holds the folder, so open it. Only for a real directory:
# `code -r` on a path that does not exist opens an empty window for it.
[ -d "$target" ] || exit 0

code_bin="${QUILL_NOTIFY_CODE_BIN:-}"
if [ -z "$code_bin" ]; then
    code_bin="$(command -v code 2>/dev/null || true)"
fi
[ -n "$code_bin" ] || \
    code_bin="/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"

[ -x "$code_bin" ] && "$code_bin" -r "$target" >/dev/null 2>&1

exit 0
