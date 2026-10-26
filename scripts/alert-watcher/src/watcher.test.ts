import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, it } from "node:test";

import { Ledger } from "./ledger.ts";
import type { SlackMessage } from "./messages.ts";
import { DEFAULT_OPTIONS, Watcher, type Dependencies } from "./watcher.ts";
import type { WorktreeState } from "./worktree.ts";

const CHANNEL = "C0123456789";

// A stand-in for Slack, git and tmux that records what the watcher did.
class Fakes {
  now = new Date("2026-10-26T09:00:00Z");
  busy: number | undefined;
  worktree: WorktreeState = { free: true };
  replies: { threadTs: string; text: string }[] = [];
  started: string[] = [];
  interrupts = 0;
  events: string[] = [];

  advance(seconds: number): void {
    this.now = new Date(this.now.getTime() + seconds * 1000);
  }

  nowSeconds(): number {
    return Math.floor(this.now.getTime() / 1000);
  }

  deps(): Dependencies {
    return {
      now: () => this.now,
      reply: async (_channel, threadTs, text) => {
        this.replies.push({ threadTs, text });
      },
      permalink: async (_channel, ts) => `https://slack.example/${ts}`,
      checkWorktree: async () => this.worktree,
      session: {
        busySince: () => this.busy,
        clearBusy: () => {
          this.busy = undefined;
        },
        writeAlertFile: (alert) => `/state/alerts/${alert.ts}.txt`,
        startRun: async (alertFile) => {
          this.started.push(alertFile);
        },
        interrupt: async () => {
          this.interrupts += 1;
        },
      },
      log: (event) => {
        this.events.push(event);
      },
    };
  }
}

function alertPost(policy: string, ts: string): SlackMessage {
  return { channel: CHANNEL, ts, bot_id: "B0000000002", text: `Incident is open for ${policy} (app)` };
}

describe("Watcher", () => {
  let fakes: Fakes;
  let watcher: Watcher;

  beforeEach(() => {
    fakes = new Fakes();
    const ledger = new Ledger(join(mkdtempSync(join(tmpdir(), "watcher-")), "ledger.json"));
    watcher = new Watcher(fakes.deps(), ledger, { ...DEFAULT_OPTIONS, channel: CHANNEL, ownBotId: "B0000000001" });
  });

  it("starts an investigation on the next tick, and says so in the thread", async () => {
    await watcher.onMessage(alertPost("Backend error logged", "100.000001"));
    await watcher.tick();

    assert.deepEqual(fakes.started, ["/state/alerts/100.000001.txt"]);
    assert.equal(fakes.replies.at(-1)?.text, "Picked this up in worktree 5.");
    assert.equal(fakes.replies.at(-1)?.threadTs, "100.000001");
  });

  it("ignores a message in another channel", async () => {
    await watcher.onMessage({ ...alertPost("Backend error logged", "100.000001"), channel: "C9999999999" });
    await watcher.tick();

    assert.deepEqual(fakes.started, []);
  });

  it("handles each fingerprint once, so the hourly repeats start nothing", async () => {
    await watcher.onMessage(alertPost("Backend error logged", "100.000001"));
    await watcher.tick();
    await watcher.onMessage(alertPost("Backend error logged", "200.000001"));

    assert.equal(watcher.queued(), 0);
    assert.ok(fakes.events.includes("duplicate"));
  });

  it("waits while a person's turn is running, and says the alert is queued", async () => {
    fakes.busy = fakes.nowSeconds();

    await watcher.onMessage(alertPost("Backend error logged", "100.000001"));
    await watcher.tick();

    assert.deepEqual(fakes.started, []);
    assert.match(fakes.replies.at(-1)?.text ?? "", /^Queued/);

    fakes.busy = undefined;
    await watcher.tick();

    assert.equal(fakes.started.length, 1);
  });

  it("parks an alert while worktree 5 is in use, saying so once", async () => {
    fakes.worktree = { free: false, reason: "it has uncommitted changes" };

    await watcher.onMessage(alertPost("Backend error logged", "100.000001"));
    await watcher.tick();
    await watcher.tick();

    assert.deepEqual(fakes.started, []);
    assert.equal(fakes.replies.filter((reply) => reply.text.includes("parked")).length, 1);

    fakes.worktree = { free: true };
    await watcher.tick();

    assert.equal(fakes.started.length, 1);
  });

  it("runs one alert at a time, starting the next only when the first finishes", async () => {
    await watcher.onMessage(alertPost("Backend error logged", "100.000001"));
    await watcher.onMessage(alertPost("Server errors - 5xx", "100.000002"));
    await watcher.tick();

    fakes.busy = fakes.nowSeconds();
    await watcher.tick();

    assert.equal(fakes.started.length, 1);

    fakes.busy = undefined;
    await watcher.tick();

    assert.equal(fakes.started.length, 2);
  });

  it("stops a run that stalls past 45 minutes and says so in its thread", async () => {
    await watcher.onMessage(alertPost("Backend error logged", "100.000001"));
    await watcher.tick();

    fakes.busy = fakes.nowSeconds();
    fakes.advance(46 * 60);
    await watcher.tick();

    assert.equal(fakes.interrupts, 1);
    assert.equal(fakes.busy, undefined);
    assert.match(fakes.replies.at(-1)?.text ?? "", /^Stopped/);
  });

  it("never interrupts a person's turn, however long it runs", async () => {
    fakes.busy = fakes.nowSeconds();
    fakes.advance(2 * 3600);
    await watcher.tick();

    assert.equal(fakes.interrupts, 0);
    assert.notEqual(fakes.busy, undefined);
  });

  it("clears a flag left far older than any real turn", async () => {
    fakes.busy = fakes.nowSeconds();
    fakes.advance(4 * 3600);
    await watcher.onMessage(alertPost("Backend error logged", "100.000001"));
    await watcher.tick();

    assert.equal(fakes.interrupts, 0);
    assert.equal(fakes.started.length, 1);
  });

  it("starts no more than six investigations in a day", async () => {
    const policies = [
      "Uptime failure",
      "Cloud Run startup failure",
      "Scheduled action failed",
      "Server errors - 5xx",
      "Backend error logged",
      "Browser errors",
      "Cloud SQL disk filling",
    ];

    for (const [index, policy] of policies.entries()) {
      await watcher.onMessage(alertPost(policy, `100.00000${index}`));
      await watcher.tick();
      fakes.advance(200);
      await watcher.tick();
    }

    assert.equal(fakes.started.length, 6);
    assert.match(fakes.replies.at(-1)?.text ?? "", /daily limit/);
  });

  it("treats alerts during an open Google Cloud incident as part of it", async () => {
    await watcher.onMessage({ channel: CHANNEL, ts: "100.000001", bot_id: "B0000000002", text: "Google Cloud incident (app)\nState: ACTIVE" });
    await watcher.onMessage(alertPost("Backend error logged", "100.000002"));

    assert.equal(watcher.queued(), 1);
    assert.match(fakes.replies.at(-1)?.text ?? "", /Google Cloud has an incident open/);
    assert.match(fakes.replies.at(-1)?.text ?? "", /slack\.example\/100\.000001/);
  });

  it("investigates again once the incident has closed", async () => {
    await watcher.onMessage({ channel: CHANNEL, ts: "100.000001", bot_id: "B0000000002", text: "Google Cloud incident (app)\nState: ACTIVE" });
    await watcher.onMessage({ channel: CHANNEL, ts: "100.000003", bot_id: "B0000000002", text: "Google Cloud incident (app)\nState: RESOLVED" });
    await watcher.onMessage(alertPost("Backend error logged", "100.000002"));

    assert.equal(watcher.queued(), 2);
  });

  it("logs a bot message it does not recognise, without its text", async () => {
    await watcher.onMessage({ channel: CHANNEL, ts: "100.000001", bot_id: "B0000000003", text: "something else" });

    assert.deepEqual(fakes.events, ["unmatched"]);
  });
});
