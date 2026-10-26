// The Claude Code session in worktree 5: whether it is busy, and typing
// into it.
//
// The busy flag is kept by .claude/hooks/alert-watcher-busy.sh, set when a
// turn begins and cleared when it ends, and holds the time the turn began
// in seconds since the epoch. The session is typed into with
// `tmux send-keys`, so a person attached to the same tmux session sees
// the run as it happens and can take over with Escape.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import type { Alert } from "./messages.ts";
import { runCommand, type Run } from "./worktree.ts";

export interface Thread {
  channel: string;
  threadTs: string;
  threadUrl: string | undefined;
}

export class Session {
  private readonly stateDirectory: string;
  private readonly tmuxTarget: string;
  private readonly run: Run;
  private readonly pauseMs: number;

  constructor(options: { stateDirectory: string; tmuxTarget: string; run?: Run; pauseMs?: number }) {
    this.stateDirectory = options.stateDirectory;
    this.tmuxTarget = options.tmuxTarget;
    this.run = options.run ?? runCommand;
    this.pauseMs = options.pauseMs ?? 3000;
  }

  private get flag(): string {
    return join(this.stateDirectory, "busy");
  }

  // When the current turn began, in seconds since the epoch, or undefined
  // when the session is idle. A flag that cannot be read as a time counts
  // as busy since now, so the watcher waits rather than typing over a turn.
  busySince(nowSeconds: number): number | undefined {
    let raw: string;

    try {
      raw = readFileSync(this.flag, "utf8").trim();
    } catch {
      return undefined;
    }

    const began = Number.parseInt(raw, 10);

    return Number.isFinite(began) ? began : nowSeconds;
  }

  clearBusy(): void {
    rmSync(this.flag, { force: true });
  }

  // Writes the alert for the skill to read: a header the skill and
  // scripts/slack-reply.sh trust, a `---`, then the text from Slack.
  writeAlertFile(alert: Alert, thread: Thread, now: Date): string {
    const directory = join(this.stateDirectory, "alerts");
    mkdirSync(directory, { recursive: true, mode: 0o700 });

    const path = join(directory, `${alert.ts.replace(".", "-")}.txt`);
    const header = [
      `channel: ${thread.channel}`,
      `thread_ts: ${thread.threadTs}`,
      `thread_url: ${thread.threadUrl ?? ""}`,
      `kind: ${alert.kind}`,
      `fingerprint: ${alert.fingerprint}`,
      `received_at: ${now.toISOString().replace(/\.\d{3}Z$/, "Z")}`,
      "---",
    ];

    writeFileSync(path, `${header.join("\n")}\n${alert.text}\n`, { mode: 0o600 });

    return path;
  }

  // `/clear` first, so each alert starts a conversation of its own, then the
  // skill. `-l` sends the text literally, so nothing in it is read as a key
  // name, and Enter goes separately.
  async startRun(alertFile: string): Promise<void> {
    await this.type("/clear");
    await sleep(this.pauseMs);
    await this.type(`/alert ${alertFile}`);
  }

  async interrupt(): Promise<void> {
    await this.run("tmux", ["send-keys", "-t", this.tmuxTarget, "Escape"]);
  }

  private async type(text: string): Promise<void> {
    await this.run("tmux", ["send-keys", "-t", this.tmuxTarget, "-l", text]);
    await this.run("tmux", ["send-keys", "-t", this.tmuxTarget, "Enter"]);
  }
}
