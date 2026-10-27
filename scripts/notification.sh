#!/bin/bash

# Stop-hook notification: say which worktree just finished.
#
# With "needs-input" as its argument it says instead that Claude is waiting
# for a reply: a question from AskUserQuestion (PreToolUse hook) or a
# permission prompt (Notification hook). A question modal gives no signal of
# its own in VS Code, so a turn could sit blocked on one unnoticed.
#
# Claude Code runs this when a response completes, passing the hook payload as
# JSON on stdin. We read `cwd` from that payload - it follows Claude into the
# worktree, whereas $CLAUDE_PROJECT_DIR stays at the session's start directory.
#
# Several worktrees of this repository are usually open at once, and a bare
# sound is identical from each, so the worktree name is spoken aloud.
#
# Every platform branch is best-effort: a notification that cannot be shown is
# never worth failing a response over, so this always exits 0.

set -u

MODE="${1:-finished}"

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

# `cwd` also follows Claude into a subdirectory after a `cd frontend`, and
# the banner would then be titled "frontend", spoken as "frontend", and a
# click would open that folder over the worktree's window. Climb back to the
# worktree root; outside a repository the directory stands as it is.
root="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || true)"
[ -n "$root" ] && cwd="$root"

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
summary_flag=""
[ "$MODE" = "needs-input" ] && summary_flag="--input"
if [ -n "$payload" ] && command -v python3 >/dev/null 2>&1; then
    summary="$(printf '%s' "$payload" \
        | python3 "$SCRIPT_DIR/notification-summary.py" ${summary_flag:+"$summary_flag"} \
            2>/dev/null || true)"
fi

if [ "$MODE" = "needs-input" ]; then
    title="$worktree"
    body="${summary:-Claude is waiting for your reply}"
else
    title="$worktree"
    if [ -n "$summary" ]; then
        body="$summary"
    elif [ -n "$branch" ]; then
        body="Claude finished on $branch"
    else
        body="Claude finished"
    fi
fi

# macOS keeps one banner per group, a new one replacing the last. The
# worktree is part of the group so that each worktree keeps its own: two
# finishing while nobody is looking leave two banners, not just the later
# one. A question has a group apart from a finished turn, so its banner is
# not replaced by the finished banner that follows the reply, or the other
# way round.
group="quill-claude-stop-$worktree"
[ "$MODE" = "needs-input" ] && group="quill-claude-input-$worktree"

# Set QUILL_NOTIFY_DEBUG=1 to print what would be shown and stop; used by
# the tests, and handy when a banner is not saying what you expected.
if [ "${QUILL_NOTIFY_DEBUG:-0}" = "1" ]; then
    printf 'title=%s\nbody=%s\ngroup=%s\n' "$title" "$body" "$group"
    if [ -n "${QUILL_NOTIFY_SSH_HOST:-}" ] \
        && [ "$(uname -s 2>/dev/null)" = "Linux" ]; then
        printf 'forward=%s\nremote=%s\n' "$QUILL_NOTIFY_SSH_HOST" \
            "${QUILL_NOTIFY_REMOTE_NAME:-devbox}"
    fi
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

SHOW_SCRIPT="$SCRIPT_DIR/notification-show.sh"
FOCUS_SCRIPT="$SCRIPT_DIR/notification-focus.sh"

# The Mac to forward to from the Linux dev box, as anything `ssh` accepts:
# an alias from ~/.ssh/config, or user@host. Unset, the box shows nothing
# beyond what notify-send can, which on a headless box is nothing.
SSH_HOST="${QUILL_NOTIFY_SSH_HOST:-}"

# What the Mac calls the box, the name VS Code shows in a window title as
# "quillmedical-5 [SSH: devbox]". A click on the banner looks for that title,
# and opens the folder over SSH by that name if no window holds it.
REMOTE_NAME="${QUILL_NOTIFY_REMOTE_NAME:-devbox}"

case "$(uname -s 2>/dev/null || echo unknown)" in
    Darwin)
        "$SHOW_SCRIPT" "$title" "$body" "$group" "$spoken" "$cwd" \
            >/dev/null 2>&1 || true
        ;;
    Linux)
        # Claude runs on a headless box reached over VS Code Remote-SSH,
        # so the screen being watched is the Mac's. Stream
        # notification-show.sh to it and run it there with what to say,
        # rather than calling a checkout on the Mac, which may be on
        # another branch or not exist at all.
        #
        # notification-focus.sh, which a click on the banner runs, travels
        # in the same stream as a variable set ahead of the show script.
        # The show script saves it on the Mac, because the click comes
        # after this connection has closed.
        #
        # BatchMode stops ssh ever waiting on a password, and setsid -f
        # detaches it, so a Mac that is asleep or refusing connections
        # costs the hook nothing: the turn ends at once either way.
        if [ -n "$SSH_HOST" ] && command -v ssh >/dev/null 2>&1; then
            remote="$(printf '%q ' bash -s -- \
                "$title" "$body" "$group" "$spoken" "$cwd" "$REMOTE_NAME")"

            stream="$(printf 'QUILL_NOTIFY_FOCUS_SOURCE=%q\n' \
                "$(cat "$FOCUS_SCRIPT" 2>/dev/null)"; cat "$SHOW_SCRIPT")"

            setsid -f ssh -o BatchMode=yes -o ConnectTimeout=5 \
                "$SSH_HOST" "$remote" <<<"$stream" >/dev/null 2>&1 \
                || true
            exit 0
        fi

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
        # Git Bash / MSYS on Windows. Untested - best effort only.
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
