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
# worktree is the group, so each worktree keeps one banner, its latest: two
# worktrees finishing while nobody is looking leave two banners, and one
# worktree finishing twice leaves one. A question shares the group with a
# finished turn. Mark asked for that on 27 October 2026, after the two kinds
# had been kept apart and piled up for the same worktree.
group="quill-claude-$worktree"

# Spoken phrase. Directory names like "quillmedical-4" read poorly aloud, so
# speak the trailing number on its own ("Quill Medicine 4"); the main checkout
# has no suffix and becomes "Quill Medicine one", and Owl's worktree is
# "Quill Medicine Owl".
case "$worktree" in
    quillmedical-owl) spoken="Quill Medicine Owl" ;;
    *-[0-9]*) spoken="Quill Medicine ${worktree##*-}" ;;
    quillmedical) spoken="Quill Medicine one" ;;
    *) spoken="$worktree" ;;
esac

# Set QUILL_NOTIFY_DEBUG=1 to print what would be shown and stop; used by
# the tests, and handy when a banner is not saying what you expected.
if [ "${QUILL_NOTIFY_DEBUG:-0}" = "1" ]; then
    printf 'title=%s\nbody=%s\ngroup=%s\nspoken=%s\n' "$title" "$body" "$group" "$spoken"
    exit 0
fi

SHOW_SCRIPT="$SCRIPT_DIR/notification-show.sh"
QUEUE_SCRIPT="$SCRIPT_DIR/notification-queue.py"

case "$(uname -s 2>/dev/null || echo unknown)" in
    Darwin)
        "$SHOW_SCRIPT" "$title" "$body" "$group" "$spoken" "$cwd" \
            >/dev/null 2>&1 || true
        ;;
    Linux)
        # Claude runs on a headless box reached over VS Code Remote-SSH,
        # so the screen being watched is the Mac's. The box only offers
        # the banner, as a line in a queue file, and the Mac's
        # notification-listen.sh fetches it over a connection the Mac
        # opens. So the box never connects to the Mac, and what reaches
        # the Mac is text it shows, never a script it runs.
        if command -v python3 >/dev/null 2>&1; then
            python3 "$QUEUE_SCRIPT" write -- \
                "$title" "$body" "$group" "$spoken" "$cwd" \
                >/dev/null 2>&1 || true
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
