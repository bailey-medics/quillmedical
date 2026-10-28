// The watcher's decisions: which alerts to investigate, when, and what to
// say in the thread. Everything that talks to Slack, git or tmux is passed
// in, so this file is plain logic and its tests need none of them.
//
// One alert is investigated at a time. The rest wait in a queue while the
// session is busy, with an alert or with a person, and while worktree 5 is
// in use. Each fingerprint is handled once, at most twenty investigations
// start in a UTC day, though a failed deploy is always investigated, and
// while a Google Cloud incident is open every other alert is treated as
// part of it.

import type { Ledger } from "./ledger.ts";
import { classify, type Alert, type SlackMessage } from "./messages.ts";
import type { Thread } from "./session.ts";
import type { WorktreeState } from "./worktree.ts";

export interface Dependencies {
  now(): Date;
  reply(channel: string, threadTs: string, text: string): Promise<void>;
  permalink(channel: string, ts: string): Promise<string | undefined>;
  checkWorktree(): Promise<WorktreeState>;
  session: {
    busySince(nowSeconds: number): number | undefined;
    clearBusy(): void;
    writeAlertFile(alert: Alert, thread: Thread, now: Date): string;
    startRun(alertFile: string): Promise<void>;
    interrupt(): Promise<void>;
  };
  // One line to the journal. Never the alert text.
  log(event: string, fields?: Record<string, string | number | boolean>): void;
}

export interface Options {
  channel: string;
  // The bot user the watcher posts as, from auth.test.
  ownUserId: string | undefined;
  dailyCap: number;
  stallMinutes: number;
  abandonedHours: number;
  incidentHours: number;
  // How long after typing a run may go without the busy flag appearing
  // before it is taken to have finished already.
  startGraceSeconds: number;
}

export const DEFAULT_OPTIONS: Omit<Options, "channel" | "ownUserId"> = {
  dailyCap: 20,
  stallMinutes: 45,
  abandonedHours: 3,
  incidentHours: 12,
  startGraceSeconds: 120,
};

interface Queued {
  alert: Alert;
  parkedNotice: boolean;
}

interface CurrentRun {
  alert: Alert;
  startedAt: number;
  sawBusy: boolean;
}

interface Incident {
  until: number;
  threadUrl: string | undefined;
}

export class Watcher {
  private readonly queue: Queued[] = [];
  private current: CurrentRun | undefined;
  private incident: Incident | undefined;
  private ticking = false;
  private readonly deps: Dependencies;
  private readonly ledger: Ledger;
  private readonly options: Options;

  constructor(deps: Dependencies, ledger: Ledger, options: Options) {
    this.deps = deps;
    this.ledger = ledger;
    this.options = options;
  }

  private nowSeconds(): number {
    return Math.floor(this.deps.now().getTime() / 1000);
  }

  queued(): number {
    return this.queue.length;
  }

  async onMessage(message: SlackMessage): Promise<void> {
    if (message.channel !== this.options.channel) {
      return;
    }

    const alert = classify(message, {
      ownUserId: this.options.ownUserId,
      now: this.deps.now(),
    });

    // Every bot post that is not an alert is on the ignore list, so this
    // line is how a post wrongly ignored would be found.
    if (!alert) {
      if (message.bot_id && message.user !== this.options.ownUserId) {
        this.deps.log("ignored", { hasAttachments: Boolean(message.attachments?.length), hasBlocks: Boolean(message.blocks?.length) });
      }
      return;
    }

    if (alert.closing) {
      if (alert.kind === "gcp-incident") {
        this.incident = undefined;
        this.deps.log("incident-closed", { fingerprint: alert.fingerprint });
      }
      return;
    }

    if (this.isKnown(alert.fingerprint)) {
      this.deps.log("duplicate", { fingerprint: alert.fingerprint });
      return;
    }

    if (alert.kind === "gcp-incident") {
      this.incident = {
        until: this.nowSeconds() + this.options.incidentHours * 3600,
        threadUrl: await this.deps.permalink(this.options.channel, alert.ts),
      };
      this.deps.log("incident-opened", { fingerprint: alert.fingerprint });
    } else if (this.incident && this.nowSeconds() < this.incident.until) {
      const link = this.incident.threadUrl ? ` (<${this.incident.threadUrl}|its thread>)` : "";
      await this.deps.reply(
        this.options.channel,
        alert.ts,
        `Google Cloud has an incident open${link}, so this is treated as part of it and not investigated on its own.`,
      );
      this.ledger.record(alert.fingerprint, "incident", this.deps.now());
      this.deps.log("part-of-incident", { fingerprint: alert.fingerprint });
      return;
    }

    this.queue.push({ alert, parkedNotice: false });
    this.deps.log("queued", { fingerprint: alert.fingerprint, waiting: this.queue.length });

    if (this.current || this.deps.session.busySince(this.nowSeconds()) !== undefined) {
      await this.deps.reply(this.options.channel, alert.ts, "Queued: worktree 5 is busy, and this will be picked up when it is free.");
    }
  }

  private isKnown(fingerprint: string): boolean {
    return (
      this.ledger.seen(fingerprint) ||
      this.current?.alert.fingerprint === fingerprint ||
      this.queue.some((item) => item.alert.fingerprint === fingerprint)
    );
  }

  // Called every half minute. Never runs twice at once, because a slow git
  // fetch could otherwise overlap the next call and start two runs.
  async tick(): Promise<void> {
    if (this.ticking) {
      return;
    }

    this.ticking = true;

    try {
      await this.step();
    } finally {
      this.ticking = false;
    }
  }

  private async step(): Promise<void> {
    const now = this.nowSeconds();
    const busy = this.deps.session.busySince(now);

    if (this.current) {
      const finished = await this.followRun(this.current, busy, now);
      if (!finished) {
        return;
      }
    } else if (busy !== undefined) {
      // A person's turn, or one interrupted before its Stop hook ran. Only
      // a flag far older than any real turn is cleared.
      if (now - busy < this.options.abandonedHours * 3600) {
        return;
      }
      this.deps.session.clearBusy();
      this.deps.log("abandoned-flag-cleared", { ageMinutes: Math.round((now - busy) / 60) });
    }

    await this.startNext(now);
  }

  // True once the run is over, whether it finished or was stopped.
  private async followRun(run: CurrentRun, busy: number | undefined, now: number): Promise<boolean> {
    if (busy !== undefined) {
      run.sawBusy = true;

      if (now - busy < this.options.stallMinutes * 60) {
        return false;
      }

      await this.deps.session.interrupt();
      this.deps.session.clearBusy();
      await this.deps.reply(
        this.options.channel,
        run.alert.ts,
        `Stopped: the investigation ran past ${this.options.stallMinutes} minutes without finishing. Worktree 5 is left as it was for a person to look at.`,
      );
      this.deps.log("stalled", { fingerprint: run.alert.fingerprint });
      this.current = undefined;
      return true;
    }

    if (!run.sawBusy && now - run.startedAt < this.options.startGraceSeconds) {
      return false;
    }

    this.deps.log("finished", { fingerprint: run.alert.fingerprint, sawBusy: run.sawBusy });
    this.current = undefined;
    return true;
  }

  private async startNext(now: number): Promise<void> {
    const next = this.queue[0];

    if (!next) {
      return;
    }

    const worktree = await this.deps.checkWorktree();

    if (!worktree.free) {
      if (!next.parkedNotice) {
        next.parkedNotice = true;
        await this.deps.reply(
          this.options.channel,
          next.alert.ts,
          `Worktree 5 is in use (${worktree.reason}), so this is parked until it is free again.`,
        );
        this.deps.log("parked", { fingerprint: next.alert.fingerprint });
      }
      return;
    }

    this.queue.shift();
    const date = this.deps.now();

    // The cap guards the Claude plan against a storm of different alerts.
    // A failed deploy is rare and matters most, so it is never held back:
    // on 28 October 2026 a real one was capped behind a day of rehearsals.
    if (next.alert.kind !== "deploy" && this.ledger.runsOn(date) >= this.options.dailyCap) {
      await this.deps.reply(
        this.options.channel,
        next.alert.ts,
        `Not investigated: ${this.options.dailyCap} investigations have already started today, which is the daily limit. Please look at this one by hand; the limit resets at midnight UTC.`,
      );
      this.ledger.record(next.alert.fingerprint, "capped", date);
      this.deps.log("capped", { fingerprint: next.alert.fingerprint });
      return;
    }

    const thread: Thread = {
      channel: this.options.channel,
      threadTs: next.alert.ts,
      threadUrl: await this.deps.permalink(this.options.channel, next.alert.ts),
    };
    const alertFile = this.deps.session.writeAlertFile(next.alert, thread, date);

    // Nothing is said in the thread here. The skill's first message says
    // it has started, so the thread never claims a run that did not begin.
    this.ledger.record(next.alert.fingerprint, "run", date);
    await this.deps.session.startRun(alertFile);

    this.current = { alert: next.alert, startedAt: now, sawBusy: false };
    this.deps.log("started", { fingerprint: next.alert.fingerprint, kind: next.alert.kind });
  }
}
