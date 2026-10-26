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

## When Claude is waiting on you

A question from `AskUserQuestion` opens a modal in VS Code with no sound and
no banner, so a turn could sit blocked on one for as long as nobody looked.
Two more hooks in `.claude/settings.json` run the same script with
`needs-input` as its argument:

- **`PreToolUse` on `AskUserQuestion`** fires just before the question
  appears. The banner shows the question itself.
- **`Notification` for `permission_prompt`** fires when a tool call is
  waiting on your approval. The banner shows Claude Code's own sentence,
  such as "Claude needs your permission to use Bash".

The title and the voice are the same as for a finished turn, the worktree
name; the banner's text is what tells them apart, showing the question
rather than a summary. The banner uses its own group,
`quill-claude-input-<worktree>`, so the finished banner that follows your
reply does not replace it. Both hooks run with `async`, so the question
appears straight away rather than waiting for the voice to finish.

`idle_prompt` is deliberately left out. It fires after the input box has
been idle for a while, which is after the finished notification has already
told you, so it would only repeat it.

## On the Linux dev box

Claude also runs on a headless Linux box, reached from the Mac over VS Code
Remote-SSH and Tailscale. The hooks fire there, but the box has no screen,
so a banner posted on it would reach nobody.

`notification.sh` therefore only works out *what* to say: the title, the
summary, the group and the spoken name. Showing it is
`scripts/notification-show.sh`, which holds everything Mac-specific above.
On a Mac it is called directly. On Linux, when `QUILL_NOTIFY_SSH_HOST` names
the Mac, the file is streamed over SSH and run there as `bash -s`, so the
Mac needs no checkout of the repository and no copy of the script that
could fall out of date. Unset, the box falls back to `notify-send`, which
on a headless box shows nothing.

`ssh` runs with `BatchMode` and is detached with `setsid -f`, so a Mac that
is asleep, off the tailnet or refusing connections costs the turn nothing.

What the Mac needs, once:

1. **Remote Login on**, under System Settings, General, Sharing. Under its
   (i), "Allow access for" must include the account the box logs in as. If
   it does not, the Mac accepts the key and then closes the connection,
   which looks like a key problem and is not.
2. **The box's public key** in the Mac's `~/.ssh/authorized_keys`. Pasting
   it in on the Mac is the dependable way; `ssh-copy-id` needs a password
   login, and fails the same way while the account is not allowed.
3. **One interactive `ssh` from the box to the Mac**, to accept its host
   key. `BatchMode` will never accept an unknown key on its own.

Then set the variable where Claude Code passes it to hooks, in the box's
`~/.claude/settings.json`:

```json
"env": { "QUILL_NOTIFY_SSH_HOST": "markbailey@<the Mac's Tailscale name>" }
```

Two things are lost on the way:

- **A click focuses nothing.** The focus script is not sent, and a Remote-SSH
  window's title ends with `[SSH: devbox]`, so it would not find the window
  anyway.
- **The other `QUILL_NOTIFY_*` settings are the Mac's defaults**, not the
  box's, because they are not forwarded.

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
whose title ends with the worktree's directory name: VS Code titles a window
`<file> - <folder>`, so the folder name finds it. It uses `AXRaise` through
System Events, which **needs Accessibility permission**, under System
Settings, Privacy and Security, Accessibility.

The title must *end with* the name, not contain it. The main checkout is
`quillmedical`, which `quillmedical-3` contains, so a click on its banner
used to raise whichever worktree was in view and go no further.

That takes about 330 milliseconds, but System Events lists only the windows
on the Space in view. For a worktree on another Space the script falls back
to `open -a "Visual Studio Code" <path>`: the editor brings forward the
window holding that folder and macOS follows to its Space, left or right.
It also *opens* a folder that has no window yet, in a new window, so it
runs only for a path that is a real directory. `QUILL_NOTIFY_EDITOR` names
a different application.

The fallback was once `code -r <path>`. That reuses the window in front
when nothing holds the path, replacing the worktree open in it.

### Clear old notifications before testing a click

A banner still sitting in Notification Centre carries its stored command.
Click a stale one and *its* command runs, which is easy to misread as a
newly sent banner firing on delivery rather than on click. That misreading
cost an afternoon here, and briefly had this page asserting that `-execute`
was broken when it was not.

Remove them first, then send one and leave it alone:

```bash
terminal-notifier -remove ALL
terminal-notifier -list ALL     # should show nothing of yours
```

## How long a banner stays up

This is not the sender's to choose. macOS takes it from a per-application
setting with two values: **Banners**, which fade after about five seconds,
and **Alerts**, which stay until dismissed. Change it under System
Settings, Notifications, Quill.

Each banner uses `-group quill-claude-stop-<worktree>`, and macOS keeps one
banner per group. So a worktree's new banner replaces that worktree's last
one, and never another worktree's: if two finish while you are reading,
both are there when you look up. With **Alerts** chosen above, that is at
most one banner on screen for each worktree.

## Turning parts of it off

All of these are read from the environment by `scripts/notification.sh`:

- `QUILL_NOTIFY_SPEAK=0` silences the speech.
- `QUILL_NOTIFY_BANNER=0` suppresses the banner.
- `QUILL_NOTIFY_ACTIVATE=""` leaves a click on the banner doing nothing.
- `QUILL_NOTIFY_VOICE` picks another installed voice. The default is Karen.
- `QUILL_NOTIFY_CHIME=1` brings back the completion sound.
- `QUILL_NOTIFY_APP` points at the notifier if it is not in the default
  place.
- `QUILL_NOTIFY_SSH_HOST` names the Mac a Linux box forwards to, as
  above.
- `QUILL_NOTIFY_DEBUG=1` prints the title, body and group that would be
  used and stops, which is how the behaviour above is checked.

## A warning about exit codes

Neither `osascript` nor `terminal-notifier` reports a failed banner
usefully. Exit status says only that the command ran, never that anything
appeared on screen, and several of the dead ends above returned zero while
showing nothing.

**Changes here have to be confirmed by eye.** A passing command is not
evidence that a banner was delivered.
