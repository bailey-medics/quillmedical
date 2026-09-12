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

title="$worktree"
if [ -n "$branch" ]; then
    body="Claude finished on $branch"
else
    body="Claude finished"
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
# voice, QUILL_NOTIFY_SPEAK=0 silences speech, and QUILL_NOTIFY_CHIME=1 brings
# back the completion sound, which is off by default.
VOICE="${QUILL_NOTIFY_VOICE:-Karen}"
SPEAK="${QUILL_NOTIFY_SPEAK:-1}"
CHIME="${QUILL_NOTIFY_CHIME:-0}"

case "$(uname -s 2>/dev/null || echo unknown)" in
    Darwin)
        # Notification Centre banners are not usable here: a banner posted by
        # osascript is attributed to osascript, which is not registered with
        # Notification Center, so macOS discards it silently and still exits 0.
        # Speech is the reliable channel, and is enough on its own.
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
