#!/bin/bash

# Show one notification on a Mac: a banner, the worktree spoken aloud, and
# optionally a chime.
#
#   notification-show.sh <title> <body> <group> <spoken> [<worktree path>]
#
# notification.sh works out what to say and calls this to say it. On a Mac
# it runs it directly. On the Linux dev box it streams this file over SSH to
# the Mac, as `bash -s`, because the box has no screen of its own: there the
# file has no path, so SCRIPT_DIR is wherever the shell started and the
# click-to-focus script is not found, and the banner is posted without it.
#
# The Mac's bash is 3.2, so nothing newer than that is used here.
#
# Every step is best-effort and this always exits 0.

set -u

title="${1:-}"
body="${2:-}"
group="${3:-}"
spoken="${4:-}"
cwd="${5:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" && pwd)"
AUDIO_FILE="$SCRIPT_DIR/level-completed.mp3"

# Overridable from the environment: QUILL_NOTIFY_VOICE picks another installed
# voice, QUILL_NOTIFY_SPEAK=0 silences speech, QUILL_NOTIFY_BANNER=0 suppresses
# the macOS banner, QUILL_NOTIFY_APP points at the branded notifier if it is
# not in the default place, QUILL_NOTIFY_ACTIVATE="" stops a click on the
# banner focusing the editor, and
# QUILL_NOTIFY_CHIME=1 brings back the completion sound, which is off by
# default.
VOICE="${QUILL_NOTIFY_VOICE:-Karen}"
SPEAK="${QUILL_NOTIFY_SPEAK:-1}"
BANNER="${QUILL_NOTIFY_BANNER:-1}"
CHIME="${QUILL_NOTIFY_CHIME:-0}"

# The Quill-branded notifier, if it has been built. QUILL_NOTIFY_APP points
# somewhere else; otherwise it is wherever `just notifier-app` puts it.
NOTIFIER_APP="${QUILL_NOTIFY_APP:-$HOME/Applications/quill-notifier.app}"
NOTIFIER_BIN="$NOTIFIER_APP/Contents/MacOS/terminal-notifier"

# A banner and speech answer different questions: the banner says which
# branch finished and survives on screen, speech says which worktree
# without needing the screen at all. Both, unless turned off.
#
# Two ways to post the banner, preferring the first:
#
#   1. $NOTIFIER_APP, a copy of terminal-notifier carrying the Quill
#      icon. macOS takes a notification's icon from the bundle that
#      sent it and offers no API to override it per notification, so
#      a custom icon means a custom bundle with its own identifier.
#      `just notifier-app` builds it; it is not in the repository
#      because it is a signed binary, and it is absent until built.
#
#   2. `display notification`, which always shows the osascript icon.
#      Addressing it to an application (System Events, Script Editor)
#      changes nothing except to break it: System Events returns exit
#      0 and shows nothing at all.
#
# Neither reports failure usefully. Exit status says only that the
# command ran, never that a banner appeared, so changes here have to
# be confirmed by eye.
if [ "$BANNER" = "1" ]; then
    if [ -x "$NOTIFIER_BIN" ]; then
        # Clicking the banner raises the editor window for the
        # worktree that finished. -activate cannot do that: a
        # bundle identifier names an application, so macOS raises
        # whichever window was last in front, which with several
        # worktrees open on separate Spaces is rarely the right
        # one. -execute stores a command with the notification and
        # runs it on the click, so notification-focus.sh can find
        # the one window holding this folder.
        #
        # The command is single-quoted for the shell -execute
        # spawns, with any quote in either path escaped. Empty
        # QUILL_NOTIFY_ACTIVATE leaves a click doing nothing.
        #
        # Clear old notifications before testing this
        # (`-remove <group>`). A banner still sitting in
        # Notification Centre carries its stored command, so a
        # click on a stale one fires that, which is easy to misread
        # as a new banner firing on delivery rather than on click.
        set -- -title "$title" -message "$body" -group "$group"
        if [ "${QUILL_NOTIFY_ACTIVATE-1}" != "" ] && [ -n "$cwd" ] \
            && [ -x "$SCRIPT_DIR/notification-focus.sh" ]; then
            q() { printf "%s" "$1" | sed "s/'/'\\\\''/g"; }
            set -- "$@" -execute \
                "'$(q "$SCRIPT_DIR/notification-focus.sh")' '$(q "$cwd")'"
        fi
        "$NOTIFIER_BIN" "$@" >/dev/null 2>&1 || true
    elif command -v osascript >/dev/null 2>&1; then
        # Backslashes first, then quotes: reversing the order would
        # escape the backslashes this step introduces. A branch name
        # is free to contain either, and an unescaped one is an
        # AppleScript syntax error that `|| true` would hide.
        esc() {
            printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
        }
        osascript -e "display notification \"$(esc "$body")\" \
            with title \"$(esc "$title")\"" >/dev/null 2>&1 || true
    fi
fi

if [ "$SPEAK" = "1" ] && command -v say >/dev/null 2>&1; then
    say -v "$VOICE" "$spoken" >/dev/null 2>&1 || true
fi

if [ "$CHIME" = "1" ] && [ -f "$AUDIO_FILE" ] \
    && command -v afplay >/dev/null 2>&1; then
    afplay "$AUDIO_FILE" >/dev/null 2>&1 || true
fi

exit 0
