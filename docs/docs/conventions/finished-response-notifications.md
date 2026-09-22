# Finished-response notifications

When Claude finishes a response, macOS shows a banner saying what the turn
did, and speaks the name of the worktree. Clicking the banner raises the
editor window for that worktree, switching Space if it is on another one.

Several worktrees of this repository are usually open at once, on separate
Spaces, so "something finished" is only useful if it also says **which**
worktree, and offers a way back to it.

## What happens on each response

`.claude/settings.json` registers `scripts/notification.sh` as a `Stop`
hook. Claude Code runs it when a response completes, passing the hook
payload as JSON on stdin. The script then does three things, each of which
can be turned off on its own:

- **A banner**, titled with the worktree directory and carrying a one-line
  summary of the turn.
- **Speech**, saying the worktree name aloud. This needs no screen, which
  is the point: it tells you which of several worktrees finished while you
  are looking at something else.
- **A chime**, off by default.

Every platform branch is best-effort and the script always exits zero. A
notification that cannot be shown is never worth failing a response over.

## Where the banner text comes from

The payload carries `last_assistant_message`, the full text of the final
response. `scripts/notification-summary.py` reduces it to one line:

1. The first bullet under the closing `## TL;DR` heading, which the project
   instructions require every response to end with. That bullet is written
   to carry the result on its own, so it needs no summarising.
2. Failing that, the first line of ordinary prose, skipping headings,
   bullets, code fences and quotes.
3. Failing that, nothing, and `notification.sh` names the branch instead.

A bold lead is kept and the sentences after it dropped, because
`**Did the thing.** Detail follows.` is exactly the split between summary
and detail. Markdown links and emphasis are flattened, and the result is
capped at 120 characters.

Every failure path prints nothing and exits zero, so a parse error costs
the summary rather than the banner.

## Why the icon needs its own application

macOS takes a notification's icon from the bundle that sent it, and offers
no way to override it per notification. `terminal-notifier` removed its own
`-appIcon` flag in 3.0.0 for that reason.

So a Quill icon means a copy of `terminal-notifier` with its own bundle
identifier, which `just notifier-app` builds into
`~/Applications/quill-notifier.app`. `initialise-repo` runs it, and a
failure there only warns.

**Allow it to notify once**, under System Settings, Notifications, Quill.
Until then it posts nothing.

The app is not committed, because it is a signed binary. Without it
`notification.sh` falls back to `osascript`, which works everywhere and
shows the generic osascript icon.

Three things were tried first and none of them work:

- **`-appIcon`** is removed, as above.
- **Wrapping `osascript` in an app bundle**, either an AppleScript applet
  or a shell script in a bundle. Whatever wraps it, `osascript` is the
  process that posts, so macOS attributes the banner to `osascript`.
- **Addressing another application**, `tell application "Script Editor" to
  display notification`. This changes nothing except to break it:
  addressing System Events returns exit 0 and shows no banner at all.

## Why clicking raises the right window

`-activate` takes a bundle identifier, which names an application rather
than a window, so macOS raises whichever Visual Studio Code window was last
in front. With several worktrees open on separate Spaces, that is rarely
the one that finished.

`-execute` stores a command with the notification and runs it when the
banner is clicked. `scripts/notification-focus.sh` then raises the window
whose title contains the worktree's directory name: VS Code titles a window
`<file> — <folder>`, so the folder name finds it. It uses `AXRaise` through
System Events, which **needs Accessibility permission**, under System
Settings, Privacy and Security, Accessibility.

That takes about 330 milliseconds. `code -r <path>` does the same job with
no permission at all, but takes about 1.3 seconds, because it starts Node
and boots VS Code's command line machinery before it can speak to the
running editor. It also *opens* a folder that has no window yet, which is
wrong for something whose job is to return to an open one. It is left in
the script, commented out.

### Clear old notifications before testing a click

A banner still sitting in Notification Centre carries its stored command.
Click a stale one and *its* command runs, which is easy to misread as a
newly sent banner firing on delivery rather than on click. That misreading
cost an afternoon here, and briefly had this page asserting that `-execute`
was broken when it was not.

Remove them first, then send one and leave it alone:

```bash
terminal-notifier -remove quill-claude-stop
terminal-notifier -list ALL     # should show nothing of yours
```

## How long a banner stays up

This is not the sender's to choose. macOS takes it from a per-application
setting with two values: **Banners**, which fade after about five seconds,
and **Alerts**, which stay until dismissed. Change it under System
Settings, Notifications, Quill.

Each banner uses `-group quill-claude-stop`, so a new one replaces the
last rather than stacking. Across several worktrees that keeps Notification
Centre clear, at the cost of not seeing a backlog of what finished while
you were away.

## Turning parts of it off

All of these are read from the environment by `scripts/notification.sh`:

- `QUILL_NOTIFY_SPEAK=0` silences the speech.
- `QUILL_NOTIFY_BANNER=0` suppresses the banner.
- `QUILL_NOTIFY_ACTIVATE=""` leaves a click on the banner doing nothing.
- `QUILL_NOTIFY_VOICE` picks another installed voice. The default is Karen.
- `QUILL_NOTIFY_CHIME=1` brings back the completion sound.
- `QUILL_NOTIFY_APP` points at the notifier if it is not in the default
  place.
- `QUILL_NOTIFY_DEBUG=1` prints the title and body that would be shown and
  stops, which is how the behaviour above is checked.

## A warning about exit codes

Neither `osascript` nor `terminal-notifier` reports a failed banner
usefully. Exit status says only that the command ran, never that anything
appeared on screen, and several of the dead ends above returned zero while
showing nothing.

**Changes here have to be confirmed by eye.** A passing command is not
evidence that a banner was delivered.
