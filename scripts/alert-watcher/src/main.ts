// The alert watcher: holds one Socket Mode connection to Slack, hands each
// channel message to the Watcher, and moves the queue on every 30 seconds.
//
// Run by quill-alert-watcher.service on the home box. Reconnecting after a
// dropped connection is @slack/socket-mode's job, not this file's.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { SocketModeClient } from "@slack/socket-mode";
import { WebClient } from "@slack/web-api";

import { ConfigError, readConfig } from "./config.ts";
import { Ledger } from "./ledger.ts";
import type { SlackMessage } from "./messages.ts";
import { Session } from "./session.ts";
import { DEFAULT_OPTIONS, Watcher } from "./watcher.ts";
import { checkWorktree } from "./worktree.ts";

const TICK_MS = 30_000;

function log(event: string, fields: Record<string, string | number | boolean> = {}): void {
  const parts = Object.entries(fields).map(([key, value]) => `${key}=${JSON.stringify(value)}`);

  console.log([event, ...parts].join(" "));
}

function isSlackMessage(value: unknown): value is SlackMessage {
  return value !== null && typeof value === "object" && "ts" in value && typeof value.ts === "string";
}

// Raw events saved to the state folder, only when ALERT_WATCHER_RECORD_EVENTS
// is 1, so the shapes Cloud Monitoring posts can be checked against
// messages.ts during the rehearsal. Off otherwise: the journal never holds
// alert text, and neither does the state folder.
function recordEvent(directory: string, event: SlackMessage): void {
  const folder = join(directory, "events");

  mkdirSync(folder, { recursive: true, mode: 0o700 });
  writeFileSync(join(folder, `${event.ts}.json`), JSON.stringify(event, null, 2), { mode: 0o600 });
}

async function main(): Promise<void> {
  const config = readConfig(process.env);
  const web = new WebClient(config.botToken);
  const socket = new SocketModeClient({ appToken: config.appToken });
  const identity = await web.auth.test();
  const session = new Session({ stateDirectory: config.stateDirectory, tmuxTarget: config.tmuxTarget });
  const ledger = new Ledger(join(config.stateDirectory, "ledger.json"));

  const watcher = new Watcher(
    {
      now: () => new Date(),
      reply: async (channel, threadTs, text) => {
        await web.chat.postMessage({ channel, thread_ts: threadTs, text, unfurl_links: false });
      },
      permalink: async (channel, ts) => {
        try {
          const found = await web.chat.getPermalink({ channel, message_ts: ts });
          return found.permalink;
        } catch {
          return undefined;
        }
      },
      checkWorktree: () => checkWorktree(config.worktree),
      session,
      log,
    },
    ledger,
    { ...DEFAULT_OPTIONS, channel: config.channel, ownBotId: identity.bot_id },
  );

  socket.on("message", async ({ event, ack }: { event: unknown; ack: () => Promise<void> }) => {
    await ack();

    if (!isSlackMessage(event)) {
      return;
    }

    if (config.recordEvents && event.channel === config.channel) {
      recordEvent(config.stateDirectory, event);
    }

    try {
      await watcher.onMessage(event);
    } catch (error) {
      log("message-failed", { error: error instanceof Error ? error.name : "unknown" });
    }
  });

  setInterval(() => {
    watcher.tick().catch((error: unknown) => {
      log("tick-failed", { error: error instanceof Error ? error.message : "unknown" });
    });
  }, TICK_MS);

  await socket.start();
  log("connected", { channel: config.channel, worktree: config.worktree });
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(2);
  }

  console.error(error instanceof Error ? error.message : "The watcher stopped.");
  process.exit(1);
});
