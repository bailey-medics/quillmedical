# Owl, the alert watcher

Watches `#quill-medical-cicd` for App production alerts and types `/alert <file>` into the Claude Code session in Owl's worktree, `quillmedical-owl`, which investigates and opens a pull request ready for review. It runs on the dev box as the systemd user service `quill-owl.service`. The steps to set it up are below.

## What it does

- **Listens to two apps only.** Google Cloud's own integration, for Cloud Monitoring alerts and Google incidents, and Goshawk, the app the GitHub workflows post through. Their `bot_id`s are in `OWL_ALERT_APPS`. Any other app's post starts nothing and is logged as `ignored-app` with its `bot_id`, so a new app in the channel shows up in the journal without a run.
- **Acts on every post from those apps, unless it is on the ignore list.** It would rather start a run that turns out not to be needed than miss a fault, since a person reviews every pull request anyway. The ignore list is success posts opening with ✅, the four-weekly alert route test, the retention decision, and the closing post of an alert already handled. Everything a person writes, replies in threads and its own posts are never alerts. The skill answers a post that is not a fault with "Not a fault" and a suggested addition to the list, and the list is narrowed from those.
- **Knows three shapes by name.** A Cloud Monitoring post whose bold title is one of the policy subjects listed in `src/messages.ts` (Google's post shows the policy's documentation subject, never its name), a `*❌ Deploy failed*` post from `deploy.yml`, and the Google Cloud incident policy. Any other post is `other`.
- **Runs each alert once.** Each is fingerprinted (the post's first bold line and the UTC day, or for a failed deploy its commit), and no more than twenty investigations start in a UTC day, though a failed deploy is always investigated. The cap guards the Claude plan against a storm of different alerts; an alert held back by it gets a reply asking a person to look by hand.
- **Waits its turn.** One investigation at a time. It queues while the session is busy, with an alert or with a person, and parks while moving Owl's worktree to the latest `main` would lose somebody's work: uncommitted changes, or a detached commit that `main` does not contain. A clean checkout on any branch, or behind `main`, is free, so a merge to `main` never stalls it.
- **Treats an open Google Cloud incident as the cause** of every other alert for the next twelve hours, or until the incident closes.
- **Stops a run that goes past 45 minutes** with Escape, and says so in the thread. A person's turn is never interrupted.
- **Warns before its certificate runs out.** The box reads the logs by showing Google a client certificate that lasts a year. From 30 days before it runs out, the watcher posts a reminder in the channel with the renewal command, once a week until it is renewed. Its expiry date is written to the journal at start-up.

## Asking Owl a question

Mention Owl in the channel, at the top level or in a thread, and it answers in that thread. In an alert's thread it reads the alert too, so "@owl is this the same as yesterday's?" has its context. Only the Slack member ids in `OWL_SUMMONERS` may ask. A mention from anybody else starts nothing and gets no reply, and the journal logs `mention-refused` without the text or who sent it.

A mention waits in the same queue as alerts and counts towards the same daily limit. An open Google Cloud incident does not swallow it. The session runs `/ask <file>` instead of `/alert <file>`, and `/ask` answers only: it never commits, pushes or opens a pull request.

The skill posts the root cause and the summary to the thread itself, through `scripts/slack-reply.sh`. The daemon only says it has picked an alert up, queued it or parked it.

## Never waiting on a prompt

Nobody is at the session to answer a permission prompt, so a prompt stalls a run until the 45-minute limit stops it. Three things keep a run from raising one:

- **An allowlist** in `start-session.sh`: the stack recipes, `slack-reply.sh`, `gcloud logging read`, and Owl's own `journalctl` and `systemctl` state, so "is Owl working?" is answered without asking.
- **Reads outside the worktree are refused** by `blockReadsOutsideWorkingDirectories` in `session-settings.json`.
- **A Bash guard**, `.claude/hooks/owl-bash-guard.sh`, wired in `session-settings.json`, refuses a command in a shape that would prompt: commands joined with `;`, `&&` or `||`, a leading `cd`, `python3 -c`, or an unquoted path outside the worktree, the alerts folder, `/dev` and the scratchpad. The refusal tells the model what shape to use instead, so it tries again rather than waiting. Quoted text and heredoc bodies are not looked at, so a Slack reply may say anything.

## Installing it

from Owl's worktree on the dev box, once the env file below exists:

```bash
just owl-install
```

That installs the packages and links `quill-owl.service` into systemd as a user service, which starts the tmux session through `start-session.sh` and then the daemon. Its log is `journalctl --user -u quill-owl`.

The tmux server runs in a systemd scope of its own, `quill-tmux-server.scope`, not in the watcher's process group. At boot `start-session.sh` is usually the first `tmux new-session` on the box, so the server it starts would otherwise belong to the service, and systemd kills everything in a service's group when it stops. A restart of the watcher must never close the sessions people are working in: on 4 November 2026 one closed all of them. `systemctl --user status quill-tmux-server.scope` shows the server.

On a box that still runs `quill-alert-watcher.service`, the service's name before Owl, the same command moves it across: it stops the old service, moves `~/.config/quill-alert-watcher` and `~/.local/state/quill-alert-watcher` to their `quill-owl` names, and starts `quill-owl.service`. It is safe to run again.

To restart Owl and its Claude Code session, for example to pick up a change to `start-session.sh`:

```bash
just owl-restart
```

It refuses while the `owl` session is busy with an alert run, unless given `force`, and runs the restart detached, so it works from inside that session too.

The unit is linked from Owl's worktree, so whenever that worktree moves to a commit where the unit file differs, systemd warns that it changed on disk. `systemctl --user daemon-reload` clears it; the warning is expected.

## Settings

Read from the environment, which the systemd unit loads from `~/.config/quill-owl/env`:

- **`SLACK_APP_TOKEN`** - the app-level token, `xapp-`, with `connections:write`.
- **`SLACK_BOT_TOKEN`** - the bot token, `xoxb-`, with `channels:history` and `chat:write`.
- **`OWL_CHANNEL`** - the channel's id, such as `C0123456789`, not its name.
- **`OWL_ALERT_APPS`** - the `bot_id`s of the two apps whose posts may be alerts, comma-separated, such as `B0123456789,B0987654321`. Required: the watcher refuses to start without it. To find an app's id, set `OWL_RECORD_EVENTS=1` for one of its posts and read `bot_id` from the saved event.
- **`OWL_SUMMONERS`** - the Slack member ids who may ask Owl a question with a mention, comma-separated, such as `U0123456789`. Optional: empty means nobody may. In Slack, open a profile, then the three dots, then "Copy member ID".
- **`OWL_WORKTREE`** - defaults to `~/github/quillmedical-owl`.
- **`OWL_TMUX_TARGET`** - defaults to `owl`.
- **`OWL_STATE`** - defaults to `~/.local/state/quill-owl`, the folder `.claude/hooks/owl-busy.sh` keeps the busy flag in.
- **`OWL_CERTIFICATE`** - defaults to `~/.config/quill-owl/pki/watcher.crt`, the client certificate whose expiry it watches.
- **`OWL_RECORD_EVENTS=1`** - saves every channel event to `events/` in the state folder, for checking the message shapes against `src/messages.ts`. Off otherwise: the journal never holds alert text.

## Tests

```bash
just uow
```

That runs `yarn typecheck` and `yarn test` in a throwaway container. CI runs the same in its shell checks job. The tests replace Slack, git and tmux with fakes, so they need none of them. One reads `infra/modules/monitoring/main.tf` and fails if an alert policy's subject there is not listed in `src/messages.ts`.

The program runs on Node 24's own TypeScript type stripping, so there is no build step: `yarn start` is `node src/main.ts`.
