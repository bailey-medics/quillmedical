# Alert watcher

Watches `#quill-medical-cicd` for App production alerts and types `/alert <file>` into the Claude Code session in worktree 5, which investigates and opens a pull request ready for review. It runs on the home box as the systemd user service `quill-alert-watcher.service`. The design, and the steps to set it up, are in the watcher phase of [the remote dev machine plan](../../docs/docs/plans/2026-10-19-remote-dev-machine-plan.md).

## What it does

- **Matches three shapes of message.** A Cloud Monitoring post naming one of the alert policies listed in `src/messages.ts`, a `*❌ Deploy failed*` post from `deploy.yml`, and the Google Cloud incident policy. Everything a person writes is ignored, and so are the four-weekly alert route test and the retention decision.
- **Runs each alert once.** Each is fingerprinted (policy and UTC day, or workflow and commit), and no more than six investigations start in a day.
- **Waits its turn.** One investigation at a time. It queues while the session is busy, with an alert or with a person, and parks while worktree 5 has uncommitted work or is on a branch of somebody's own.
- **Treats an open Google Cloud incident as the cause** of every other alert for the next twelve hours, or until the incident closes.
- **Stops a run that goes past 45 minutes** with Escape, and says so in the thread. A person's turn is never interrupted.

The skill posts the root cause and the summary to the thread itself, through `scripts/slack-reply.sh`. The daemon only says it has picked an alert up, queued it or parked it.

## Installing it

From worktree 5 on the home box, once the env file below exists:

```bash
just alert-watcher-install
```

That installs the packages and links `quill-alert-watcher.service` into systemd as a user service, which starts the tmux session through `start-session.sh` and then the daemon. Its log is `journalctl --user -u quill-alert-watcher`.

## Settings

Read from the environment, which the systemd unit loads from `~/.config/quill-alert-watcher/env`:

- **`SLACK_APP_TOKEN`** - the app-level token, `xapp-`, with `connections:write`.
- **`SLACK_BOT_TOKEN`** - the bot token, `xoxb-`, with `channels:history` and `chat:write`.
- **`ALERT_WATCHER_CHANNEL`** - the channel's id, such as `C0123456789`, not its name.
- **`ALERT_WATCHER_WORKTREE`** - defaults to `~/github/quillmedical-5`.
- **`ALERT_WATCHER_TMUX_TARGET`** - defaults to `q5`.
- **`QUILL_ALERT_WATCHER_STATE`** - defaults to `~/.local/state/quill-alert-watcher`, the folder `.claude/hooks/alert-watcher-busy.sh` keeps the busy flag in.
- **`ALERT_WATCHER_RECORD_EVENTS=1`** - saves every channel event to `events/` in the state folder, for checking the message shapes against `src/messages.ts`. Off otherwise: the journal never holds alert text.

## Tests

```bash
just uaw
```

That runs `yarn typecheck` and `yarn test` in a throwaway container. CI runs the same in its shell checks job. The tests replace Slack, git and tmux with fakes, so they need none of them. One reads `infra/modules/monitoring/main.tf` and fails if an alert policy there is not listed in `src/messages.ts`.

The program runs on Node 24's own TypeScript type stripping, so there is no build step: `yarn start` is `node src/main.ts`.
