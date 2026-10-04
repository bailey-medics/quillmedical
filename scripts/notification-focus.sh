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
#      "<file> – <folder>", so a title ending in the folder's basename finds
#      it. Needs Accessibility permission, and System Events lists only the
#      windows on the Space in view, so this finds nothing for a worktree on
#      another Space.
#
#   2. `open -a`, which asks macOS to hand the folder to the editor. The
#      editor brings forward the window already holding it, and macOS
#      follows to that window's Space, in either direction. With no such
#      window it opens the folder in a new one.
#
# The title must end with the folder name, not merely contain it. The main
# checkout is "quillmedical", which every "quillmedical-3" contains: a click
# on its banner raised whichever worktree was already in view and stopped
# there, so the Space never changed.
#
# `open -a` rather than `code -r`. `-r` reuses the window in front when no
# window holds the path, replacing the worktree open in it.
#
# The second only runs for a path that is a real directory, so a stale or
# mistyped path opens nothing.
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
            set matches to every window whose name is folderName ¬
                or name ends with (" " & folderName)
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

# 2. No window in view holds the folder, so hand it to the editor. Only for
# a real directory. QUILL_NOTIFY_EDITOR names another application.
[ -d "$target" ] || exit 0

open -a "${QUILL_NOTIFY_EDITOR:-Visual Studio Code}" "$target" \
    >/dev/null 2>&1

exit 0
