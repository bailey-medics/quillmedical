#!/bin/bash

# Stop-hook notification: say which worktree just finished.
#
# Claude Code runs this when a response completes, passing the hook payload as
# JSON on stdin. We read `cwd` from that payload — it follows Claude into the
# worktree, whereas $CLAUDE_PROJECT_DIR stays at the session's start directory.
#
# Several worktrees of this repository are usually open at once, and a bare
# sound is identical from each, so the worktree name is spoken aloud.
#
# Every platform branch is best-effort: a notification that cannot be shown is
# never worth failing a response over, so this always exits 0.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AUDIO_FILE="$SCRIPT_DIR/level-completed.mp3"

# Read the hook payload, if there is one. Extract `cwd` without assuming jq is
# installed; fall back to the current directory when stdin is empty or odd.
payload=""
if [ ! -t 0 ]; then
    payload="$(cat 2>/dev/null || true)"
fi

cwd=""
if [ -n "$payload" ]; then
    cwd="$(printf '%s' "$payload" \
        | sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
        | head -n 1)"
fi
[ -n "$cwd" ] || cwd="$PWD"

worktree="$(basename "$cwd")"
branch="$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

# What the turn actually did, taken from `last_assistant_message` in the
# payload. The first bullet of the closing TL;DR is written to carry the
# result on its own, so its bold lead makes a better banner line than the
# branch name: "Wired the notifier into the Stop hook" rather than
# "finished on
# feature/practising-stop-the-card-asking-forever".
#
# Python rather than sed: the field is long, multiline and JSON-escaped, and
# a regex over it goes wrong quietly. Any failure leaves $summary empty and
# the branch line stands in, so a banner is never lost to a parse error.
summary=""
if [ -n "$payload" ] && command -v python3 >/dev/null 2>&1; then
    summary="$(printf '%s' "$payload" \
        | python3 "$SCRIPT_DIR/notification-summary.py" 2>/dev/null || true)"
fi

title="$worktree"
if [ -n "$summary" ]; then
    body="$summary"
elif [ -n "$branch" ]; then
    body="Claude finished on $branch"
else
    body="Claude finished"
fi

# Set QUILL_NOTIFY_DEBUG=1 to print what would be shown and stop; used by
# the tests, and handy when a banner is not saying what you expected.
if [ "${QUILL_NOTIFY_DEBUG:-0}" = "1" ]; then
    printf 'title=%s\nbody=%s\n' "$title" "$body"
    exit 0
fi

# Spoken phrase. Directory names like "quillmedical-4" read poorly aloud, so
# speak the trailing number on its own ("Quill Medicine 4"); the main checkout
# has no suffix and becomes "Quill Medicine one".
case "$worktree" in
    *-[0-9]*) spoken="Quill Medicine ${worktree##*-}" ;;
    quillmedical) spoken="Quill Medicine one" ;;
    *) spoken="$worktree" ;;
esac

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


case "$(uname -s 2>/dev/null || echo unknown)" in
    Darwin)
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
                set -- -title "$title" -message "$body" \
                    -group quill-claude-stop
                if [ "${QUILL_NOTIFY_ACTIVATE-1}" != "" ] \
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
        ;;
    Linux)
        if command -v notify-send >/dev/null 2>&1; then
            notify-send "$title" "$body" >/dev/null 2>&1 || true
        fi
        for player in paplay aplay ffplay; do
            if [ -f "$AUDIO_FILE" ] && command -v "$player" >/dev/null 2>&1; then
                "$player" "$AUDIO_FILE" >/dev/null 2>&1 || true
                break
            fi
        done
        ;;
    MINGW*|MSYS*|CYGWIN*)
        # Git Bash / MSYS on Windows. Untested — best effort only.
        if command -v powershell.exe >/dev/null 2>&1; then
            powershell.exe -NoProfile -Command \
                "[reflection.assembly]::LoadWithPartialName('System.Windows.Forms') | Out-Null; \
                 \$n = New-Object System.Windows.Forms.NotifyIcon; \
                 \$n.Icon = [System.Drawing.SystemIcons]::Information; \
                 \$n.Visible = \$true; \
                 \$n.ShowBalloonTip(5000, '$title', '$body', 'Info'); \
                 Start-Sleep -Seconds 5" >/dev/null 2>&1 || true
        fi
        ;;
    *)
        # Unknown platform: stay silent rather than emit noise on every response.
        ;;
esac

exit 0
